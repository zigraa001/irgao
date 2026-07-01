// Unit tests for the mock fare estimation (src/pricing.js). DB-free, run with
// `npm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  SERVICE_PRICING,
  SERVICES,
  haversineKm,
  estimateFare,
} = require("../src/pricing");

test("estimateFare uses base + per-km per service with 18% GST", () => {
  for (const service of SERVICES) {
    const { base, perKm } = SERVICE_PRICING[service];
    const expected = Math.round((base + perKm * 10) * 1.18 / 100) * 100;
    assert.equal(estimateFare(service, 10), expected);
  }
});

test("estimateFare equals base with GST at zero distance (rounded)", () => {
  for (const service of SERVICES) {
    const { base } = SERVICE_PRICING[service];
    assert.equal(estimateFare(service, 0), Math.round(base * 1.18 / 100) * 100);
  }
});

test("estimateFare grows with distance", () => {
  assert.ok(estimateFare("taxi", 50) > estimateFare("taxi", 10));
});

test("estimateFare clamps negative / non-numeric distance to base with GST", () => {
  const base = Math.round(SERVICE_PRICING.taxi.base * 1.18 / 100) * 100;
  assert.equal(estimateFare("taxi", -5), base);
  assert.equal(estimateFare("taxi", "abc"), base);
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
