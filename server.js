// IraGo Express server.
// Serves the existing static site (index.html, app.html, assets, etc.) and
// mounts the JSON API under /api. The database is a Hostinger MySQL instance
// reached with the `mysql2` driver, configured from DB_HOST / DB_PORT /
// DB_USER / DB_PASSWORD / DB_NAME — see README and .env.example.
require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { ping, maskedConfig, pool } = require("./src/db");
const { pingZones, zonesDbConfig, pool: zonesPool } = require("./src/zones-db");
const { validateEmailConfig } = require("./src/email");
const { initSchema } = require("./src/schema");
const { initZonesSchema } = require("./src/zones-schema");
const apiRouter = require("./src/api");
const { clearAuthCookie } = require("./src/auth");
const { cleanupExpiredOtps } = require("./src/otp");
const { attachWebSocketServer } = require("./src/dispatch-hub");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const app = express();

if (String(process.env.TRUST_PROXY || "").toLowerCase() === "true") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(cookieParser());

// JSON API.
app.use("/api", apiRouter);

// Role-specific auth portals. Passenger uses /app.html; operator & admin have their own URLs.
const APP_HTML = path.join(ROOT, "app.html");
app.get("/login/passenger", (_req, res) => res.redirect(302, "/app.html"));
app.get("/signup/passenger", (_req, res) => res.redirect(302, "/app.html?register=1"));
for (const role of ["operator"]) {
  app.get(`/login/${role}`, (_req, res) => res.sendFile(APP_HTML));
  app.get(`/signup/${role}`, (_req, res) => res.sendFile(APP_HTML));
}
app.get("/login/admin", (_req, res) => res.sendFile(APP_HTML));
app.get("/signup/admin", (_req, res) => res.redirect(302, "/login/admin"));
app.get("/login", (_req, res) => res.redirect(302, "/app.html"));

// One-click browser logout (clears session cookie, then login screen).
app.get("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.redirect(302, "/app.html?logout=1");
});

// Static site (express.static guards against directory traversal and serves
// index.html at "/").
app.use(express.static(ROOT));

// Tracks whether the database came up so the startup log (and /api/health)
// can report a degraded state instead of guessing.
let dbConnected = false;
let zonesDbConnected = false;

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
    try {
      await pingZones();
      await initZonesSchema();
      zonesDbConnected = true;
      console.log(
        "[startup] zones database connected:",
        maskedConfig({
          host: zonesDbConfig.host,
          port: zonesDbConfig.port,
          user: zonesDbConfig.user,
          database: zonesDbConfig.database,
          password: zonesDbConfig.password,
        })
      );
    } catch (zonesErr) {
      zonesDbConnected = false;
      console.error(
        "[startup] WARNING: airspace zones database unavailable — map overlays and fuel planning may fail."
      );
      console.error(`[startup] zones message: ${zonesErr.message}`);
    }
    const purged = await cleanupExpiredOtps();
    dbConnected = true;
    console.log(
      `[startup] database connected and schema ensured (purged ${purged} stale OTP row(s)).`
    );
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
  const smtpReady = validateEmailConfig();
  if (!process.env.DB_PASSWORD) {
    console.warn(
      "[startup] DB_PASSWORD is not set — database routes will fail until it is configured."
    );
  }
  if (!process.env.AUTH_SECRET) {
    console.warn(
      "[startup] AUTH_SECRET is not set — using an insecure dev fallback (set AUTH_SECRET in production)."
    );
  }
  await connectDatabase();

  // Create a plain HTTP server so the WebSocket server can share the same port.
  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(
      `[startup] Server running on port ${PORT} (database: ${
        dbConnected ? "connected" : "unavailable"
      }, smtp: ${smtpReady ? "configured" : "missing"}, ws: /ws/operator).`
    );
  });
}

// Close the pool cleanly on shutdown so connections aren't left dangling.
async function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing MySQL pool ...`);
  try {
    await pool.end();
    await zonesPool.end().catch(() => {});
    console.log("[shutdown] pools closed.");
  } catch (err) {
    console.error("[shutdown] error closing pool:", err.message);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
