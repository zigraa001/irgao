// Auto-dispatch: offer bookings to nearest available operators (30s timeout).
// Uber-style: only operators within DISPATCH_RADIUS_KM of the pickup are ever
// notified, and at most MAX_OFFER_ATTEMPTS of the nearest are tried (one at a
// time). If none accept, the booking moves to "no_pilot" instead of cycling
// through every operator on Earth — that was the "all operators get notified"
// bug (no radius + no attempt cap).
const { query, queryOne } = require("./db");
const { haversineKm } = require("./pricing");
const { pushOperator, pushCustomer } = require("./dispatch-hub");

const OFFER_SECONDS = 30;
const DISPATCH_RADIUS_KM = 25; // only offer to pilots within this radius of pickup
const MAX_OFFER_ATTEMPTS = 6; // try at most this many nearest pilots, then give up
const BUSY_STATUSES = [
  "assigned",
  "accepted",
  "enroute",
  "picked_up",
  "flying",
];
const IN_TRANSIT_STATUSES = ["accepted", "enroute", "picked_up", "flying"];

const offerTimers = new Map();

function clearOfferTimer(offerId) {
  const t = offerTimers.get(offerId);
  if (t) {
    clearTimeout(t);
    offerTimers.delete(offerId);
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
  const rows = await query(
    `SELECT id, name, email, gpsLat, gpsLng
     FROM users
     WHERE role = 'operator' AND deletedAt IS NULL AND bannedAt IS NULL
       AND gpsLat IS NOT NULL AND gpsLng IS NOT NULL`
  );
  const exclude = new Set(excludeIds.map(Number));
  const candidates = [];
  for (const op of rows) {
    if (exclude.has(op.id)) continue;
    if (await isOperatorBusy(op.id)) continue;
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

async function createOffer(booking, operator) {
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

  clearOfferTimer(offerId);
  const timer = setTimeout(() => expireOffer(offerId), OFFER_SECONDS * 1000);
  offerTimers.set(offerId, timer);
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
      message: "No pilots available nearby right now.",
    });
    return null;
  }

  await query("UPDATE bookings SET status = 'dispatching' WHERE id = ?", [
    bookingId,
  ]);
  return createOffer(booking, nearby[0]);
}

async function startDispatch(bookingId) {
  await query(
    "UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL WHERE id = ?",
    [bookingId]
  );
  return offerToNextOperator(bookingId);
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

  clearOfferTimer(offerId);
  await query("UPDATE dispatch_offers SET status = 'accepted' WHERE id = ?", [
    offerId,
  ]);
  await query(
    `UPDATE dispatch_offers SET status = 'expired'
     WHERE bookingId = ? AND id != ? AND status = 'pending'`,
    [offer.bookingId, offerId]
  );
  await query(
    `UPDATE bookings SET operatorId = ?, pendingOperatorId = NULL, status = 'assigned'
     WHERE id = ?`,
    [operatorId, offer.bookingId]
  );

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
};
