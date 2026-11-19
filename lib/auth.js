import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, importJWK } from "jose"
import { ObjectId } from "mongodb"
import { collections, getDB } from "./db.js"
import "dotenv/config"

let jwksInstance = null
const keyCache = new Map()

function getJWKS() {
  if (!jwksInstance) {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
    jwksInstance = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`))
  }
  return jwksInstance
}

async function getKeyForToken(token) {
  try {
    const header = decodeProtectedHeader(token)
    if (header?.kid) {
      if (keyCache.has(header.kid)) {
        return keyCache.get(header.kid)
      }

      const db = getDB()
      if (db) {
        const query = ObjectId.isValid(header.kid)
          ? { _id: new ObjectId(header.kid) }
          : { _id: header.kid }
        const keyRecord = await db.collection("jwks").findOne(query)
        if (keyRecord && keyRecord.publicKey) {
          const jwk = typeof keyRecord.publicKey === "string"
            ? JSON.parse(keyRecord.publicKey)
            : keyRecord.publicKey
          const key = await importJWK(jwk, header.alg || keyRecord.alg || "EdDSA")
          keyCache.set(header.kid, key)
          return key
        }
      }
    }
  } catch (err) {
    console.warn("Notice: direct DB JWK resolution error:", err.message)
  }
  return null
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
    let payload = null

    // 1. First attempt instant DB key resolution (works across localhost and cloud with 0 network latency)
    const dbKey = await getKeyForToken(token)
    if (dbKey) {
      const res = await jwtVerify(token, dbKey)
      payload = res.payload
    } else {
      // 2. Fall back to remote JWKS endpoint
      const JWKS = getJWKS()
      const res = await jwtVerify(token, JWKS)
      payload = res.payload
    }

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
