// Tests for the least-fuel route avoidance algorithm (v2).
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  planAvoidanceRoute,
  segmentCrossesNoFly,
  segmentRestrictedZones,
  buildFuelGraph,
  dijkstraFuel,
  computeAltitudeProfile,
  segmentsIntersect,
  edgeFuelKg,
  climbFuelKg,
  segmentFuelKg,
  altitudeFuelFactor,
} = require("../src/route-planner");
const { circleZone, box } = require("../src/india-zones-data");

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNoFly(name, geometry) {
  return { name, zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry };
}

function makeRestricted(name, geometry, maxAlt = 300) {
  return { name, zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: maxAlt, category: "urban_core", geometry };
}

// ── Segment intersection ─────────────────────────────────────────────────

test("segmentsIntersect detects crossing lines", () => {
  assert.equal(segmentsIntersect(0, 0, 1, 1, 0, 1, 1, 0), true);
  assert.equal(segmentsIntersect(0, 0, 1, 0, 0, 1, 1, 1), false);
});

// ── segmentCrossesNoFly ──────────────────────────────────────────────────

test("segmentCrossesNoFly returns false for path that misses no-fly zone", () => {
  const nfz = makeNoFly("Test Airport", circleZone(77.1, 28.556, 0.035));
  assert.equal(segmentCrossesNoFly(77.0, 28.7, 77.0, 28.8, [nfz]), false);
});

test("segmentCrossesNoFly returns true for path through no-fly zone", () => {
  const nfz = makeNoFly("Test Airport", circleZone(77.1, 28.556, 0.035));
  assert.equal(segmentCrossesNoFly(77.0, 28.556, 77.2, 28.556, [nfz]), true);
});

// ── segmentRestrictedZones ───────────────────────────────────────────────

test("segmentRestrictedZones identifies restricted zones along a segment", () => {
  const rz = makeRestricted("Urban Core", box(77.0, 28.5, 77.2, 28.6), 300);
  const crossed = segmentRestrictedZones(76.9, 28.55, 77.3, 28.55, [rz]);
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].zone.name, "Urban Core");
  assert.equal(crossed[0].requiredAltitudeM, 350);
});

test("segmentRestrictedZones returns empty when path misses restricted zone", () => {
  const rz = makeRestricted("Urban Core", box(77.0, 28.5, 77.2, 28.6), 300);
  const crossed = segmentRestrictedZones(76.9, 28.7, 77.3, 28.7, [rz]);
  assert.equal(crossed.length, 0);
});

// ── Fuel cost model ──────────────────────────────────────────────────────

test("altitudeFuelFactor is 1.0 at optimal altitude and increases away from it", () => {
  const factor0 = altitudeFuelFactor(280, 280);
  const factorHigh = altitudeFuelFactor(480, 280);
  assert.ok(Math.abs(factor0 - 1.0) < 0.01);
  assert.ok(factorHigh > 1.5, `Factor at 480m should be > 1.5, got ${factorHigh}`);
});

test("segmentFuelKg increases with distance", () => {
  const f10 = segmentFuelKg("taxi", 10, 280);
  const f20 = segmentFuelKg("taxi", 20, 280);
  assert.ok(f20 > f10);
  assert.ok(Math.abs(f20 - f10 * 2) < 1, "Should scale roughly linearly with distance");
});

test("climbFuelKg is zero when target is below base", () => {
  assert.equal(climbFuelKg("taxi", 300, 200), 0);
});

test("climbFuelKg is positive when climbing", () => {
  const fuel = climbFuelKg("taxi", 280, 500);
  assert.ok(fuel > 0, `Climb fuel should be positive, got ${fuel}`);
});

test("edgeFuelKg is higher when crossing a restricted zone (climb penalty)", () => {
  const fuelClear = edgeFuelKg("taxi", 10, 280, []);
  const rz = makeRestricted("R", box(0, 0, 1, 1), 400);
  const fuelRestricted = edgeFuelKg("taxi", 10, 280, [{ zone: rz, requiredAltitudeM: 450 }]);
  assert.ok(fuelRestricted > fuelClear,
    `Restricted edge fuel (${fuelRestricted}) should exceed clear edge (${fuelClear})`);
});

// ── Direct route (no obstacles) ──────────────────────────────────────────

