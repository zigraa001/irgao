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

const OTP_REQUESTS_DDL = STATEMENTS[3];

// Add a column to an existing table when missing (no migration tool).
async function ensureColumn(table, column, definition) {
  const rows = await query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (rows.length === 0) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    dbg(`initSchema: added ${table}.${column}`);
  }
}

async function columnInfo(table, column) {
  const rows = await query(`SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`, [
    column,
  ]);
  return rows[0] || null;
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

  const legacyColumns = ["code", "screenOtp", "devOtp", "plainCode"];
  for (const legacy of legacyColumns) {
    const col = await columnInfo("otp_requests", legacy);
    if (col) {
      await query(`ALTER TABLE \`otp_requests\` DROP COLUMN \`${legacy}\``);
      dbg(`initSchema: dropped legacy otp_requests.${legacy}`);
    }
  }

  // Encrypted payloads are plain strings — always use LONGTEXT (JSON CHECK constraints
  // on Hostinger reject enc:v1:... even after a superficial type migration).
  try {
    await query("ALTER TABLE `otp_requests` MODIFY payload LONGTEXT NULL");
    dbg("initSchema: normalized otp_requests.payload -> LONGTEXT");
  } catch (err) {
    dbg(`initSchema: payload MODIFY note: ${err.message}`);
  }

  await dropOtpCheckConstraints();

  try {
    await probeOtpWrite();
  } catch (err) {
    console.error(
      `[startup] otp_requests probe failed (${err.code || "error"}): ${err.message} — recreating table`
    );
    await recreateOtpRequestsTable();
    await probeOtpWrite();
  }
}

async function dropOtpCheckConstraints() {
  try {
    const rows = await query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_requests'
         AND CONSTRAINT_TYPE = 'CHECK'`
    );
    for (const row of rows) {
      const name = row.CONSTRAINT_NAME;
      await query(`ALTER TABLE \`otp_requests\` DROP CHECK \`${name}\``);
      dbg(`initSchema: dropped CHECK constraint ${name}`);
    }
  } catch (err) {
    dbg(`initSchema: CHECK constraint cleanup skipped: ${err.message}`);
  }
}

async function recreateOtpRequestsTable() {
  dbg("initSchema: DROP + CREATE otp_requests");
  await query("DROP TABLE IF EXISTS `otp_requests`");
  await query(OTP_REQUESTS_DDL);
}

