import express from "express"
import cors from "cors"
import "dotenv/config"
import { connectDB } from "./lib/db.js"
import { verifyToken, verifyRenter, verifyOwner, verifyAdmin } from "./lib/auth.js"
import ownerRoutes from "./routes/owner.js"
import adminRoutes from "./routes/admin.js"
import equipmentRoutes from "./routes/equipment.js"
import reviewsRoutes from "./routes/reviews.js"
import customerRoutes from "./routes/customer.js"
import bookingsRoutes from "./routes/bookings.js"
import usersRoutes from "./routes/users.js"
import analyticsRoutes from "./routes/analytics.js"

const app = express()
const port = process.env.PORT || 5000

// Middleware - CORS allowing CLIENT_URL, http://localhost:3000, and credentials
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean)

app.use(express.json())
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, postman)
      if (!origin) return callback(null, true)
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        process.env.NODE_ENV !== "production"
      ) {
        return callback(null, true)
      }
      return callback(null, true)
    },
    credentials: true,
  })
)

// Graceful database connection initialization
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

// Modular feature routes
app.use("/api/owner", ownerRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/equipment", equipmentRoutes)
app.use("/api/reviews", reviewsRoutes)
app.use("/api/customer", customerRoutes)
app.use("/api/bookings", bookingsRoutes)
app.use("/api/users", usersRoutes)
app.use("/api/analytics", analyticsRoutes)

// Phase 1 Verification Endpoint (Verifies Better-Auth JWT via JWKS and loads DB user)
app.get("/api/test/verify-jwt", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Better-Auth JWT successfully verified via JWKS",
    user: req.user,
  })
})

// Phase 1 Role Check Verification Endpoints
app.get("/api/test/customer-only", verifyToken, verifyRenter, (req, res) => {
  res.json({ success: true, message: "Welcome, verified Customer", user: req.user })
})

app.get("/api/test/owner-only", verifyToken, verifyOwner, (req, res) => {
  res.json({ success: true, message: "Welcome, verified Owner", user: req.user })
})

app.get("/api/test/admin-only", verifyToken, verifyAdmin, (req, res) => {
  res.json({ success: true, message: "Welcome, verified Admin", user: req.user })
})

// In local development, run app.listen; on Vercel serverless, Vercel invokes export default app
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`GearNest server running locally on port ${port}`)
  })
}

export default app
