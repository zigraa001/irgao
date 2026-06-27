// IraGo /api router. Future stories mount bookings, operator, and admin
// routes here.
const express = require("express");
const { prisma } = require("./db");
const authRoutes = require("./auth-routes");
const bookingRoutes = require("./booking-routes");
const { requireAuth } = require("./auth");

const router = express.Router();

// Health check: confirms the server is up and the database is reachable.
router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

// Auth: signup + login.
router.use("/auth", authRoutes);

// Bookings: customer trip creation.
router.use("/bookings", bookingRoutes);

// Current authenticated user — demonstrates the requireAuth guard and is handy
// for the client to restore a session from a stored token.
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
