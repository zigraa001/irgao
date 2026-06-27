// IraGo database layer — raw MySQL via the `mysql2` driver.
//
// This follows Hostinger's "Connect a MySQL database to a Node.js application"
// guide: a single reusable connection POOL created from discrete environment
// variables (DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME). A pool keeps
// a handful of connections open and reuses them, instead of opening a new TCP
// connection for every query.
//
// Verbose debug logging is on by default so connection/credential problems are
// easy to diagnose on a fresh Hostinger deploy. Set DB_DEBUG=false to silence
// the per-query logs (connection-level logs always print).
const mysql = require("mysql2/promise");

// --- Debug logging -------------------------------------------------------
const DEBUG = String(process.env.DB_DEBUG || "true").toLowerCase() !== "false";

function dbg(...args) {
  if (DEBUG) console.log("[db]", ...args);
}

function dberr(...args) {
  console.error("[db]", ...args);
}

// Never print the real password — show only its length so you can tell
// "empty" from "set" without leaking the secret into logs.
function maskedConfig(cfg) {
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: cfg.database,
    password: cfg.password ? `set (${String(cfg.password).length} chars)` : "EMPTY",
  };
}

// --- Pool configuration (read straight from the environment) -------------
const poolConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
  queueLimit: 0,
  // Surface connection timeouts quickly instead of hanging the request.
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
};

// Warn loudly at boot if any required variable is missing — this is the #1
// cause of "it won't connect" on a new deploy.
const REQUIRED = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  dberr(
    `WARNING: missing required DB env var(s): ${missing.join(", ")}. ` +
      "Set them in your .env (see .env.example)."
  );
}

dbg("Creating MySQL connection pool with config:", maskedConfig(poolConfig));

const pool = mysql.createPool(poolConfig);

// Log low-level pool events so dropped/new connections are visible.
pool.on("connection", () => dbg("pool: a new physical connection was opened"));
pool.on("acquire", (c) => dbg(`pool: connection ${c.threadId} acquired`));
pool.on("release", (c) => dbg(`pool: connection ${c.threadId} released`));
pool.on("enqueue", () => dbg("pool: waiting for an available connection slot"));

// --- Query helper --------------------------------------------------------
// Thin wrapper around pool.query that logs the SQL, the params, the row count,
// and (crucially) the MySQL error code + message on failure.
async function query(sql, params = []) {
  const label = sql.replace(/\s+/g, " ").trim().slice(0, 120);
  const start = process.hrtime.bigint();
  try {
    dbg("SQL >", label, params.length ? JSON.stringify(params) : "");
    const [rows] = await pool.query(sql, params);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const count = Array.isArray(rows) ? rows.length : rows.affectedRows;
    dbg(`SQL < ok (${count} row(s), ${ms.toFixed(1)}ms)`);
    return rows;
  } catch (err) {
    dberr(`SQL FAILED: ${label}`);
    dberr(`  params: ${JSON.stringify(params)}`);
    dberr(`  code=${err.code} errno=${err.errno} sqlState=${err.sqlState}`);
    dberr(`  message: ${err.message}`);
    throw err;
  }
}

// Convenience: run a query and return the first row (or null).
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Verify the database is actually reachable. Used by the startup sequence and
// the /api/health endpoint. Returns true on success, throws on failure.
async function ping() {
  dbg("ping: SELECT 1 ...");
  await query("SELECT 1 AS ok");
  dbg("ping: database reachable");
  return true;
}

module.exports = { pool, query, queryOne, ping, dbg, dberr, maskedConfig };
