import { MongoClient } from "mongodb"
import "dotenv/config"

let client = null
let dbInstance = null

function getClient() {
  if (!client) {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gearnestdb"
    client = new MongoClient(uri)
  }
  return client
}

export async function connectDB() {
  if (dbInstance) return dbInstance
  try {
    const c = getClient()
    await c.connect()
    console.log("Connected to MongoDB (GearNest)")
    dbInstance = c.db(process.env.DB_NAME || "gearnestdb")
    return dbInstance
  } catch (error) {
    console.error("MongoDB connection error:", error.message)
    throw error
  }
}

export function getDB() {
  if (!dbInstance) {
    const c = getClient()
    dbInstance = c.db(process.env.DB_NAME || "gearnestdb")
  }
  return dbInstance
}

export const collections = {
  users: () => getDB().collection("user"),
  equipment: () => getDB().collection("equipment"),
  bookings: () => getDB().collection("bookings"),
  payments: () => getDB().collection("payments"),
  favorites: () => getDB().collection("favorites"),
  reviews: () => getDB().collection("reviews"),
}
