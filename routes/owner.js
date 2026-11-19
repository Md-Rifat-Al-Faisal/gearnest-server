import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken, verifyOwner } from "../lib/auth.js"

const router = express.Router()

// All routes require token and owner role
router.use(verifyToken, verifyOwner)

// POST /api/owner/equipment - Add new equipment (default: Pending)
router.post("/equipment", async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      location,
      rentalPrice,
      rentalType,
      availableQuantity,
      condition,
      brand,
      model,
      image,
      rentalTerms,
    } = req.body

    if (!name || !category || !rentalPrice || !rentalType || availableQuantity === undefined) {
      return res.status(400).json({ message: "Missing required equipment fields" })
    }

    const price = parseFloat(rentalPrice)
    const quantity = parseInt(availableQuantity, 10)

    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity < 0) {
      return res.status(400).json({ message: "Invalid price or quantity values" })
    }

    const newEquipment = {
      name: name.trim(),
      description: description ? description.trim() : "",
      category: category.trim(),
      location: location ? location.trim() : "",
      rentalPrice: price,
      rentalType: rentalType.trim(), // "Daily" | "Weekly" | "Monthly"
      availableQuantity: quantity,
      condition: condition ? condition.trim() : "Good",
      brand: brand ? brand.trim() : "",
      model: model ? model.trim() : "",
      image: image || "",
      rentalTerms: rentalTerms ? rentalTerms.trim() : "",
      status: "Pending", // Always Pending by default until Admin approves
      ownerId: req.user.id,
      ownerName: req.user.name || "Owner",
      ownerEmail: req.user.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await collections.equipment().insertOne(newEquipment)

    res.status(201).json({
      success: true,
      message: "Equipment listed successfully. Pending admin approval.",
      equipment: { _id: result.insertedId, ...newEquipment },
    })
  } catch (error) {
    console.error("Error creating equipment:", error)
    res.status(500).json({ message: "Failed to create equipment" })
  }
})

// GET /api/owner/equipment - List all equipment for the logged-in owner
router.get("/equipment", async (req, res) => {
  try {
    const equipment = await collections
      .equipment()
      .find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({ success: true, equipment })
  } catch (error) {
    console.error("Error fetching owner equipment:", error)
    res.status(500).json({ message: "Failed to fetch equipment" })
  }
})

// GET /api/owner/equipment/:id - Single equipment details for owner
router.get("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const item = await collections.equipment().findOne({
      _id: new ObjectId(id),
      ownerId: req.user.id,
    })

    if (!item) {
      return res.status(404).json({ message: "Equipment not found" })
    }

    res.json({ success: true, equipment: item })
  } catch (error) {
    console.error("Error fetching equipment details:", error)
    res.status(500).json({ message: "Failed to fetch equipment details" })
  }
})

// PATCH /api/owner/equipment/:id - Update owner's equipment
router.patch("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const existing = await collections.equipment().findOne({
      _id: new ObjectId(id),
      ownerId: req.user.id,
    })

    if (!existing) {
      return res.status(404).json({ message: "Equipment not found or unauthorized" })
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
      { _id: new ObjectId(id), ownerId: req.user.id },
      { $set: updates }
    )

    res.json({
      success: true,
      message: "Equipment updated successfully",
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error("Error updating equipment:", error)
    res.status(500).json({ message: "Failed to update equipment" })
  }
})

// DELETE /api/owner/equipment/:id - Delete equipment (blocked if active bookings exist)
router.delete("/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid equipment ID format" })
    }

    const existing = await collections.equipment().findOne({
      _id: new ObjectId(id),
      ownerId: req.user.id,
    })

    if (!existing) {
      return res.status(404).json({ message: "Equipment not found or unauthorized" })
    }

    // Check for active bookings on this equipment
    const activeBooking = await collections.bookings().findOne({
      equipmentId: new ObjectId(id),
      bookingStatus: "active",
    })

    if (activeBooking) {
      return res.status(400).json({
        message: "Cannot delete equipment with active rental bookings. Please wait until rentals are completed.",
      })
    }

    const result = await collections.equipment().deleteOne({
      _id: new ObjectId(id),
      ownerId: req.user.id,
    })

    res.json({
      success: true,
      message: "Equipment deleted successfully",
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error("Error deleting equipment:", error)
    res.status(500).json({ message: "Failed to delete equipment" })
  }
})

export default router
