// Separate MySQL pool for the airspace / corridor catalog (flight_zones).
// Uses ZONES_DB_* env vars; falls back to the main DB host/user/password with
// database name irago_zones (or DB_NAME + "_zones" when DB_NAME is set).
const mysql = require("mysql2/promise");
const { dbg, dberr, maskedConfig } = require("./db");

const poolConfig = {
  host: process.env.ZONES_DB_HOST || process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.ZONES_DB_PORT || process.env.DB_PORT) || 3306,
  user: process.env.ZONES_DB_USER || process.env.DB_USER,
  password: process.env.ZONES_DB_PASSWORD || process.env.DB_PASSWORD,
  database:
    process.env.ZONES_DB_NAME ||
    (process.env.DB_NAME ? `${process.env.DB_NAME}_zones` : "irago_zones"),
  waitForConnections: true,
  connectionLimit: Number(process.env.ZONES_DB_POOL_LIMIT) || 5,
  queueLimit: 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
};

const missing = ["host", "user", "password", "database"].filter(
  (k) => !poolConfig[k]
);
if (missing.length) {
  dberr(
    `[zones-db] WARNING: connection value(s) empty: ${missing.join(", ")}. ` +
      "Set ZONES_DB_* or the main DB_* vars plus ZONES_DB_NAME."
  );
}

dbg("[zones-db] Creating MySQL pool:", maskedConfig(poolConfig));

const pool = mysql.createPool(poolConfig);

async function zonesQuery(sql, params = []) {
  const label = sql.replace(/\s+/g, " ").trim().slice(0, 120);
  const start = process.hrtime.bigint();
  try {
    dbg("[zones-db] SQL >", label, params.length ? JSON.stringify(params) : "");
    const [rows] = await pool.query(sql, params);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const count = Array.isArray(rows) ? rows.length : rows.affectedRows;
    dbg(`[zones-db] SQL < ok (${count} row(s), ${ms.toFixed(1)}ms)`);
    return rows;
  } catch (err) {
    dberr(`[zones-db] SQL FAILED: ${label}`);
    dberr(`  params: ${JSON.stringify(params)}`);
    dberr(`  code=${err.code} errno=${err.errno} sqlState=${err.sqlState}`);
    dberr(`  message: ${err.message}`);
    throw err;
  }
}

async function zonesQueryOne(sql, params = []) {
  const rows = await zonesQuery(sql, params);
  return rows[0] || null;
}

async function pingZones() {
  dbg("[zones-db] ping: SELECT 1 ...");
  await zonesQuery("SELECT 1 AS ok");
  dbg("[zones-db] ping: zones database reachable");
  return true;
}

module.exports = {
  pool: pool,
  zonesQuery,
  zonesQueryOne,
  pingZones,
  zonesDbConfig: poolConfig,
};
