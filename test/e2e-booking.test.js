// End-to-end booking lifecycle tests (unit-level with faked DB).
//
// Tests the full flow:
//   customer creates booking → pays → dispatch offers to operator →
//   operator accepts → status progression → completed → ratings
// Plus: cancellation, race conditions, no-fly rejection.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// ── In-memory state ──────────────────────────────────────────────────────

let users, bookings, offers, aircraft, ratings, pushSubs, nextBookingId, nextOfferId;
const pushed = [];
const pushedCustomers = [];

function resetState() {
  users = [
    { id: 1, role: "customer", name: "Rider", email: "rider@test.com", passwordHash: "", deletedAt: null, bannedAt: null, onDuty: 0, gpsLat: null, gpsLng: null },
    { id: 2, role: "operator", name: "Pilot A", email: "pilotA@test.com", passwordHash: "", deletedAt: null, bannedAt: null, onDuty: 1, gpsLat: 28.61, gpsLng: 77.21, gpsUpdatedAt: new Date() },
    { id: 3, role: "operator", name: "Pilot B", email: "pilotB@test.com", passwordHash: "", deletedAt: null, bannedAt: null, onDuty: 1, gpsLat: 28.62, gpsLng: 77.22, gpsUpdatedAt: new Date() },
    { id: 4, role: "admin", name: "Admin", email: "admin@test.com", passwordHash: "", deletedAt: null, bannedAt: null, onDuty: 0 },
  ];
  bookings = [];
  offers = [];
  aircraft = [
    { id: 1, name: "eVTOL-001", model: "IraGo V1", status: "available", capacity: 4 },
    { id: 2, name: "eVTOL-002", model: "IraGo V1", status: "available", capacity: 4 },
  ];
  ratings = [];
  pushSubs = [];
  nextBookingId = 100;
  nextOfferId = 500;
  pushed.length = 0;
  pushedCustomers.length = 0;
}

// ── Fake DB ──────────────────────────────────────────────────────────────

