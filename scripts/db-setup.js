#!/usr/bin/env node
// Swaps the Prisma datasource `provider` in prisma/schema.prisma between
// "mysql" and "sqlite" based on the DATABASE_PROVIDER env var, because Prisma
// requires the provider to be a string literal (it cannot be read from env).
//
// Usage: node scripts/db-setup.js   (typically run via `npm run db:setup`,
// which also runs `prisma generate`).
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const provider = (process.env.DATABASE_PROVIDER || "mysql").toLowerCase();

if (!["mysql", "sqlite"].includes(provider)) {
  console.error(
    `Invalid DATABASE_PROVIDER="${provider}". Expected "mysql" or "sqlite".`
  );
  process.exit(1);
}

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");

// Only the datasource provider uses "mysql"/"sqlite"; the generator uses
// "prisma-client-js", so this targeted replace is unambiguous.
const updated = schema.replace(
  /provider = "(?:mysql|sqlite)"/,
  `provider = "${provider}"`
);

if (updated === schema) {
  console.log(`Prisma datasource provider already set to "${provider}".`);
} else {
  fs.writeFileSync(schemaPath, updated);
  console.log(`Prisma datasource provider set to "${provider}".`);
}
