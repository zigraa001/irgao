const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  bboxFromGeometry,
  parseBoundsQuery,
  buildZonesSql,
} = require("../src/zone-geometry");

test("bboxFromGeometry computes envelope", () => {
  const bbox = bboxFromGeometry({
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
  });
  assert.deepEqual(bbox, {
    minLat: 17.63,
    maxLat: 17.69,
    minLng: 75.88,
    maxLng: 75.94,
  });
});

test("parseBoundsQuery rejects invalid viewport", () => {
  assert.equal(parseBoundsQuery({}), null);
  assert.equal(
    parseBoundsQuery({ swLat: 18, swLng: 75, neLat: 17, neLng: 76 }),
    null
  );
});

test("buildZonesSql filters by bounding-box intersection and caps results", () => {
  const { sql, params } = buildZonesSql({
    swLat: 17.5,
    swLng: 75.7,
    neLat: 17.8,
    neLng: 76.1,
  });
  assert.match(sql, /maxLat >= \?/);
  assert.match(sql, /LIMIT \?/);
  assert.deepEqual(params, [17.5, 17.8, 75.7, 76.1, 240]);
});
