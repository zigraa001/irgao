// India-wide flight zone catalog (simplified GeoJSON footprints for map overlay).
// Coordinates are [longitude, latitude]. Altitudes are metres AGL.
//
// no_fly     — airport / terminal control zones drawn as CIRCLES around the
//              runway point (illustrative, not official NOTAMs). ~0.035° ≈ 3–4 km.
// restricted — sensitive urban cores (illustrative boxes)

function box(swLng, swLat, neLng, neLat) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [swLng, swLat],
        [neLng, swLat],
        [neLng, neLat],
        [swLng, neLat],
        [swLng, swLat],
      ],
    ],
  };
}

/**
 * Circular airspace around a point — a `segments`-sided regular polygon
 * centred on (lng, lat) with radius `radiusDeg` (in latitude degrees, ≈ km at
 * mid-latitudes). The longitude spacing is divided by cos(lat) so the circle
 * looks round everywhere instead of squashed east–west at higher latitudes.
 */
function circleZone(lng, lat, radiusDeg = 0.035, segments = 36) {
  const latScale = Math.cos((lat * Math.PI) / 180) || 1;
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const ang = (i / segments) * 2 * Math.PI;
    const dx = (Math.cos(ang) * radiusDeg) / latScale;
    const dy = Math.sin(ang) * radiusDeg;
    ring.push([lng + dx, lat + dy]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

/** Circular no-fly zone around an airport. Kept under the old name so existing
 *  call sites keep working; returns a circle, not a square. */
function airportZone(lng, lat, radiusDeg = 0.035) {
  return circleZone(lng, lat, radiusDeg);
}

const INDIA_ZONES = [
  // ── No-fly: major airports (circular) ───────────────────────────────────
  { name: "Delhi IGI — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(77.1, 28.556) },
  { name: "Mumbai CSIA — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(72.868, 19.089) },
  { name: "Bengaluru KIAL — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(77.706, 13.199) },
  { name: "Chennai — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(80.169, 12.994) },
  { name: "Kolkata — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(88.446, 22.654) },
  { name: "Hyderabad RGIA — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(78.429, 17.24) },
  { name: "Kochi — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(76.392, 10.152) },
  { name: "Ahmedabad — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(72.635, 23.077) },
  { name: "Pune — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(73.91, 18.582) },
  { name: "Goa — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(73.832, 15.38) },
  { name: "Jaipur — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(75.806, 26.824) },
  { name: "Lucknow — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(80.889, 26.76) },
  { name: "Chandigarh — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(76.788, 30.674) },
  { name: "Srinagar — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(74.774, 33.987) },
  { name: "Guwahati — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(91.588, 26.106) },
  { name: "Bhubaneswar — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(85.818, 20.244) },
  { name: "Coimbatore — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(77.043, 11.03) },
  { name: "Nagpur — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(79.055, 21.092) },
  { name: "Varanasi — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(82.859, 25.452) },
  { name: "Amritsar — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(74.797, 31.71) },
  { name: "Thiruvananthapuram — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(76.92, 8.482) },
  { name: "Patna — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(85.089, 25.591) },
  { name: "Ranchi — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(85.321, 23.314) },
  { name: "Indore — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(75.801, 22.72) },
  { name: "Visakhapatnam — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(83.224, 17.721) },
  { name: "Solapur Airport — no-fly", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, geometry: airportZone(75.934, 17.628) },

  // ── Restricted: sensitive urban cores (circular, illustrative) ──────────
  { name: "New Delhi — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(77.215, 28.625, 0.045) },
  { name: "Mumbai South — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(72.845, 18.94, 0.04) },
  { name: "Bengaluru CBD — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(77.595, 12.975, 0.025) },
  { name: "Hyderabad Secretariat — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(78.48, 17.4, 0.022) },
  { name: "Chennai Marina — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(80.285, 13.06, 0.022) },
  { name: "Kolkata Maidan — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(88.35, 22.56, 0.022) },
  { name: "Solapur CBD — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, geometry: circleZone(75.91, 17.66, 0.03) },
];

module.exports = { INDIA_ZONES, box, airportZone, circleZone };
