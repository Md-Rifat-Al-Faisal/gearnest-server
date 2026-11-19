import "dotenv/config"
import { MongoClient, ObjectId } from "mongodb"

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI is not defined in .env")
  process.exit(1)
}

const client = new MongoClient(uri)

const SEED_EQUIPMENT = [
  // 1. Construction
  {
    name: "CAT 308 CR Mini Hydraulic Excavator",
    description: "Compact 8-ton excavator engineered for high performance in tight commercial and residential job sites. Features enclosed cab with AC, swing boom, and rubber tracks.",
    category: "Construction",
    location: "Austin, TX",
    rentalPrice: 380,
    rentalType: "Daily",
    availableQuantity: 3,
    condition: "Excellent",
    brand: "Caterpillar",
    model: "308 CR",
    image: "https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Operator license verification required. Cleaning fee applies if returned unwashed.",
    status: "Approved",
  },
  {
    name: "Bobcat S650 Skid-Steer Loader",
    description: "Versatile medium-frame skid-steer loader with 74 HP turbo diesel engine and rated operating capacity of 2,690 lbs. Includes standard bucket and auxiliary hydraulics.",
    category: "Construction",
    location: "Denver, CO",
    rentalPrice: 240,
    rentalType: "Daily",
    availableQuantity: 4,
    condition: "Good",
    brand: "Bobcat",
    model: "S650",
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Full fuel tank on delivery; return full or fuel surcharge applies. Security deposit required.",
    status: "Approved",
  },

  // 2. Photography
  {
    name: "Sony FX6 Cinema Camera Production Package",
    description: "Full-frame 4K cinema kit featuring Sony FX6 body, 24-70mm f/2.8 GM II lens, 2x 160GB CFexpress Type A cards, Tilta V-mount cage, and 2x Anton Bauer batteries.",
    category: "Photography",
    location: "Los Angeles, CA",
    rentalPrice: 195,
    rentalType: "Daily",
    availableQuantity: 2,
    condition: "Like New",
    brand: "Sony",
    model: "ILME-FX6V",
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Certificate of Insurance (COI) or credit hold required prior to handover.",
    status: "Approved",
  },
  {
    name: "Profoto B10X Plus 500Ws Duo Light Kit",
    description: "Portable off-camera flash and continuous LED studio kit. Includes two 500Ws B10X Plus heads, OCF softboxes, air remote TTL, light stands, and padded backpack.",
    category: "Photography",
    location: "New York, NY",
    rentalPrice: 120,
    rentalType: "Daily",
    availableQuantity: 5,
    condition: "Excellent",
    brand: "Profoto",
    model: "B10X Plus Duo",
    image: "https://images.unsplash.com/photo-1520390138845-fd2d229dd553?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Careful indoor/outdoor handling. Damage waiver available upon request.",
    status: "Approved",
  },

  // 3. Vehicles
  {
    name: "Ford F-350 Super Duty Dually Crew Cab",
    description: "6.7L Power Stroke V8 Turbo Diesel heavy-duty work truck equipped with gooseneck hitch prep, trailer brake controller, and 4x4 off-road package. 20,000 lbs towing capacity.",
    category: "Vehicles",
    location: "Dallas, TX",
    rentalPrice: 750,
    rentalType: "Weekly",
    availableQuantity: 2,
    condition: "Excellent",
    brand: "Ford",
    model: "F-350 Lariat",
    image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Valid commercial or standard driver's license + proof of comprehensive auto insurance required.",
    status: "Approved",
  },
  {
    name: "Cargo Van High Roof 159 Extended",
    description: "Spacious cargo transport van with 460 cu ft payload volume, integrated tie-down D-rings, rear cargo ramp, and rearview backup camera. Ideal for equipment staging and logistics.",
    category: "Vehicles",
    location: "Chicago, IL",
    rentalPrice: 135,
    rentalType: "Daily",
    availableQuantity: 3,
    condition: "Good",
    brand: "Ram",
    model: "ProMaster 2500",
    image: "https://images.unsplash.com/photo-1616422285623-13ff0162193c?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Mileage allowance of 150 miles/day included. Excess mileage billed at $0.35/mile.",
    status: "Approved",
  },

  // 4. Agriculture
  {
    name: "John Deere 5075E Utility Tractor",
    description: "75 HP 3-cylinder diesel utility tractor with 520M front-end loader and 540 PTO. Exceptional maneuverability for pasture mowing, hay moving, and heavy ground management.",
    category: "Agriculture",
    location: "Des Moines, IA",
    rentalPrice: 900,
    rentalType: "Weekly",
    availableQuantity: 2,
    condition: "Good",
    brand: "John Deere",
    model: "5075E",
    image: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Ag-use agreement required. Flatbed transport delivery can be scheduled for additional fee.",
    status: "Approved",
  },
  {
    name: "Kubota ZD1211 Zero Turn Diesel Mower",
    description: "Commercial zero-turn mower featuring 24.8 HP Kubota diesel engine and 60-inch deep aerocut pro deck. Cuts through thick pasture brush with unmatched speed.",
    category: "Agriculture",
    location: "Omaha, NE",
    rentalPrice: 110,
    rentalType: "Daily",
    availableQuantity: 4,
    condition: "Excellent",
    brand: "Kubota",
    model: "ZD1211-60",
    image: "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Clean deck before returning. Blades sharpened prior to rental dispatch.",
    status: "Approved",
  },

  // 5. Electronics
  {
    name: "DJI Matrice 300 RTK Industrial Drone Survey Kit",
    description: "High-end commercial aerial survey platform with Zenmuse H20T thermal hybrid sensor, dual remote controllers, 6x smart flight batteries, and real-time RTK positioning.",
    category: "Electronics",
    location: "Seattle, WA",
    rentalPrice: 420,
    rentalType: "Daily",
    availableQuantity: 2,
    condition: "Like New",
    brand: "DJI",
    model: "Matrice 300 RTK",
    image: "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "FAA Part 107 certified pilot license required for verification before dispatch.",
    status: "Approved",
  },
  {
    name: "FLIR T865 High-Performance Thermal Camera",
    description: "Professional handheld infrared inspection camera with 640 x 480 IR resolution, UltraMax processing, interchangeable 24-degree lens, and laser-assisted autofocus.",
    category: "Electronics",
    location: "San Jose, CA",
    rentalPrice: 180,
    rentalType: "Daily",
    availableQuantity: 3,
    condition: "Excellent",
    brand: "FLIR",
    model: "T865",
    image: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Calibration certificate provided. Shipped in Pelican storm hard case.",
    status: "Approved",
  },

  // 6. Events
  {
    name: "JBL VTX A8 Compact Line Array Sound System",
    description: "Premium concert sound package consisting of 4x JBL VTX A8 dual 8-inch elements, Crown I-Tech 4x3500HD amplifier rack, rigging frames, and multi-core cabling.",
    category: "Events",
    location: "Atlanta, GA",
    rentalPrice: 850,
    rentalType: "Daily",
    availableQuantity: 2,
    condition: "Excellent",
    brand: "JBL Professional",
    model: "VTX A8 System",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Audio engineer staging support available. Load-in and load-out dock access required.",
    status: "Approved",
  },
  {
    name: "Chauvet Professional Rogue Outcast Beam Wash Kit",
    description: "IP65 weather-rated outdoor moving head lighting package. Includes 4x Chauvet Beam Wash fixtures, road flight case, DMX distro, safety cables, and clamps.",
    category: "Events",
    location: "Nashville, TN",
    rentalPrice: 320,
    rentalType: "Daily",
    availableQuantity: 4,
    condition: "Like New",
    brand: "Chauvet Pro",
    model: "Rogue Outcast 1",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=80",
    rentalTerms: "Weather-resistant rated IP65. Grounded 20A power circuits required.",
    status: "Approved",
  },
]

