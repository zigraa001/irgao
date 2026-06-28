#!/usr/bin/env node
// Seeds operational sample data only — aircraft fleet for bookings.
//
// Users are NOT seeded. All accounts come from the auth flow:
//   • Customers — OTP signup (POST /api/auth/signup-request + verify-signup)
//   • Operators/admins — admin dashboard or `npm run admin:bootstrap` for the first admin
//
// Idempotent: aircraft upserted by name.
require("dotenv").config();
const { query, queryOne, pool } = require("../src/db");
const { initSchema } = require("../src/schema");

const AIRCRAFT = [
  { name: "IG-001", model: "eVTOL Falcon X", status: "available", capacity: 4 },
  { name: "IG-002", model: "eVTOL Falcon X", status: "available", capacity: 4 },
  { name: "IG-003", model: "eVTOL Condor S", status: "maintenance", capacity: 6 },
];

async function main() {
  await initSchema();

  for (const a of AIRCRAFT) {
    const existing = await queryOne("SELECT id FROM aircraft WHERE name = ?", [
      a.name,
    ]);
    if (existing) {
      await query(
        "UPDATE aircraft SET model = ?, status = ?, capacity = ? WHERE id = ?",
        [a.model, a.status, a.capacity, existing.id]
      );
    } else {
      await query(
        "INSERT INTO aircraft (name, model, status, capacity) VALUES (?, ?, ?, ?)",
        [a.name, a.model, a.status, a.capacity]
      );
    }
  }

  const aircraftCount = (await queryOne("SELECT COUNT(*) AS n FROM aircraft")).n;
  const userCount = (await queryOne("SELECT COUNT(*) AS n FROM users")).n;
  console.log(`Seed complete: ${aircraftCount} aircraft (${userCount} users — auth-only, not seeded).`);
  console.log("First admin: npm run admin:bootstrap  (requires ADMIN_PASSWORD in .env)");
  console.log("Customers: register via /app.html with OTP verification.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end();
    process.exit(1);
  });
