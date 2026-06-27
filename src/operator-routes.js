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

// Load the booking named by :id and confirm it is assigned to the logged-in
// operator. Returns the booking, or sends the appropriate error response and
// returns null so the caller can `if (!booking) return;`.
async function loadOwnTrip(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid trip id" });
    return null;
  }
  const booking = await prisma.booking.findUnique({ where: { id } });
  // Re-check operatorId on the loaded record (don't trust the id alone): an
  // operator may only act on a mission dispatch actually assigned to them.
  if (!booking || booking.operatorId !== req.user.id) {
    res.status(404).json({ error: "Trip not found" });
    return null;
  }
  return booking;
}

// POST /api/operator/trips/:id/accept — accept an assigned mission.
// Only a trip currently in "assigned" status can be accepted; this moves it to
// "accepted" so dispatch (and the customer's tracking view) knows the pilot
// will fly it.
router.post(
  "/trips/:id/accept",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const booking = await loadOwnTrip(req, res);
    if (!booking) return;

    if (booking.status !== "assigned") {
      return res.status(409).json({
        error: "Only an assigned trip can be accepted",
      });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "accepted" },
    });
    res.json({ booking: updated });
  }
);

// POST /api/operator/trips/:id/reject — reject an assigned mission.
// Sets status to "rejected" and frees the booking for reassignment by clearing
// the operator and aircraft so an admin can assign it to someone else.
router.post(
  "/trips/:id/reject",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const booking = await loadOwnTrip(req, res);
    if (!booking) return;

    if (booking.status !== "assigned") {
      return res.status(409).json({
        error: "Only an assigned trip can be rejected",
      });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "rejected", operatorId: null, aircraftId: null },
    });
    res.json({ booking: updated });
  }
);

module.exports = router;