const SEED_REVIEWS = [
  {
    reviewerName: "Marcus Vance",
    reviewerRole: "Commercial Site Superintendent",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    rating: 5,
    comment:
      "GearNest saved our deadline when an on-site excavator blew a hydraulic line. We booked the CAT 308 CR within minutes, and the owner had it delivered to our Austin site before 7 AM the next morning. Clean, flawless machine.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
  },
  {
    reviewerName: "Elena Rostova",
    reviewerRole: "Cinematographer & Commercial Director",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    rating: 5,
    comment:
      "Renting cinema packages used to require tedious paperwork and days of email back-and-forth. The Sony FX6 package on GearNest arrived in a Pelican case in pristine condition, sensor spotless, batteries topped off. Absolutely essential platform.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6), // 6 days ago
  },
  {
    reviewerName: "David Thornton",
    reviewerRole: "Live Productions Director",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    rating: 5,
    comment:
      "The JBL VTX A8 rig delivered pristine acoustic coverage for our 3-day outdoor music festival in Atlanta. Transparent rental pricing, clear terms, and instant Stripe confirmation gave our clients total peace of mind.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
  },
  {
    reviewerName: "Sarah Jenkins",
    reviewerRole: "Precision Agriculture Manager",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
    rating: 5,
    comment:
      "We needed an extra utility tractor during peak harvesting week. Found an approved John Deere 5075E located just 15 miles away. Equipment was meticulously serviced and the owner communicated every detail clearly.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // 14 days ago
  },
  {
    reviewerName: "Keith Gallagher",
    reviewerRole: "Industrial Survey Specialist",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
    rating: 5,
    comment:
      "The Matrice 300 RTK drone survey kit with thermal imaging allowed our infrastructure team to audit 40 acres of utility corridors without any hiccups. GearNest is now our go-to equipment depot.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20), // 20 days ago
  },
]

