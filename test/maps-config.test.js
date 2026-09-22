const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapsClientConfig } = require("../src/maps-config");

test("maps config stays on OpenStreetMap when the key is empty", () => {
  assert.deepEqual(mapsClientConfig({ GOOGLE_MAPS_API_KEY: "" }), { provider: "osm" });
  assert.deepEqual(mapsClientConfig({}), { provider: "osm" });
});

test("maps config returns the Google key when it is set", () => {
  assert.deepEqual(mapsClientConfig({ GOOGLE_MAPS_API_KEY: "  test-key  " }), {
    provider: "google",
    apiKey: "test-key",
  });
});
