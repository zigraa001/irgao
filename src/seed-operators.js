// Seed operator companies and regional offices on startup.
// Idempotent — skips if data already exists.
const { query, queryOne } = require("./db");

const COMPANIES = [
  { name: "SkyTaxi India", code: "SKYTAXI", rating: 4.7, fleetSize: 48 },
  { name: "AeroRide", code: "AERORIDE", rating: 4.5, fleetSize: 36 },
  { name: "UrbanWing", code: "URBANWING", rating: 4.6, fleetSize: 42 },
  { name: "GoldenFleet Air Ambulance", code: "GOLDENFLEET", rating: 4.9, fleetSize: 24 },
];

const METRO_OFFICES = [
  { city: "Delhi NCR", lat: 28.6139, lng: 77.2090 },
  { city: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { city: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { city: "Chennai", lat: 13.0827, lng: 80.2707 },
  { city: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { city: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { city: "Pune", lat: 18.5204, lng: 73.8567 },
  { city: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { city: "Jaipur", lat: 26.9124, lng: 75.7873 },
  { city: "Lucknow", lat: 26.8467, lng: 80.9462 },
];

async function seedOperators() {
  // Check if already seeded
  const existing = await queryOne("SELECT COUNT(*) AS cnt FROM operator_companies");
  if (existing && existing.cnt > 0) return { seeded: false };

  for (const c of COMPANIES) {
    await query(
      `INSERT INTO operator_companies (name, code, rating, fleetSize) VALUES (?, ?, ?, ?)`,
      [c.name, c.code, c.rating, c.fleetSize]
    );
  }

  // Get inserted companies
  const companies = await query("SELECT id, code FROM operator_companies");
  const companyMap = {};
  for (const c of companies) companyMap[c.code] = c.id;

  // Create offices: each company gets offices in all metro cities
  for (const c of companies) {
    for (const m of METRO_OFFICES) {
      await query(
        `INSERT INTO regional_offices (companyId, city, address, lat, lng, radiusKm)
         VALUES (?, ?, ?, ?, ?, 30)`,
        [c.id, m.city, m.city + " Regional Office", m.lat, m.lng]
      );
    }
  }

  return { seeded: true, companies: COMPANIES.length, offices: COMPANIES.length * METRO_OFFICES.length };
}

module.exports = { seedOperators, COMPANIES, METRO_OFFICES };
