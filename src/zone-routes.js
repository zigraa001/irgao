// Flight / restricted airspace zones for map overlays (2D footprint + altitude band).
const express = require("express");
const { zonesQuery } = require("./zones-db");
const { requireAuth } = require("./auth");
const { parseBoundsQuery, buildZonesSql } = require("./zone-geometry");

const router = express.Router();

function shapeZone(row) {
  let geometry = null;
  try {
    geometry = JSON.parse(row.geometry);
  } catch {
    geometry = null;
  }
  return {
    id: row.id,
    name: row.name,
    zoneType: row.zoneType,
    minAltitudeM: row.minAltitudeM,
    maxAltitudeM: row.maxAltitudeM,
    // Bounding box used by the client to cull sub-pixel zones without
    // re-parsing the polygon geometry on every redraw.
    minLat: row.minLat,
    maxLat: row.maxLat,
    minLng: row.minLng,
    maxLng: row.maxLng,
    geometry,
  };
}

async function queryZonesInBounds(bounds) {
  const { sql, params } = buildZonesSql(bounds);
  const rows = await zonesQuery(sql, params);
  return rows.map(shapeZone);
}

// GET /api/zones?swLat=&swLng=&neLat=&neLng=
// Returns only zones whose bounding box intersects the requested viewport.
// Passengers receive footprints only (no altitude bands). Operators/admins get full data.
router.get("/", requireAuth, async (req, res) => {
  const bounds = parseBoundsQuery(req.query);
  if (!bounds) {
    return res.status(400).json({
      error: "Viewport bounds required: swLat, swLng, neLat, neLng query parameters",
    });
  }

  let zones = await queryZonesInBounds(bounds);
  if (req.user.role === "customer") {
    zones = zones.map((z) => ({
      id: z.id,
      name: z.name,
      zoneType: z.zoneType,
      minLat: z.minLat,
      maxLat: z.maxLat,
      minLng: z.minLng,
      maxLng: z.maxLng,
      geometry: z.geometry,
    }));
  }

  res.json({ zones, bounds });
});

module.exports = router;
module.exports.shapeZone = shapeZone;
module.exports.queryZonesInBounds = queryZonesInBounds;
