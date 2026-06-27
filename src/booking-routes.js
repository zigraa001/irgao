// IraGo booking routes. Mounted at /api/bookings.
//
// A booking captures a customer's requested trip (pickup, destination, service)
// and the mock fare estimate, persisted with status "requested" and tied to the
// authenticated customer. Fare and distance are computed server-side so we never
// trust client-supplied money or geometry.
const express = require("express");
const { prisma } = require("./db");
const { requireAuth } = require("./auth");
const { SERVICES, haversineKm, estimateFare } = require("./pricing");

const router = express.Router();

// Coerce a value to a finite number, or null if it isn't one.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST /api/bookings — create a booking for the logged-in customer.
// Body: { pickupName, pickupLat, pickupLng, destName, destLat, destLng,
//         service }. distanceKm + fareEstimate are computed server-side.
router.post("/", requireAuth, async (req, res) => {
  const b = req.body || {};

  const pickupName = typeof b.pickupName === "string" ? b.pickupName.trim() : "";
  const destName = typeof b.destName === "string" ? b.destName.trim() : "";
  const pickupLat = num(b.pickupLat);
  const pickupLng = num(b.pickupLng);
  const destLat = num(b.destLat);
  const destLng = num(b.destLng);
  const service = typeof b.service === "string" ? b.service : "";

  // Guard: a booking cannot be created unless pickup, destination, and service
  // are all set (mirrors the client-side bookingDraftReady() gate).
  if (
    !pickupName ||
    pickupLat === null ||
    pickupLng === null ||
    !destName ||
    destLat === null ||
    destLng === null
  ) {
    return res
      .status(400)
      .json({ error: "Pickup and destination (name + coordinates) are required" });
  }
  if (!SERVICES.includes(service)) {
    return res.status(400).json({ error: "A valid service must be selected" });
  }

  const distanceKm =
    Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;
  const fareEstimate = estimateFare(service, distanceKm);

  const booking = await prisma.booking.create({
    data: {
      customerId: req.user.id,
      pickupName,
      pickupLat,
      pickupLng,
      destName,
      destLat,
      destLng,
      service,
      distanceKm,
      fareEstimate,
      status: "requested",
    },
  });

  res.status(201).json({ booking });
});

module.exports = router;
