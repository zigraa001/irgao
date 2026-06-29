// Integration tests for the Uber-style ride lifecycle, using a stubbed
// dispatch-hub so we can assert the operator routes push the right events to
// the customer channel (without the flakiness of HTTP SSE streaming in tests):
//   - operator status progression (accepted → enroute → picked_up → flying → completed)
//   - operator GPS heartbeat pushes ride_gps to the customer channel
//   - GET /api/tracking/nearby returns only AVAILABLE (non-busy) pilots
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.AUTH_SECRET = "test-secret-for-ride-tracking";

// --- In-memory fake of src.db -------------------------------------------------
const fakeDb = (() => {
  const users = [
    { id: 50, role: "operator", name: "Pilot A", gpsLat: 28.62, gpsLng: 77.22, deletedAt: null, bannedAt: null },
    { id: 51, role: "operator", name: "Pilot B", gpsLat: 28.63, gpsLng: 77.23, deletedAt: null, bannedAt: null },
  ];
  const bookings = [];
  const offers = [];
  let nextBookingId = 900;

  function mkBooking(over) {
    return {
      id: nextBookingId++,
      customerId: 7,
      operatorId: 50,
      status: "accepted",
      pickupLat: 28.61,
      pickupLng: 77.21,
      pickupName: "Pickup",
      destName: "Dest",
      destLat: 28.45,
      destLng: 77.03,
      service: "taxi",
      distanceKm: 25,
      fareEstimate: 5000,
      carbonSavedKg: 10,
      paymentStatus: "paid",
      createdAt: "2026-06-29 00:00:00",
      updatedAt: "2026-06-29 00:00:00",
      ...over,
    };
  }

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("SELECT * FROM bookings WHERE id = ?")) {
      const b = bookings.find((x) => x.id === params[0]);
      return b ? [b] : [];
    }
    if (s.startsWith("UPDATE bookings SET status = ? WHERE id = ?")) {
      const b = bookings.find((x) => x.id === params[1]);
      if (b) { b.status = params[0]; b.updatedAt = "2026-06-29 00:00:01"; }
      return { affectedRows: 1 };
    }
    if (s.startsWith("UPDATE users SET gpsLat")) {
      const u = users.find((x) => x.id === params[2]);
      if (u) { u.gpsLat = params[0]; u.gpsLng = params[1]; }
      return { affectedRows: 1 };
    }
    if (s.includes("FROM bookings") && s.includes("operatorId = ?") && s.includes("ORDER BY updatedAt DESC")) {
      // Active-booking lookup from the GPS heartbeat: statuses are hardcoded in
      // the SQL (not params), so match by operatorId only and return the row.
      const opId = params[0];
      const active = ["assigned", "accepted", "enroute", "picked_up", "flying"];
      const hit = bookings
        .filter((b) => b.operatorId === opId && active.includes(b.status))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
      return hit ? [hit] : [];
    }
    if (s.includes("FROM bookings") && s.includes("operatorId = ?") && s.includes("status IN")) {
      const opId = params[0];
      const statuses = params.slice(1);
      const hit = bookings.find(
        (b) => b.operatorId === opId && statuses.includes(b.status)
      );
      return hit ? [hit] : [];
    }
    if (s.includes("FROM users u") && s.includes("role = 'operator'")) {
      // Mirror the route's SELECT aliases so operatorId/operatorName resolve.
      return users
        .filter((u) => u.gpsLat != null)
        .map((u) => ({
          operatorId: u.id,
          operatorName: u.name,
          gpsLat: u.gpsLat,
          gpsLng: u.gpsLng,
          gpsUpdatedAt: u.gpsUpdatedAt || null,
        }));
    }
    if (s.startsWith("SELECT DISTINCT operatorId FROM bookings")) {
      const statuses = params;
      return bookings
        .filter((b) => b.operatorId != null && statuses.includes(b.status))
        .map((b) => ({ operatorId: b.operatorId }));
    }
    if (s.startsWith("SELECT DISTINCT operatorId FROM dispatch_offers")) {
      return offers
        .filter((o) => o.status === "pending" && new Date(o.expiresAt) > new Date())
        .map((o) => ({ operatorId: o.operatorId }));
    }
    if (s.startsWith("SELECT id, name, gpsLat, gpsLng, gpsUpdatedAt FROM users WHERE id = ?")) {
      const u = users.find((x) => x.id === params[0]);
      return u ? [u] : [];
    }
    throw new Error("Unhandled SQL in fake ride-tracking: " + s.slice(0, 90));
  }
  async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }
  return { query, queryOne, _users: users, _bookings: bookings, mkBooking };
})();

// Inject the fake db BEFORE any route module loads.
const dbPath = require.resolve("../src/db");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

