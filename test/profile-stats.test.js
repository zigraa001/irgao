// Unit tests for the profile dashboard aggregator (src/profile-stats.js).
// The DB layer is faked in the require cache before the module loads, so the
// tests run anywhere with `npm test` and exercise the real aggregation logic.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.AUTH_SECRET = "test-profile-stats";

// --- Fake db ---------------------------------------------------------------
const bookings = [];
const users = [
  { id: 1, role: "customer", deletedAt: null },
  { id: 2, role: "operator", deletedAt: null },
  { id: 3, role: "admin", deletedAt: null },
  { id: 4, role: "customer", deletedAt: null },
];

function fakeQuery(sql, params = []) {
  const s = sql.replace(/\s+/g, " ").trim();

  if (s.includes("FROM bookings") && s.includes("customerId = ?")) {
    return bookings.filter((b) => b.customerId === params[0]);
  }
  if (s.includes("FROM bookings") && s.includes("operatorId = ?")) {
    return bookings.filter((b) => b.operatorId === params[0]);
  }
  if (s.includes("FROM users") && s.includes("GROUP BY role")) {
    const counts = {};
    for (const u of users) {
      if (!u.deletedAt) counts[u.role] = (counts[u.role] || 0) + 1;
    }
    return Object.keys(counts).map((role) => ({ role, n: counts[role] }));
  }
  if (s.includes("FROM bookings") && s.includes("SUM(")) {
    const agg = bookings.reduce(
      (a, b) => {
        a.total += 1;
        if (b.status === "completed") a.completed += 1;
        if (b.status === "cancelled" || b.status === "rejected") a.cancelled += 1;
        a.distanceKm += Number(b.distanceKm) || 0;
        a.revenue += Number(b.fareEstimate) || 0;
        a.carbonSavedKg += Number(b.carbonSavedKg) || 0;
        return a;
      },
      { total: 0, completed: 0, cancelled: 0, distanceKm: 0, revenue: 0, carbonSavedKg: 0 }
    );
    return [agg];
  }
  return [];
}

function fakeQueryOne(sql, params = []) {
  const s = sql.replace(/\s+/g, " ").trim();
  if (s.includes("FROM aircraft")) return { n: 3 };
  if (s.includes("FROM bookings") && s.includes("status NOT IN")) {
    return { n: bookings.filter((b) => !["completed", "cancelled", "rejected"].includes(b.status)).length };
  }
  return null;
}

require.cache[require.resolve("../src/db")] = {
  id: require.resolve("../src/db"),
  filename: require.resolve("../src/db"),
  loaded: true,
  exports: { query: fakeQuery, queryOne: fakeQueryOne },
};

const { buildProfileStats } = require("../src/profile-stats");

test("customer stats aggregate trips, spend, distance and CO₂", async () => {
  bookings.length = 0;
  bookings.push(
    { id: 1, customerId: 1, service: "taxi", status: "completed", distanceKm: 10, fareEstimate: 500, carbonSavedKg: 2.1, pickupName: "A", destName: "B" },
    { id: 2, customerId: 1, service: "golden", status: "requested", distanceKm: 20, fareEstimate: 1000, carbonSavedKg: 4.2, pickupName: "C", destName: "D" },
    { id: 3, customerId: 1, service: "taxi", status: "cancelled", distanceKm: 5, fareEstimate: 250, carbonSavedKg: 1, pickupName: "E", destName: "F" },
    { id: 4, customerId: 99, service: "taxi", status: "completed", distanceKm: 999, fareEstimate: 999, carbonSavedKg: 999, pickupName: "X", destName: "Y" }
  );

  const stats = await buildProfileStats(1, "customer");
  assert.equal(stats.scope, "customer");
  assert.equal(stats.totals.trips, 3);
  assert.equal(stats.totals.completed, 1);
  assert.equal(stats.totals.inProgress, 1);
  assert.equal(stats.totals.cancelled, 1);
  assert.equal(stats.totals.spentINR, 1750);
  assert.equal(stats.totals.distanceKm, 35);
  assert.equal(stats.totals.carbonSavedKg, 7.3);
  assert.equal(stats.byService.taxi, 2);
  assert.equal(stats.byService.golden, 1);
  assert.equal(stats.recent[0].route, "A → B");
});

test("operator stats count assigned missions and earnings from completed only", async () => {
  bookings.length = 0;
  bookings.push(
    { id: 10, operatorId: 2, service: "taxi", status: "completed", distanceKm: 12, fareEstimate: 600, carbonSavedKg: 2.5, pickupName: "P", destName: "Q" },
    { id: 11, operatorId: 2, service: "shuttle", status: "flying", distanceKm: 8, fareEstimate: 400, carbonSavedKg: 1.5, pickupName: "R", destName: "S" }
  );

  const stats = await buildProfileStats(2, "operator");
  assert.equal(stats.scope, "operator");
  assert.equal(stats.totals.assigned, 2);
  assert.equal(stats.totals.completed, 1);
  assert.equal(stats.totals.inProgress, 1);
  // earnings = 600 * 0.6 = 360
  assert.equal(stats.totals.earningsINR, 360);
  assert.equal(stats.totals.distanceFlownKm, 12);
  assert.equal(stats.totals.carbonSavedKg, 2.5);
});

test("admin stats roll up platform totals across users and bookings", async () => {
  bookings.length = 0;
  bookings.push(
    { id: 1, status: "completed", distanceKm: 10, fareEstimate: 500, carbonSavedKg: 2, service: "taxi" },
    { id: 2, status: "requested", distanceKm: 20, fareEstimate: 1000, carbonSavedKg: 4, service: "taxi" },
    { id: 3, status: "cancelled", distanceKm: 5, fareEstimate: 250, carbonSavedKg: 1, service: "taxi" }
  );

  const stats = await buildProfileStats(3, "admin");
  assert.equal(stats.scope, "admin");
  assert.equal(stats.totals.totalBookings, 3);
  assert.equal(stats.totals.completed, 1);
  assert.equal(stats.totals.cancelled, 1);
  assert.equal(stats.totals.live, 1);
  assert.equal(stats.totals.revenueINR, 1750);
  assert.equal(stats.totals.carbonSavedKg, 7);
  assert.equal(stats.totals.availableAircraft, 3);
  assert.equal(stats.totals.users.customer, 2);
  assert.equal(stats.totals.users.operator, 1);
  assert.equal(stats.totals.users.admin, 1);
});

test("empty database yields zeros, not NaN", async () => {
  bookings.length = 0;
  const stats = await buildProfileStats(1, "customer");
  assert.equal(stats.totals.trips, 0);
  assert.equal(stats.totals.spentINR, 0);
  assert.equal(stats.totals.distanceKm, 0);
  assert.equal(stats.totals.carbonSavedKg, 0);
});
