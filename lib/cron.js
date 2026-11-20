import cron from "node-cron"
import { ObjectId } from "mongodb"
import { collections } from "./db.js"

/**
 * Scans active bookings and automatically marks them "completed"
 * when their rental end date has passed, atomically restoring equipment stock.
 */
export async function autoCompleteExpiredRentals() {
  try {
    const bookingsColl = collections.bookings()
    const equipmentColl = collections.equipment()

    if (!bookingsColl || !equipmentColl) {
      return
    }

    const now = new Date()

    // Find all active bookings whose rental end date has passed
    const activeBookings = await bookingsColl
      .find({ bookingStatus: "active" })
      .toArray()

    let completedCount = 0

    for (const booking of activeBookings) {
      if (!booking.endDate) continue

      const endDate = new Date(booking.endDate)
      // Check if end date is strictly in the past (before current moment)
      if (endDate < now) {
        // 1. Atomically transition booking status from active to completed
        const updateRes = await bookingsColl.updateOne(
          {
            _id: booking._id,
            bookingStatus: "active", // Concurrency guard
          },
          {
            $set: {
              bookingStatus: "completed",
              completedAt: now,
              completedBy: "cron-job",
              updatedAt: now,
            },
          }
        )

        // 2. Only restore stock if the atomic transition succeeded
        if (updateRes.modifiedCount > 0 && booking.equipmentId && booking.quantity) {
          try {
            const eqId = ObjectId.isValid(booking.equipmentId)
              ? new ObjectId(booking.equipmentId)
              : booking.equipmentId

            await equipmentColl.updateOne(
              { _id: eqId },
              { $inc: { availableQuantity: Number(booking.quantity) || 1 } }
            )

            console.log(
              `[CRON] Auto-completed expired rental ${booking._id} for equipment ${booking.equipmentName || booking.equipmentId}. Restored ${booking.quantity} unit(s).`
            )
            completedCount++
          } catch (stockErr) {
            console.error(`[CRON] Error restoring stock for booking ${booking._id}:`, stockErr.message)
          }
        }
      }
    }

    if (completedCount > 0) {
      console.log(`[CRON] Total expired rentals auto-completed and restocked: ${completedCount}`)
    }
    return { completedCount }
  } catch (error) {
    console.error("[CRON] Error during automated rental expiration check:", error.message)
    return { completedCount: 0, error: error.message }
  }
}

let lastAuditTime = 0
/**
 * Throttled lazy runner (runs at most once every 60 seconds on incoming requests)
 * Guarantees automated expiration even on Vercel serverless functions without persistent daemon.
 */
export async function lazyAuditExpiredRentals() {
  const now = Date.now()
  if (now - lastAuditTime > 60 * 1000) {
    lastAuditTime = now
    autoCompleteExpiredRentals().catch((err) =>
      console.warn("Notice: lazy expiration check warning:", err.message)
    )
  }
}

/**
 * Initializes scheduled cron jobs for GearNest
 */
export function initCronJobs() {
  // Run on the hour every hour: "0 * * * *"
  cron.schedule("0 * * * *", async () => {
    console.log("[CRON] Running scheduled rental expiration check...")
    await autoCompleteExpiredRentals()
  })

  // Run initial check 10 seconds after server startup
  setTimeout(async () => {
    console.log("[CRON] Initial startup rental expiration audit running...")
    await autoCompleteExpiredRentals()
  }, 10000)

  console.log("Automated booking expiration cron job initialized (hourly schedule)")
}
