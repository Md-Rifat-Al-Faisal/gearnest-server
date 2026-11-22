import express from "express"
import cors from "cors"
import "dotenv/config"
import Stripe from "stripe"
import { connectDB, collections } from "./lib/db.js"
import ownerRoutes from "./routes/owner.js"
import adminRoutes from "./routes/admin.js"
import equipmentRoutes from "./routes/equipment.js"
import reviewsRoutes from "./routes/reviews.js"
import customerRoutes from "./routes/customer.js"
import bookingsRoutes, { fulfillPaidBooking } from "./routes/bookings.js"
import usersRoutes from "./routes/users.js"
import analyticsRoutes from "./routes/analytics.js"
import { initCronJobs, autoCompleteExpiredRentals } from "./lib/cron.js"

const app = express()
const port = process.env.PORT || 5000

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
})

// CORS origins configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://gearnest-client.vercel.app",
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, postman)
      if (!origin) return callback(null, true)
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /^https:\/\/gearnest-client(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)

      if (isAllowed) {
        return callback(null, true)
      }
      return callback(new Error("CORS policy violation: origin not allowed"), false)
    },
    credentials: true,
  })
)

// Stripe Webhook mounted with raw body parser BEFORE express.json()
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"]
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
    let event

    try {
      if (endpointSecret && sig && stripe) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret)
      } else {
        // Fallback in dev or unconfigured webhook secret
        event =
          typeof req.body === "string" || Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString())
            : req.body
      }
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message)
      return res.status(400).send(`Webhook Error: ${err.message}`)
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const bookingId = session.metadata?.bookingId
      const sessionId = session.id
      try {
        await fulfillPaidBooking({
          bookingId,
          sessionId,
          session,
          reqUser: null,
        })
        console.log(`[Stripe Webhook] Successfully fulfilled booking: ${bookingId}`)
      } catch (fulfillErr) {
        console.warn(`[Stripe Webhook] Notice during fulfillment:`, fulfillErr.message)
      }
    }

    res.json({ received: true })
  }
)

// Standard JSON body parser for all other endpoints
app.use(express.json())

// Database connection
try {
  await connectDB()
} catch (err) {
  console.error("MongoDB connection warning at startup:", err.message)
}

// Root route
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "GearNest Rental Platform API is running on Vercel Serverless",
    environment: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
  })
})

// Health check endpoint with database ping
app.get("/api/health", async (req, res) => {
  try {
    const db = await connectDB()
    await db.command({ ping: 1 })
    res.json({
      status: "healthy",
      database: "connected",
      dbName: process.env.DB_NAME || "gearnestdb",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: err.message,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  }
})

// Contact Dispatch & Equipment Inquiries endpoint
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, message, subject } = req.body

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required" })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: "Invalid email address format" })
    }

    const inquiry = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : "",
      subject: subject ? subject.trim() : "Equipment Dispatch Inquiry",
      message: message.trim(),
      status: "new",
      createdAt: new Date(),
    }

    const result = await collections.contacts().insertOne(inquiry)

    res.status(201).json({
      success: true,
      message: "Inquiry received. Our dispatch team will review your request.",
      inquiryId: result.insertedId,
    })
  } catch (error) {
    console.error("Error saving contact inquiry:", error)
    res.status(500).json({ message: "Failed to record inquiry" })
  }
})

// Automated cron execution endpoint (protected by CRON_SECRET on Vercel or external monitor)
app.get("/api/cron/expire-rentals", async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET || "gearnest_cron_secret_prod_secure_2026"
    const authHeader = req.headers["authorization"]
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ message: "Unauthorized: Invalid cron secret" })
    }

    const result = await autoCompleteExpiredRentals()
    res.json({
      success: true,
      message: "Automated rental expiration and stock restoration check completed",
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Feature routes
app.use("/api/owner", ownerRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/equipment", equipmentRoutes)
app.use("/api/reviews", reviewsRoutes)
app.use("/api/customer", customerRoutes)
app.use("/api/bookings", bookingsRoutes)
app.use("/api/users", usersRoutes)
app.use("/api/analytics", analyticsRoutes)

// In local development, run app.listen and start background cron jobs; on Vercel serverless, export default app
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`GearNest server running locally on port ${port}`)
    initCronJobs()
  })
}

export default app
