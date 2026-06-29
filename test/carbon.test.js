const { test } = require("node:test");
const assert = require("node:assert/strict");
const { estimateCarbonSavedKg } = require("../src/carbon");

test("estimateCarbonSavedKg scales by service and distance", () => {
  const taxi = estimateCarbonSavedKg("taxi", 10);
  const golden = estimateCarbonSavedKg("golden", 10);
  const shuttle = estimateCarbonSavedKg("shuttle", 10);
  assert.ok(taxi > shuttle);
  assert.ok(golden > taxi);
  assert.equal(taxi, 4.2);
});

test("estimateCarbonSavedKg returns 0 for invalid distance", () => {
  assert.equal(estimateCarbonSavedKg("taxi", -5), 0);
});
