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

  `CREATE TABLE IF NOT EXISTS otp_requests (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    purpose    VARCHAR(32)  NOT NULL,
    codeHash   VARCHAR(255) NOT NULL,
    payload    LONGTEXT     NULL,
    attempts   INT          NOT NULL DEFAULT 0,
    expiresAt  DATETIME     NOT NULL,
    consumedAt DATETIME     NULL,
    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_email_created (email, createdAt),
    INDEX idx_otp_email_purpose (email, purpose, consumedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Add a column to an existing table when missing (no migration tool).
async function ensureColumn(table, column, definition) {
  const rows = await query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (rows.length === 0) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    dbg(`initSchema: added ${table}.${column}`);
  }
}

async function columnInfo(table, column) {
  return queryOne(`SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`, [column]);
}

async function tableExists(table) {
  const rows = await query(`SHOW TABLES LIKE ?`, [table]);
  return rows.length > 0;
}

// Ensure otp_requests has every column the OTP module expects (handles partial
// or legacy tables that predate the current schema).
async function ensureOtpRequestsSchema() {
  if (!(await tableExists("otp_requests"))) return;

  const columns = [
    ["email", "email VARCHAR(255) NOT NULL DEFAULT ''"],
    ["purpose", "purpose VARCHAR(32) NOT NULL DEFAULT ''"],
    ["codeHash", "codeHash VARCHAR(255) NOT NULL DEFAULT ''"],
    ["payload", "payload LONGTEXT NULL"],
    ["attempts", "attempts INT NOT NULL DEFAULT 0"],
    ["expiresAt", "expiresAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ["consumedAt", "consumedAt DATETIME NULL"],
    ["createdAt", "createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],
  ];
  for (const [name, definition] of columns) {
    await ensureColumn("otp_requests", name, definition);
  }

  // Dev builds stored plaintext OTP in a legacy `code` column — drop it so INSERT
  // into codeHash-only rows succeeds.
  const legacyCode = await columnInfo("otp_requests", "code");
  if (legacyCode) {
    await query("ALTER TABLE `otp_requests` DROP COLUMN `code`");
    dbg("initSchema: dropped legacy otp_requests.code");
  }

  // Encrypted payloads are plain strings; JSON columns reject enc:v1:... values.
  const payloadCol = await columnInfo("otp_requests", "payload");
  if (payloadCol?.Type && String(payloadCol.Type).toLowerCase().includes("json")) {
    await query("ALTER TABLE `otp_requests` MODIFY payload LONGTEXT NULL");
    dbg("initSchema: migrated otp_requests.payload JSON -> LONGTEXT");
  }
}

// Create all tables if they don't already exist. Safe to run on every boot.
async function initSchema() {
  dbg("initSchema: ensuring tables exist (users, aircraft, bookings, otp_requests) ...");
  for (const sql of STATEMENTS) {
    await query(sql);
  }
  await ensureOtpRequestsSchema();
  // Existing seeded accounts are treated as verified; new signups require OTP.
  await ensureColumn(
    "users",
    "emailVerified",
    "emailVerified TINYINT(1) NOT NULL DEFAULT 1"
  );
  dbg("initSchema: done");
}

module.exports = { initSchema };
