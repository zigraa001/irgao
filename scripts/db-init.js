#!/usr/bin/env node
// Creates IraGo tables in the main app DB and the airspace catalog in the zones DB.
require("dotenv").config();
const { pool, maskedConfig } = require("../src/db");
const { pool: zonesPool, zonesDbConfig } = require("../src/zones-db");
const { initSchema } = require("../src/schema");
const { initZonesSchema } = require("../src/zones-schema");

async function main() {
  console.log(
    "Initializing main schema against:",
    maskedConfig({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
    })
  );
  await initSchema();
  console.log(
    "Initializing zones schema against:",
    maskedConfig({
      host: zonesDbConfig.host,
      port: zonesDbConfig.port,
      user: zonesDbConfig.user,
      database: zonesDbConfig.database,
      password: zonesDbConfig.password,
    })
  );
  await initZonesSchema();
  console.log("Schema ready (app + zones).");
}

main()
  .then(async () => {
    await pool.end();
    await zonesPool.end();
  })
  .catch(async (err) => {
    console.error("Schema init failed:", err.message);
    await pool.end().catch(() => {});
    await zonesPool.end().catch(() => {});
    process.exit(1);
  });
