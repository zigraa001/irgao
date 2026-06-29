// Auto-dispatch: offer bookings to nearest available operators (30s timeout).
// Uber-style: only operators within DISPATCH_RADIUS_KM of the pickup are ever
// notified, and at most MAX_OFFER_ATTEMPTS of the nearest are tried (one at a
// time). If none accept, the booking moves to "no_pilot" instead of cycling
// through every operator on Earth — that was the "all operators get notified"
// bug (no radius + no attempt cap).
const { query, queryOne } = require("./db");
const { haversineKm } = require("./pricing");
const { pushOperator, pushCustomer } = require("./dispatch-hub");
const push = require("./push");

const OFFER_SECONDS = 30;
const DISPATCH_RADIUS_KM = 20; // only offer to pilots within this radius of pickup
const MAX_OFFER_ATTEMPTS = 10; // try at most this many nearest pilots, then give up
const BUSY_STATUSES = [
  "assigned",
  "accepted",
  "enroute",
  "picked_up",
  "flying",
];
const IN_TRANSIT_STATUSES = ["accepted", "enroute", "picked_up", "flying"];

// offerId → { timer, bookingId }. We track the bookingId so that when one
// operator accepts, we can clear every other pending offer's timer for that
// booking — otherwise their setTimeout fires later and no-ops (wasteful, and
// can race against the already-assigned state).
const offerTimers = new Map();

function clearOfferTimer(offerId) {
  const entry = offerTimers.get(offerId);
  if (entry) {
    clearTimeout(entry.timer);
    offerTimers.delete(offerId);
  }
}

// On accept, kill every still-pending offer timer for this booking so no
// later expiry fires against an already-assigned trip.
function clearAllOfferTimersForBooking(bookingId) {
  const id = Number(bookingId);
  for (const [offerId, entry] of offerTimers) {
    if (Number(entry.bookingId) === id) {
      clearTimeout(entry.timer);
      offerTimers.delete(offerId);
    }
  }
}

async function isOperatorBusy(operatorId) {
  const row = await queryOne(
    `SELECT id FROM bookings
     WHERE operatorId = ? AND status IN (${BUSY_STATUSES.map(() => "?").join(",")})
     LIMIT 1`,
    [operatorId, ...BUSY_STATUSES]
  );
  if (row) return true;
  const pending = await queryOne(
    `SELECT id FROM dispatch_offers
     WHERE operatorId = ? AND status = 'pending' AND expiresAt > NOW()
     LIMIT 1`,
    [operatorId]
  );
  return Boolean(pending);
}

async function listAvailableOperatorsNear(pickupLat, pickupLng, excludeIds = []) {
  // Single query: select non-busy, ON-DUTY operators (no active booking, no
  // pending unexpired offer) in one pass via NOT EXISTS — replaces the previous
  // N+1 that ran 2 queries per candidate. Off-duty pilots are excluded so they
  // never receive offers.
  const busyPlaceholders = BUSY_STATUSES.map(() => "?").join(",");
  const rows = await query(
    `SELECT id, name, email, gpsLat, gpsLng
     FROM users u
     WHERE u.role = 'operator' AND u.deletedAt IS NULL AND u.bannedAt IS NULL
       AND u.onDuty = 1
       AND u.gpsLat IS NOT NULL AND u.gpsLng IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.operatorId = u.id AND b.status IN (${busyPlaceholders})
       )
       AND NOT EXISTS (
         SELECT 1 FROM dispatch_offers o
         WHERE o.operatorId = u.id AND o.status = 'pending' AND o.expiresAt > NOW()
       )`,
    BUSY_STATUSES
  );
  const exclude = new Set(excludeIds.map(Number));
  const candidates = [];
  for (const op of rows) {
    if (exclude.has(op.id)) continue;
    const dist = haversineKm(pickupLat, pickupLng, op.gpsLat, op.gpsLng);
    if (dist > DISPATCH_RADIUS_KM) continue; // radius cap — no global cycling
    candidates.push({ ...op, distanceKm: Math.round(dist * 10) / 10 });
  }
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates;
}

