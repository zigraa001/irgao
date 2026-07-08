// Flight / restricted airspace zones for map overlays (2D footprint + altitude band).
const express = require("express");
const { zonesQuery } = require("./zones-db");
const { requireAuth } = require("./auth");
const { parseBoundsQuery, buildZonesSql } = require("./zone-geometry");
const {
  ZONE_TYPE_LEGENDS,
  ZONE_CATEGORY_LEGENDS,
  ALTITUDE_BANDS,
  getZoneLegend,
} = require("./zone-legends");

const router = express.Router();

function shapeZone(row) {
  let geometry = null;
  try {
    geometry = JSON.parse(row.geometry);
  } catch {
    geometry = null;
  }
  const legend = getZoneLegend(row.zoneType, row.category);
  return {
    id: row.id,
    name: row.name,
    zoneType: row.zoneType,
    category: row.category || null,
    minAltitudeM: row.minAltitudeM,
    maxAltitudeM: row.maxAltitudeM,
    minLat: row.minLat,
    maxLat: row.maxLat,
    minLng: row.minLng,
    maxLng: row.maxLng,
    geometry,
    legend,
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

  // Airspace overlays are non-critical: if the zones catalog (a separate
  // database) is unreachable, degrade to an empty overlay instead of a 500
  // that spams the client console. The error is logged by zonesQuery.
  let zones;
  try {
    zones = await queryZonesInBounds(bounds);
  } catch (err) {
    return res.json({ zones: [], bounds, degraded: true });
  }

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

// GET /api/zones/legends — map legend definitions (zone types, categories,
// altitude bands) so the frontend can render a legend without hardcoding.
// Public (no auth) — the legend is static metadata, not user data.
router.get("/legends", (req, res) => {
  res.json({
    zoneTypes: ZONE_TYPE_LEGENDS,
    categories: ZONE_CATEGORY_LEGENDS,
    altitudeBands: ALTITUDE_BANDS,
  });
});

module.exports = router;
module.exports.shapeZone = shapeZone;
module.exports.queryZonesInBounds = queryZonesInBounds;
