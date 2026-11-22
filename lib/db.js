import { MongoClient } from "mongodb"
import "dotenv/config"

let client = null
let dbInstance = null

function getClient() {
  if (!client) {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/gearnestdb"
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    })
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

    // Ensure database indexes for integrity and performance
    try {
      // 1. Favorites unique compound index (customerId + equipmentId)
      await dbInstance.collection("favorites").createIndex(
        { customerId: 1, equipmentId: 1 },
        { unique: true }
      )
      // 2. Payments unique transaction index to prevent duplicate records
      await dbInstance.collection("payments").createIndex(
        { transactionId: 1 },
        { unique: true, sparse: true }
      )
      // 3. Bookings lookup indexes
      await dbInstance.collection("bookings").createIndex({ customerId: 1 })
      await dbInstance.collection("bookings").createIndex({ ownerId: 1 })
      await dbInstance.collection("bookings").createIndex({ stripeSessionId: 1 })
      // 4. Equipment query indexes
      await dbInstance.collection("equipment").createIndex({ status: 1, category: 1 })
      await dbInstance.collection("equipment").createIndex({ ownerId: 1 })
    } catch (idxErr) {
      console.warn("Notice: index creation status:", idxErr.message)
    }

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
  contacts: () => getDB().collection("contacts"),
}