async function expireOffer(offerId) {
  const offer = await queryOne("SELECT * FROM dispatch_offers WHERE id = ?", [
    offerId,
  ]);
  if (!offer || offer.status !== "pending") return;
  await query(
    "UPDATE dispatch_offers SET status = 'expired' WHERE id = ?",
    [offerId]
  );
  pushOperator(offer.operatorId, "dispatch_cancelled", {
    offerId,
    reason: "expired",
  });
  await offerToNextOperator(offer.bookingId);
}

async function createOffer(booking, operator, meta = {}) {
  const attempt = Number(meta.attempt) || 1;
  const maxAttempts = Number(meta.maxAttempts) || MAX_OFFER_ATTEMPTS;

  const result = await query(
    `INSERT INTO dispatch_offers (bookingId, operatorId, status, expiresAt)
     VALUES (?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [booking.id, operator.id, OFFER_SECONDS]
  );
  const offerId = result.insertId;
  await query("UPDATE bookings SET pendingOperatorId = ? WHERE id = ?", [
    operator.id,
    booking.id,
  ]);

  const offer = await queryOne(
    `SELECT o.*, b.pickupName, b.pickupLat, b.pickupLng, b.destName, b.destLat, b.destLng,
            b.service, b.distanceKm, b.fareEstimate, b.carbonSavedKg
     FROM dispatch_offers o
     JOIN bookings b ON b.id = o.bookingId
     WHERE o.id = ?`,
    [offerId]
  );

  pushOperator(operator.id, "dispatch_offer", {
    offerId,
    expiresInSeconds: OFFER_SECONDS,
    playSound: true,
    requestId: offer.bookingId,
    attempt,
    maxAttempts,
    service: offer.service,
    booking: {
      id: offer.bookingId,
      pickupName: offer.pickupName,
      pickupLat: offer.pickupLat,
      pickupLng: offer.pickupLng,
      destName: offer.destName,
      destLat: offer.destLat,
      destLng: offer.destLng,
      service: offer.service,
      distanceKm: offer.distanceKm,
      fareEstimate: offer.fareEstimate,
      carbonSavedKg: offer.carbonSavedKg,
    },
    operatorDistanceKm: operator.distanceKm,
  });

  // Tell the passenger which operator we're currently waiting on (one at a
  // time, nearest first) — "Waiting for operator 1 of 10 to accept…".
  pushCustomer(booking.id, "dispatch_progress", {
    bookingId: booking.id,
    attempt,
    maxAttempts,
    operatorId: operator.id,
    operatorDistanceKm: operator.distanceKm,
    message:
      attempt <= 1
        ? `Waiting for operator 1 of ${maxAttempts} to accept…`
        : `Forwarding request to operator ${attempt} of ${maxAttempts}…`,
  });

  // Web Push: reach the pilot even if their tab is backgrounded/locked. Fire
  // and forget — SSE is still the primary channel; this is the "ting" that
  // works when the browser isn't in focus.
  push
    .sendToUser(operator.id, {
      type: "dispatch_offer",
      offerId,
      requestId: offer.bookingId,
      title:
        offer.service === "golden"
          ? "🚨 Golden Hour request — accept now"
          : "New ride request",
      body: `${offer.pickupName} → ${offer.destName} · ${offer.distanceKm} km`,
      service: offer.service,
      attempt,
      maxAttempts,
    })
    .catch((err) => console.error("[push] sendToUser failed:", err.message));

  clearOfferTimer(offerId);
  const timer = setTimeout(() => expireOffer(offerId), OFFER_SECONDS * 1000);
  offerTimers.set(offerId, { timer, bookingId: booking.id });
  return offerId;
}

async function offerToNextOperator(bookingId, triedOperatorIds = []) {
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [
    bookingId,
  ]);
  if (!booking || booking.paymentStatus !== "paid") return null;
  if (booking.operatorId) return null;
  if (!["requested", "dispatching"].includes(booking.status)) return null;

  const tried = await query(
    `SELECT operatorId FROM dispatch_offers WHERE bookingId = ?`,
    [bookingId]
  );
  const excludeIds = [
    ...tried.map((r) => r.operatorId),
    ...triedOperatorIds,
  ];

  const nearby = await listAvailableOperatorsNear(
    booking.pickupLat,
    booking.pickupLng,
    excludeIds
  );

  // Attempt cap: if we've already tried MAX_OFFER_ATTEMPTS nearby pilots (or
  // there are no more nearby pilots at all within the radius), give up
  // gracefully instead of widening to global. The customer is told no pilot
  // was found nearby.
  if (!nearby.length || tried.length >= MAX_OFFER_ATTEMPTS) {
    await query("UPDATE bookings SET status = 'no_pilot' WHERE id = ?", [
      bookingId,
    ]);
    pushCustomer(bookingId, "ride_update", {
      bookingId,
      status: "no_pilot",
      message: "Sorry, we couldn't find a pilot nearby. Please try again shortly.",
    });
    pushCustomer(bookingId, "dispatch_progress", {
      bookingId,
      attempt: tried.length,
      maxAttempts: MAX_OFFER_ATTEMPTS,
      final: true,
      message: "Sorry, we couldn't find a pilot nearby. Please try again shortly.",
    });
    return null;
  }

  await query("UPDATE bookings SET status = 'dispatching' WHERE id = ?", [
    bookingId,
  ]);
  // tried.length operators have already been offered (and rejected/expired);
  // the one we're about to offer is the next attempt.
  const attempt = tried.length + 1;
  return createOffer(booking, nearby[0], {
    attempt,
    maxAttempts: MAX_OFFER_ATTEMPTS,
  });
}

async function startDispatch(bookingId) {
  await query(
    "UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL WHERE id = ?",
    [bookingId]
  );
  return offerToNextOperator(bookingId);
}

// Boot-time recovery. The dispatch offer timers live in memory, so a restart
// orphans every booking still in "dispatching" (their 30s timers are gone and
// no one will re-offer). Expire stale pending offers and re-enter the dispatch
// loop for any paid, still-dispatchable booking. Safe to run on every boot.
async function recoverDispatch() {
  let expiredOffers = 0;
  let redispatched = 0;
  try {
    const stale = await query(
      `UPDATE dispatch_offers SET status = 'expired'
       WHERE status = 'pending' AND expiresAt <= NOW()`
    );
    expiredOffers = stale.affectedRows || 0;
  } catch (err) {
    console.error("[dispatch] recover: failed to expire stale offers:", err.message);
  }
  try {
    const stuck = await query(
      `SELECT id FROM bookings
       WHERE paymentStatus = 'paid' AND status IN ('requested', 'dispatching')`
    );
    for (const b of stuck) {
      try {
        await offerToNextOperator(b.id);
        redispatched += 1;
      } catch (err) {
        console.error(`[dispatch] recover: re-offer for booking ${b.id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("[dispatch] recover: failed to load stuck bookings:", err.message);
  }
  return { expiredOffers, redispatched };
}

async function acceptOffer(offerId, operatorId) {
  const offer = await queryOne(
    "SELECT * FROM dispatch_offers WHERE id = ? AND operatorId = ?",
    [offerId, operatorId]
  );
  if (!offer || offer.status !== "pending") {
    return { ok: false, status: 404, error: "Offer not found or expired" };
  }
  if (new Date(offer.expiresAt) < new Date()) {
    return { ok: false, status: 409, error: "Offer expired" };
  }

  clearAllOfferTimersForBooking(offer.bookingId);

  // Race-safe claim: only the first concurrent accept flips the booking to
  // "assigned". The conditional `WHERE operatorId IS NULL` guarantees a second
  // concurrent accept (on a different pending offer for the same booking) gets
  // affectedRows=0 and loses — no double-assignment, no duplicate pushCustomer.
  // assignedAt seeds the cancellation grace clock (Uber/Ola 5-min free window).
  const claim = await query(
    `UPDATE bookings SET operatorId = ?, pendingOperatorId = NULL, status = 'assigned', assignedAt = NOW()
     WHERE id = ? AND operatorId IS NULL`,
    [operatorId, offer.bookingId]
  );
  if (claim.affectedRows === 0) {
    return {
      ok: false,
      status: 409,
      error: "This trip has already been accepted by another pilot.",
    };
  }

  // Auto on-duty: accepting a trip forces the operator on-duty for its
  // duration. They go back off-duty on drop-off or cancellation.
  await setOperatorDuty(operatorId, 1);

  await query("UPDATE dispatch_offers SET status = 'accepted' WHERE id = ?", [
    offerId,
  ]);
  await query(
    `UPDATE dispatch_offers SET status = 'expired'
     WHERE bookingId = ? AND id != ? AND status = 'pending'`,
    [offer.bookingId, offerId]
  );

  // Assign an available aircraft to this trip (best-effort). If none is free,
  // aircraftId stays NULL and the pilot won't be able to take off until one is.
  await assignAvailableAircraft(offer.bookingId);

  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [
    offer.bookingId,
  ]);
  // Tell the passenger a pilot has been assigned (Uber-style "driver found").
  pushCustomer(offer.bookingId, "ride_update", {
    bookingId: offer.bookingId,
    status: "assigned",
    operatorId,
  });
  return { ok: true, booking };
}

