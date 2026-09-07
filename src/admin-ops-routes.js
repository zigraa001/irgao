// Admin operations: live in-transit flights and fleet positions.
const express = require("express");
const { query } = require("./db");
const { requireAuth, requireRole } = require("./auth");
const { IN_TRANSIT_STATUSES } = require("./dispatch");

const router = express.Router();

// GET /api/admin/live-flights — all trips in transit + operator GPS.
router.get(
  "/live-flights",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    const placeholders = IN_TRANSIT_STATUSES.map(() => "?").join(",");
    const rows = await query(
      `SELECT b.id, b.status, b.pickupName, b.pickupLat, b.pickupLng,
              b.destName, b.destLat, b.destLng, b.service, b.distanceKm,
              b.fareEstimate, b.paymentStatus, b.carbonSavedKg, b.updatedAt,
              c.name AS customerName, c.email AS customerEmail,
              o.id AS operatorId, o.name AS operatorName,
              o.gpsLat, o.gpsLng, o.gpsUpdatedAt,
              a.name AS aircraftName
       FROM bookings b
       JOIN users c ON c.id = b.customerId
       LEFT JOIN users o ON o.id = b.operatorId
       LEFT JOIN aircraft a ON a.id = b.aircraftId
       WHERE b.status IN (${placeholders})
          OR (b.status = 'assigned' AND b.operatorId IS NOT NULL)
          OR b.status = 'dispatching'
       ORDER BY b.updatedAt DESC`,
      IN_TRANSIT_STATUSES
    );

    const dispatching = await query(
      `SELECT b.id, b.pickupName, b.destName, b.status, b.pendingOperatorId,
              u.name AS pendingOperatorName
       FROM bookings b
       LEFT JOIN users u ON u.id = b.pendingOperatorId
       WHERE b.status = 'dispatching' OR b.pendingOperatorId IS NOT NULL`
    );

    const fleet = await query(
      `SELECT u.id, u.name, u.gpsLat, u.gpsLng, u.gpsUpdatedAt,
              b.id AS bookingId, b.status AS tripStatus
       FROM users u
       LEFT JOIN bookings b ON b.operatorId = u.id
         AND b.status IN (${placeholders})
       WHERE u.role = 'operator' AND u.deletedAt IS NULL AND u.bannedAt IS NULL
         AND u.gpsLat IS NOT NULL AND u.gpsLng IS NOT NULL
       ORDER BY u.name`,
      IN_TRANSIT_STATUSES
    );

    res.json({
      flights: rows.map((r) => ({
        id: r.id,
        status: r.status,
        pickup: { name: r.pickupName, lat: r.pickupLat, lng: r.pickupLng },
        dest: { name: r.destName, lat: r.destLat, lng: r.destLng },
        service: r.service,
        distanceKm: r.distanceKm,
        fareEstimate: r.fareEstimate,
        paymentStatus: r.paymentStatus,
        carbonSavedKg: r.carbonSavedKg,
        updatedAt: r.updatedAt,
        customer: { name: r.customerName, email: r.customerEmail },
        operator: r.operatorId
          ? {
              id: r.operatorId,
              name: r.operatorName,
              lat: r.gpsLat,
              lng: r.gpsLng,
              gpsUpdatedAt: r.gpsUpdatedAt,
            }
          : null,
        aircraft: r.aircraftName || null,
      })),
      dispatching,
      fleet: fleet.map((r) => ({
        operatorId: r.id,
        name: r.name,
        lat: r.gpsLat,
        lng: r.gpsLng,
        gpsUpdatedAt: r.gpsUpdatedAt,
        inTransit: Boolean(r.bookingId),
        bookingId: r.bookingId || null,
        tripStatus: r.tripStatus || null,
      })),
    });
  }
);

const IN_FLIGHT_STATUSES = [
  "dispatching",
  "assigned",
  "accepted",
  "enroute",
  "at_pickup",
  "picked_up",
  "flying",
];

// GET /api/admin/bookings — full booking history for the admin dashboard.
// ?filter=all|inflight|done|cancelled  ?limit=50  ?offset=0
router.get("/bookings", requireAuth, requireRole("admin"), async (req, res) => {
  const filter = String(req.query.filter || "all").toLowerCase();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 10000);

  let where = "1=1";
  const params = [];
  if (filter === "inflight") {
    where = `b.status IN (${IN_FLIGHT_STATUSES.map(() => "?").join(",")})`;
    params.push(...IN_FLIGHT_STATUSES);
  } else if (filter === "done") {
    where = "b.status = ?";
    params.push("completed");
  } else if (filter === "cancelled") {
    where = "b.status = ?";
    params.push("cancelled");
  }

  const inflightPlaceholders = IN_FLIGHT_STATUSES.map(() => "?").join(",");
  const [rows, stats, filteredCount] = await Promise.all([
    query(
      `SELECT b.id, b.status, b.service, b.pickupName, b.destName, b.distanceKm,
              b.fareEstimate, b.paymentStatus, b.createdAt, b.updatedAt,
              c.name AS customerName, c.email AS customerEmail,
              o.name AS operatorName, a.name AS aircraftName
       FROM bookings b
       JOIN users c ON c.id = b.customerId
       LEFT JOIN users o ON o.id = b.operatorId
       LEFT JOIN aircraft a ON a.id = b.aircraftId
       WHERE ${where}
       ORDER BY b.createdAt DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    query(
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status IN (${inflightPlaceholders}) THEN 1 ELSE 0 END) AS inflight,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM bookings`,
      IN_FLIGHT_STATUSES
    ),
    query(
      `SELECT COUNT(*) AS n FROM bookings b WHERE ${where}`,
      params
    ),
  ]);

  const s = stats[0] || {};
  res.json({
    bookings: rows.map((r) => ({
      id: r.id,
      status: r.status,
      service: r.service,
      pickupName: r.pickupName,
      destName: r.destName,
      distanceKm: r.distanceKm,
      fareEstimate: r.fareEstimate,
      paymentStatus: r.paymentStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      customer: { name: r.customerName, email: r.customerEmail },
      operatorName: r.operatorName || null,
      aircraftName: r.aircraftName || null,
    })),
    total: Number(filteredCount[0]?.n) || 0,
    stats: {
      total: Number(s.total) || 0,
      inflight: Number(s.inflight) || 0,
      done: Number(s.done) || 0,
      cancelled: Number(s.cancelled) || 0,
    },
    limit,
    offset,
    filter,
  });
});

module.exports = router;
