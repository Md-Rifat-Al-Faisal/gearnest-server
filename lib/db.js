import { MongoClient } from "mongodb"
import "dotenv/config"

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gearnestdb"

const client = new MongoClient(uri)

let dbInstance = null

export async function connectDB() {
  if (dbInstance) return dbInstance
  try {
    await client.connect()
    console.log("Connected to MongoDB (GearNest)")
    dbInstance = client.db(process.env.DB_NAME || "gearnestdb")
    return dbInstance
  } catch (error) {
    console.error("MongoDB connection error:", error)
    throw error
  }
}

export function getDB() {
  if (!dbInstance) {
    dbInstance = client.db(process.env.DB_NAME || "gearnestdb")
  }
  return dbInstance
}

export const collections = {
  users: () => getDB().collection("user"), // Better-Auth default collection is "user"
  equipment: () => getDB().collection("equipment"),
  bookings: () => getDB().collection("bookings"),
  payments: () => getDB().collection("payments"),
  favorites: () => getDB().collection("favorites"),
  reviews: () => getDB().collection("reviews"),
}