// Pick the first available aircraft and mark it in_flight for the booking.
// Leaves aircraftId NULL if the fleet is fully used / under maintenance.
async function assignAvailableAircraft(bookingId) {
  const ac = await queryOne(
    "SELECT id FROM aircraft WHERE status = 'available' ORDER BY id LIMIT 1"
  );
  if (!ac) return null;
  await query("UPDATE aircraft SET status = 'in_flight' WHERE id = ?", [ac.id]);
  await query("UPDATE bookings SET aircraftId = ? WHERE id = ?", [
    ac.id,
    bookingId,
  ]);
  return ac.id;
}

// Release the aircraft tied to a booking back to "available" and clear the
// booking's aircraftId. Used when a trip ends (completed) or is handed back
// (operator trip-level reject / re-dispatch). No-op if no aircraft was set.
async function releaseAircraft(bookingId) {
  const booking = await queryOne(
    "SELECT aircraftId FROM bookings WHERE id = ?",
    [bookingId]
  );
  if (!booking || !booking.aircraftId) return;
  await query("UPDATE aircraft SET status = 'available' WHERE id = ?", [
    booking.aircraftId,
  ]);
  await query("UPDATE bookings SET aircraftId = NULL WHERE id = ?", [bookingId]);
}

// Flip an operator's onDuty flag. Used by the manual toggle and by the auto
// on-duty/off-duty transitions on accept / drop-off / cancel.
async function setOperatorDuty(operatorId, onDuty) {
  await query("UPDATE users SET onDuty = ? WHERE id = ? AND role = 'operator'", [
    onDuty ? 1 : 0,
    operatorId,
  ]);
}

