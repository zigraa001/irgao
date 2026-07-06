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
  const [rows, userRow] = await Promise.all([
    query(
      `SELECT id, service, status, distanceKm, fareEstimate, carbonSavedKg,
              creditsEarned, creditsUsed, pickupName, destName, createdAt
         FROM bookings
         WHERE customerId = ?
         ORDER BY createdAt DESC
         LIMIT 200`,
      [userId]
    ),
    queryOne("SELECT carbonCredits FROM users WHERE id = ?", [userId]),
  ]);

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
    carbonCredits: userRow ? Number(userRow.carbonCredits) || 0 : 0,
    creditsEarned: sumRows(rows, "creditsEarned"),
    creditsUsed: sumRows(rows, "creditsUsed"),
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
    `SELECT id, service, status, distanceKm, fareEstimate, operatorPayout, carbonSavedKg,
            pickupName, destName, createdAt
       FROM bookings
       WHERE operatorId = ?
       ORDER BY createdAt DESC
       LIMIT 200`,
    [userId]
  );

  const completedRows = rows.filter((r) => r.status === "completed");
  let commRate = 0.15;
  try {
    const commRow = await queryOne(
      "SELECT settingValue FROM pricing_config WHERE settingKey = 'platformCommissionPercent'"
    );
    if (commRow) commRate = commRow.settingValue / 100;
  } catch {}
  // Use persisted operatorPayout per row with legacy fallback
  let earnings = 0;
  for (const r of completedRows) {
    earnings += r.operatorPayout != null ? r.operatorPayout : (r.fareEstimate || 0) * (1 - commRate);
  }
  earnings = Math.round(earnings);

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

async function companyStats(userId) {
  const userRow = await queryOne(
    "SELECT companyId FROM users WHERE id = ?",
    [userId]
  );
  const companyId = userRow ? userRow.companyId : null;
  if (!companyId) {
    return { scope: "company", totals: { completedFlights: 0, completedThisMonth: 0, grossRevenue: 0, netPayout: 0, totalPilots: 0, onDutyPilots: 0, cancelled: 0 } };
  }

  const [flightAgg, monthAgg, pilotAgg, dutyAgg] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) AS completed,
              COALESCE(SUM(b.fareEstimate), 0) AS gross,
              COALESCE(SUM(COALESCE(b.operatorPayout, b.fareEstimate * 0.85)), 0) AS net,
              SUM(CASE WHEN b.status = 'cancelled' OR b.status = 'rejected' THEN 1 ELSE 0 END) AS cancelled
         FROM bookings b
         JOIN users u ON u.id = b.operatorId
         WHERE u.companyId = ? AND b.status = 'completed'`,
      [companyId]
    ),
    queryOne(
      `SELECT COUNT(*) AS n
         FROM bookings b
         JOIN users u ON u.id = b.operatorId
         WHERE u.companyId = ? AND b.status = 'completed'
           AND b.createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      [companyId]
    ),
    queryOne(
      `SELECT COUNT(*) AS n FROM users WHERE companyId = ? AND role = 'operator' AND ${USER_NOT_DELETED}`,
      [companyId]
    ),
    queryOne(
      `SELECT COUNT(*) AS n FROM users WHERE companyId = ? AND role = 'operator' AND onDuty = 1 AND ${USER_NOT_DELETED}`,
      [companyId]
    ),
  ]);

  const cancelledAgg = await queryOne(
    `SELECT COUNT(*) AS n
       FROM bookings b
       JOIN users u ON u.id = b.operatorId
       WHERE u.companyId = ? AND (b.status = 'cancelled' OR b.status = 'rejected')`,
    [companyId]
  );

  return {
    scope: "company",
    totals: {
      completedFlights: num(flightAgg ? flightAgg.completed : 0),
      completedThisMonth: num(monthAgg ? monthAgg.n : 0),
      grossRevenue: Math.round(num(flightAgg ? flightAgg.gross : 0)),
      netPayout: Math.round(num(flightAgg ? flightAgg.net : 0)),
      totalPilots: num(pilotAgg ? pilotAgg.n : 0),
      onDutyPilots: num(dutyAgg ? dutyAgg.n : 0),
      cancelled: num(cancelledAgg ? cancelledAgg.n : 0),
    },
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
  if (role === "company") return companyStats(userId);
  return customerStats(userId);
}

module.exports = {
  buildProfileStats,
  customerStats,
  operatorStats,
  adminStats,
  companyStats,
};
