// IraGo Express server.
// Serves the existing static site (index.html, app.html, assets, etc.) and
// mounts the JSON API under /api. The database is a Hostinger MySQL instance
// reached with the `mysql2` driver, configured from DB_HOST / DB_PORT /
// DB_USER / DB_PASSWORD / DB_NAME — see README and .env.example.
require("dotenv").config();

const path = require("path");
const express = require("express");
const { ping, maskedConfig, pool } = require("./src/db");
const { initSchema } = require("./src/schema");
const apiRouter = require("./src/api");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const app = express();

app.use(express.json());

// JSON API.
app.use("/api", apiRouter);

// Static site (express.static guards against directory traversal and serves
// index.html at "/").
app.use(express.static(ROOT));

// Tracks whether the database came up so the startup log (and /api/health)
// can report a degraded state instead of guessing.
let dbConnected = false;

async function connectDatabase() {
  // The whole DB bring-up is wrapped in try/catch so a database outage or bad
  // credentials degrade the service instead of crashing the process — the
  // static site and any DB-independent routes keep working. Plenty of debug
  // output here because a fresh Hostinger deploy is where connection problems
  // show up.
  console.log(
    "[startup] connecting to MySQL with:",
    maskedConfig({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
    })
  );
  try {
    await ping();
    await initSchema();
    dbConnected = true;
    console.log("[startup] database connected and schema ensured.");
  } catch (err) {
    dbConnected = false;
    console.error(
      "[startup] WARNING: could not connect to the database. The server will " +
        "keep running, but database-backed routes will fail until the " +
        "connection is restored."
    );
    console.error(`[startup] code=${err.code} errno=${err.errno} sqlState=${err.sqlState}`);
    console.error(`[startup] message: ${err.message}`);
    console.error(
      "[startup] Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, and — " +
        "if connecting from outside Hostinger — that your IP is allowed under " +
        "hPanel > Databases > Remote MySQL."
    );
  }
}

async function start() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(
      `[startup] Server running on port ${PORT} (database: ${
        dbConnected ? "connected" : "unavailable"
      }).`
    );
  });
}

// Close the pool cleanly on shutdown so connections aren't left dangling.
async function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing MySQL pool ...`);
  try {
    await pool.end();
    console.log("[shutdown] pool closed.");
  } catch (err) {
    console.error("[shutdown] error closing pool:", err.message);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
