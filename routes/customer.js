import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken, verifyRenter } from "../lib/auth.js"
import { lazyAuditExpiredRentals } from "../lib/cron.js"

const router = express.Router()

// All customer routes require authenticated customer role
router.use(verifyToken, verifyRenter)

/**
 * 1. POST /api/customer/favorites
 * Upserts a favorite equipment bookmark for the logged-in renter.
 * Rejects non-Approved equipment listings.
 */
router.post("/favorites", async (req, res) => {
  try {
    const { equipmentId } = req.body

    if (!equipmentId || !ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: "Invalid or missing equipment ID" })
    }

    const item = await collections.equipment().findOne({ _id: new ObjectId(equipmentId) })
    if (!item) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    if (item.status !== "Approved") {
      return res.status(400).json({ message: "Only approved equipment listings can be favorited" })
    }

    await collections.favorites().updateOne(
      { customerId: req.user.id, equipmentId: new ObjectId(equipmentId) },
      {
        $set: {
          customerId: req.user.id,
          equipmentId: new ObjectId(equipmentId),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )

    res.status(200).json({
      success: true,
      message: "Equipment added to your favorites",
      equipmentId,
    })
  } catch (error) {
    console.error("Error saving favorite:", error)
    res.status(500).json({ message: "Failed to update favorites" })
  }
})

/**
 * 2. DELETE /api/customer/favorites/:equipmentId
 * Removes an equipment item from the renter's favorites.
 */
router.delete("/favorites/:equipmentId", async (req, res) => {
  try {
    const { equipmentId } = req.params

    if (!equipmentId || !ObjectId.isValid(equipmentId)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const result = await collections.favorites().deleteOne({
      customerId: req.user.id,
      equipmentId: new ObjectId(equipmentId),
    })

    res.json({
      success: true,
      message: "Equipment removed from favorites",
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error("Error removing favorite:", error)
    res.status(500).json({ message: "Failed to remove favorite" })
  }
})

/**
 * 3. GET /api/customer/favorites
 * Returns user's saved equipment using $lookup against equipment collection
 * so prices, specifications, and available quantities are always live.
 */
router.get("/favorites", async (req, res) => {
  try {
    const favorites = await collections
      .favorites()
      .aggregate([
        { $match: { customerId: req.user.id } },
        {
          $lookup: {
            from: "equipment",
            localField: "equipmentId",
            foreignField: "_id",
            as: "equipment",
          },
        },
        { $unwind: "$equipment" },
        { $sort: { createdAt: -1 } },
        {
          $project: {
            _id: 1,
            equipmentId: 1,
            createdAt: 1,
            equipment: 1,
          },
        },
      ])
      .toArray()

    res.json({
      success: true,
      count: favorites.length,
      favorites,
    })
  } catch (error) {
    console.error("Error fetching favorites:", error)
    res.status(500).json({ message: "Failed to load favorites" })
  }
})

/**
 * 4. GET /api/customer/rentals
 * Returns all bookings for the authenticated renter (newest first).
 */
router.get("/rentals", async (req, res) => {
  try {
    lazyAuditExpiredRentals()

    const rentals = await collections
      .bookings()
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rentals.length,
      rentals,
    })
  } catch (error) {
    console.error("Error fetching customer rentals:", error)
    res.status(500).json({ message: "Failed to fetch rental history" })
  }
})

/**
 * 5. PATCH /api/customer/rentals/:id/cancel
 * Allows a customer to cancel their pending (unpaid) reservation.
 */
router.patch("/rentals/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid booking ID" })
    }

    const booking = await collections.bookings().findOne({
      _id: new ObjectId(id),
      customerId: req.user.id,
    })

    if (!booking) {
      return res.status(404).json({ message: "Rental booking not found" })
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({
        message: "Active or paid rentals cannot be directly cancelled. Please contact support dispatch.",
      })
    }

    await collections.bookings().updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          bookingStatus: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )

    res.json({
      success: true,
      message: "Pending reservation cancelled successfully",
    })
  } catch (error) {
    console.error("Error cancelling reservation:", error)
    res.status(500).json({ message: "Failed to cancel reservation" })
  }
})

export default router
