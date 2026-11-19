import express from "express"
import cors from "cors"
import "dotenv/config"
import { connectDB } from "./lib/db.js"
import { verifyToken, verifyRenter, verifyOwner, verifyAdmin } from "./lib/auth.js"

const app = express()
const port = process.env.PORT || 5000

// Middleware - allow localhost & any vercel preview deployment dynamically
app.use(express.json())
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true)
      // Allow all origins (reflection) while supporting credentials
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

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})

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