// Verify INSERT works (catches legacy NOT NULL columns migration missed).
async function probeOtpWrite() {
  const probeEmail = "__health_probe__@invalid.test";
  await query(
    `INSERT INTO otp_requests (email, purpose, codeHash, payload, attempts, expiresAt)
     VALUES (?, ?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL 60 SECOND))`,
    [probeEmail, "signup_passenger", "$2b$10$probe", "enc:v1:probe"]
  );
  await query(`DELETE FROM otp_requests WHERE email = ?`, [probeEmail]);
  dbg("initSchema: otp_requests write probe OK");
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
  await ensureColumn("users", "deletedAt", "deletedAt DATETIME NULL");
  await ensureColumn("users", "bannedAt", "bannedAt DATETIME NULL");
  await ensureColumn("users", "gpsLat", "gpsLat DOUBLE NULL");
  await ensureColumn("users", "gpsLng", "gpsLng DOUBLE NULL");
  await ensureColumn("users", "gpsUpdatedAt", "gpsUpdatedAt DATETIME NULL");
  // Admin-provisioned accounts (operator/admin created via the admin console)
  // are created with a temporary password and this flag set to 1, forcing the
  // user to choose their own password on first login.
  await ensureColumn(
    "users",
    "mustResetPassword",
    "mustResetPassword TINYINT(1) NOT NULL DEFAULT 0"
  );
  await ensureColumn("bookings", "paymentStatus", "paymentStatus VARCHAR(32) NOT NULL DEFAULT 'pending'");
  await ensureColumn("bookings", "carbonSavedKg", "carbonSavedKg DOUBLE NULL");
  await ensureColumn("bookings", "pendingOperatorId", "pendingOperatorId INT NULL");
  await query(`CREATE TABLE IF NOT EXISTS dispatch_offers (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    bookingId  INT          NOT NULL,
    operatorId INT          NOT NULL,
    status     VARCHAR(32)  NOT NULL DEFAULT 'pending',
    expiresAt  DATETIME     NOT NULL,
    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dispatch_booking (bookingId),
    INDEX idx_dispatch_operator (operatorId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Ratings: both sides rate after completion. raterRole records who rated whom.
  await query(`CREATE TABLE IF NOT EXISTS ratings (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    bookingId  INT          NOT NULL,
    raterId    INT          NOT NULL,
    raterRole  VARCHAR(32)  NOT NULL,
    rateeId    INT          NOT NULL,
    stars      INT          NOT NULL,
    comment    VARCHAR(1000) NULL,
    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_rating (bookingId, raterId),
    INDEX idx_ratings_ratee (rateeId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Cancellation ledger: records fee policy applied (free / fee / waived) per cancel.
  await ensureColumn(
    "bookings",
    "cancelledAt",
    "cancelledAt DATETIME NULL"
  );
  await ensureColumn(
    "bookings",
    "assignedAt",
    "assignedAt DATETIME NULL"
  );
  await ensureColumn(
    "bookings",
    "cancellationFee",
    "cancellationFee DOUBLE NOT NULL DEFAULT 0"
  );
  // Operator duty state. onDuty=0 means offline and excluded from dispatch.
  await ensureColumn(
    "users",
    "onDuty",
    "onDuty TINYINT(1) NOT NULL DEFAULT 0"
  );
  // Web-push subscriptions (one operator may have multiple devices).
  await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    userId        INT          NOT NULL,
    endpoint      VARCHAR(512) NOT NULL,
    p256dh        VARCHAR(255) NOT NULL,
    auth          VARCHAR(255) NOT NULL,
    createdAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_push_user (userId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ── Operator companies & regional offices ─────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS operator_companies (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    code       VARCHAR(32)  NOT NULL UNIQUE,
    logoUrl    VARCHAR(512) NULL,
    rating     DOUBLE       NOT NULL DEFAULT 4.5,
    fleetSize  INT          NOT NULL DEFAULT 0,
    active     TINYINT(1)   NOT NULL DEFAULT 1,
    createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await query(`CREATE TABLE IF NOT EXISTS regional_offices (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    companyId    INT          NOT NULL,
    city         VARCHAR(255) NOT NULL,
    address      VARCHAR(512) NULL,
    lat          DOUBLE       NOT NULL,
    lng          DOUBLE       NOT NULL,
    contactPhone VARCHAR(32)  NULL,
    radiusKm     DOUBLE       NOT NULL DEFAULT 30,
    active       TINYINT(1)   NOT NULL DEFAULT 1,
    createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_office_company (companyId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Pilot profile columns on users (company/office assignment, aircraft info).
  await ensureColumn("users", "companyId", "companyId INT NULL");
  await ensureColumn("users", "officeId", "officeId INT NULL");
  await ensureColumn("users", "aircraftType", "aircraftType VARCHAR(128) NULL");
  await ensureColumn("users", "aircraftReg", "aircraftReg VARCHAR(32) NULL");
  await ensureColumn("users", "pilotLicense", "pilotLicense VARCHAR(64) NULL");

  // Company/office linkage and ride OTP columns on bookings.
  await ensureColumn("bookings", "companyId", "companyId INT NULL");
  await ensureColumn("bookings", "officeId", "officeId INT NULL");
  await ensureColumn("bookings", "rideOtp", "rideOtp VARCHAR(8) NULL");
  await ensureColumn("bookings", "rideOtpVerified", "rideOtpVerified TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("bookings", "estimatedPickupMin", "estimatedPickupMin INT NULL");

  // Seed operator companies and regional offices (idempotent).
  const { seedOperators } = require("./seed-operators");
  await seedOperators().catch(err => dbg("seedOperators: " + err.message));

  dbg("initSchema: done");
}

module.exports = { initSchema, probeOtpWrite };
