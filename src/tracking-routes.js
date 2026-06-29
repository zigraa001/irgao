// Live GPS / fleet visibility for passengers + the Uber-style "track my ride"
// SSE stream.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole } = require("./auth");
const { haversineKm } = require("./pricing");
const { IN_TRANSIT_STATUSES, BUSY_STATUSES } = require("./dispatch");
const { subscribeCustomer } = require("./dispatch-hub");

const router = express.Router();
const PASSENGER_RADIUS_KM = 10;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/tracking/nearby — AVAILABLE air taxis within 10 km of the passenger.
// Uber-style pre-booking view: shows free pilots near the pickup so the
// passenger can see supply before confirming. Busy (in-transit) pilots are
// excluded — once you confirm, you track YOUR pilot via /my-ride instead.
router.get("/nearby", requireAuth, requireRole("customer"), async (req, res) => {
  const lat = num(req.query.lat);
  const lng = num(req.query.lng);
  if (lat === null || lng === null) {
    return res.status(400).json({ error: "lat and lng query params are required" });
  }

  const rows = await query(
    `SELECT u.id AS operatorId, u.name AS operatorName, u.gpsLat, u.gpsLng, u.gpsUpdatedAt
     FROM users u
     WHERE u.role = 'operator' AND u.deletedAt IS NULL AND u.bannedAt IS NULL
       AND u.gpsLat IS NOT NULL AND u.gpsLng IS NOT NULL`
  );

  // Find pilots currently busy with a trip so we can exclude them.
  const busyRows = await query(
    `SELECT DISTINCT operatorId FROM bookings
     WHERE operatorId IS NOT NULL AND status IN (${BUSY_STATUSES.map(() => "?").join(",")})`,
    BUSY_STATUSES
  );
  const busy = new Set(busyRows.map((r) => r.operatorId));
  // Also exclude pilots holding a pending dispatch offer (about to be busy).
  const pendingRows = await query(
    `SELECT DISTINCT operatorId FROM dispatch_offers
     WHERE status = 'pending' AND expiresAt > NOW()`
  );
  pendingRows.forEach((r) => busy.add(r.operatorId));

  const taxis = [];
  for (const row of rows) {
    if (busy.has(row.operatorId)) continue;
    const dist = haversineKm(lat, lng, row.gpsLat, row.gpsLng);
    if (dist <= PASSENGER_RADIUS_KM) {
      taxis.push({
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        lat: row.gpsLat,
        lng: row.gpsLng,
        gpsUpdatedAt: row.gpsUpdatedAt,
        distanceKm: Math.round(dist * 10) / 10,
      });
    }
  }
  taxis.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({ taxis, radiusKm: PASSENGER_RADIUS_KM });
});

// GET /api/tracking/my-ride/:bookingId — one-shot assigned operator GPS.
router.get("/my-ride/:bookingId", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!booking.operatorId) {
    return res.json({ operator: null, bookingStatus: booking.status });
  }
  const op = await queryOne(
    "SELECT id, name, gpsLat, gpsLng, gpsUpdatedAt FROM users WHERE id = ?",
    [booking.operatorId]
  );
  let distanceKm = null;
  if (op?.gpsLat != null && req.user.role === "customer") {
    const d = haversineKm(
      booking.pickupLat,
      booking.pickupLng,
      op.gpsLat,
      op.gpsLng
    );
    distanceKm = Math.round(d * 10) / 10;
  }
  res.json({
    operator: op
      ? {
          id: op.id,
          name: op.name,
          lat: op.gpsLat,
          lng: op.gpsLng,
          gpsUpdatedAt: op.gpsUpdatedAt,
          distanceKm,
        }
      : null,
    bookingStatus: booking.status,
  });
});

// GET /api/tracking/my-ride/:bookingId/stream — SSE stream of ride status
// updates + the assigned pilot's live GPS for this booking. Uber-style: the
// passenger subscribes after confirming and sees ONLY their plane move.
router.get(
  "/my-ride/:bookingId/stream",
  requireAuth,
  async (req, res) => {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (req.user.role === "customer" && booking.customerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    // Send the current state immediately so the client doesn't have to poll.
    const op = booking.operatorId
      ? await queryOne(
          "SELECT id, name, gpsLat, gpsLng, gpsUpdatedAt FROM users WHERE id = ?",
          [booking.operatorId]
        )
      : null;
    res.write(
      `event: ride_state\ndata: ${JSON.stringify({
        bookingId: booking.id,
        status: booking.status,
        operator: op
          ? {
              id: op.id,
              name: op.name,
              lat: op.gpsLat,
              lng: op.gpsLng,
            }
          : null,
      })}\n\n`
    );
    subscribeCustomer(bookingId, res);
  }
);

module.exports = router;
