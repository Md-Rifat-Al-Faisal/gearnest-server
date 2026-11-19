import express from "express"
import cors from "cors"
import "dotenv/config"
import { connectDB } from "./lib/db.js"
import { verifyToken, verifyRenter, verifyOwner, verifyAdmin } from "./lib/auth.js"

const app = express()
const port = process.env.PORT || 5000

// Middleware
app.use(express.json())
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
)

// Initialize DB connection
await connectDB()

// Root route
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "GearNest Rental Platform API is running",
    time: new Date().toISOString(),
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

app.listen(port, () => {
  console.log(`GearNest server running on port ${port}`)
})

export default app