async function seed() {
  try {
    await client.connect()
    console.log("Connected to MongoDB Atlas...")

    const db = client.db("gearnestdb")
    const usersCol = db.collection("user")
    const equipmentCol = db.collection("equipment")
    const reviewsCol = db.collection("reviews")

    // Determine Owner to associate equipment with
    const cliArg = process.argv[2]
    const envOwner = process.env.OWNER_EMAIL || process.env.OWNER_ID

    let owner = null

    if (cliArg) {
      if (ObjectId.isValid(cliArg)) {
        owner = await usersCol.findOne({ _id: new ObjectId(cliArg) })
      }
      if (!owner) {
        owner = await usersCol.findOne({ email: cliArg })
      }
    }

    if (!owner && envOwner) {
      if (ObjectId.isValid(envOwner)) {
        owner = await usersCol.findOne({ _id: new ObjectId(envOwner) })
      }
      if (!owner) {
        owner = await usersCol.findOne({ email: envOwner })
      }
    }

    // Try finding any user with role "owner" or any user
    if (!owner) {
      owner = await usersCol.findOne({ role: "owner" })
    }
    if (!owner) {
      owner = await usersCol.findOne({})
    }

    // If no user exists at all in the database yet, construct a placeholder owner ID
    const ownerId = owner ? (owner._id ? owner._id.toString() : owner.id) : new ObjectId().toString()
    const ownerName = owner?.name || "GearNest Certified Equipment Fleet"
    const ownerEmail = owner?.email || "owner@gearnest.com"

    console.log(`Associating equipment with owner: [${ownerName}] (${ownerEmail}, id: ${ownerId})`)

    // Clear existing equipment and reviews before re-seeding
    const deletedEq = await equipmentCol.deleteMany({})
    const deletedRev = await reviewsCol.deleteMany({})
    console.log(`Cleaned up old records: ${deletedEq.deletedCount} equipment items, ${deletedRev.deletedCount} reviews.`)

    // Prepare equipment documents
    const equipmentDocs = SEED_EQUIPMENT.map((item, idx) => ({
      ...item,
      ownerId,
      ownerName,
      ownerEmail,
      createdAt: new Date(Date.now() - (12 - idx) * 1000 * 60 * 60 * 24),
      updatedAt: new Date(),
    }))

    const eqResult = await equipmentCol.insertMany(equipmentDocs)
    console.log(` Successfully seeded ${eqResult.insertedCount} equipment items across all 6 categories!`)

    const revResult = await reviewsCol.insertMany(SEED_REVIEWS)
    console.log(` Successfully seeded ${revResult.insertedCount} verified customer reviews!`)

    console.log("Seeding complete! You can now browse featured and catalog items.")
  } catch (error) {
    console.error("Seeding failed with error:", error)
  } finally {
    await client.close()
  }
}

seed()
