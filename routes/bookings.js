import express from "express"
import { ObjectId } from "mongodb"
import Stripe from "stripe"
import { collections } from "../lib/db.js"
import { verifyToken, verifyRenter } from "../lib/auth.js"

const router = express.Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
})

// All booking routes require authenticated customer/renter role
router.use(verifyToken, verifyRenter)

/**
 * 1. POST /api/bookings/initiate
 * Recomputes rental duration and total strictly on the server, verifies availability,
 * checks that the owner is not self-booking, and inserts a pending booking.
 */
router.post("/initiate", async (req, res) => {
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
      return res.status(400).json({ message: "Invalid or missing equipment ID" })
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format provided" })
    }

    // Set today at 00:00:00 UTC for date validation
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startCompare = new Date(start)
    startCompare.setHours(0, 0, 0, 0)

    if (startCompare < today) {
      return res.status(400).json({ message: "Rental start date cannot be in the past" })
    }

    if (end < start) {
      return res.status(400).json({ message: "End date must be on or after start date" })
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

    // Strict Server-Side Rental Calculation:
    // days = Math.max(1, Math.ceil((end - start) / 86400000))
    // units by rentalType (Daily: 1, Weekly: 7, Monthly: 30)
    const diffMs = end.getTime() - start.getTime()
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    const divisor =
      equipment.rentalType === "Monthly" ? 30 : equipment.rentalType === "Weekly" ? 7 : 1
    const units = Math.max(1, Math.ceil(days / divisor))
    const totalAmount = equipment.rentalPrice * units * qty

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
 * 2. POST /api/bookings/verify
 * Accepts { sessionId } only.
 * Retrieves session from Stripe, verifies completion & user email,
 * enforces idempotency, atomically decrements stock, updates booking to "active",
 * and records the payment transaction.
 */
router.post("/verify", async (req, res) => {
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

    // Verify session status is complete / paid
    if (session.status !== "complete" && session.payment_status !== "paid") {
      return res.status(400).json({
        message: `Stripe checkout is not completed. Current status: ${session.status}`,
      })
    }

    // Verify user authorization: session must belong to logged-in user
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
    const equipmentId = session.metadata?.equipmentId
    const quantity = parseInt(session.metadata?.quantity || "1", 10)

    if (!bookingId || !ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID associated with Stripe metadata" })
    }

    // Extract transactionId from payment_intent
    const transactionId =
      typeof session.payment_intent === "object" && session.payment_intent !== null
        ? session.payment_intent.id
        : session.payment_intent || sessionId

    // Enforce idempotency: check if payment record already exists
    const existingPayment = await collections.payments().findOne({ transactionId })
    if (existingPayment) {
      return res.json({
        success: true,
        message: "Payment already verified (Idempotent replay)",
        isIdempotent: true,
        bookingId,
        transactionId,
      })
    }

    // Atomically decrement stock from equipment collection
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
        console.warn(
          `Notice: Stock could not be decremented for equipment ${equipmentId}. Available quantity may be less than ${quantity}.`
        )
      }
    }

    // Update booking to paymentStatus: "paid" and bookingStatus: "active"
    await collections.bookings().updateOne(
      { _id: new ObjectId(bookingId) },
      {
        $set: {
          paymentStatus: "paid",
          bookingStatus: "active",
          transactionId,
          stripeSessionId: sessionId,
          paidAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )

    // Insert record into payments collection
    const paymentDoc = {
      bookingId: new ObjectId(bookingId),
      equipmentId: equipmentId && ObjectId.isValid(equipmentId) ? new ObjectId(equipmentId) : null,
      equipmentName: session.metadata?.equipmentName || "",
      customerId: req.user.id,
      customerEmail: req.user.email,
      transactionId,
      stripeSessionId: sessionId,
      amount: (session.amount_total || 0) / 100, // converted from cents
      currency: session.currency || "usd",
      paymentMethod: session.payment_method_types?.[0] || "card",
      status: "completed",
      createdAt: new Date(),
    }

    await collections.payments().insertOne(paymentDoc)

    res.json({
      success: true,
      message: "Payment successfully verified and rental activated",
      bookingId,
      transactionId,
    })
  } catch (error) {
    console.error("Error verifying Stripe session:", error)
    res.status(500).json({ message: "Failed to verify Stripe payment" })
  }
})

export default router
