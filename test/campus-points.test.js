const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeDronePosition, etaRemainingMin } = require("../src/campus-points");

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
