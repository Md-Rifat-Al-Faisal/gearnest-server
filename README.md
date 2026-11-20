# GearNest — Industrial Equipment Rental Platform (Backend Server)

The **GearNest Server** is a robust RESTful API backend engineered with Express 5, MongoDB Native Driver, Stripe Checkout, and Better-Auth JWT verification. It powers equipment catalog discovery, fleet lifecycle management, atomic inventory control, rental contract progression, and platform-wide analytics aggregations.

- **Live API Base URL**: [https://gearnest-server.vercel.app](https://gearnest-server.vercel.app)
- **Frontend Client Application**: [https://gearnest-client.vercel.app](https://gearnest-client.vercel.app)

---

## Architecture & API Overview

### 1. Public Catalog & Testimonials
- `GET /api/equipment/featured`: Returns the 6 highest-rated approved equipment listings for landing page showcases.
- `GET /api/equipment`: Escaped regex query search (name, model, brand, location), category filter, rental type filter, price range limits, availability filter, and server-side pagination.
- `GET /api/equipment/:id`: Retrieves individual machinery specs and validated owner contact metadata. Validates ObjectIds (returns HTTP 400 on malformed IDs, never 500).
- `GET /api/reviews`: Returns platform customer testimonials and rating metrics.

### 2. Customer Routes (`verifyToken`, `verifyRenter`)
- `POST /api/customer/favorites`: Upserts a favorite equipment reference using a unique compound index `{ customerId: 1, equipmentId: 1 }`.
- `GET /api/customer/favorites`: Returns user's saved machinery populated via MongoDB `$lookup` so prices and availability stay real-time.
- `DELETE /api/customer/favorites/:equipmentId`: Removes equipment from the renter's favorites.
- `POST /api/bookings/initiate`: Server-side duration computation (`Math.max(1, Math.ceil((end - start) / 86400000))`), unit rate calculation (`Daily`, `Weekly`, `Monthly`), inventory check (`availableQuantity >= quantity`), and pending reservation creation.
- `POST /api/bookings/verify`: Validates Stripe `checkout.session.completed` webhook or client verification, updates payment to `paid`, marks booking `active`, and atomically decrements equipment stock via `$inc: { availableQuantity: -quantity }`. Idempotent against repeat triggers.
- `GET /api/customer/rentals`: Returns personal rental contracts and payment status.

### 3. Equipment Owner Routes (`verifyToken`, `verifyOwner`)
- `POST /api/owner/equipment`: Creates a new equipment listing with default status `"Pending"` awaiting administrative moderation.
- `GET /api/owner/equipment`: Lists all machinery owned by the authenticated user (`req.user.id`).
- `PATCH /api/owner/equipment/:id`: Updates equipment parameters, rental price, term, or condition.
- `DELETE /api/owner/equipment/:id`: Deletes machinery listing (strictly blocked if active bookings exist).
- `GET /api/owner/rentals`: Returns all reservations placed on equipment owned by `req.user.id`.
- `PATCH /api/owner/rentals/:id/status`: Transitions rental status (`active` $\rightarrow$ `completed` or `cancelled`). **Guards atomic stock restoration**: only increments `availableQuantity` when transitioning out of `"active"` status to prevent double-restores.

### 4. Administrative Routes (`verifyToken`, `verifyAdmin`)
- `GET /api/admin/equipment`: Returns all platform equipment across all statuses.
- `PATCH /api/admin/equipment/:id/status`: Approves or Rejects submitted equipment listings.
- `PATCH /api/admin/equipment/:id`: Administrative overrides on any listing.
- `DELETE /api/admin/equipment/:id`: Removes platform listing (blocked if active bookings exist).
- `GET /api/admin/rentals`: Full audit log of all bookings across the platform.
- `GET /api/admin/users`: Lists registered accounts with optional role filtering.
- `PATCH /api/admin/users/:id/role`: Promotes or demotes user role (`customer`, `owner`, `admin`). Blocks admins from demoting themselves (`id === req.user.id`).
- `DELETE /api/admin/users/:id`: Removes platform user (blocked from deleting own admin account).

### 5. Analytics Aggregations (`/api/analytics`)
- `GET /api/analytics/admin` (`verifyToken`, `verifyAdmin`):
  - Parallel MongoDB aggregations for `totalUsers`, `totalEquipment`, `totalBookings`, `pendingApprovals`, `activeRentals`, `completedRentals`, and `totalRevenue`.
  - Zero-filled past 6-month monthly trends (`monthlyStats`: `month`, `bookings`, `revenue`).
  - Equipment category breakdown and status distribution.
- `GET /api/analytics/owner` (`verifyToken`, `verifyOwner`):
  - Owner-scoped counts: `totalListedEquipment`, `approvedEquipment`, `pendingEquipment`, `rejectedEquipment`, `activeRentals`, `completedRentals`, `totalEarnings`.
  - Zero-filled past 6-month earnings velocity (`monthlyEarnings`: `month`, `bookings`, `earnings`).
  - Fleet moderation status breakdown.

### 6. User Profile Routes (`/api/users`)
- `GET /api/users/profile` (`verifyToken`): Returns authenticated user information.
- `PATCH /api/users/profile` (`verifyToken`): Updates phone, address, name, or profile image.

### 7. Automated Booking Status Expiration (Cron Job)
- Powered by `node-cron` running on an hourly schedule.
- Scans for all active bookings where `endDate < new Date()`.
- Atomically transitions status to `"completed"` and restores equipment inventory (`availableQuantity += quantity`).

---

## Authentication & Security

- **Database-Backed JWKS Resolution**: Tokens signed by Better-Auth are verified using public keys retrieved directly from MongoDB's `jwks` collection via `jose` (`importJWK` and `jwtVerify`) with in-memory caching. This guarantees immediate zero-latency verification without external HTTP roundtrips.
- **Remote JWKS Fallback**: If key is not in MongoDB, falls back to `createRemoteJWKSet`.
- **RBAC Enforcement**: Middleware guards (`verifyToken`, `verifyRenter`, `verifyOwner`, `verifyAdmin`) enforce strict role hierarchy.

---

## Demo Credentials

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Customer** | `customer@gearnest.com` | `Password123!` | Public Catalog, Wishlist, Checkout, Customer Dashboard |
| **Fleet Owner** | `owner@gearnest.com` | `Password123!` | Add/Edit Equipment, Fleet Orders, Stock Restore, Owner Analytics |
| **Admin** | `admin@gearnest.com` | `Password123!` | Moderate Equipment, Manage Users, Platform Analytics, All Rentals |

---

## Tech Stack & Dependencies

```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^5.0.0",
    "jose": "^5.9.6",
    "mongodb": "^6.12.0",
    "node-cron": "^3.0.3",
    "stripe": "^17.4.0"
  }
}
```

---

## Environment Variables Reference

Create a `.env` file in the `gearnest-server` root directory:

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Atlas Connection
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/gearnestdb"
DB_NAME="gearnestdb"

# Client Application URL (for CORS and JWKS fallback)
CLIENT_URL="http://localhost:3000"

# Stripe Secret Key (Test Mode)
STRIPE_SECRET_KEY="sk_test_..."
```

---

## Local Setup & Seeding

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Md-Rifat-Al-Faisal/gearnest-server.git
   cd gearnest-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Add your MongoDB connection string and Stripe secret key
   ```

4. **Seed database with sample machinery and customer reviews**:
   ```bash
   node seed.js owner@gearnest.com
   ```

5. **Start the server with hot-reloading**:
   ```bash
   npm run dev
   # Server runs at http://localhost:5000
   ```
