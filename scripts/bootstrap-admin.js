#!/usr/bin/env node
// Create the first admin account from env — not a demo seed.
//
// Requires ADMIN_USER and ADMIN_PASSWORD in .env. Users are otherwise created
// Users are otherwise created via OTP signup (passengers/operators) or this bootstrap for admin.
//
// Usage: npm run admin:bootstrap
require("dotenv").config();
const { query, queryOne, pool } = require("../src/db");
const { initSchema } = require("../src/schema");
const { hashPassword } = require("../src/auth");

const ADMIN_USER = (process.env.ADMIN_USER || "admin@irago.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
    console.error(
      "ADMIN_PASSWORD must be set in .env (min 6 characters) before bootstrapping."
    );
    process.exit(1);
  }

  await initSchema();

  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [
    ADMIN_USER,
  ]);

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  if (existing) {
    await query(
      `UPDATE users SET name = ?, passwordHash = ?, role = 'admin', emailVerified = 1 WHERE id = ?`,
      ["Admin", passwordHash, existing.id]
    );
    console.log(`Admin updated: ${ADMIN_USER}`);
  } else {
    await query(
      `INSERT INTO users (name, email, passwordHash, role, emailVerified)
       VALUES (?, ?, ?, 'admin', 1)`,
      ["Admin", ADMIN_USER, passwordHash]
    );
    console.log(`Admin created: ${ADMIN_USER}`);
  }

  console.log(`Sign in at /login/admin with ADMIN_USER + ADMIN_PASSWORD from .env`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Bootstrap failed:", err.message);
    await pool.end();
    process.exit(1);
  });
