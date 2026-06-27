// IraGo /api router. Future stories mount auth, bookings, operator, and admin
// routes here.
const express = require("express");
const { prisma } = require("./db");

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

module.exports = router;
