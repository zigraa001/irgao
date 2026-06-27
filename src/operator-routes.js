// IraGo operator routes. Mounted at /api/operator.
//
// These endpoints are scoped to the logged-in operator (pilot). An operator
// only ever sees bookings that dispatch has assigned to them
// (booking.operatorId === req.user.id). Accept/reject and status-advance
// actions are added in US-010/US-011.
const express = require("express");
const { prisma } = require("./db");
const { requireAuth, requireRole } = require("./auth");

const router = express.Router();

// Public shape of a customer attached to a booking — never the passwordHash.
const customerSelect = { id: true, name: true, email: true };
// Public shape of an aircraft attached to a booking.
const aircraftSelect = { id: true, name: true, model: true, status: true };

// GET /api/operator/trips — bookings assigned to the logged-in operator.
// Includes the customer and assigned aircraft so the list can show route,
// customer, service, status, and aircraft, and the details view has the full
// pickup/destination, distance, fare, and customer info. Newest first.
router.get(
  "/trips",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const trips = await prisma.booking.findMany({
      where: { operatorId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: customerSelect },
        aircraft: { select: aircraftSelect },
      },
    });
    res.json({ trips });
  }
);

module.exports = router;
