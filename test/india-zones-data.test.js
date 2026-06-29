const { test } = require("node:test");
const assert = require("node:assert/strict");
const { INDIA_ZONES, box, airportZone, circleZone } = require("../src/india-zones-data");

test("INDIA_ZONES covers major airports nationwide with no corridors", () => {
  assert.ok(INDIA_ZONES.length >= 30);
  const types = new Set(INDIA_ZONES.map((z) => z.zoneType));
  assert.ok(types.has("no_fly"));
  assert.ok(types.has("restricted"));
  // Corridors were removed from the catalog entirely.
  assert.ok(!types.has("flight_corridor"));
  for (const z of INDIA_ZONES) {
    assert.equal(z.geometry.type, "Polygon");
    assert.ok(z.maxAltitudeM >= z.minAltitudeM);
  }
});

test("airportZone produces a closed circular ring, not a 5-point square", () => {
  const g = airportZone(77.1, 28.5);
  const ring = g.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  // A circle has many vertices; a square box has only 5.
  assert.ok(ring.length > 10, `expected a circle, got ${ring.length} vertices`);
});

test("circleZone is centred and roughly round", () => {
  const g = circleZone(77.0, 28.0, 0.05, 36);
  const ring = g.coordinates[0];
  // Every vertex should be ~0.05° from the centre (lat), allowing for the
  // cos(lat) longitude stretch.
  for (const [lng, lat] of ring) {
    const dlat = lat - 28.0;
    const dlng = (lng - 77.0) * Math.cos((28.0 * Math.PI) / 180);
    const r = Math.sqrt(dlat * dlat + dlng * dlng);
    assert.ok(Math.abs(r - 0.05) < 0.005, `radius ${r} drifted from 0.05`);
  }
});

test("box still produces a closed 5-point ring", () => {
  const b = box(70, 10, 90, 30);
  assert.equal(b.coordinates[0].length, 5);
});
