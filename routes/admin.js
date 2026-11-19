import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken, verifyAdmin } from "../lib/auth.js"

const router = express.Router()

// All admin routes require token and admin role
router.use(verifyToken, verifyAdmin)

// GET /api/admin/equipment - List all equipment across the platform
router.get("/equipment", async (req, res) => {
  try {
    const { status, search } = req.query
    const query = {}

    if (status && status !== "all") {
      query.status = status
    }

    if (search && typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { category: { $regex: escaped, $options: "i" } },
        { location: { $regex: escaped, $options: "i" } },
        { ownerName: { $regex: escaped, $options: "i" } },
      ]
    }

    const equipment = await collections
      .equipment()
      .find(query)
      .sort({ createdAt: -1 })
      .toArray()

    res.json({ success: true, count: equipment.length, equipment })
  } catch (error) {
    console.error("Error fetching admin equipment:", error)
    res.status(500).json({ message: "Failed to fetch equipment for administration" })
  }
})

// GET /api/admin/equipment/:id - Single equipment lookup for admin
router.get("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const item = await collections.equipment().findOne({ _id: new ObjectId(id) })
    if (!item) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    res.json({ success: true, equipment: item })
  } catch (error) {
    console.error("Error fetching equipment details:", error)
    res.status(500).json({ message: "Failed to fetch equipment details" })
  }
})

// PATCH /api/admin/equipment/:id/status - Approve or Reject equipment
router.patch("/equipment/:id/status", async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    if (!["Approved", "Rejected", "Pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be Approved, Rejected, or Pending" })
    }

    const result = await collections.equipment().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    res.json({
      success: true,
      message: `Equipment status updated to ${status}`,
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error("Error moderating equipment status:", error)
    res.status(500).json({ message: "Failed to update equipment status" })
  }
})

// PATCH /api/admin/equipment/:id - Admin update of equipment specifications
router.patch("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const allowedFields = [
      "name",
      "description",
      "category",
      "location",
      "rentalPrice",
      "rentalType",
      "availableQuantity",
      "condition",
      "brand",
      "model",
      "image",
      "rentalTerms",
      "status",
    ]

    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "rentalPrice") {
          updates[field] = parseFloat(req.body[field])
        } else if (field === "availableQuantity") {
          updates[field] = parseInt(req.body[field], 10)
        } else {
          updates[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field]
        }
      }
    }

    updates.updatedAt = new Date()

    const result = await collections.equipment().updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    res.json({
      success: true,
      message: "Equipment updated by administrator",
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error("Error updating equipment by admin:", error)
    res.status(500).json({ message: "Failed to update equipment" })
  }
})

// DELETE /api/admin/equipment/:id - Admin delete (blocks if active bookings exist)
router.delete("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const activeBooking = await collections.bookings().findOne({
      equipmentId: new ObjectId(id),
      bookingStatus: "active",
    })

    if (activeBooking) {
      return res.status(400).json({
        message: "Cannot delete equipment with active rental bookings.",
      })
    }

    const result = await collections.equipment().deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    res.json({
      success: true,
      message: "Equipment permanently deleted by administrator",
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error("Error deleting equipment by admin:", error)
    res.status(500).json({ message: "Failed to delete equipment" })
  }
})

/**
 * GET /api/admin/users
 * List all users with optional role filter, excluding passwords.
 */
router.get("/users", async (req, res) => {
  try {
    const { role } = req.query
    const query = {}

    if (role && role !== "all") {
      query.role = role
    }

    const users = await collections
      .users()
      .find(query, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray()

    const sanitizedUsers = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      image: u.image || "",
      phone: u.phone || "",
      address: u.address || "",
      role: u.role || "customer",
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }))

    res.json({
      success: true,
      count: sanitizedUsers.length,
      users: sanitizedUsers,
    })
  } catch (error) {
    console.error("Error fetching admin users:", error)
    res.status(500).json({
      message: "Failed to fetch users",
      error: error.message,
    })
  }
})

/**
 * PATCH /api/admin/users/:id/role
 * Update a user's role (customer, owner, admin).
 * Blocks admin self-demotion.
 */
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body

    const validRoles = ["customer", "owner", "admin"]
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        message: `Invalid role. Permitted roles are: ${validRoles.join(", ")}`,
      })
    }

    // Security check: Block administrators from altering their own role
    if (id === req.user.id) {
      return res.status(400).json({
        message: "Security restriction: Administrators cannot modify or demote their own account role.",
      })
    }

    const query = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id }

    const updated = await collections.users().findOneAndUpdate(
      query,
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: "after", projection: { password: 0 } }
    )

    if (!updated) {
      return res.status(404).json({ message: "User account not found" })
    }

    res.json({
      success: true,
      message: `User role successfully updated to "${role}"`,
      user: {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        role: updated.role,
      },
    })
  } catch (error) {
    console.error("Error updating user role:", error)
    res.status(500).json({
      message: "Failed to update user role",
      error: error.message,
    })
  }
})

/**
 * DELETE /api/admin/users/:id
 * Delete a user from the platform.
 * Blocks administrator self-deletion.
 */
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params

    // Security check: Block administrators from deleting their own account
    if (id === req.user.id) {
      return res.status(400).json({
        message: "Security restriction: Administrators cannot delete their own active account.",
      })
    }

    const query = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id }

    const result = await collections.users().deleteOne(query)

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User account not found" })
    }

    res.json({
      success: true,
      message: "User permanently removed from platform",
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error("Error deleting user:", error)
    res.status(500).json({
      message: "Failed to delete user",
      error: error.message,
    })
  }
})

/**
 * GET /api/admin/rentals
 * List all platform rental reservations (newest first).
 */
router.get("/rentals", async (req, res) => {
  try {
    const rentals = await collections
      .bookings()
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      count: rentals.length,
      rentals,
    })
  } catch (error) {
    console.error("Error fetching all platform rentals:", error)
    res.status(500).json({
      message: "Failed to fetch platform rental bookings",
      error: error.message,
    })
  }
})

export default router
