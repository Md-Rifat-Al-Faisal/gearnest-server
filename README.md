# GearNest API — High-Performance Industrial Rental Engine & Dispatch Backend

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express 5](https://img.shields.io/badge/Express-5.0-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB_Atlas-6.x_Native-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Stripe API](https://img.shields.io/badge/Stripe_API-17.4-626CD9?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com/)
[![Jose JWKS](https://img.shields.io/badge/Jose_JWKS-5.9-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://github.com/panva/jose)
[![Node-Cron](https://img.shields.io/badge/Node--Cron-4.6-FF6C37?style=for-the-badge&logo=postman&logoColor=white)](https://github.com/node-cron/node-cron)
[![Vercel Serverless](https://img.shields.io/badge/Vercel_Serverless-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

The **GearNest Server** is a RESTful API backend engineered with Express 5, MongoDB Native Driver, Stripe Checkout, and Better-Auth JWT verification. It provides atomic inventory locking, equipment catalog discovery, fleet lifecycle tracking, role-based access control (RBAC), and platform analytics aggregations.

- **Production API URL**: [https://gearnest-server.vercel.app](https://gearnest-server.vercel.app)
- **Production Client URL**: [https://gearnest-client.vercel.app](https://gearnest-client.vercel.app)

---

## Architectural Highlights

- **Database-Backed JWKS Resolution**: Tokens signed by Better-Auth are verified using public keys retrieved directly from MongoDB's `jwks` collection using `jose` (`importJWK` and `jwtVerify`) with in-memory caching. This eliminates external HTTP latency on every protected request.
- **Atomic Stock Progression**: Booking reservations and return transitions utilize atomic MongoDB operations (`findOneAndUpdate` with `$inc` and conditional filters) to guarantee zero double-bookings or lost fleet counts.
- **Idempotent Payment Verification**: Stripe checkout sessions are verified with strict amount checks, status assertions (`payment_status === "paid"`), and one-time atomic claims.
- **Automated Rental Expiration**: Dual-mode engine supporting background `node-cron` in local environments and lazy on-demand audits + Vercel Cron (`/api/cron/expire-rentals`) in serverless deployments.

---

## Demo Accounts & Role-Based Access

The platform features pre-configured accounts across all access tiers:

| Role | Demo Email | Access Scope |
| :--- | :--- | :--- |
| **Customer** | `customer@gearnest.com` | Public catalog discovery, wishlist, dynamic Stripe checkout, active rental tracking |
| **Fleet Owner** | `owner@gearnest.com` | Equipment listing wizard, fleet orders, return dispatch, atomic stock restoration, partner analytics |
| **Platform Administrator** | `admin@gearnest.com` | Fleet moderation queue, platform user RBAC, platform-wide rentals audit, master analytics |

> [!NOTE]
> Demo passwords are protected against unauthorized modification on shared environments. Evaluators can log in using the pre-configured credentials provided above or in the evaluation submission form.

---

## API Endpoints Reference

### 1. Public Catalog & Contact
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/equipment/featured` | Returns newest approved listings for landing page showcases. |
| `GET` | `/api/equipment` | Search (name, brand, location), category filter, rate limits, stock availability, and pagination. |
| `GET` | `/api/equipment/:id` | Detailed machinery specifications, condition, and owner contact card. |
| `POST` | `/api/contact` | Submits jobsite inquiry form into MongoDB `contacts` collection. |
| `GET` | `/api/reviews` | Retrieves operator testimonials and verified ratings. |

### 2. Customer Routes (`verifyToken`, `verifyRenter`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/customer/favorites` | Upserts saved equipment using compound index `{ customerId: 1, equipmentId: 1 }`. |
| `GET` | `/api/customer/favorites` | Returns user favorites populated via MongoDB `$lookup` for live pricing and stock. |
| `DELETE` | `/api/customer/favorites/:equipmentId` | Removes equipment from user favorites. |
| `POST` | `/api/bookings/initiate` | Computes rental duration, unit pricing, validates stock, and creates pending booking. |
| `POST` | `/api/bookings/verify` | Idempotently verifies paid Stripe session, claims booking, and decrements stock. |
| `GET` | `/api/customer/rentals` | Returns personal rental bookings and payment receipts. |
| `PATCH` | `/api/customer/rentals/:id/cancel` | Allows customers to cancel pending, unpaid reservations. |

### 3. Stripe Webhook & Fulfillment
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/webhooks/stripe` | Processes raw Stripe `checkout.session.completed` events with signature verification. |

### 4. Equipment Owner Routes (`verifyToken`, `verifyOwner`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/owner/equipment` | Creates a new machinery listing with default `"Pending"` moderation status. |
| `GET` | `/api/owner/equipment` | Lists all machinery owned by authenticated partner. |
| `PATCH` | `/api/owner/equipment/:id` | Updates machinery parameters, rental rates, or specifications. |
| `DELETE` | `/api/owner/equipment/:id` | Deletes machinery listing (blocked if active bookings exist). |
| `GET` | `/api/owner/rentals` | Returns all reservations placed on owner's fleet. |
| `PATCH` | `/api/owner/rentals/:id/status` | Transitions booking status (`active` $\rightarrow$ `completed` or `cancelled`) with atomic stock restoration. |

### 5. Administrator Routes (`verifyToken`, `verifyAdmin`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/equipment` | Returns all platform machinery across all moderation statuses. |
| `PATCH` | `/api/admin/equipment/:id/status` | Approves or rejects submitted equipment listings. |
| `PATCH` | `/api/admin/equipment/:id` | Administrative edits on any listing. |
| `DELETE` | `/api/admin/equipment/:id` | Removes listing from platform (blocked if active bookings exist). |
| `GET` | `/api/admin/rentals` | Complete audit log of all bookings across the platform. |
| `GET` | `/api/admin/users` | Lists registered platform accounts with optional role filtering. |
| `PATCH` | `/api/admin/users/:id/role` | Updates user role (`customer`, `owner`, `admin`) with self-demotion guardrail. |
| `DELETE` | `/api/admin/users/:id` | Removes platform user (blocked from deleting own admin account). |

### 6. Analytics Aggregations (`/api/analytics`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/analytics/admin` | Parallel MongoDB aggregations: revenue, users, equipment, 6-month trajectory, category split. |
| `GET` | `/api/analytics/owner` | Owner-scoped aggregations: earnings velocity, fleet inventory, order distribution. |

### 7. Automated Rental Expiration
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/cron/expire-rentals` | Evaluates past-due active bookings (`endDate` < current time), transitions to `"completed"`, and restores inventory. Protected by optional cron secret. |

---

## Tech Stack & Core Technologies

| Technology | Badge | Purpose |
| :--- | :--- | :--- |
| **Node.js** | ![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs) | Server runtime |
| **Express 5** | ![Express](https://img.shields.io/badge/Express-5.0-000000?logo=express) | REST API framework & routing |
| **MongoDB Native** | ![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?logo=mongodb) | High-performance document database driver |
| **Stripe** | ![Stripe](https://img.shields.io/badge/Stripe-17.4-626CD9?logo=stripe) | Server SDK for checkout sessions & webhooks |
| **Jose** | ![Jose](https://img.shields.io/badge/Jose-5.9-000000?logo=jsonwebtokens) | Cryptographic JWKS resolution & JWT verification |
| **Node-Cron** | ![Cron](https://img.shields.io/badge/Node--Cron-4.6-FF6C37?logo=postman) | Scheduled rental lifecycle audits |

---

## Environment Variables Reference

Create a `.env` file in the `gearnest-server` root directory:

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Atlas Database URI
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/gearnestdb"
DB_NAME="gearnestdb"

# Client Web Application URL (CORS & Remote JWKS fallback)
CLIENT_URL="http://localhost:3000"

# Stripe Secret Key (Test Mode)
STRIPE_SECRET_KEY="sk_test_..."

# Optional Stripe Webhook Signing Secret
STRIPE_WEBHOOK_SECRET="whsec_..."

# Optional Vercel Cron Secret (for protected cron triggers)
CRON_SECRET="your_secure_cron_secret"
```

---

## Local Setup & Database Seeding

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
   # Update MongoDB URI and Stripe Secret Key
   ```

4. **Seed database with equipment listings & testimonials**:
   ```bash
   node seed.js owner@gearnest.com
   ```

5. **Start server**:
   ```bash
   # Development mode
   node index.js
   ```