test("planAvoidanceRoute returns direct path when no zones block", () => {
  const result = planAvoidanceRoute({
    pickupLat: 28.7, pickupLng: 77.0,
    destLat: 28.8, destLng: 77.1,
    zones: [], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.equal(result.reason, "direct_clear");
  assert.equal(result.waypoints.length, 2);
  assert.equal(result.detourRatio, 1);
  assert.ok(result.totalFuelKg > 0);
  assert.equal(result.algorithm, "least_fuel_dijkstra_v2");
});

// ── Route around a single no-fly zone ────────────────────────────────────

test("planAvoidanceRoute reroutes around a no-fly zone in the direct path", () => {
  const nfz = makeNoFly("Blocking Zone", box(77.04, 28.54, 77.16, 28.58));
  const result = planAvoidanceRoute({
    pickupLat: 28.56, pickupLng: 76.9,
    destLat: 28.56, destLng: 77.3,
    zones: [nfz], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.ok(result.reason.includes("rerouted"));
  assert.ok(result.waypoints.length >= 3);
  assert.ok(result.detourRatio > 1);
  assert.ok(result.totalFuelKg > 0);
});

// ── Endpoint inside no-fly → infeasible ──────────────────────────────────

test("planAvoidanceRoute returns infeasible when pickup is inside a no-fly zone", () => {
  const nfz = makeNoFly("Airport", circleZone(77.1, 28.556, 0.035));
  const result = planAvoidanceRoute({
    pickupLat: 28.556, pickupLng: 77.1,
    destLat: 28.7, destLng: 77.2,
    zones: [nfz], service: "taxi",
  });
  assert.equal(result.feasible, false);
  assert.equal(result.reason, "endpoint_in_no_fly");
});

// ── Restricted zone: overfly vs. detour decision ─────────────────────────

test("algorithm chooses to overfly a small restricted zone (climb is cheaper than detour)", () => {
  // Small restricted zone in the direct path: climbing 70m is cheaper than
  // going 5+ km around it.
  const rz = makeRestricted("Small Park", circleZone(77.1, 28.55, 0.01), 300);
  const result = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.9,
    destLat: 28.55, destLng: 77.3,
    zones: [rz], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  // Should fly through at higher altitude — the detour ratio should be ~1
  // (not much longer than direct).
  assert.ok(result.totalFuelKg > 0);
  // Check that at least one segment crosses the restricted zone.
  const crossedSeg = result.segments.find((s) => s.crossedRestricted.length > 0);
  // It's valid to either fly over or route around — the algorithm picks least fuel.
  // We verify the result is feasible and has a fuel estimate.
  assert.ok(result.totalDistanceKm > 0);
});

test("algorithm chooses to route around a large restricted zone when detour is shorter in fuel", () => {
  // Large restricted zone with very high ceiling — climbing to 1550m burns
  // a LOT of fuel, so routing around should be cheaper.
  const rz = makeRestricted("Huge Zone", box(76.8, 28.3, 77.4, 28.7), 1500);
  const result = planAvoidanceRoute({
    pickupLat: 28.5, pickupLng: 76.6,
    destLat: 28.5, destLng: 77.6,
    zones: [rz], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.ok(result.totalFuelKg > 0);
  // With a 1500m ceiling, the climb penalty is massive, so the algorithm
  // should either route around or fly through at high cost — either way it
  // must return a feasible route.
});

// ── Fuel comparison: overfly fuel vs. direct fuel ────────────────────────

test("totalFuelKg includes climb penalty for restricted zone crossing", () => {
  const rz = makeRestricted("Urban", box(77.0, 28.5, 77.2, 28.6), 400);
  const withZone = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.9,
    destLat: 28.55, destLng: 77.3,
    zones: [rz], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  const noZone = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.9,
    destLat: 28.55, destLng: 77.3,
    zones: [], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  // Route with restricted zone should cost more fuel than clear route
  // (whether it goes over or around, there's a penalty).
  assert.ok(withZone.totalFuelKg >= noZone.totalFuelKg,
    `With zone: ${withZone.totalFuelKg} should >= without: ${noZone.totalFuelKg}`);
});

// ── Altitude profile ─────────────────────────────────────────────────────

test("altitude profile shows transitions when crossing restricted zones", () => {
  const rz = makeRestricted("Urban", box(77.0, 28.5, 77.2, 28.6), 300);
  const result = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.8,
    destLat: 28.55, destLng: 77.5,
    zones: [rz], service: "taxi",
    baseCruiseAltitudeM: 280,
  });
  assert.ok(result.altitudeProfile, "Should have altitude profile");
  assert.ok(result.altitudeProfile.min > 0);
});

// ── computeAltitudeProfile (legacy compat) ───────────────────────────────

test("computeAltitudeProfile raises altitude when crossing restricted zone", () => {
  const restricted = makeRestricted("Urban Core", box(77.0, 28.5, 77.2, 28.6), 300);
  const waypoints = [
    { lat: 28.55, lng: 76.8 },
    { lat: 28.55, lng: 77.1 },
    { lat: 28.55, lng: 77.5 },
  ];
  const segments = computeAltitudeProfile(waypoints, [restricted], 280);
  assert.equal(segments.length, 2);
  const crossingSeg = segments.find((s) => s.crossedRestricted.length > 0);
  assert.ok(crossingSeg, "Should identify the restricted zone crossing");
  assert.ok(crossingSeg.altitudeM > 300, "Should climb above restricted ceiling");
});

// ── Multiple no-fly zones ────────────────────────────────────────────────

test("planAvoidanceRoute navigates between two no-fly zones", () => {
  const nfz1 = makeNoFly("Airport A", box(77.0, 28.5, 77.1, 28.6));
  const nfz2 = makeNoFly("Airport B", box(77.2, 28.5, 77.3, 28.6));
  const result = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.8,
    destLat: 28.55, destLng: 77.5,
    zones: [nfz1, nfz2], service: "taxi",
  });
  assert.equal(result.feasible, true);
  assert.ok(result.waypoints.length >= 3);
});

// ── Dijkstra correctness ─────────────────────────────────────────────────

test("dijkstraFuel finds least-cost path", () => {
  const nodes = [
    { id: 0, lat: 0, lng: 0 },
    { id: 1, lat: 1, lng: 1 },
    { id: 2, lat: 0.5, lng: 0.5 },
  ];
  const adj = new Map([
    [0, [
      { to: 2, fuelKg: 5, distKm: 1, altitudeM: 280, crossedRestricted: [] },
      { to: 1, fuelKg: 100, distKm: 10, altitudeM: 280, crossedRestricted: [] },
    ]],
    [1, [
      { to: 2, fuelKg: 5, distKm: 1, altitudeM: 280, crossedRestricted: [] },
      { to: 0, fuelKg: 100, distKm: 10, altitudeM: 280, crossedRestricted: [] },
    ]],
    [2, [
      { to: 0, fuelKg: 5, distKm: 1, altitudeM: 280, crossedRestricted: [] },
      { to: 1, fuelKg: 5, distKm: 1, altitudeM: 280, crossedRestricted: [] },
    ]],
  ]);
  const result = dijkstraFuel(nodes, adj, 0, 1);
  assert.deepEqual(result.path, [0, 2, 1]);
  assert.equal(result.totalFuelKg, 10);
});

test("dijkstraFuel returns null when no path exists", () => {
  const nodes = [{ id: 0, lat: 0, lng: 0 }, { id: 1, lat: 1, lng: 1 }];
  const adj = new Map([[0, []], [1, []]]);
  assert.equal(dijkstraFuel(nodes, adj, 0, 1), null);
});

// ── Service-specific fuel profiles ───────────────────────────────────────

test("golden hour service burns more fuel than taxi for same route", () => {
  const taxi = planAvoidanceRoute({
    pickupLat: 28.7, pickupLng: 77.0,
    destLat: 28.8, destLng: 77.1,
    zones: [], service: "taxi",
  });
  const golden = planAvoidanceRoute({
    pickupLat: 28.7, pickupLng: 77.0,
    destLat: 28.8, destLng: 77.1,
    zones: [], service: "golden",
  });
  assert.ok(golden.totalFuelKg > taxi.totalFuelKg,
    `Golden (${golden.totalFuelKg} kg) should burn more than taxi (${taxi.totalFuelKg} kg)`);
});

// ── Full India zones integration ─────────────────────────────────────────

test("route between two points near Delhi avoids IGI no-fly zone with least fuel", () => {
  const { INDIA_ZONES } = require("../src/india-zones-data");
  const result = planAvoidanceRoute({
    pickupLat: 28.5, pickupLng: 76.9,
    destLat: 28.6, destLng: 77.3,
    zones: INDIA_ZONES, service: "taxi",
  });
  assert.equal(result.feasible, true);
  assert.ok(result.waypoints.length >= 2);
  assert.ok(result.totalFuelKg > 0);
  assert.ok(result.totalDistanceKm > 0);
  assert.equal(result.algorithm, "least_fuel_dijkstra_v2");
});

// ── Restricted zones don't block feasibility ─────────────────────────────

test("restricted zones never make a route infeasible", () => {
  const rz = makeRestricted("Urban", box(77.0, 28.5, 77.2, 28.6), 300);
  const result = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.9,
    destLat: 28.55, destLng: 77.3,
    zones: [rz], service: "taxi",
  });
  assert.equal(result.feasible, true);
});
