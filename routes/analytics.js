import express from "express"
import { ObjectId } from "mongodb"
import { collections } from "../lib/db.js"
import { verifyToken, verifyAdmin, verifyOwner } from "../lib/auth.js"

const router = express.Router()

/**
 * Helper to generate zero-filled past 6 months using UTC dates.
 * Eliminates month/timezone boundary discrepancies.
 */
function getPastSixMonthsUTC() {
  const months = []
  const now = new Date()

  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    months.push({ key, month: label, bookings: 0, revenue: 0, earnings: 0 })
  }
  return months
}

/**
 * GET /api/analytics/admin
 * Aggregates platform-wide metrics: user count, equipment by category,
 * rental statuses, verified payments revenue, and zero-filled 6-month trends.
 */
router.get("/admin", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))

    // 1. Parallel summary counts
    const [
      totalUsers,
      totalEquipment,
      allTimePaidBookings,
      pendingApprovals,
      activeRentals,
      completedRentals,
      paymentRevenueAgg,
      bookingRevenueAgg,
      monthlyPaymentsAgg,
      categoryAgg,
      statusAgg,
    ] = await Promise.all([
      collections.users().countDocuments({}),
      collections.equipment().countDocuments({}),
      // Count confirmed/paid bookings only (excludes abandoned pending checkouts)
      collections.bookings().countDocuments({ paymentStatus: "paid" }),
      collections.equipment().countDocuments({ status: "Pending" }),
      collections.bookings().countDocuments({ bookingStatus: "active" }),
      collections.bookings().countDocuments({ bookingStatus: "completed" }),
      // Primary revenue from payments collection
      collections
        .payments()
        .aggregate([
          { $match: { status: { $in: ["succeeded", "completed"] } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // Fallback revenue from paid bookings
      collections
        .bookings()
        .aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ])
        .toArray(),
      // Monthly revenue trend from payments collection grouped by paidAt in UTC
      collections
        .payments()
        .aggregate([
          {
            $match: {
              status: { $in: ["succeeded", "completed"] },
              $expr: {
                $gte: [{ $ifNull: ["$paidAt", "$createdAt"] }, sixMonthsAgo],
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: { $ifNull: ["$paidAt", "$createdAt"] },
                  timezone: "UTC",
                },
              },
              bookings: { $sum: 1 },
              revenue: { $sum: "$amount" },
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

    // Total revenue directly from verified payments collection
    const totalRevenue = paymentRevenueAgg[0]?.total || 0

    // 2. Zero-fill monthly trends
    const monthTemplates = getPastSixMonthsUTC()
    const aggMap = new Map(monthlyPaymentsAgg.map((m) => [m._id, m]))

    const monthlyStats = monthTemplates.map((m) => {
      const match = aggMap.get(m.key)
      return {
        month: m.month,
        bookings: match ? match.bookings : 0,
        revenue: match ? match.revenue : 0,
      }
    })

    // Make totalBookings strictly consistent with the chart sum
    const totalBookings = monthlyStats.reduce((acc, m) => acc + (m.bookings || 0), 0)

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
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))

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
              paidAt: { $gte: sixMonthsAgo },
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: { $ifNull: ["$paidAt", "$createdAt"] }, timezone: "UTC" } },
              bookings: { $sum: 1 },
              earnings: { $sum: "$totalAmount" },
            },
          },
        ])
        .toArray(),
    ])

    const totalEarnings = earningsAgg[0]?.total || 0

    // 2. Zero-fill monthly earnings trends
    const monthTemplates = getPastSixMonthsUTC()
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
