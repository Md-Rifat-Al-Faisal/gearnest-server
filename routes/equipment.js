import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"

const router = express.Router()

/**
 * 1. GET /api/equipment/featured
 * IMPORTANT: Declared BEFORE /:id so Express does not capture "featured" as an ID param!
 * Returns 6 approved equipment items for the landing page.
 */
router.get("/featured", async (req, res) => {
  try {
    const featured = await collections
      .equipment()
      .find({ status: "Approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray()

    res.json({ success: true, count: featured.length, equipment: featured })
  } catch (error) {
    console.error("Error fetching featured equipment:", error)
    res.status(500).json({
      message: "Failed to fetch featured equipment",
      error: error.message,
    })
  }
})

/**
 * 2. GET /api/equipment/categories
 * Returns distinct category counts of approved equipment.
 */
router.get("/categories", async (req, res) => {
  try {
    const categories = await collections
      .equipment()
      .aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray()

    res.json({
      success: true,
      categories: categories.map((c) => ({ name: c._id, count: c.count })),
    })
  } catch (error) {
    console.error("Error fetching categories:", error)
    res.status(500).json({ message: "Failed to fetch equipment categories" })
  }
})

/**
 * 3. GET /api/equipment
 * Public search, multi-facet filtering, sorting, and pagination.
 */
router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      rentalType,
      minPrice,
      maxPrice,
      availableOnly,
      sort,
      page = 1,
      limit = 9,
    } = req.query

    const query = { status: "Approved" }

    // Search matching name, location, or category with escaped regex
    if (search && typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { location: { $regex: escaped, $options: "i" } },
        { category: { $regex: escaped, $options: "i" } },
        { brand: { $regex: escaped, $options: "i" } },
      ]
    }

    // Category filter
    if (category && category !== "all" && typeof category === "string") {
      query.category = category
    }

    // Rental type filter (Daily, Weekly, Monthly)
    if (rentalType && rentalType !== "all" && typeof rentalType === "string") {
      query.rentalType = rentalType
    }

    // Price range filter
    const min = parseFloat(minPrice)
    const max = parseFloat(maxPrice)
    if (!isNaN(min) || !isNaN(max)) {
      query.rentalPrice = {}
      if (!isNaN(min)) query.rentalPrice.$gte = min
      if (!isNaN(max)) query.rentalPrice.$lte = max
    }

    // Availability filter
    if (availableOnly === "true" || availableOnly === true) {
      query.availableQuantity = { $gt: 0 }
    }

    // Sorting
    let sortQuery = { createdAt: -1 } // Default: newest
    if (sort === "price-asc") {
      sortQuery = { rentalPrice: 1 }
    } else if (sort === "price-desc") {
      sortQuery = { rentalPrice: -1 }
    } else if (sort === "newest") {
      sortQuery = { createdAt: -1 }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 9))
    const skip = (pageNum - 1) * limitNum

    const total = await collections.equipment().countDocuments(query)
    const equipment = await collections
      .equipment()
      .find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .toArray()

    const totalPages = Math.ceil(total / limitNum) || 1

    res.json({
      success: true,
      equipment,
      total,
      page: pageNum,
      totalPages,
      hasMore: pageNum < totalPages,
    })
  } catch (error) {
    console.error("Error querying equipment catalog:", error)
    res.status(500).json({ message: "Failed to load equipment catalog" })
  }
})

/**
 * 3. GET /api/equipment/:id
 * Single equipment details lookup.
 * Validates ObjectId and returns 400 if invalid (never 500).
 */
router.get("/:id", async (req, res) => {
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
    console.error("Error retrieving equipment item:", error)
    res.status(500).json({ message: "Failed to retrieve equipment details" })
  }
})

export default router
