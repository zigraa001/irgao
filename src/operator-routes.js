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
const {
  acceptOffer,
  rejectOffer,
  offerToNextOperator,
  releaseAircraft,
  setOperatorDuty,
  verifyRideOtp,
  BUSY_STATUSES,
} = require("./dispatch");
const { haversineKm, parseCoord } = require("./pricing");
const { rateLimit } = require("./rate-limit");
const push = require("./push");

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

// GET /api/operator/duty — current on-duty/off-duty state for the pilot.
router.get("/duty", requireAuth, requireRole("operator"), async (req, res) => {
  const u = await queryOne(
    "SELECT onDuty, gpsLat, gpsLng, gpsUpdatedAt FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json({ onDuty: Boolean(u?.onDuty), gps: { lat: u?.gpsLat ?? null, lng: u?.gpsLng ?? null } });
});

// POST /api/operator/duty — toggle on-duty / off-duty.
// Body: { onDuty: true|false }. Going off-duty is refused while the pilot still
// has an active in-transit trip (they're committed to that ride). On-duty is
// always allowed. Accepting a trip auto-forces on-duty; drop-off/cancel
// auto-flips off-duty — this endpoint is the manual override in between.
router.post("/duty", requireAuth, requireRole("operator"), async (req, res) => {
  const onDuty = Boolean(req.body?.onDuty);
  if (!onDuty) {
    const active = await queryOne(
      `SELECT id FROM bookings
       WHERE operatorId = ? AND status IN (${BUSY_STATUSES.map(() => "?").join(",")})
       LIMIT 1`,
      [req.user.id, ...BUSY_STATUSES]
    );
    if (active) {
      return res.status(409).json({
        error: "Cannot go off-duty while you have an active trip.",
        code: "ACTIVE_TRIP",
      });
    }
  }
  await setOperatorDuty(req.user.id, onDuty ? 1 : 0);
  res.json({ onDuty });
});

// ── Web Push subscriptions ────────────────────────────────────────────────
// GET /api/operator/push/vapid-public-key — public key the browser needs to
// subscribe via pushManager.subscribe({ applicationServerKey }).
router.get(
  "/push/vapid-public-key",
  requireAuth,
  requireRole("operator"),
  (req, res) => {
    const publicKey = push.getPublicKey();
    if (!publicKey) {
      return res
        .status(503)
        .json({ error: "Web Push is not configured (VAPID keys missing).", configured: false });
    }
    res.json({ publicKey, configured: true });
  }
);

// POST /api/operator/push/subscribe — store a browser PushSubscription.
// Body: { endpoint, keys: { p256dh, auth } } (the serialized PushSubscription).
router.post(
  "/push/subscribe",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const result = await push.saveSubscription(req.user.id, req.body);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }
);

// POST /api/operator/push/unsubscribe — drop a subscription (e.g. user logged
// out / denied notifications). Body: { endpoint }.
router.post(
  "/push/unsubscribe",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const result = await push.removeSubscription(req.user.id, req.body?.endpoint);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }
);

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

// POST /api/operator/trips/:id/reject — hand back an assigned mission.
// Releases the aircraft, returns the booking to a dispatchable state, and
// re-enters the nearest-pilot dispatch loop (which excludes operators already
// offered this trip, including this one). Previously this stranded the booking
// in "rejected" with no re-dispatch — the customer was stuck.
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

    // Race-safe: only succeeds if still assigned to this operator.
    const claim = await query(
      `UPDATE bookings
       SET status = 'dispatching', operatorId = NULL, aircraftId = NULL, pendingOperatorId = NULL
       WHERE id = ? AND status = 'assigned' AND operatorId = ?`,
      [booking.id, req.user.id]
    );
    if (claim.affectedRows === 0) {
      return res.status(409).json({
        error: "Trip already changed — refresh and try again",
      });
    }
    await releaseAircraft(booking.id);
    await setOperatorDuty(req.user.id, 0);
    pushCustomer(booking.id, "ride_update", {
      bookingId: booking.id,
      status: "dispatching",
      message: "Your pilot reassigned — finding another nearby pilot…",
    });
    await offerToNextOperator(booking.id);
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
//   enroute   → at_pickup (pilot arrived at pickup, waiting for customer OTP)
//   at_pickup → picked_up (customer OTP verified via /verify-otp)
//   picked_up → flying    (in the air to destination — requires an aircraft)
//   flying    → completed (landed at destination, trip done — frees aircraft)
async function advanceTripStatus(req, res, fromStatus, toStatus) {
  const booking = await loadOwnTrip(req, res);
  if (!booking) return;
  if (booking.status !== fromStatus) {
    return res.status(409).json({
      error: `Trip must be "${fromStatus}" to move it to "${toStatus}"`,
    });
  }
  if (toStatus === "flying" && !booking.aircraftId) {
    return res.status(409).json({
      error:
        "No aircraft is assigned to this trip. Cannot take off until an aircraft is available.",
      code: "NO_AIRCRAFT",
    });
  }
  // Race-safe: only the first concurrent advance from this status succeeds.
  const claim = await query(
    "UPDATE bookings SET status = ? WHERE id = ? AND status = ?",
    [toStatus, booking.id, fromStatus]
  );
  if (claim.affectedRows === 0) {
    return res.status(409).json({
      error: `Trip status already changed — refresh and try again`,
    });
  }
  if (toStatus === "completed") {
    await releaseAircraft(booking.id);
    await setOperatorDuty(req.user.id, 0);
  }
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
  (req, res) => advanceTripStatus(req, res, "enroute", "at_pickup")
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
router.post("/location", requireAuth, requireRole("operator"), rateLimit("operator.location"), async (req, res) => {
  const lat = parseCoord(req.body?.lat, "lat");
  const lng = parseCoord(req.body?.lng, "lng");
  if (lat === null || lng === null) {
    return res
      .status(400)
      .json({ error: "lat ([-90,90]) and lng ([-180,180]) are required" });
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

// POST /api/operator/bookings/:id/verify-otp — pilot verifies the ride OTP
// shared by the customer at pickup. Only the assigned operator can verify.
router.post(
  "/bookings/:id/verify-otp",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    if (!booking || booking.operatorId !== req.user.id) {
      return res.status(404).json({ error: "Booking not found" });
    }
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const result = await verifyRideOtp(id, otp);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    res.json({ booking: updated, message: "OTP verified — ride started!" });
  }
);

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
