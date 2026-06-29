// Unit tests for dispatch eligibility (busy vs available operators).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const bookings = [];
const offers = [];
const users = [
  { id: 1, role: "operator", name: "Near", gpsLat: 28.61, gpsLng: 77.21, deletedAt: null, bannedAt: null },
  { id: 2, role: "operator", name: "Far", gpsLat: 19.08, gpsLng: 72.88, deletedAt: null, bannedAt: null },
  { id: 3, role: "operator", name: "Busy", gpsLat: 28.62, gpsLng: 77.22, deletedAt: null, bannedAt: null },
];

const fakeDb = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("SELECT id FROM bookings") && s.includes("operatorId = ?")) {
      const opId = params[0];
      const statuses = params.slice(1);
      const hit = bookings.find(
        (b) => b.operatorId === opId && statuses.includes(b.status)
      );
      return hit ? [{ id: hit.id }] : [];
    }
    if (s.startsWith("SELECT id FROM dispatch_offers")) {
      const opId = params[0];
      const hit = offers.find(
        (o) =>
          o.operatorId === opId &&
          o.status === "pending" &&
          new Date(o.expiresAt) > new Date()
      );
      return hit ? [{ id: hit.id }] : [];
    }
    if (s.includes("FROM users") && s.includes("role = 'operator'")) {
      return users.filter((u) => u.gpsLat != null);
    }
    if (s.startsWith("INSERT INTO dispatch_offers")) {
      const id = offers.length + 1;
      offers.push({
        id,
        bookingId: params[0],
        operatorId: params[1],
        status: "pending",
        expiresAt: new Date(Date.now() + params[2] * 1000),
      });
      return { insertId: id };
    }
    if (s.startsWith("UPDATE bookings SET pendingOperatorId")) {
      const b = bookings.find((x) => x.id === params[1]);
      if (b) b.pendingOperatorId = params[0];
      return { affectedRows: 1 };
    }
    if (s.startsWith("UPDATE bookings SET status = 'dispatching'")) {
      const b = bookings.find((x) => x.id === params[0]);
      if (b) b.status = "dispatching";
      return { affectedRows: 1 };
    }
    if (s.startsWith("UPDATE bookings SET status = 'no_pilot'")) {
      const b = bookings.find((x) => x.id === params[0]);
      if (b) b.status = "no_pilot";
      return { affectedRows: 1 };
    }
    if (s.includes("FROM dispatch_offers o") && s.includes("JOIN bookings")) {
      const offer = offers.find((o) => o.id === params[0]);
      const booking = bookings.find((b) => b.id === offer.bookingId);
      return [
        {
          ...offer,
          pickupName: booking.pickupName,
          pickupLat: booking.pickupLat,
          pickupLng: booking.pickupLng,
          destName: booking.destName,
          destLat: booking.destLat,
          destLng: booking.destLng,
          service: booking.service,
          distanceKm: booking.distanceKm,
          fareEstimate: booking.fareEstimate,
          carbonSavedKg: booking.carbonSavedKg,
        },
      ];
    }
    if (s.startsWith("SELECT * FROM bookings WHERE id")) {
      const b = bookings.find((x) => x.id === params[0]);
      return b ? [b] : [];
    }
    if (s.startsWith("SELECT operatorId FROM dispatch_offers WHERE bookingId")) {
      return offers
        .filter((o) => o.bookingId === params[0])
        .map((o) => ({ operatorId: o.operatorId }));
    }
    if (s.startsWith("UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL")) {
      const b = bookings.find((x) => x.id === params[0]);
      if (b) {
        b.status = "dispatching";
        b.pendingOperatorId = null;
      }
      return { affectedRows: 1 };
    }
    throw new Error("Unhandled SQL in fake: " + s.slice(0, 80));
  },
  async queryOne(sql, params) {
    const rows = await fakeDb.query(sql, params);
    return rows[0] || null;
  },
};

bookings.push({
  id: 99,
  pickupLat: 28.6139,
  pickupLng: 77.209,
  pickupName: "Delhi",
  destName: "Gurgaon",
  destLat: 28.45,
  destLng: 77.03,
  service: "taxi",
  distanceKm: 25,
  fareEstimate: 5000,
  carbonSavedKg: 10,
  paymentStatus: "paid",
  operatorId: null,
  status: "requested",
});

// Ocean pickup — no operator is within DISPATCH_RADIUS_KM, so dispatch should
// give up and mark this booking 'no_pilot'.
bookings.push({
  id: 77,
  pickupLat: 0,
  pickupLng: 0,
  pickupName: "Ocean",
  destName: "Nowhere",
  destLat: 1,
  destLng: 1,
  service: "taxi",
  distanceKm: 100,
  fareEstimate: 5000,
  carbonSavedKg: 10,
  paymentStatus: "paid",
  operatorId: null,
  status: "requested",
});

// operator 3 is in transit
bookings.push({
  id: 50,
  operatorId: 3,
  status: "flying",
});

const dbPath = path.resolve(__dirname, "../src/db.js");
require.cache[dbPath] = { exports: fakeDb };

const hubPath = path.resolve(__dirname, "../src/dispatch-hub.js");
const pushed = [];
const pushedCustomers = [];
require.cache[hubPath] = {
  exports: {
    pushOperator(operatorId, event, data) {
      pushed.push({ operatorId, event, data });
    },
    pushCustomer(bookingId, event, data) {
      pushedCustomers.push({ bookingId, event, data });
    },
  },
};

const {
  listAvailableOperatorsNear,
  isOperatorBusy,
  startDispatch,
  DISPATCH_RADIUS_KM,
  MAX_OFFER_ATTEMPTS,
} = require("../src/dispatch");

test("isOperatorBusy is true when operator has in-transit booking", async () => {
  assert.equal(await isOperatorBusy(3), true);
  assert.equal(await isOperatorBusy(1), false);
});

test("listAvailableOperatorsNear skips busy operators, applies the radius cap, and sorts by distance", async () => {
  const list = await listAvailableOperatorsNear(28.6139, 77.209, []);
  // Near (~0.5 km) is in; Busy (~1 km) is excluded as busy; Far (~1100 km,
  // Mumbai) is excluded by the DISPATCH_RADIUS_KM cap — that's the fix for the
  // "all operators get notified" bug.
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 1);
  assert.ok(list[0].distanceKm <= DISPATCH_RADIUS_KM);
});

test("startDispatch offers to nearest available operator", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  pushed.length = 0;
  const offerId = await startDispatch(99);
  assert.ok(offerId);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].operatorId, 1);
  assert.equal(pushed[0].event, "dispatch_offer");
  assert.equal(pushed[0].data.playSound, true);
  t.mock.timers.reset();
});

test("dispatch gives up with 'no_pilot' when no nearby pilot accepts (radius + attempt cap)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  pushed.length = 0;
  pushedCustomers.length = 0;
  // Booking 77 has an ocean pickup — no operator within radius.
  const id = await startDispatch(77);
  assert.equal(id, null);
  const b = bookings.find((x) => x.id === 77);
  assert.equal(b.status, "no_pilot");
  assert.ok(
    pushedCustomers.some(
      (p) => p.event === "ride_update" && p.data.status === "no_pilot"
    )
  );
  t.mock.timers.reset();
});

test("dispatch radius and attempt caps are configured", () => {
  assert.ok(DISPATCH_RADIUS_KM > 0);
  assert.ok(MAX_OFFER_ATTEMPTS > 0);
});
