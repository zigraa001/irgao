// Tests for the visibility-graph route avoidance algorithm.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  planAvoidanceRoute,
  segmentCrossesNoFly,
  buildVisibilityGraph,
  dijkstra,
  computeAltitudeProfile,
  segmentsIntersect,
} = require("../src/route-planner");
const { circleZone, box } = require("../src/india-zones-data");

// ── Helpers ──────────────────────────────────────────────────────────────

function makeNoFly(name, geometry) {
  return { name, zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry };
}

function makeRestricted(name, geometry, maxAlt = 300) {
  return { name, zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: maxAlt, geometry };
}

// ── Segment intersection ─────────────────────────────────────────────────

test("segmentsIntersect detects crossing lines", () => {
  assert.equal(segmentsIntersect(0, 0, 1, 1, 0, 1, 1, 0), true);
  assert.equal(segmentsIntersect(0, 0, 1, 0, 0, 1, 1, 1), false);
});

// ── segmentCrossesNoFly ──────────────────────────────────────────────────

test("segmentCrossesNoFly returns false for path that misses no-fly zone", () => {
  const nfz = makeNoFly("Test Airport", circleZone(77.1, 28.556, 0.035));
  assert.equal(
    segmentCrossesNoFly(77.0, 28.7, 77.0, 28.8, [nfz]),
    false,
    "Path well north of the zone should be clear"
  );
});

test("segmentCrossesNoFly returns true for path through no-fly zone", () => {
  const nfz = makeNoFly("Test Airport", circleZone(77.1, 28.556, 0.035));
  assert.equal(
    segmentCrossesNoFly(77.0, 28.556, 77.2, 28.556, [nfz]),
    true,
    "Path through the center of the zone should be blocked"
  );
});

// ── Direct route (no obstacles) ──────────────────────────────────────────

