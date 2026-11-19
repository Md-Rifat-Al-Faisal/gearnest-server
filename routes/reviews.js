import express from "express"
import { collections } from "../lib/db.js"

const router = express.Router()

// GET /api/reviews - Customer reviews for landing page
router.get("/", async (req, res) => {
  try {
    const reviews = await collections
      .reviews()
      .find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray()

    res.json({ success: true, count: reviews.length, reviews })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    res.status(500).json({ message: "Failed to fetch reviews" })
  }
})

export default router