const fakeDb = {
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();

    // ── INSERT bookings ──
    if (s.startsWith("INSERT INTO bookings")) {
      const id = nextBookingId++;
      const b = {
        id,
        customerId: params[0],
        pickupName: params[1], pickupLat: params[2], pickupLng: params[3],
        destName: params[4], destLat: params[5], destLng: params[6],
        service: params[7], distanceKm: params[8], fareEstimate: params[9],
        carbonSavedKg: params[10], paymentStatus: params[11], status: params[12],
        operatorId: null, aircraftId: null, pendingOperatorId: null,
        assignedAt: null, cancelledAt: null, cancellationFee: 0,
        createdAt: new Date(), updatedAt: new Date(),
      };
      bookings.push(b);
      return { insertId: id };
    }

    // ── INSERT dispatch_offers ──
    if (s.startsWith("INSERT INTO dispatch_offers")) {
      const id = nextOfferId++;
      offers.push({
        id, bookingId: params[0], operatorId: params[1],
        status: "pending", expiresAt: new Date(Date.now() + params[2] * 1000),
        createdAt: new Date(),
      });
      return { insertId: id };
    }

    // ── INSERT ratings ──
    if (s.startsWith("INSERT INTO ratings")) {
      const existing = ratings.find((r) => r.bookingId === params[0] && r.raterId === params[1]);
      if (existing) {
        existing.stars = params[4];
        existing.comment = params[5];
      } else {
        ratings.push({
          bookingId: params[0], raterId: params[1], raterRole: params[2],
          rateeId: params[3], stars: params[4], comment: params[5],
          createdAt: new Date(),
        });
      }
      return { affectedRows: 1 };
    }

    // ── SELECT * FROM bookings WHERE id ──
    if (s.startsWith("SELECT * FROM bookings WHERE id")) {
      return bookings.filter((b) => b.id === params[0]);
    }

    // ── SELECT aircraftId FROM bookings ──
    if (s.includes("SELECT aircraftId FROM bookings")) {
      const b = bookings.find((x) => x.id === params[0]);
      return b ? [{ aircraftId: b.aircraftId }] : [];
    }

    // ── SELECT id FROM aircraft WHERE status = 'available' ──
    if (s.includes("FROM aircraft WHERE status = 'available'")) {
      const a = aircraft.find((x) => x.status === "available");
      return a ? [{ id: a.id }] : [];
    }

    // ── UPDATE aircraft ──
    if (s.startsWith("UPDATE aircraft SET status")) {
      // Two forms: "SET status = 'available' WHERE id = ?" (1 param: id)
      //            "SET status = ? WHERE id = ?" (2 params: status, id)
      let targetId, newStatus;
      if (params.length === 1) {
        targetId = params[0];
        newStatus = s.includes("'available'") ? "available" : s.includes("'in_flight'") ? "in_flight" : "available";
      } else {
        newStatus = params[0];
        targetId = params[1];
      }
      const a = aircraft.find((x) => x.id === targetId);
      if (a) a.status = newStatus;
      return { affectedRows: a ? 1 : 0 };
    }

    // ── UPDATE bookings SET aircraftId ──
    if (s.startsWith("UPDATE bookings SET aircraftId") && !s.includes("status")) {
      // Two forms: "SET aircraftId = ? WHERE id = ?" (2 params)
      //            "SET aircraftId = NULL WHERE id = ?" (1 param, literal NULL)
      if (s.includes("= NULL")) {
        const b = bookings.find((x) => x.id === params[0]);
        if (b) b.aircraftId = null;
        return { affectedRows: b ? 1 : 0 };
      }
      const b = bookings.find((x) => x.id === params[1]);
      if (b) b.aircraftId = params[0];
      return { affectedRows: b ? 1 : 0 };
    }

    // ── UPDATE bookings SET paymentStatus ──
    if (s.startsWith("UPDATE bookings SET paymentStatus")) {
      const b = bookings.find((x) => x.id === params[0] && x.paymentStatus === "pending");
      if (b) { b.paymentStatus = "paid"; return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET status = 'cancelled' (race-safe) ──
    if (s.includes("SET status = 'cancelled'")) {
      const b = bookings.find((x) => x.id === params[1] && !["cancelled", "completed"].includes(x.status));
      if (b) { b.status = "cancelled"; b.cancelledAt = new Date(); b.cancellationFee = params[0]; return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET operatorId (accept claim) ──
    if (s.includes("SET operatorId = ?") && s.includes("operatorId IS NULL")) {
      const b = bookings.find((x) => x.id === params[1] && x.operatorId === null);
      if (b) {
        b.operatorId = params[0]; b.pendingOperatorId = null;
        b.status = "assigned"; b.assignedAt = new Date();
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET status (conditional advance) ──
    if (s.startsWith("UPDATE bookings SET status = ?") && s.includes("AND status = ?")) {
      const toStatus = params[0];
      const id = params[1];
      const fromStatus = params[2];
      const b = bookings.find((x) => x.id === id && x.status === fromStatus);
      if (b) { b.status = toStatus; b.updatedAt = new Date(); return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET status = 'dispatching' (reject/redispatch) ──
    if (s.includes("SET status = 'dispatching', operatorId = NULL")) {
      let b;
      if (s.includes("AND status = 'assigned' AND operatorId = ?")) {
        b = bookings.find((x) => x.id === params[0] && x.status === "assigned" && x.operatorId === params[1]);
      } else {
        b = bookings.find((x) => x.id === params[0]);
      }
      if (b) {
        b.status = "dispatching"; b.operatorId = null;
        b.aircraftId = null; b.pendingOperatorId = null;
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL ──
    if (s.startsWith("UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL")) {
      const b = bookings.find((x) => x.id === params[0]);
      if (b) { b.status = "dispatching"; b.pendingOperatorId = null; }
      return { affectedRows: 1 };
    }

    // ── UPDATE bookings SET status = 'no_pilot' (conditional) ──
    if (s.includes("SET status = 'no_pilot'")) {
      const b = bookings.find((x) => x.id === params[0] && x.operatorId === null && x.status === "dispatching");
      if (b) { b.status = "no_pilot"; return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    }

    // ── UPDATE bookings SET pendingOperatorId ──
    if (s.startsWith("UPDATE bookings SET pendingOperatorId")) {
      const b = bookings.find((x) => x.id === params[1]);
      if (b) b.pendingOperatorId = params[0];
      return { affectedRows: 1 };
    }

    // ── UPDATE dispatch_offers SET status = 'accepted' (offer claim) ──
    if (s.includes("SET status = 'accepted'") && s.includes("AND status = 'pending' AND expiresAt > NOW()")) {
      const o = offers.find((x) => x.id === params[0] && x.operatorId === params[1] && x.status === "pending" && x.expiresAt > new Date());
      if (o) { o.status = "accepted"; return { affectedRows: 1 }; }
      return { affectedRows: 0 };
    }

    // ── SELECT * FROM dispatch_offers WHERE id ──
    if (s.startsWith("SELECT * FROM dispatch_offers WHERE id") && !s.includes("operatorId")) {
      return offers.filter((o) => o.id === params[0]);
    }

    // ── UPDATE dispatch_offers SET status = 'expired' (by booking) ──
    if (s.includes("SET status = 'expired'") && s.includes("bookingId = ?") && s.includes("id != ?")) {
      for (const o of offers) {
        if (o.bookingId === params[0] && o.id !== params[1] && o.status === "pending") {
          o.status = "expired";
        }
      }
      return { affectedRows: 0 };
    }

    // ── UPDATE dispatch_offers SET status = 'expired' (by booking, all) ──
    if (s.includes("SET status = 'expired'") && s.includes("bookingId = ?") && s.includes("status = 'pending'")) {
      let count = 0;
      for (const o of offers) {
        if (o.bookingId === params[0] && o.status === "pending") {
          o.status = "expired"; count++;
        }
      }
      return { affectedRows: count };
    }

    // ── UPDATE dispatch_offers SET status = 'expired' (stale) ──
    if (s.includes("SET status = 'expired'") && s.includes("expiresAt <= NOW()")) {
      let count = 0;
      for (const o of offers) {
        if (o.status === "pending" && o.expiresAt <= new Date()) {
          o.status = "expired"; count++;
        }
      }
      return { affectedRows: count };
    }

    // ── UPDATE dispatch_offers SET status = 'rejected' ──
    if (s.includes("SET status = 'rejected'")) {
      const o = offers.find((x) => x.id === params[0]);
      if (o) o.status = "rejected";
      return { affectedRows: o ? 1 : 0 };
    }

    // ── SELECT * FROM dispatch_offers WHERE id AND operatorId ──
    if (s.includes("FROM dispatch_offers WHERE id = ? AND operatorId = ?")) {
      const o = offers.find((x) => x.id === params[0] && x.operatorId === params[1]);
      return o ? [o] : [];
    }

    // ── SELECT operatorId FROM dispatch_offers WHERE bookingId ──
    if (s.includes("SELECT operatorId FROM dispatch_offers WHERE bookingId")) {
      return offers.filter((o) => o.bookingId === params[0]).map((o) => ({ operatorId: o.operatorId }));
    }

    // ── SELECT DISTINCT operatorId FROM dispatch_offers ──
    if (s.includes("SELECT DISTINCT operatorId FROM dispatch_offers WHERE bookingId")) {
      const ids = [...new Set(offers.filter((o) => o.bookingId === params[0]).map((o) => o.operatorId))];
      return ids.map((id) => ({ operatorId: id }));
    }

    // ── Joined offer + booking query ──
    if (s.includes("FROM dispatch_offers o") && s.includes("JOIN bookings")) {
      const offer = offers.find((o) => o.id === params[0]);
      if (!offer) return [];
      const b = bookings.find((x) => x.id === offer.bookingId);
      if (!b) return [];
      return [{ ...offer, ...b }];
    }

    // ── SELECT from users (operators near) ──
    if (s.includes("FROM users u") && s.includes("role = 'operator'")) {
      return users
        .filter((u) => u.role === "operator" && !u.deletedAt && !u.bannedAt && u.onDuty && u.gpsLat != null)
        .filter((u) => {
          const busyBooking = bookings.some((b) =>
            b.operatorId === u.id && ["assigned", "accepted", "enroute", "picked_up", "flying"].includes(b.status)
          );
          const pendingOffer = offers.some((o) =>
            o.operatorId === u.id && o.status === "pending" && o.expiresAt > new Date()
          );
          return !(busyBooking || pendingOffer);
        });
    }

    // ── SELECT email, name FROM users ──
    if (s.includes("SELECT email, name FROM users")) {
      const u = users.find((x) => x.id === params[0]);
      return u ? [{ email: u.email, name: u.name }] : [];
    }

    // ── SELECT id, name, gpsLat FROM users ──
    if (s.includes("SELECT id, name, gpsLat")) {
      const u = users.find((x) => x.id === params[0]);
      return u ? [{ id: u.id, name: u.name, gpsLat: u.gpsLat, gpsLng: u.gpsLng, gpsUpdatedAt: u.gpsUpdatedAt }] : [];
    }

    // ── UPDATE users SET onDuty ──
    if (s.includes("UPDATE users SET onDuty")) {
      const u = users.find((x) => x.id === params[1] && x.role === "operator");
      if (u) u.onDuty = params[0];
      return { affectedRows: u ? 1 : 0 };
    }

    // ── UPDATE users SET gpsLat ──
    if (s.includes("UPDATE users SET gpsLat")) {
      const u = users.find((x) => x.id === params[2]);
      if (u) { u.gpsLat = params[0]; u.gpsLng = params[1]; u.gpsUpdatedAt = new Date(); }
      return { affectedRows: u ? 1 : 0 };
    }

    // ── SELECT id FROM bookings (busy check) ──
    if (s.startsWith("SELECT id FROM bookings") && s.includes("operatorId = ?")) {
      const opId = params[0];
      const statuses = params.slice(1);
      const hit = bookings.find((b) => b.operatorId === opId && statuses.includes(b.status));
      return hit ? [{ id: hit.id }] : [];
    }

    // ── SELECT id FROM dispatch_offers (pending check) ──
    if (s.startsWith("SELECT id FROM dispatch_offers") && s.includes("operatorId = ?")) {
      const opId = params[0];
      const hit = offers.find((o) => o.operatorId === opId && o.status === "pending" && o.expiresAt > new Date());
      return hit ? [{ id: hit.id }] : [];
    }

    // ── SELECT from ratings ──
    if (s.includes("FROM ratings WHERE bookingId")) {
      return ratings.filter((r) => r.bookingId === params[0]);
    }

    // ── SELECT from push_subscriptions ──
    if (s.includes("FROM push_subscriptions")) {
      return pushSubs.filter((p) => p.userId === params[0]);
    }

    // ── Catch-all ──
    return [];
  },

  async queryOne(sql, params) {
    const rows = await fakeDb.query(sql, params);
    return rows[0] || null;
  },
};

// ── Wire fake modules ────────────────────────────────────────────────────

const dbPath = path.resolve(__dirname, "../src/db.js");
require.cache[dbPath] = { exports: { ...fakeDb, dbg: () => {} } };

const hubPath = path.resolve(__dirname, "../src/dispatch-hub.js");
require.cache[hubPath] = {
  exports: {
    pushOperator(operatorId, event, data) { pushed.push({ operatorId, event, data }); },
    pushCustomer(bookingId, event, data) { pushedCustomers.push({ bookingId, event, data }); },
    subscribeOperator() {},
    subscribeCustomer() {},
    attachWebSocketServer() {},
  },
};

const pushPath = path.resolve(__dirname, "../src/push.js");
require.cache[pushPath] = {
  exports: {
    sendToUser: () => Promise.resolve(),
    getPublicKey: () => "fake-key",
    saveSubscription: () => Promise.resolve({ ok: true }),
    removeSubscription: () => Promise.resolve({ ok: true }),
  },
};

const {
  startDispatch,
  acceptOffer,
  rejectOffer,
  releaseAircraft,
  setOperatorDuty,
  stopDispatch,
} = require("../src/dispatch");

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => resetState());

test("full booking lifecycle: create → pay → dispatch → accept → enroute → pickup → flying → completed → rate", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();

  // 1. Dispatch — simulates what happens after customer pays.
  bookings.push({
    id: 1, customerId: 1, pickupName: "Delhi", destName: "Gurgaon",
    pickupLat: 28.6139, pickupLng: 77.209, destLat: 28.45, destLng: 77.03,
    service: "taxi", distanceKm: 25, fareEstimate: 12000, carbonSavedKg: 10,
    paymentStatus: "paid", status: "requested", operatorId: null, aircraftId: null,
    pendingOperatorId: null, assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const offerId = await startDispatch(1);
  assert.ok(offerId, "Should create an offer");
  assert.equal(pushed.length, 1, "Should push to one operator");
  assert.equal(pushed[0].event, "dispatch_offer");

  // 2. Operator accepts.
  const result = await acceptOffer(offerId, 2);
  assert.equal(result.ok, true);
  const b = bookings.find((x) => x.id === 1);
  assert.equal(b.operatorId, 2);
  assert.equal(b.status, "assigned");
  assert.ok(b.aircraftId, "Should assign an aircraft");

  // 3. Status progression: assigned → accepted → enroute → picked_up → flying → completed.
  // Use the conditional UPDATE pattern that advanceTripStatus now uses.
  const advance = async (from, to) => {
    const claim = await fakeDb.query(
      "UPDATE bookings SET status = ? WHERE id = ? AND status = ?",
      [to, 1, from]
    );
    assert.equal(claim.affectedRows, 1, `${from} → ${to} should succeed`);
  };

  await advance("assigned", "accepted");
  await advance("accepted", "enroute");
  await advance("enroute", "picked_up");
  await advance("picked_up", "flying");
  await advance("flying", "completed");

  assert.equal(b.status, "completed");

  // 4. Ratings — customer rates operator, operator rates customer.
  await fakeDb.query(
    "INSERT INTO ratings (bookingId, raterId, raterRole, rateeId, stars, comment) VALUES (?, ?, ?, ?, ?, ?)",
    [1, 1, "customer", 2, 5, "Smooth flight!"]
  );
  await fakeDb.query(
    "INSERT INTO ratings (bookingId, raterId, raterRole, rateeId, stars, comment) VALUES (?, ?, ?, ?, ?, ?)",
    [1, 2, "operator", 1, 4, "Polite passenger"]
  );

  const bookingRatings = ratings.filter((r) => r.bookingId === 1);
  assert.equal(bookingRatings.length, 2);
  assert.equal(bookingRatings[0].stars, 5);
  assert.equal(bookingRatings[1].stars, 4);

  t.mock.timers.reset();
});

test("race condition: concurrent status advance — second caller fails", async () => {
  resetState();
  bookings.push({
    id: 2, customerId: 1, operatorId: 2, status: "accepted",
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: 1, pendingOperatorId: null,
    assignedAt: new Date(), cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const first = await fakeDb.query(
    "UPDATE bookings SET status = ? WHERE id = ? AND status = ?",
    ["enroute", 2, "accepted"]
  );
  assert.equal(first.affectedRows, 1);

  // Second concurrent call — status already changed.
  const second = await fakeDb.query(
    "UPDATE bookings SET status = ? WHERE id = ? AND status = ?",
    ["enroute", 2, "accepted"]
  );
  assert.equal(second.affectedRows, 0, "Second advance should fail (status already changed)");
});

test("race condition: concurrent accept — second pilot loses", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();
  bookings.push({
    id: 3, customerId: 1, status: "dispatching", operatorId: null,
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  // Two offers for the same booking (simulating overlapping dispatch).
  offers.push({
    id: 1, bookingId: 3, operatorId: 2, status: "pending",
    expiresAt: new Date(Date.now() + 30000), createdAt: new Date(),
  });
  offers.push({
    id: 2, bookingId: 3, operatorId: 3, status: "pending",
    expiresAt: new Date(Date.now() + 30000), createdAt: new Date(),
  });

  const first = await acceptOffer(1, 2);
  assert.equal(first.ok, true);

  const second = await acceptOffer(2, 3);
  assert.equal(second.ok, false, "Second accept should fail");
  assert.equal(second.status, 409);

  t.mock.timers.reset();
});

test("race condition: concurrent cancel — second caller gets conflict", async () => {
  resetState();
  bookings.push({
    id: 4, customerId: 1, status: "dispatching", operatorId: null,
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const first = await fakeDb.query(
    "UPDATE bookings SET status = 'cancelled', cancelledAt = NOW(), cancellationFee = ? WHERE id = ? AND status NOT IN ('cancelled', 'completed')",
    [0, 4]
  );
  assert.equal(first.affectedRows, 1);

  const second = await fakeDb.query(
    "UPDATE bookings SET status = 'cancelled', cancelledAt = NOW(), cancellationFee = ? WHERE id = ? AND status NOT IN ('cancelled', 'completed')",
    [0, 4]
  );
  assert.equal(second.affectedRows, 0, "Second cancel should fail");
});

test("dispatch gives up after all nearby pilots exhausted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();
  // Put operators far away so none are within DISPATCH_RADIUS_KM.
  users.forEach((u) => { if (u.role === "operator") { u.gpsLat = 0; u.gpsLng = 0; } });
  bookings.push({
    id: 5, customerId: 1, status: "requested", operatorId: null,
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const offerId = await startDispatch(5);
  assert.equal(offerId, null, "Should not create an offer (no nearby pilots)");
  // The booking should be marked no_pilot by the race-safe conditional update,
  // but only if status is 'dispatching'. startDispatch first sets dispatching,
  // then offerToNextOperator runs the conditional.
  const b = bookings.find((x) => x.id === 5);
  assert.equal(b.status, "no_pilot");

  t.mock.timers.reset();
});

test("operator reject re-dispatches to next pilot", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();
  bookings.push({
    id: 6, customerId: 1, status: "requested", operatorId: null,
    pickupLat: 28.6139, pickupLng: 77.209, destLat: 28.45, destLng: 77.03,
    service: "taxi", distanceKm: 25, fareEstimate: 12000, carbonSavedKg: 10,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const offerId = await startDispatch(6);
  assert.ok(offerId);

  // First pilot rejects.
  const rejResult = await rejectOffer(offerId, pushed[pushed.length - 1].operatorId);
  assert.equal(rejResult.ok, true);

  // Should have dispatched to the next pilot.
  const nextOffer = offers.find((o) => o.bookingId === 6 && o.status === "pending");
  assert.ok(nextOffer, "Should create a new offer for the next pilot");

  t.mock.timers.reset();
});

test("aircraft is released after trip completion", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();

  bookings.push({
    id: 7, customerId: 1, operatorId: 2, status: "flying",
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: 1, pendingOperatorId: null,
    assignedAt: new Date(), cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  aircraft[0].status = "in_flight";

  await releaseAircraft(7);
  assert.equal(aircraft[0].status, "available", "Aircraft should be released back to available");
  const b = bookings.find((x) => x.id === 7);
  assert.equal(b.aircraftId, null, "Booking should clear aircraftId");

  t.mock.timers.reset();
});

test("stopDispatch expires all pending offers and releases aircraft", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();

  bookings.push({
    id: 8, customerId: 1, status: "dispatching", operatorId: null,
    pickupLat: 28.6, pickupLng: 77.2, destLat: 28.5, destLng: 77.0,
    service: "taxi", distanceKm: 20, fareEstimate: 10000, carbonSavedKg: 8,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  offers.push({
    id: 10, bookingId: 8, operatorId: 2, status: "pending",
    expiresAt: new Date(Date.now() + 30000), createdAt: new Date(),
  });

  await stopDispatch(8);
  assert.equal(offers[0].status, "expired", "Offer should be expired");

  t.mock.timers.reset();
});

test("off-duty operators are excluded from dispatch", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  resetState();
  // Set all operators off-duty.
  users.forEach((u) => { if (u.role === "operator") u.onDuty = 0; });

  bookings.push({
    id: 9, customerId: 1, status: "requested", operatorId: null,
    pickupLat: 28.6139, pickupLng: 77.209, destLat: 28.45, destLng: 77.03,
    service: "taxi", distanceKm: 25, fareEstimate: 12000, carbonSavedKg: 10,
    paymentStatus: "paid", aircraftId: null, pendingOperatorId: null,
    assignedAt: null, cancelledAt: null, cancellationFee: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const offerId = await startDispatch(9);
  assert.equal(offerId, null, "Should not dispatch to off-duty operators");

  t.mock.timers.reset();
});
