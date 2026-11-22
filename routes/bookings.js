import express from "express"
import { ObjectId } from "mongodb"
import Stripe from "stripe"
import { collections } from "../lib/db.js"
import { verifyToken, verifyRenter } from "../lib/auth.js"

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
})

/**
 * Shared atomic payment fulfillment function.
 * Called by both POST /api/bookings/verify (client flow) and Stripe Webhook (server flow).
 * Fully idempotent, atomic, and handles stock-exhaustion race conditions.
 */
export async function fulfillPaidBooking({ bookingId, sessionId, session, reqUser }) {
  if (!bookingId || !ObjectId.isValid(bookingId)) {
    throw new Error("Invalid booking ID associated with Stripe metadata")
  }

  // 1. Fetch booking record
  const booking = await collections.bookings().findOne({ _id: new ObjectId(bookingId) })
  if (!booking) {
    throw new Error("Booking record not found")
  }

  // Cross-user verification check
  if (reqUser && booking.customerId && booking.customerId.toString() !== reqUser.id.toString()) {
    throw new Error("Unauthorized: Booking does not belong to the authenticated user")
  }

  // 2. Strict amount verification (compare cents)
  const expectedCents = Math.round(booking.totalAmount * 100)
  if (typeof session.amount_total !== "number" || session.amount_total !== expectedCents) {
    throw new Error(
      `Stripe session amount ($${((session.amount_total || 0) / 100).toFixed(2)}) does not match booking total ($${booking.totalAmount.toFixed(2)})`
    )
  }

  // 3. Strict payment_status verification
  if (session.payment_status !== "paid") {
    throw new Error(`Stripe checkout is not paid. Current status: ${session.payment_status}`)
  }

  // Extract transactionId
  const transactionId =
    typeof session.payment_intent === "object" && session.payment_intent !== null
      ? session.payment_intent.id
      : session.payment_intent || sessionId

  // 4. Atomic claim: Only transition if paymentStatus is not already "paid"
  const claimed = await collections.bookings().findOneAndUpdate(
    {
      _id: new ObjectId(bookingId),
      paymentStatus: { $ne: "paid" },
    },
    {
      $set: {
        paymentStatus: "paid",
        bookingStatus: "active",
        transactionId,
        stripeSessionId: sessionId,
        paidAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  )

  if (!claimed) {
    // Already claimed or marked paid by a concurrent call
    return {
      success: true,
      message: "Payment already verified (Idempotent replay)",
      isIdempotent: true,
      bookingId,
      transactionId,
    }
  }

  const equipmentId = session.metadata?.equipmentId || (booking.equipmentId ? booking.equipmentId.toString() : null)
  const quantity = parseInt(session.metadata?.quantity || String(booking.quantity || 1), 10)

  // 5. Atomically decrement stock from equipment collection
  if (equipmentId && ObjectId.isValid(equipmentId)) {
    const stockUpdate = await collections.equipment().updateOne(
      {
        _id: new ObjectId(equipmentId),
        availableQuantity: { $gte: quantity },
      },
      {
        $inc: { availableQuantity: -quantity },
        $set: { updatedAt: new Date() },
      }
    )

    if (stockUpdate.modifiedCount === 0) {
      // Stock decrement failed! Another customer rented the last units concurrently!
      console.error(
        `Critical: Stock decrement failed for equipment ${equipmentId}. Insufficient stock for quantity ${quantity}.`
      )
      // Flag booking as needs-review
      await collections.bookings().updateOne(
        { _id: new ObjectId(bookingId) },
        {
          $set: {
            bookingStatus: "needs-review",
            stockError: true,
            notes: (booking.notes ? booking.notes + " | " : "") + "Stock exhausted prior to checkout. Refund initiated.",
            updatedAt: new Date(),
          },
        }
      )

      // Automatically trigger Stripe refund for the customer
      if (session.payment_intent && stripe) {
        try {
          const piId =
            typeof session.payment_intent === "object"
              ? session.payment_intent.id
              : session.payment_intent
          await stripe.refunds.create({ payment_intent: piId, reason: "duplicate" })
          await collections.bookings().updateOne(
            { _id: new ObjectId(bookingId) },
            { $set: { paymentStatus: "refunded", bookingStatus: "cancelled", updatedAt: new Date() } }
          )
        } catch (refundErr) {
          console.error("Auto-refund error:", refundErr.message)
        }
      }

      throw new Error(
        "Inventory was rented out prior to checkout completion. An automated refund has been initiated."
      )
    }
  }

  // 6. Record payment doc into payments collection (amount strictly in USD)
  const paymentDoc = {
    bookingId: new ObjectId(bookingId),
    equipmentId: equipmentId && ObjectId.isValid(equipmentId) ? new ObjectId(equipmentId) : null,
    equipmentName: booking.equipmentName || session.metadata?.equipmentName || "",
    customerId: reqUser?.id || booking.customerId,
    customerEmail: reqUser?.email || booking.customerEmail || session.customer_details?.email,
    transactionId,
    stripeSessionId: sessionId,
    amount: booking.totalAmount,
    currency: session.currency || "usd",
    paymentMethod: session.payment_method_types?.[0] || "card",
    status: "succeeded",
    paidAt: new Date(),
    createdAt: new Date(),
  }

  try {
    await collections.payments().insertOne(paymentDoc)
  } catch (insertErr) {
    console.warn("Payment record notice (possible duplicate key):", insertErr.message)
  }

  return {
    success: true,
    message: "Payment successfully verified and rental activated",
    bookingId,
    transactionId,
  }
}

/**
 * 1. POST /api/bookings/initiate
 * Validates equipment status, stock, user eligibility, calculates rental cost
 * and inserts a pending booking.
 */
router.post("/initiate", verifyToken, verifyRenter, async (req, res) => {
  try {
    const {
      equipmentId,
      startDate,
      endDate,
      quantity = 1,
      contactNumber,
      deliveryAddress,
      notes,
    } = req.body

    if (!equipmentId || !ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: "A valid Equipment ID is required" })
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format provided" })
    }

    if (start > end) {
      return res.status(400).json({ message: "Rental start date must be before or equal to end date" })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (start < today) {
      return res.status(400).json({ message: "Rental start date cannot be in the past" })
    }

    const qty = parseInt(quantity, 10)
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" })
    }

    // Load live equipment record from database
    const equipment = await collections.equipment().findOne({ _id: new ObjectId(equipmentId) })
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    if (equipment.status !== "Approved") {
      return res.status(400).json({ message: "This equipment is currently not approved for rental" })
    }

    // Block owner from booking their own equipment
    if (equipment.ownerId && equipment.ownerId.toString() === req.user.id.toString()) {
      return res.status(400).json({ message: "Equipment partners cannot book their own machinery listings" })
    }

    // Check available stock
    if (equipment.availableQuantity < qty) {
      return res.status(400).json({
        message: `Requested quantity (${qty}) exceeds currently available inventory (${equipment.availableQuantity})`,
      })
    }

    // Calculate rental units & price
    const diffMs = end.getTime() - start.getTime()
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    const divisor =
      equipment.rentalType === "Monthly" ? 30 : equipment.rentalType === "Weekly" ? 7 : 1
    const units = Math.max(1, Math.ceil(days / divisor))
    const totalAmount = Math.max(0.5, equipment.rentalPrice * units * qty)

    // Insert pending booking
    const newBooking = {
      equipmentId: new ObjectId(equipmentId),
      equipmentName: equipment.name,
      equipmentImage: equipment.image,
      category: equipment.category,
      ownerId: equipment.ownerId,
      ownerName: equipment.ownerName || "Partner",
      ownerEmail: equipment.ownerEmail || "",
      customerId: req.user.id,
      customerName: req.user.name || "Customer",
      customerEmail: req.user.email,
      startDate: start,
      endDate: end,
      days,
      units,
      rentalType: equipment.rentalType,
      rentalPrice: equipment.rentalPrice,
      quantity: qty,
      totalAmount,
      contactNumber: contactNumber ? contactNumber.trim() : "",
      deliveryAddress: deliveryAddress ? deliveryAddress.trim() : "",
      notes: notes ? notes.trim() : "",
      paymentStatus: "pending",
      bookingStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await collections.bookings().insertOne(newBooking)

    res.status(201).json({
      success: true,
      bookingId: result.insertedId,
      totalAmount,
      equipmentName: equipment.name,
      equipmentImage: equipment.image,
      quantity: qty,
      days,
      units,
      rentalType: equipment.rentalType,
    })
  } catch (error) {
    console.error("Error initiating booking:", error)
    res.status(500).json({ message: "Failed to initiate booking contract" })
  }
})

/**
 * 2. GET /api/bookings/:id
 * Retrieve booking details by ID (renter, owner, or admin)
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid booking ID format" })
    }

    const booking = await collections.bookings().findOne({ _id: new ObjectId(id) })
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" })
    }

    const isCustomer = booking.customerId && booking.customerId.toString() === req.user.id.toString()
    const isOwner = booking.ownerId && booking.ownerId.toString() === req.user.id.toString()
    const isAdmin = req.user.role === "admin"

    if (!isCustomer && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "Unauthorized access to booking" })
    }

    res.json({ success: true, booking })
  } catch (error) {
    console.error("Error retrieving booking:", error)
    res.status(500).json({ message: "Failed to retrieve booking details" })
  }
})

/**
 * 3. PATCH /api/bookings/:id/session
 * Records the Stripe session ID on an existing booking.
 */
router.patch("/:id/session", verifyToken, verifyRenter, async (req, res) => {
  try {
    const { id } = req.params
    const { sessionId } = req.body

    if (!id || !ObjectId.isValid(id) || !sessionId) {
      return res.status(400).json({ message: "Valid booking ID and sessionId required" })
    }

    await collections.bookings().updateOne(
      { _id: new ObjectId(id), customerId: req.user.id },
      { $set: { stripeSessionId: sessionId, updatedAt: new Date() } }
    )

    res.json({ success: true, message: "Stripe session linked to booking" })
  } catch (error) {
    console.error("Error linking session:", error)
    res.status(500).json({ message: "Failed to link session" })
  }
})

/**
 * 3. POST /api/bookings/verify
 * Accepts { sessionId } only.
 * Retrieves session from Stripe, verifies completion & user email,
 * executes atomic claim, decrements stock, updates booking, and logs payment.
 */
router.post("/verify", verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.body

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "Stripe session ID is required" })
    }

    // Retrieve session directly from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    })

    if (!session) {
      return res.status(404).json({ message: "Stripe session not found" })
    }

    // Verify session belongs to logged-in user
    const sessionEmail =
      session.customer_details?.email || session.metadata?.customerEmail
    if (
      sessionEmail &&
      req.user.email &&
      sessionEmail.toLowerCase() !== req.user.email.toLowerCase()
    ) {
      return res.status(403).json({
        message: "Stripe session belongs to a different user account",
      })
    }

    const bookingId = session.metadata?.bookingId
    const result = await fulfillPaidBooking({
      bookingId,
      sessionId,
      session,
      reqUser: req.user,
    })

    res.json(result)
  } catch (error) {
    console.error("Error verifying Stripe session:", error.message)
    const isConflict = error.message.includes("Inventory was rented out")
    res.status(isConflict ? 409 : 400).json({ message: error.message || "Failed to verify Stripe payment" })
  }
})

export default router
