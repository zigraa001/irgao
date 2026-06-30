// Bounding-box helpers for flight-zone queries (viewport / route envelopes).

function bboxFromGeometry(geometry) {
  if (
    !geometry ||
    geometry.type !== "Polygon" ||
    !geometry.coordinates ||
    !geometry.coordinates[0]
  ) {
    return null;
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of geometry.coordinates[0]) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

function parseBoundsQuery(query) {
  const swLat = Number(query.swLat);
  const swLng = Number(query.swLng);
  const neLat = Number(query.neLat);
  const neLng = Number(query.neLng);
  if (
    !Number.isFinite(swLat) ||
    !Number.isFinite(swLng) ||
    !Number.isFinite(neLat) ||
    !Number.isFinite(neLng)
  ) {
    return null;
  }
  if (swLat > neLat || swLng > neLng) return null;
  return { swLat, swLng, neLat, neLng };
}

function routeEnvelope(pickupLat, pickupLng, destLat, destLng, padDeg = 0.2) {
  return {
    swLat: Math.min(pickupLat, destLat) - padDeg,
    swLng: Math.min(pickupLng, destLng) - padDeg,
    neLat: Math.max(pickupLat, destLat) + padDeg,
    neLng: Math.max(pickupLng, destLng) + padDeg,
  };
}

// Cap the number of zones returned per viewport so a whole-India pan at low
// zoom can't pull the entire catalog (and force the client to draw hundreds of
// polygons). 240 is comfortably above any realistic city-view count while
// bounding DB + render cost.
const ZONES_QUERY_LIMIT = 240;

function buildZonesSql(bounds) {
  return {
    sql: `SELECT id, name, zoneType, category, minAltitudeM, maxAltitudeM, geometry,
                 minLat, maxLat, minLng, maxLng
          FROM flight_zones
          WHERE maxLat >= ? AND minLat <= ? AND maxLng >= ? AND minLng <= ?
          ORDER BY zoneType, name
          LIMIT ?`,
    params: [
      bounds.swLat,
      bounds.neLat,
      bounds.swLng,
      bounds.neLng,
      ZONES_QUERY_LIMIT,
    ],
  };
}

module.exports = {
  bboxFromGeometry,
  parseBoundsQuery,
  routeEnvelope,
  buildZonesSql,
  ZONES_QUERY_LIMIT,
};
