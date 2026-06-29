// IraGo booking routes. Mounted at /api/bookings.
//
// A booking captures a customer's requested trip (pickup, destination, service)
// and the mock fare estimate, persisted with status "requested" and tied to the
// authenticated customer. Fare and distance are computed server-side so we never
// trust client-supplied money or geometry.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth } = require("./auth");
const { SERVICES, haversineKm, estimateFare } = require("./pricing");
const { estimateCarbonSavedKg } = require("./carbon");
const { startDispatch } = require("./dispatch");

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
  const carbonSavedKg = estimateCarbonSavedKg(service, distanceKm);

  const result = await query(
    `INSERT INTO bookings
       (customerId, pickupName, pickupLat, pickupLng, destName, destLat, destLng,
        service, distanceKm, fareEstimate, carbonSavedKg, paymentStatus, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      req.user.id,
      pickupName,
      pickupLat,
      pickupLng,
      destName,
      destLat,
      destLng,
      service,
      distanceKm,
      fareEstimate,
      carbonSavedKg,
      "requested",
    ]
  );

  // Return the persisted row so the client gets the generated id, status, and
  // timestamps exactly as stored.
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [
    result.insertId,
  ]);

  res.status(201).json({ booking });
});

// GET /api/bookings/:id — fetch a single booking for status tracking (US-007).
// Returns the persisted booking (including its current status, which the
// operator advances). Readable by the owning customer, the assigned operator,
// or an admin; anyone else gets 403.
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  const u = req.user;
  const allowed =
    u.role === "admin" ||
    booking.customerId === u.id ||
    booking.operatorId === u.id;
  if (!allowed) {
    return res.status(403).json({ error: "Not allowed to view this booking" });
  }

  res.json({ booking });
});

// POST /api/bookings/:id/pay — dummy payment; starts auto-dispatch to nearest pilot.
router.post("/:id/pay", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (booking.paymentStatus === "paid") {
    return res.json({ booking, message: "Already paid" });
  }

  await query(
    "UPDATE bookings SET paymentStatus = 'paid' WHERE id = ?",
    [id]
  );
  const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  await startDispatch(id);
  const fresh = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  res.json({
    booking: fresh,
    message: "Payment successful. Finding a nearby pilot…",
    carbonSavedKg: updated.carbonSavedKg,
  });
});

module.exports = router;
