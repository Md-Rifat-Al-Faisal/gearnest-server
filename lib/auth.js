import { createRemoteJWKSet, jwtVerify } from "jose"
import { ObjectId } from "mongodb"
import { collections } from "./db.js"
import "dotenv/config"

let jwksInstance = null

function getJWKS() {
  if (!jwksInstance) {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
    jwksInstance = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`))
  }
  return jwksInstance
}

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token required" })
  }

  const token = authHeader.split(" ")[1]
  if (!token) {
    return res.status(401).json({ message: "Token missing" })
  }

  try {
    const JWKS = getJWKS()
    const { payload } = await jwtVerify(token, JWKS)

    const users = collections.users()
    let dbUser = null

    if (payload.sub) {
      if (ObjectId.isValid(payload.sub)) {
        dbUser = await users.findOne({ _id: new ObjectId(payload.sub) })
      } else {
        dbUser = await users.findOne({ _id: payload.sub })
      }
    }

    if (!dbUser && payload.email) {
      dbUser = await users.findOne({ email: payload.email })
    }

    if (!dbUser) {
      return res.status(401).json({ message: "User account not found" })
    }

    req.user = {
      id: dbUser._id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role || "customer",
    }

    next()
  } catch (error) {
    console.error("JWT verification failed:", error.message)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

export function verifyRenter(req, res, next) {
  if (req.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access required" })
  }
  next()
}

export function verifyOwner(req, res, next) {
  if (req.user?.role !== "owner") {
    return res.status(403).json({ message: "Owner access required" })
  }
  next()
}

export function verifyAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" })
  }
  next()
}
