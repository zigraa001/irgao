// Aggregates a user's booking history into a single "profile dashboard" payload.
// Mounted at GET /api/me/stats. Output is role-scoped:
//   - customer: their trips, spend, distance, CO₂ saved, service mix
//   - operator: trips assigned to them, flown distance, earnings, CO₂ saved
//   - admin:    platform-wide totals (users, bookings, revenue, CO₂, live)
// Every aggregate coerces NULL/missing columns to 0 so the dashboard never
// renders "NaN" on a fresh database with no bookings yet.
const { query, queryOne } = require("./db");
const { USER_NOT_DELETED } = require("./auth");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Sum a column across rows, guarding against NULL/non-numeric values.
function sumRows(rows, col) {
  return rows.reduce((acc, r) => acc + num(r[col]), 0);
}

// Group rows by a key column and sum one numeric column per group.
function groupSum(rows, keyCol, valCol) {
  const out = {};
  for (const r of rows) {
    const k = r[keyCol] || "unknown";
    out[k] = num(out[k]) + num(r[valCol]);
  }
  return out;
}

function countBy(rows, keyCol) {
  const out = {};
  for (const r of rows) {
    const k = r[keyCol] || "unknown";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

async function customerStats(userId) {
  const rows = await query(
    `SELECT id, service, status, distanceKm, fareEstimate, carbonSavedKg,
            pickupName, destName, createdAt
       FROM bookings
       WHERE customerId = ?
       ORDER BY createdAt DESC
       LIMIT 200`,
    [userId]
  );

  const totals = {
    trips: rows.length,
    completed: rows.filter((r) => r.status === "completed").length,
    inProgress: rows.filter(
      (r) =>
        r.status !== "completed" &&
        r.status !== "cancelled" &&
        r.status !== "rejected"
    ).length,
    cancelled: rows.filter(
      (r) => r.status === "cancelled" || r.status === "rejected"
    ).length,
    distanceKm: Math.round(sumRows(rows, "distanceKm") * 10) / 10,
    spentINR: Math.round(sumRows(rows, "fareEstimate")),
    carbonSavedKg: Math.round(sumRows(rows, "carbonSavedKg") * 10) / 10,
  };

  return {
    scope: "customer",
    totals,
    byService: countBy(rows, "service"),
    serviceDistanceKm: groupSum(rows, "service", "distanceKm"),
    byStatus: countBy(rows, "status"),
    recent: rows.slice(0, 5).map((r) => ({
      id: r.id,
      service: r.service,
      status: r.status,
      route: `${r.pickupName} → ${r.destName}`,
      distanceKm: r.distanceKm,
      fareEstimate: r.fareEstimate,
      carbonSavedKg: r.carbonSavedKg,
      createdAt: r.createdAt,
    })),
  };
}

async function operatorStats(userId) {
  const rows = await query(
    `SELECT id, service, status, distanceKm, fareEstimate, carbonSavedKg,
            pickupName, destName, createdAt
       FROM bookings
       WHERE operatorId = ?
       ORDER BY createdAt DESC
       LIMIT 200`,
    [userId]
  );

  // Earnings proxy: operator share of completed trip fares (60%).
  const completedRows = rows.filter((r) => r.status === "completed");
  const earnings = Math.round(sumRows(completedRows, "fareEstimate") * 0.6);

  const totals = {
    assigned: rows.length,
    completed: completedRows.length,
    inProgress: rows.filter(
      (r) =>
        r.status !== "completed" &&
        r.status !== "cancelled" &&
        r.status !== "rejected"
    ).length,
    distanceFlownKm: Math.round(sumRows(completedRows, "distanceKm") * 10) / 10,
    earningsINR: earnings,
    carbonSavedKg: Math.round(sumRows(completedRows, "carbonSavedKg") * 10) / 10,
  };

  return {
    scope: "operator",
    totals,
    byService: countBy(rows, "service"),
    byStatus: countBy(rows, "status"),
    recent: rows.slice(0, 5).map((r) => ({
      id: r.id,
      service: r.service,
      status: r.status,
      route: `${r.pickupName} → ${r.destName}`,
      distanceKm: r.distanceKm,
      fareEstimate: r.fareEstimate,
      carbonSavedKg: r.carbonSavedKg,
      createdAt: r.createdAt,
    })),
  };
}

async function adminStats() {
  const [usersByRole, bookingAgg, fleetAgg, liveAgg] = await Promise.all([
    query(
      `SELECT role, COUNT(*) AS n FROM users WHERE ${USER_NOT_DELETED} GROUP BY role`
    ),
    query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'cancelled' OR status = 'rejected' THEN 1 ELSE 0 END) AS cancelled,
              COALESCE(SUM(distanceKm), 0) AS distanceKm,
              COALESCE(SUM(fareEstimate), 0) AS revenue,
              COALESCE(SUM(carbonSavedKg), 0) AS carbonSavedKg
         FROM bookings`
    ),
    queryOne(`SELECT COUNT(*) AS n FROM aircraft WHERE status = 'available'`),
    queryOne(
      `SELECT COUNT(*) AS n FROM bookings WHERE status NOT IN ('completed','cancelled','rejected')`
    ),
  ]);

  const users = {};
  for (const r of usersByRole) users[r.role || "unknown"] = r.n;

  const agg = bookingAgg[0] || {};
  const totals = {
    users,
    totalUsers: sumRows(usersByRole, "n"),
    totalBookings: num(agg.total),
    completed: num(agg.completed),
    cancelled: num(agg.cancelled),
    live: num(liveAgg ? liveAgg.n : 0),
    availableAircraft: num(fleetAgg ? fleetAgg.n : 0),
    distanceKm: Math.round(num(agg.distanceKm) * 10) / 10,
    revenueINR: Math.round(num(agg.revenue)),
    carbonSavedKg: Math.round(num(agg.carbonSavedKg) * 10) / 10,
  };

  return { scope: "admin", totals };
}

async function buildProfileStats(userId, role) {
  if (role === "admin") return adminStats();
  if (role === "operator") return operatorStats(userId);
  return customerStats(userId);
}

module.exports = {
  buildProfileStats,
  customerStats,
  operatorStats,
  adminStats,
};
