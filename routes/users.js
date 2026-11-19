import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken } from "../lib/auth.js"

const router = express.Router()

// All profile routes require an authenticated user
router.use(verifyToken)

/**
 * GET /api/users/profile
 * Returns the currently authenticated user's profile details.
 */
router.get("/profile", async (req, res) => {
  try {
    const id = req.user.id
    const query = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id }

    const user = await collections.users().findOne(query, {
      projection: { password: 0 },
    })

    if (!user) {
      return res.status(404).json({ message: "User account not found" })
    }

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image || "",
        phone: user.phone || "",
        address: user.address || "",
        role: user.role || "customer",
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error("Error fetching user profile:", error)
    res.status(500).json({
      message: "Failed to fetch user profile",
      error: error.message,
    })
  }
})

/**
 * PATCH /api/users/profile
 * Update name, image, phone, and address.
 * Strictly prevents modification of email or role.
 */
router.patch("/profile", async (req, res) => {
  try {
    const id = req.user.id
    const { name, image, phone, address } = req.body

    const updateFields = {}
    if (name !== undefined && typeof name === "string") updateFields.name = name.trim()
    if (image !== undefined && typeof image === "string") updateFields.image = image.trim()
    if (phone !== undefined && typeof phone === "string") updateFields.phone = phone.trim()
    if (address !== undefined && typeof address === "string") updateFields.address = address.trim()
    updateFields.updatedAt = new Date()

    // Enforce security: strictly strip role and email if present in payload
    delete updateFields.email
    delete updateFields.role

    const query = ObjectId.isValid(id)
      ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
      : { _id: id }

    const updated = await collections.users().findOneAndUpdate(
      query,
      { $set: updateFields },
      { returnDocument: "after", projection: { password: 0 } }
    )

    if (!updated) {
      return res.status(404).json({ message: "User account not found" })
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        image: updated.image || "",
        phone: updated.phone || "",
        address: updated.address || "",
        role: updated.role || "customer",
      },
    })
  } catch (error) {
    console.error("Error updating user profile:", error)
    res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    })
  }
})

export default router
