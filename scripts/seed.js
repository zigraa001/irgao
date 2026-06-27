#!/usr/bin/env node
// Seeds sample data: 1 admin, 2 operators, 2 customers, and 3 aircraft.
//
// Idempotent: users are upserted by their unique email (INSERT ... ON DUPLICATE
// KEY UPDATE) and aircraft are upserted by name (looked up first, since name is
// not a unique column), so running `npm run db:seed` repeatedly won't create
// duplicates.
//
// All seed users share the same demo password ("password123"), stored only as
// a bcrypt hash — never in plaintext.
require("dotenv").config();
const bcrypt = require("bcrypt");
const { query, queryOne, pool } = require("../src/db");
const { initSchema } = require("../src/schema");

const DEMO_PASSWORD = "password123";

// Users may set their own password; anyone without `password` falls back to the
// shared DEMO_PASSWORD. The primary admin gets real credentials so the live site
// can be administered immediately after seeding.
const USERS = [
  { name: "Admin", email: "admin@irago.com", role: "admin", password: "iragoadmin@123" },
  { name: "Olivia Operator", email: "olivia@irago.test", role: "operator" },
  { name: "Owen Operator", email: "owen@irago.test", role: "operator" },
  { name: "Casey Customer", email: "casey@irago.test", role: "customer" },
  { name: "Cleo Customer", email: "cleo@irago.test", role: "customer" },
];

const AIRCRAFT = [
  { name: "IG-001", model: "eVTOL Falcon X", status: "available", capacity: 4 },
  { name: "IG-002", model: "eVTOL Falcon X", status: "available", capacity: 4 },
  { name: "IG-003", model: "eVTOL Condor S", status: "maintenance", capacity: 6 },
];

async function main() {
  // Make sure the tables exist before seeding (so a fresh DB can be seeded
  // without a separate init step).
  await initSchema();

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password || DEMO_PASSWORD, 10);
    // On conflict (existing email) refresh name + role AND the password hash, so
    // re-seeding can also reset credentials (e.g. the admin password).
    await query(
      `INSERT INTO users (name, email, passwordHash, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), passwordHash = VALUES(passwordHash)`,
      [u.name, u.email, passwordHash, u.role]
    );
  }

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

  const userCount = (await queryOne("SELECT COUNT(*) AS n FROM users")).n;
  const aircraftCount = (await queryOne("SELECT COUNT(*) AS n FROM aircraft")).n;
  console.log(`Seed complete: ${userCount} users, ${aircraftCount} aircraft.`);
  console.log(`Admin login: admin@irago.com / iragoadmin@123`);
  console.log(`Demo password for the other seeded users: "${DEMO_PASSWORD}"`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end();
    process.exit(1);
  });
