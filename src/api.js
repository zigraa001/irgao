// IraGo /api router. Future stories mount bookings, operator, and admin
// routes here.
const express = require("express");
const { ping } = require("./db");
const authRoutes = require("./auth-routes");
const bookingRoutes = require("./booking-routes");
const operatorRoutes = require("./operator-routes");
const adminRoutes = require("./admin-routes");
const { requireAuth } = require("./auth");

const router = express.Router();

// Health check: confirms the server is up and the database is reachable.
router.get("/health", async (req, res) => {
  try {
    await ping();
    res.json({ status: "ok", db: "connected" });
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

// Admin: user management (create/list operators and admins). Admin-only.
router.use("/admin", adminRoutes);

// Current authenticated user — demonstrates the requireAuth guard and is handy
// for the client to restore a session from a stored token.
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
