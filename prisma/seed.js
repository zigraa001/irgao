#!/usr/bin/env node
// Seeds sample data: 1 admin, 2 operators, 2 customers, and 3 aircraft.
//
// Idempotent: users are upserted by their unique email and aircraft are
// upserted by name (looked up first, since name is not a unique column), so
// running `npm run db:seed` repeatedly won't create duplicates.
//
// All seed users share the same demo password ("password123"), stored only as
// a bcrypt hash — never in plaintext.
require("dotenv").config();
const bcrypt = require("bcrypt");
const { prisma } = require("../src/db");

const DEMO_PASSWORD = "password123";

const USERS = [
  { name: "Admin User", email: "admin@irago.test", role: "admin" },
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
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { ...u, passwordHash },
    });
  }

  for (const a of AIRCRAFT) {
    const existing = await prisma.aircraft.findFirst({ where: { name: a.name } });
    if (existing) {
      await prisma.aircraft.update({ where: { id: existing.id }, data: a });
    } else {
      await prisma.aircraft.create({ data: a });
    }
  }

  const [users, aircraft] = await Promise.all([
    prisma.user.count(),
    prisma.aircraft.count(),
  ]);
  console.log(`Seed complete: ${users} users, ${aircraft} aircraft.`);
  console.log(`Demo password for all seeded users: "${DEMO_PASSWORD}"`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
