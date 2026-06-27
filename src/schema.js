// IraGo schema bootstrap.
//
// With Prisma removed there is no migration tool, so the app creates its own
// tables on startup with idempotent `CREATE TABLE IF NOT EXISTS` statements.
// Column names are camelCase to match the JSON the API returns to the client.
//
// Status/role values are stored as plain VARCHARs (validated in app code) to
// keep the schema simple and portable.
const { query, dbg } = require("./db");

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    email        VARCHAR(255) NOT NULL UNIQUE,
    passwordHash VARCHAR(255) NOT NULL,
    role         VARCHAR(32)  NOT NULL DEFAULT 'customer',
    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS aircraft (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(255) NOT NULL,
    model     VARCHAR(255) NOT NULL,
    status    VARCHAR(32)  NOT NULL DEFAULT 'available',
    capacity  INT          NOT NULL,
    createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS bookings (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    customerId   INT          NOT NULL,
    pickupName   VARCHAR(255) NOT NULL,
    pickupLat    DOUBLE       NOT NULL,
    pickupLng    DOUBLE       NOT NULL,
    destName     VARCHAR(255) NOT NULL,
    destLat      DOUBLE       NOT NULL,
    destLng      DOUBLE       NOT NULL,
    service      VARCHAR(64)  NOT NULL,
    distanceKm   DOUBLE       NOT NULL,
    fareEstimate DOUBLE       NOT NULL,
    status       VARCHAR(32)  NOT NULL DEFAULT 'requested',
    operatorId   INT          NULL,
    aircraftId   INT          NULL,
    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookings_customer (customerId),
    INDEX idx_bookings_operator (operatorId),
    INDEX idx_bookings_aircraft (aircraftId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Create all tables if they don't already exist. Safe to run on every boot.
async function initSchema() {
  dbg("initSchema: ensuring tables exist (users, aircraft, bookings) ...");
  for (const sql of STATEMENTS) {
    await query(sql);
  }
  dbg("initSchema: done");
}

module.exports = { initSchema };