test("planAvoidanceRoute returns direct path when no zones block", () => {
  const result = planAvoidanceRoute({
    pickupLat: 28.7, pickupLng: 77.0,
    destLat: 28.8, destLng: 77.1,
    zones: [],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.equal(result.reason, "direct_clear");
  assert.equal(result.waypoints.length, 2);
  assert.equal(result.detourRatio, 1);
});

// ── Route around a single no-fly zone ────────────────────────────────────

test("planAvoidanceRoute reroutes around a no-fly zone in the direct path", () => {
  const nfz = makeNoFly("Blocking Zone", box(77.04, 28.54, 77.16, 28.58));
  const result = planAvoidanceRoute({
    pickupLat: 28.56, pickupLng: 76.9,
    destLat: 28.56, destLng: 77.3,
    zones: [nfz],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.equal(result.reason, "rerouted_around_no_fly");
  assert.ok(result.waypoints.length >= 3, "Should have intermediate waypoints");
  assert.ok(result.detourRatio > 1, "Detour should be longer than direct");
});

// ── Endpoint inside no-fly → infeasible ──────────────────────────────────

test("planAvoidanceRoute returns infeasible when pickup is inside a no-fly zone", () => {
  const nfz = makeNoFly("Airport", circleZone(77.1, 28.556, 0.035));
  const result = planAvoidanceRoute({
    pickupLat: 28.556, pickupLng: 77.1,
    destLat: 28.7, destLng: 77.2,
    zones: [nfz],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, false);
  assert.equal(result.reason, "endpoint_in_no_fly");
});

test("planAvoidanceRoute returns infeasible when destination is inside a no-fly zone", () => {
  const nfz = makeNoFly("Airport", circleZone(77.1, 28.556, 0.035));
  const result = planAvoidanceRoute({
    pickupLat: 28.7, pickupLng: 77.2,
    destLat: 28.556, destLng: 77.1,
    zones: [nfz],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, false);
  assert.equal(result.reason, "endpoint_in_no_fly");
});

// ── Altitude profile with restricted zones ───────────────────────────────

test("computeAltitudeProfile raises altitude when crossing restricted zone", () => {
  const restricted = makeRestricted("Urban Core", box(77.0, 28.5, 77.2, 28.6), 300);
  const waypoints = [
    { lat: 28.55, lng: 76.8 },
    { lat: 28.55, lng: 77.1 },
    { lat: 28.55, lng: 77.5 },
  ];
  const segments = computeAltitudeProfile(waypoints, [restricted], 280);
  assert.equal(segments.length, 2);
  // The segment whose midpoint/endpoints are inside the restricted zone
  // should have altitude above the 300 m ceiling.
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
    zones: [nfz1, nfz2],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.ok(result.waypoints.length >= 3);
});

// ── Visibility graph construction ────────────────────────────────────────

test("buildVisibilityGraph excludes edges that cross no-fly zones", () => {
  const nfz = makeNoFly("Wall", box(77.0, 28.0, 77.2, 29.0));
  const { nodes, adj } = buildVisibilityGraph(76.5, 28.5, 77.5, 28.5, [nfz]);
  // Start (76.5) and end (77.5) shouldn't have a direct edge (blocked by the wall).
  const startEdges = adj.get(0);
  const directToEnd = startEdges.find((e) => e.to === 1);
  assert.equal(directToEnd, undefined, "Direct start→end edge should be blocked");
});

// ── Dijkstra correctness ─────────────────────────────────────────────────

test("dijkstra finds shortest path in a simple graph", () => {
  const nodes = [
    { id: 0, lat: 0, lng: 0 },
    { id: 1, lat: 1, lng: 1 },
    { id: 2, lat: 0.5, lng: 0.5 },
  ];
  const adj = new Map([
    [0, [{ to: 2, dist: 1 }, { to: 1, dist: 10 }]],
    [1, [{ to: 2, dist: 1 }, { to: 0, dist: 10 }]],
    [2, [{ to: 0, dist: 1 }, { to: 1, dist: 1 }]],
  ]);
  const result = dijkstra(nodes, adj, 0, 1);
  assert.deepEqual(result.path, [0, 2, 1]);
  assert.equal(result.totalKm, 2);
});

test("dijkstra returns null when no path exists", () => {
  const nodes = [
    { id: 0, lat: 0, lng: 0 },
    { id: 1, lat: 1, lng: 1 },
  ];
  const adj = new Map([
    [0, []],
    [1, []],
  ]);
  const result = dijkstra(nodes, adj, 0, 1);
  assert.equal(result, null);
});

// ── Restricted zones don't block routing (only altitude) ─────────────────

test("restricted zones don't cause route avoidance — only altitude adjustment", () => {
  const restricted = makeRestricted("Urban", box(77.0, 28.5, 77.2, 28.6), 300);
  const result = planAvoidanceRoute({
    pickupLat: 28.55, pickupLng: 76.9,
    destLat: 28.55, destLng: 77.3,
    zones: [restricted],
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.equal(result.reason, "direct_clear");
  assert.equal(result.waypoints.length, 2, "Should go direct — restricted zones are overflown");
  // But segments should show altitude bump.
  const crossingSeg = result.segments.find((s) => s.crossedRestricted.length > 0);
  assert.ok(crossingSeg);
  assert.ok(crossingSeg.altitudeM > 300);
});

// ── Full India zones integration ─────────────────────────────────────────

test("route between two points near Delhi avoids IGI no-fly zone", () => {
  const { INDIA_ZONES } = require("../src/india-zones-data");
  const result = planAvoidanceRoute({
    pickupLat: 28.5, pickupLng: 76.9,
    destLat: 28.6, destLng: 77.3,
    zones: INDIA_ZONES,
    baseCruiseAltitudeM: 280,
  });
  assert.equal(result.feasible, true);
  assert.ok(result.waypoints.length >= 2);
  assert.ok(result.totalDistanceKm > 0);
});
