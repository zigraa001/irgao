// IraGo /api router. Future stories mount bookings, operator, and admin
// routes here.
const express = require("express");
const { ping, queryOne } = require("./db");
const { probeOtpWrite } = require("./schema");
const authRoutes = require("./auth-routes");
const bookingRoutes = require("./booking-routes");
const operatorRoutes = require("./operator-routes");
const adminRoutes = require("./admin-routes");
const { requireAuth } = require("./auth");
const { requireTailscale } = require("./tailscale");

const router = express.Router();

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

// Current authenticated user — reads from cookie/Bearer token and returns profile.
router.get("/me", requireAuth, async (req, res) => {
  const user = await queryOne(
    "SELECT id, name, email, role, emailVerified FROM users WHERE id = ?",
    [req.user.id]
  );
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
    },
  });
});

module.exports = router;
