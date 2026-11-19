import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken, verifyAdmin, verifyOwner } from "../lib/auth.js"

const router = express.Router()

/**
 * Helper to generate zero-filled past 6 months
 */
function getPastSixMonths() {
  const months = []
  const now = new Date()

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleString("en-US", { month: "short" })
    months.push({ key, month: label, bookings: 0, revenue: 0, earnings: 0 })
  }
  return months
}

/**
 * GET /api/analytics/admin
 * Aggregates platform-wide metrics: user count, equipment by category,
 * rental statuses, total revenue, and zero-filled 6-month trends.
 */
router.get("/admin", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    // 1. Parallel summary counts
    const [
      totalUsers,
      totalEquipment,
      totalBookings,
      pendingApprovals,
      activeRentals,
      completedRentals,
      revenueAgg,
      monthlyAgg,
      categoryAgg,
      statusAgg,
    ] = await Promise.all([
      collections.users().countDocuments({}),
      collections.equipment().countDocuments({}),
      collections.bookings().countDocuments({}),
      collections.equipment().countDocuments({ status: "Pending" }),
      collections.bookings().countDocuments({ bookingStatus: "active" }),
      collections.bookings().countDocuments({ bookingStatus: "completed" }),
      collections
        .bookings()
        .aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ])
        .toArray(),
      collections
        .bookings()
        .aggregate([
          {
            $match: {
              createdAt: { $gte: sixMonthsAgo },
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              bookings: { $sum: 1 },
              revenue: { $sum: "$totalAmount" },
            },
          },
        ])
        .toArray(),
      collections
        .equipment()
        .aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $project: { category: "$_id", count: 1, _id: 0 } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      collections
        .equipment()
        .aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $project: { status: "$_id", count: 1, _id: 0 } },
        ])
        .toArray(),
    ])

    const totalRevenue = revenueAgg[0]?.total || 0

    // 2. Zero-fill monthly trends
    const monthTemplates = getPastSixMonths()
    const aggMap = new Map(monthlyAgg.map((m) => [m._id, m]))

    const monthlyStats = monthTemplates.map((m) => {
      const match = aggMap.get(m.key)
      return {
        month: m.month,
        bookings: match ? match.bookings : 0,
        revenue: match ? match.revenue : 0,
      }
    })

    res.json({
      success: true,
      summary: {
        totalUsers,
        totalEquipment,
        totalBookings,
        pendingApprovals,
        activeRentals,
        completedRentals,
        totalRevenue,
      },
      monthlyStats,
      equipmentByCategory: categoryAgg,
      statusBreakdown: statusAgg,
    })
  } catch (error) {
    console.error("Error generating admin analytics:", error)
    res.status(500).json({
      message: "Failed to generate administrative analytics",
      error: error.message,
    })
  }
})

/**
 * GET /api/analytics/owner
 * Aggregates partner-scoped metrics: listed equipment, status counts,
 * active/completed bookings, total earnings, and zero-filled 6-month earnings.
 */
router.get("/owner", verifyToken, verifyOwner, async (req, res) => {
  try {
    const ownerFilter = {
      $in: [req.user.id, ...(ObjectId.isValid(req.user.id) ? [new ObjectId(req.user.id)] : [])],
    }

    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    // 1. Parallel scoped queries
    const [
      totalListedEquipment,
      approvedEquipment,
      pendingEquipment,
      rejectedEquipment,
      activeRentals,
      completedRentals,
      earningsAgg,
      monthlyEarningsAgg,
    ] = await Promise.all([
      collections.equipment().countDocuments({ ownerId: ownerFilter }),
      collections.equipment().countDocuments({ ownerId: ownerFilter, status: "Approved" }),
      collections.equipment().countDocuments({ ownerId: ownerFilter, status: "Pending" }),
      collections.equipment().countDocuments({ ownerId: ownerFilter, status: "Rejected" }),
      collections.bookings().countDocuments({ ownerId: ownerFilter, bookingStatus: "active" }),
      collections.bookings().countDocuments({ ownerId: ownerFilter, bookingStatus: "completed" }),
      collections
        .bookings()
        .aggregate([
          { $match: { ownerId: ownerFilter, paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ])
        .toArray(),
      collections
        .bookings()
        .aggregate([
          {
            $match: {
              ownerId: ownerFilter,
              createdAt: { $gte: sixMonthsAgo },
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              bookings: { $sum: 1 },
              earnings: { $sum: "$totalAmount" },
            },
          },
        ])
        .toArray(),
    ])

    const totalEarnings = earningsAgg[0]?.total || 0

    // 2. Zero-fill monthly earnings trends
    const monthTemplates = getPastSixMonths()
    const aggMap = new Map(monthlyEarningsAgg.map((m) => [m._id, m]))

    const monthlyEarnings = monthTemplates.map((m) => {
      const match = aggMap.get(m.key)
      return {
        month: m.month,
        bookings: match ? match.bookings : 0,
        earnings: match ? match.earnings : 0,
      }
    })

    const equipmentStatusBreakdown = [
      { name: "Approved", value: approvedEquipment, color: "#10b981" },
      { name: "Pending", value: pendingEquipment, color: "#f59e0b" },
      { name: "Rejected", value: rejectedEquipment, color: "#f43f5e" },
    ]

    res.json({
      success: true,
      summary: {
        totalListedEquipment,
        approvedEquipment,
        pendingEquipment,
        rejectedEquipment,
        activeRentals,
        completedRentals,
        totalEarnings,
      },
      monthlyEarnings,
      equipmentStatusBreakdown,
    })
  } catch (error) {
    console.error("Error generating owner analytics:", error)
    res.status(500).json({
      message: "Failed to generate owner analytics",
      error: error.message,
    })
  }
})

export default router
