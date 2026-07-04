// IraGo /api router. Future stories mount bookings, operator, and admin
// routes here.
const express = require("express");
const { ping, queryOne } = require("./db");
const { probeOtpWrite } = require("./schema");
const authRoutes = require("./auth-routes");
const bookingRoutes = require("./booking-routes");
const operatorRoutes = require("./operator-routes");
const adminRoutes = require("./admin-routes");
const adminOpsRoutes = require("./admin-ops-routes");
const zoneRoutes = require("./zone-routes");
const { router: routeRoutes } = require("./route-routes");
const trackingRoutes = require("./tracking-routes");
const demoRoutes = require("./demo-routes");
const mobileAuthRoutes = require("./mobile-auth-routes");
const droneRoutes = require("./drone-routes");
const { requireAuth, USER_NOT_DELETED } = require("./auth");
const { requireTailscale } = require("./tailscale");
const { buildProfileStats } = require("./profile-stats");
const { fetchWeather } = require("./weather");

const router = express.Router();

// Client-side JS error sink. The app.html error handler POSTs uncaught errors
// here so they show in server logs — turns invisible "stuck screen" crashes in
// the user's browser into something diagnosable.
router.post("/client-error", express.json(), (req, res) => {
  const b = req.body || {};
  console.error(
    `[client-error] build=${b.build} msg=${b.msg} at ${b.src}:${b.line}:${b.col}`
  );
  res.json({ ok: true });
});

// Health check: confirms the server is up and the database is reachable.
router.get("/health", async (req, res) => {
  try {
    await ping();
    const otpCol = await queryOne(
      "SHOW COLUMNS FROM otp_requests WHERE Field = 'codeHash'"
    );
    const payloadCol = await queryOne(
      "SHOW COLUMNS FROM otp_requests WHERE Field = 'payload'"
    );
    const legacyCode = await queryOne(
      "SHOW COLUMNS FROM otp_requests WHERE Field = 'code'"
    );
    if (!otpCol) {
      return res.status(503).json({
        status: "error",
        db: "connected",
        schema: "otp_requests missing codeHash column — restart app to migrate",
      });
    }
    if (legacyCode) {
      return res.status(503).json({
        status: "error",
        db: "connected",
        schema: "otp_requests has legacy code column — restart app to migrate",
      });
    }
    if (payloadCol?.Type && String(payloadCol.Type).toLowerCase().includes("json")) {
      return res.status(503).json({
        status: "error",
        db: "connected",
        schema: "otp_requests.payload still JSON — restart app to migrate",
      });
    }
    try {
      await probeOtpWrite();
    } catch (err) {
      return res.status(503).json({
        status: "error",
        db: "connected",
        schema: "otp_requests write probe failed — restart app to migrate",
        message: err.message,
        code: err.code,
      });
    }
    res.json({ status: "ok", db: "connected", schema: "ready" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", message: err.message });
  }
});

// Auth: signup + login.
router.use("/auth", authRoutes);

// Bookings: customer trip creation.
router.use("/bookings", bookingRoutes);

// Operator: trips assigned to the logged-in pilot.
router.use("/operator", operatorRoutes);

// Admin: user management — Tailscale-gated when ADMIN_REQUIRE_TAILSCALE=true.
router.use("/admin", requireTailscale, adminRoutes);
router.use("/admin", requireTailscale, adminOpsRoutes);

// Live GPS / fleet (passenger 10 km radius).
router.use("/tracking", trackingRoutes);

// Least-fuel route planning.
router.use("/route", routeRoutes);

// Demo mode: auto-runs a full ride lifecycle for testing.
router.use("/demo", demoRoutes);

// Phone verification (add/change phone on profile).
router.use("/auth/mobile", mobileAuthRoutes);

// Flight / restricted airspace zones for map overlays.
router.use("/zones", zoneRoutes);

// Drone rental services.
router.use("/drones", droneRoutes);

// Weather: live conditions + flight risk at a lat/lng.
router.get("/weather", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat and lng query params are required" });
  }
  try {
    const weather = await fetchWeather(lat, lng);
    res.json(weather);
  } catch (err) {
    console.error("[weather] fetch failed:", err.message);
    res.status(500).json({ error: "Weather service unavailable" });
  }
});
router.get("/me", requireAuth, async (req, res) => {
  const user = await queryOne(
    `SELECT id, name, email, phone, role, emailVerified, bannedAt, mustResetPassword FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
    [req.user.id]
  );
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (user.bannedAt) {
    return res.status(403).json({
      error: "This account has been suspended.",
      code: "ACCOUNT_BANNED",
    });
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
      mustResetPassword: Boolean(user.mustResetPassword),
    },
  });
});

// GET /api/me/stats — aggregated profile dashboard for the logged-in user.
// Role-scoped: customer (trips/spend/CO₂), operator (assigned/flown/earnings),
// admin (platform totals). Returns zeros on a fresh DB so the dashboard renders
// cleanly before any bookings exist.
router.get("/me/stats", requireAuth, async (req, res) => {
  try {
    const stats = await buildProfileStats(req.user.id, req.user.role);
    res.json({ stats });
  } catch (err) {
    console.error("[api] /me/stats failed:", err.message);
    res.status(500).json({ error: "Could not load profile stats." });
  }
});

module.exports = router;