// Stub dispatch-hub to record what gets pushed to operators / customers.
const hubPath = require.resolve("../src/dispatch-hub");
const pushedCustomers = [];
const pushedOperators = [];
require.cache[hubPath] = {
  id: hubPath,
  filename: hubPath,
  loaded: true,
  exports: {
    attachWebSocketServer() {},
    subscribeOperator() {},
    pushOperator(operatorId, event, data) { pushedOperators.push({ operatorId, event, data }); },
    subscribeCustomer() {},
    pushCustomer(bookingId, event, data) { pushedCustomers.push({ bookingId, event, data }); },
  },
};

const http = require("node:http");
const express = require("express");
const operatorRoutes = require("../src/operator-routes");
const trackingRoutes = require("../src/tracking-routes");
const { signToken } = require("../src/auth");

const app = express();
app.use(express.json());
app.use("/api/operator", operatorRoutes);
app.use("/api/tracking", trackingRoutes);

const server = http.createServer(app);
let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const operatorToken = () => signToken({ id: 50, name: "Pilot A", role: "operator" });
const customerToken = () => signToken({ id: 7, name: "Cara", role: "customer" });

test("operator advances the ride through the full lifecycle + notifies the customer", async () => {
  fakeDb._bookings.length = 0;
  fakeDb._bookings.push(fakeDb.mkBooking({ id: 900, status: "accepted" }));
  pushedCustomers.length = 0;

  async function postAction(action) {
    const res = await fetch(`${baseUrl}/api/operator/trips/900/${action}`, {
      method: "POST",
      headers: { authorization: `Bearer ${operatorToken()}` },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  assert.equal((await postAction("enroute")).json.booking.status, "enroute");
  assert.equal((await postAction("pickup")).json.booking.status, "picked_up");
  assert.equal((await postAction("takeoff")).json.booking.status, "flying");
  assert.equal((await postAction("complete")).json.booking.status, "completed");

  // Each advance pushed a ride_update to the customer channel.
  const statuses = pushedCustomers.map((p) => p.data.status);
  assert.deepEqual(statuses, ["enroute", "picked_up", "flying", "completed"]);
  assert.ok(pushedCustomers.every((p) => p.event === "ride_update"));
});

test("status advance is rejected (409) from the wrong source status", async () => {
  fakeDb._bookings.length = 0;
  // 'pickup' requires source 'enroute'; this booking is 'accepted' → 409.
  fakeDb._bookings.push(fakeDb.mkBooking({ id: 910, status: "accepted" }));
  const res = await fetch(`${baseUrl}/api/operator/trips/910/pickup`, {
    method: "POST",
    headers: { authorization: `Bearer ${operatorToken()}` },
  });
  assert.equal(res.status, 409);
});

test("an operator may not advance a trip assigned to another operator (404)", async () => {
  fakeDb._bookings.length = 0;
  fakeDb._bookings.push(fakeDb.mkBooking({ id: 920, operatorId: 51, status: "accepted" }));
  const res = await fetch(`${baseUrl}/api/operator/trips/920/enroute`, {
    method: "POST",
    headers: { authorization: `Bearer ${operatorToken()}` },
  });
  assert.equal(res.status, 404);
});

test("operator GPS heartbeat pushes ride_gps to the customer channel", async () => {
  fakeDb._bookings.length = 0;
  fakeDb._bookings.push(fakeDb.mkBooking({ id: 930, status: "accepted" }));
  pushedCustomers.length = 0;

  const res = await fetch(`${baseUrl}/api/operator/location`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${operatorToken()}` },
    body: JSON.stringify({ lat: 28.615, lng: 77.215 }),
  });
  assert.equal(res.status, 200);
  assert.ok(
    pushedCustomers.some(
      (p) => p.event === "ride_gps" && p.bookingId === 930 && p.data.lat === 28.615
    ),
    "expected a ride_gps push to the customer of booking 930"
  );
});

test("GET /api/tracking/nearby returns only AVAILABLE (non-busy) pilots", async () => {
  fakeDb._bookings.length = 0;
  // Pilot A (50) is busy (accepted); Pilot B (51) is free. Query near Pilot B.
  fakeDb._bookings.push(fakeDb.mkBooking({ id: 940, operatorId: 50, status: "accepted" }));
  const res = await fetch(
    `${baseUrl}/api/tracking/nearby?lat=28.63&lng=77.23`,
    { headers: { authorization: `Bearer ${customerToken()}` } }
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  const ids = json.taxis.map((t) => t.operatorId);
  assert.ok(!ids.includes(50), "busy pilot must not appear in nearby list");
  assert.ok(ids.includes(51), "free pilot must appear in nearby list");
});
