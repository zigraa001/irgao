// IraGo operator routes. Mounted at /api/operator.
//
// These endpoints are scoped to the logged-in operator (pilot). An operator
// only ever sees bookings that dispatch has assigned to them
// (booking.operatorId === req.user.id). Accept/reject and status-advance
// actions are added in US-010/US-011.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole } = require("./auth");
const { subscribeOperator, pushCustomer } = require("./dispatch-hub");
const { acceptOffer, rejectOffer } = require("./dispatch");
const { haversineKm } = require("./pricing");

const router = express.Router();

// Take a flat JOIN row (booking columns + aliased customer_*/aircraft_* columns)
// and reshape it into the nested { ...booking, customer, aircraft } object the
// client expects. A LEFT JOIN means aircraft may be absent (null id).
function shapeTrip(row) {
  const {
    customer_id,
    customer_name,
    customer_email,
    aircraft_id,
    aircraft_name,
    aircraft_model,
    aircraft_status,
    ...booking
  } = row;

  return {
    ...booking,
    customer: customer_id
      ? { id: customer_id, name: customer_name, email: customer_email }
      : null,
    aircraft: aircraft_id
      ? {
          id: aircraft_id,
          name: aircraft_name,
          model: aircraft_model,
          status: aircraft_status,
        }
      : null,
  };
}

// SELECT list shared by the trips queries: every booking column plus the public
// fields of the joined customer and aircraft (never the customer passwordHash).
const TRIP_SELECT = `
  b.*,
  c.id    AS customer_id,
  c.name  AS customer_name,
  c.email AS customer_email,
  a.id    AS aircraft_id,
  a.name  AS aircraft_name,
  a.model AS aircraft_model,
  a.status AS aircraft_status
  FROM bookings b
  JOIN users c ON c.id = b.customerId
  LEFT JOIN aircraft a ON a.id = b.aircraftId
`;

// GET /api/operator/trips — bookings assigned to the logged-in operator.
// Includes the customer and assigned aircraft so the list can show route,
// customer, service, status, and aircraft, and the details view has the full
// pickup/destination, distance, fare, and customer info. Newest first.
router.get(
  "/trips",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const rows = await query(
      `SELECT ${TRIP_SELECT} WHERE b.operatorId = ? ORDER BY b.createdAt DESC`,
      [req.user.id]
    );
    res.json({ trips: rows.map(shapeTrip) });
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
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
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

    await query("UPDATE bookings SET status = ? WHERE id = ?", [
      "accepted",
      booking.id,
    ]);
    const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [
      booking.id,
    ]);
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

    await query(
      "UPDATE bookings SET status = ?, operatorId = NULL, aircraftId = NULL WHERE id = ?",
      ["rejected", booking.id]
    );
    const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [
      booking.id,
    ]);
    res.json({ booking: updated });
  }
);

// ── Status progression (Uber-style ride lifecycle) ───────────────────────
// Each advance moves the booking forward and notifies the passenger in real
// time via the customer SSE channel. Allowed transitions:
//   accepted  → enroute   (pilot heading to pickup)
//   enroute   → picked_up (pilot arrived at pickup, passenger boarded)
//   picked_up → flying    (in the air to destination)
//   flying    → completed (landed at destination, trip done)
async function advanceTripStatus(req, res, fromStatus, toStatus) {
  const booking = await loadOwnTrip(req, res);
  if (!booking) return;
  if (booking.status !== fromStatus) {
    return res.status(409).json({
      error: `Trip must be "${fromStatus}" to move it to "${toStatus}"`,
    });
  }
  await query("UPDATE bookings SET status = ? WHERE id = ?", [
    toStatus,
    booking.id,
  ]);
  const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [
    booking.id,
  ]);
  pushCustomer(booking.id, "ride_update", {
    bookingId: booking.id,
    status: toStatus,
  });
  res.json({ booking: updated });
}

router.post(
  "/trips/:id/enroute",
  requireAuth,
  requireRole("operator"),
  (req, res) => advanceTripStatus(req, res, "accepted", "enroute")
);
router.post(
  "/trips/:id/pickup",
  requireAuth,
  requireRole("operator"),
  (req, res) => advanceTripStatus(req, res, "enroute", "picked_up")
);
router.post(
  "/trips/:id/takeoff",
  requireAuth,
  requireRole("operator"),
  (req, res) => advanceTripStatus(req, res, "picked_up", "flying")
);
router.post(
  "/trips/:id/complete",
  requireAuth,
  requireRole("operator"),
  (req, res) => advanceTripStatus(req, res, "flying", "completed")
);

// GET /api/operator/dispatch/stream — SSE dispatch offers (ting sound on client).
router.get(
  "/dispatch/stream",
  requireAuth,
  requireRole("operator"),
  (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(": connected\n\n");
    subscribeOperator(req.user.id, res);
  }
);

// POST /api/operator/location — GPS heartbeat from pilot device.
// Saves the GPS, then — if the pilot has an active in-transit booking — pushes
// the position to that booking's customer SSE channel so the passenger sees the
// plane move in real time (Uber-style "track your driver").
router.post("/location", requireAuth, requireRole("operator"), async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  await query(
    "UPDATE users SET gpsLat = ?, gpsLng = ?, gpsUpdatedAt = NOW() WHERE id = ?",
    [lat, lng, req.user.id]
  );

  // Push live GPS to the passenger watching this pilot's active trip.
  const active = await queryOne(
    `SELECT id, pickupLat, pickupLng, destLat, destLng, status FROM bookings
     WHERE operatorId = ? AND status IN ('assigned','accepted','enroute','picked_up','flying')
     ORDER BY updatedAt DESC LIMIT 1`,
    [req.user.id]
  );
  if (active) {
    const refLat =
      active.status === "flying" ? active.destLat : active.pickupLat;
    const refLng =
      active.status === "flying" ? active.destLng : active.pickupLng;
    const distanceKm =
      Number.isFinite(refLat) && Number.isFinite(refLng)
        ? Math.round(haversineKm(refLat, refLng, lat, lng) * 10) / 10
        : null;
    pushCustomer(active.id, "ride_gps", {
      bookingId: active.id,
      lat,
      lng,
      status: active.status,
      distanceKm,
    });
  }

  res.json({ ok: true, lat, lng });
});

// POST /api/operator/dispatch/offers/:id/accept
router.post(
  "/dispatch/offers/:id/accept",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const offerId = Number(req.params.id);
    const result = await acceptOffer(offerId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ booking: result.booking });
  }
);

// POST /api/operator/dispatch/offers/:id/reject
router.post(
  "/dispatch/offers/:id/reject",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const offerId = Number(req.params.id);
    const result = await rejectOffer(offerId, req.user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: "Offer declined. Dispatching to next pilot." });
  }
);

module.exports = router;
