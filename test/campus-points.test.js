const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeDronePosition, etaRemainingMin, lookupCampusPoint, campusDeliveryFare } = require("../src/campus-points");

const BASE = {
  pickupLat: 12.99,
  pickupLng: 80.23,
  dropLat: 12.98,
  dropLng: 80.24,
  etaMin: 3,
};

test("delivered stays at drop, completed sits at pad", () => {
  const drop = computeDronePosition({ ...BASE, status: "delivered" });
  assert.equal(drop.lat, 12.98);
  assert.equal(drop.lng, 80.24);
  const home = computeDronePosition({ ...BASE, status: "completed" });
  assert.equal(home.lat, 12.99);
  assert.equal(home.lng, 80.23);
});

test("returning flies from drop back to pad", () => {
  const now = Date.now();
  const mid = computeDronePosition(
    {
      ...BASE,
      status: "returning",
      returnStartedUnix: (now - 30000) / 1000,
    },
    now
  );
  assert.ok(mid);
  assert.equal(mid.source, "return");
  assert.ok(Math.abs(mid.lat - 12.985) < 1e-9);
  assert.ok(Math.abs(mid.lng - 80.235) < 1e-9);
  assert.equal(etaRemainingMin({ ...BASE, status: "returning", returnStartedUnix: now / 1000 }, null, now), 1);
});

test("campus drone delivery is ₹49 plus ₹7 per km, then GST", () => {
  const from = lookupCampusPoint("Mandi Town");
  const to = lookupCampusPoint("IIT Mandi North Campus");
  const fare = campusDeliveryFare(from, to);
  assert.equal(fare.base, 49);
  assert.equal(fare.perKm, 7);
  assert.equal(fare.kmCharge, Math.round(fare.distanceKm * 7));
  assert.equal(fare.subtotal, 49 + fare.kmCharge);
  assert.equal(fare.gst, Math.round(fare.subtotal * 0.18));
  assert.equal(fare.total, fare.subtotal + fare.gst);
  assert.ok(fare.distanceKm > 1);
});

test("IIT Mandi pads resolve for operator send", () => {
  const town = lookupCampusPoint("Mandi Town");
  const north = lookupCampusPoint("IIT Mandi North Campus");
  const south = lookupCampusPoint("IIT Mandi South Campus");
  assert.ok(town && north && south);
  assert.equal(town.lat, 31.7082);
  assert.equal(north.lat, 31.78129);
  assert.equal(south.lat, 31.77314);
  assert.ok(lookupCampusPoint("Pine Mess"));
  assert.ok(lookupCampusPoint("Alder Mess"));
  assert.ok(lookupCampusPoint("North Campus Library"));
  assert.ok(lookupCampusPoint("B28 Hostel"));
  assert.ok(lookupCampusPoint("Faculty Quarters"));
  assert.ok(lookupCampusPoint("Sports Complex"));
  assert.ok(lookupCampusPoint("Parashar Hostel (B6)"));
  assert.ok(lookupCampusPoint("Cedar Mess"));
  const mandi = Object.values(require("../src/campus-points").CAMPUS_POINTS).filter((c) => c[0] > 31 && c[0] < 32);
  assert.ok(mandi.length >= 60);
});
