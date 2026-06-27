#!/usr/bin/env node
// Creates the IraGo tables (users, aircraft, bookings) in the configured
// MySQL database if they don't already exist. The server also does this on
// boot, but this script lets you provision/verify the schema on its own.
require("dotenv").config();
const { pool, maskedConfig } = require("../src/db");
const { initSchema } = require("../src/schema");

async function main() {
  console.log(
    "Initializing schema against:",
    maskedConfig({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
    })
  );
  await initSchema();
  console.log("Schema ready.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Schema init failed:", err.message);
    await pool.end();
    process.exit(1);
  });
