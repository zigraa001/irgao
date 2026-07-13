#!/usr/bin/env node
// Bootstrap / refresh the hardcoded admin account.
// Same credentials are also ensured automatically on every `npm start`.
//
// Usage: npm run admin:bootstrap
require("dotenv").config();
const { pool } = require("../src/db");
const { initSchema } = require("../src/schema");
const {
  ensureAdmin,
  HARDCODED_ADMIN_EMAIL,
} = require("../src/ensure-admin");

async function main() {
  await initSchema();
  await ensureAdmin();
  console.log(`Sign in at /login/admin as ${HARDCODED_ADMIN_EMAIL}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Bootstrap failed:", err.message);
    await pool.end();
    process.exit(1);
  });
