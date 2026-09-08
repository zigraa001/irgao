const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateTrackingKey, normalizeTrackingKey } = require("../src/drone-track");

test("generateTrackingKey is IRG-XXXX-XXXX and unique-ish", () => {
  const a = generateTrackingKey();
  const b = generateTrackingKey();
  assert.match(a, /^IRG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.notEqual(a, b);
  assert.equal(normalizeTrackingKey(" irg-ab3k-9m2p "), "IRG-AB3K-9M2P");
});
