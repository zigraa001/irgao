const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  pointInPolygon,
  planLeastFuelRoute,
  publicFuelPlan,
  estimateFuelKg,
} = require("../src/fuel-route");

const delhiCorridor = {
  name: "Delhi NCR — flight corridor",
  zoneType: "flight_corridor",
  minAltitudeM: 150,
  maxAltitudeM: 450,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [76.95, 28.35],
        [77.45, 28.35],
        [77.45, 28.85],
        [76.95, 28.85],
        [76.95, 28.35],
      ],
    ],
  },
};

const noFly = {
  name: "Test no-fly",
  zoneType: "no_fly",
  minAltitudeM: 0,
  maxAltitudeM: 914,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [77.08, 28.54],
        [77.12, 28.54],
        [77.12, 28.57],
        [77.08, 28.57],
        [77.08, 28.54],
      ],
    ],
  },
};

test("pointInPolygon detects inside vs outside", () => {
  assert.equal(pointInPolygon(77.2, 28.6, delhiCorridor.geometry), true);
  assert.equal(pointInPolygon(70.0, 10.0, delhiCorridor.geometry), false);
});

test("planLeastFuelRoute returns cruise altitude in corridor for operators", () => {
  const plan = planLeastFuelRoute({
    pickupLat: 28.61,
    pickupLng: 77.21,
    destLat: 28.65,
    destLng: 77.25,
    service: "taxi",
    zones: [delhiCorridor],
  });
  assert.equal(plan.feasible, true);
  assert.ok(plan.cruiseAltitudeM >= 150 && plan.cruiseAltitudeM <= 450);
  assert.ok(plan.fuelKg > 0);
  assert.equal(plan.algorithm, "least_fuel_v1");
});

test("planLeastFuelRoute blocks no-fly endpoints", () => {
  const plan = planLeastFuelRoute({
    pickupLat: 28.555,
    pickupLng: 77.1,
    destLat: 28.65,
    destLng: 77.25,
    service: "taxi",
    zones: [delhiCorridor, noFly],
  });
  assert.equal(plan.feasible, false);
  assert.ok(plan.violations.length > 0);
});

test("publicFuelPlan hides altitude from passengers", () => {
  const plan = planLeastFuelRoute({
    pickupLat: 28.61,
    pickupLng: 77.21,
    destLat: 28.65,
    destLng: 77.25,
    service: "taxi",
    zones: [delhiCorridor],
  });
  const pub = publicFuelPlan(plan);
  assert.equal(pub.cruiseAltitudeM, undefined);
  assert.ok(pub.fuelEstimateKg > 0);
  assert.ok(pub.note);
});

test("estimateFuelKg increases with distance", () => {
  const low = estimateFuelKg("taxi", 10, 280);
  const high = estimateFuelKg("taxi", 50, 280);
  assert.ok(high > low);
});