// Tear down everything dispatch was doing for a booking: clear in-memory offer
// timers, expire every still-pending offer, release the assigned aircraft, and
// notify each offered operator that the request was withdrawn. Does NOT change
// the booking status — the caller decides the final status (cancelled/etc).
async function stopDispatch(bookingId) {
  clearAllOfferTimersForBooking(bookingId);
  await query(
    `UPDATE dispatch_offers SET status = 'expired'
     WHERE bookingId = ? AND status = 'pending'`,
    [bookingId]
  );
  const offered = await query(
    "SELECT DISTINCT operatorId FROM dispatch_offers WHERE bookingId = ?",
    [bookingId]
  );
  for (const o of offered) {
    pushOperator(o.operatorId, "dispatch_cancelled", {
      bookingId,
      reason: "cancelled",
    });
  }
  await releaseAircraft(bookingId);
}

async function rejectOffer(offerId, operatorId) {
  const offer = await queryOne(
    "SELECT * FROM dispatch_offers WHERE id = ? AND operatorId = ?",
    [offerId, operatorId]
  );
  if (!offer || offer.status !== "pending") {
    return { ok: false, status: 404, error: "Offer not found" };
  }

  clearOfferTimer(offerId);
  await query("UPDATE dispatch_offers SET status = 'rejected' WHERE id = ?", [
    offerId,
  ]);
  await query("UPDATE bookings SET pendingOperatorId = NULL WHERE id = ?", [
    offer.bookingId,
  ]);
  pushOperator(operatorId, "dispatch_cancelled", {
    offerId,
    reason: "rejected",
  });
  await offerToNextOperator(offer.bookingId);
  return { ok: true };
}

module.exports = {
  OFFER_SECONDS,
  DISPATCH_RADIUS_KM,
  MAX_OFFER_ATTEMPTS,
  BUSY_STATUSES,
  IN_TRANSIT_STATUSES,
  listAvailableOperatorsNear,
  startDispatch,
  acceptOffer,
  rejectOffer,
  offerToNextOperator,
  isOperatorBusy,
  recoverDispatch,
  assignAvailableAircraft,
  releaseAircraft,
  stopDispatch,
  setOperatorDuty,
};
