const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.AUTH_SECRET = "test-zones";

const fakeZonesDb = (() => {
  const zones = [
    {
      id: 1,
      name: "Delhi corridor",
      zoneType: "flight_corridor",
      minAltitudeM: 100,
      maxAltitudeM: 400,
      minLat: 28.35,
      maxLat: 28.85,
      minLng: 76.95,
      maxLng: 77.45,
      geometry: JSON.stringify({
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
      }),
    },
    {
      id: 2,
      name: "Solapur restricted",
      zoneType: "restricted",
      minAltitudeM: 0,
      maxAltitudeM: 300,
      minLat: 17.63,
      maxLat: 17.69,
      minLng: 75.88,
      maxLng: 75.94,
      geometry: JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [75.88, 17.63],
            [75.94, 17.63],
            [75.94, 17.69],
            [75.88, 17.69],
            [75.88, 17.63],
          ],
        ],
      }),
    },
  ];

  async function zonesQuery(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (!s.includes("FROM flight_zones")) return [];
    if (s.includes("maxLat >= ?")) {
      const [swLat, neLat, swLng, neLng] = params;
      return zones.filter(
        (z) =>
          z.maxLat >= swLat &&
          z.minLat <= neLat &&
          z.maxLng >= swLng &&
          z.minLng <= neLng
      );
    }
    return zones;
  }

  async function zonesQueryOne() {
    return null;
  }

  return { zonesQuery, zonesQueryOne };
})();

require.cache[require.resolve("../src/zones-db")] = {
  id: require.resolve("../src/zones-db"),
  filename: require.resolve("../src/zones-db"),
  loaded: true,
  exports: fakeZonesDb,
};

// requireAuth now re-checks the user row in the main DB; stub ./db so the
// lookup degrades to "allow on token alone" without a real MySQL connection.
require.cache[require.resolve("../src/db")] = {
  id: require.resolve("../src/db"),
  filename: require.resolve("../src/db"),
  loaded: true,
  exports: {
    query: async () => [],
    queryOne: async () => null,
  },
};

const zoneRoutes = require("../src/zone-routes");
const { signToken } = require("../src/auth");

const app = express();
app.use("/api/zones", zoneRoutes);
const server = http.createServer(app);
let baseUrl;

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test("GET /api/zones without auth returns 401", async () => {
  const res = await fetch(
    `${baseUrl}/api/zones?swLat=17&swLng=75&neLat=18&neLng=76`
  );
  assert.equal(res.status, 401);
});

test("GET /api/zones without bounds returns 400", async () => {
  const token = signToken({ id: 1, name: "U", role: "customer" });
  const res = await fetch(`${baseUrl}/api/zones`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 400);
});

test("GET /api/zones returns only zones in viewport", async () => {
  const token = signToken({ id: 1, name: "U", role: "operator" });
  const res = await fetch(
    `${baseUrl}/api/zones?swLat=17.5&swLng=75.7&neLat=17.8&neLng=76.1`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.zones.length, 1);
  assert.equal(json.zones[0].zoneType, "restricted");
  assert.equal(json.zones[0].geometry.type, "Polygon");
});
