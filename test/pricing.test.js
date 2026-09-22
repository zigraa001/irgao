// Unit tests for the mock fare estimation (src/pricing.js). DB-free, run with
// `npm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  SERVICE_PRICING,
  SERVICES,
  haversineKm,
  estimateFare,
  pricingForRide,
  evtolDistanceCharge,
} = require("../src/pricing");

test("estimateFare uses base + per-km per service with 18% GST", () => {
  for (const service of SERVICES) {
    const pricing = SERVICE_PRICING[service];
    const bare = pricing.slab === "evtol"
      ? evtolDistanceCharge(10)
      : pricing.base + pricing.perKm * 10;
    const expected = Math.round(bare * 1.18 / 100) * 100;
    assert.equal(estimateFare(service, 10), expected);
  }
});

test("estimateFare equals base with GST at zero distance (rounded)", () => {
  for (const service of SERVICES) {
    const pricing = SERVICE_PRICING[service];
    const bare = pricing.slab === "evtol" ? evtolDistanceCharge(0) : pricing.base;
    assert.equal(estimateFare(service, 0), Math.round(bare * 1.18 / 100) * 100);
  }
});

test("estimateFare grows with distance", () => {
  assert.ok(estimateFare("taxi", 50) > estimateFare("taxi", 10));
});

test("estimateFare clamps negative / non-numeric distance to the eVTOL minimum with GST", () => {
  const base = Math.round(evtolDistanceCharge(0) * 1.18 / 100) * 100;
  assert.equal(estimateFare("taxi", -5), base);
  assert.equal(estimateFare("taxi", "abc"), base);
});

test("eVTOL slabs are ₹15 to 20 km, ₹12 to 50, ₹10 after, minimum ₹300", () => {
  assert.equal(evtolDistanceCharge(10), 300);
  assert.equal(evtolDistanceCharge(20), 300);
  assert.equal(evtolDistanceCharge(50), 20 * 15 + 30 * 12);
  assert.equal(evtolDistanceCharge(78), 20 * 15 + 30 * 12 + 28 * 10);
  assert.equal(evtolDistanceCharge(100), 20 * 15 + 30 * 12 + 28 * 10 + 22 * 10);
});

test("estimateFare throws on an unknown service", () => {
  assert.throws(() => estimateFare("rocket", 10), /Unknown service/);
});

test("haversineKm computes a sane distance (CP -> IGI ~ 15-20km)", () => {
  const km = haversineKm(28.6315, 77.2167, 28.5562, 77.1);
  assert.ok(km > 10 && km < 25, `expected ~15-20km, got ${km}`);
});

test("haversineKm is zero for identical points", () => {
  assert.equal(haversineKm(28.6, 77.2, 28.6, 77.2), 0);
});

test("every eVTOL cabin uses the same distance slabs", () => {
  const km = 116;
  const fare = (name) =>
    estimateFare("taxi", km, { _servicePricing: pricingForRide("taxi", name) });
  const expected = Math.round(evtolDistanceCharge(km) * 1.18 / 100) * 100;
  assert.equal(fare("IraGo Eco"), expected);
  assert.equal(fare("IraGo Lite"), expected);
  assert.equal(fare("IraGo Comfort"), expected);
  assert.equal(fare("IraGo Premium"), expected);
});
