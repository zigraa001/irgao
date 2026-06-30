// India-wide flight zone catalog (simplified GeoJSON footprints for map overlay).
// Coordinates are [longitude, latitude]. Altitudes are metres AGL.
//
// Zone types:
//   no_fly      — absolute prohibition at all altitudes (airports, nuclear, military bases)
//   restricted  — conditional: allowed above maxAltitudeM (urban cores, government,
//                 wildlife sanctuaries, cantonments)

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

function airportZone(lng, lat, radiusDeg = 0.035) {
  return circleZone(lng, lat, radiusDeg);
}

const INDIA_ZONES = [
  // ═══════════════════════════════════════════════════════════════════════
  // NO-FLY: Major Airports (CTR — Control Zone)
  // Radius ~3-4 km. All altitudes blocked (0 – 914 m / 3000 ft AGL).
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Delhi IGI", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(77.1, 28.556) },
  { name: "Mumbai CSIA", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(72.868, 19.089) },
  { name: "Bengaluru KIAL", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(77.706, 13.199) },
  { name: "Chennai", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(80.169, 12.994) },
  { name: "Kolkata", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(88.446, 22.654) },
  { name: "Hyderabad RGIA", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(78.429, 17.24) },
  { name: "Kochi", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(76.392, 10.152) },
  { name: "Ahmedabad", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(72.635, 23.077) },
  { name: "Pune", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(73.91, 18.582) },
  { name: "Goa", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(73.832, 15.38) },
  { name: "Jaipur", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(75.806, 26.824) },
  { name: "Lucknow", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(80.889, 26.76) },
  { name: "Chandigarh", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(76.788, 30.674) },
  { name: "Srinagar", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(74.774, 33.987) },
  { name: "Guwahati", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(91.588, 26.106) },
  { name: "Bhubaneswar", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(85.818, 20.244) },
  { name: "Coimbatore", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(77.043, 11.03) },
  { name: "Nagpur", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(79.055, 21.092) },
  { name: "Varanasi", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(82.859, 25.452) },
  { name: "Amritsar", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(74.797, 31.71) },
  { name: "Thiruvananthapuram", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(76.92, 8.482) },
  { name: "Patna", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(85.089, 25.591) },
  { name: "Ranchi", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(85.321, 23.314) },
  { name: "Indore", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(75.801, 22.72) },
  { name: "Visakhapatnam", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(83.224, 17.721) },
  { name: "Solapur Airport", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "airport", geometry: airportZone(75.934, 17.628) },

  // ═══════════════════════════════════════════════════════════════════════
  // NO-FLY: Military Air Force Bases
  // Active runways — absolute no-fly at all altitudes.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Hindon AFB", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(77.364, 28.708, 0.04) },
  { name: "Tambaram AFB (Chennai)", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(80.124, 12.908, 0.03) },
  { name: "Yelahanka AFB (Bengaluru)", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(77.606, 13.136, 0.03) },
  { name: "Lohegaon AFB (Pune)", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(73.921, 18.583, 0.03) },
  { name: "Jodhpur AFB", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(73.049, 26.251, 0.04) },
  { name: "Jamnagar AFB", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(70.012, 22.465, 0.03) },
  { name: "Agra AFB", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(77.961, 27.157, 0.03) },
  { name: "Halwara AFB (Punjab)", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(75.764, 30.744, 0.03) },
  { name: "Pathankot AFB", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(75.634, 32.234, 0.03) },
  { name: "INS Hansa (Goa Naval Air)", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 914, category: "military_airbase", geometry: airportZone(73.839, 15.392, 0.025) },

  // ═══════════════════════════════════════════════════════════════════════
  // NO-FLY: Nuclear Facilities
  // AERB (Atomic Energy Regulatory Board) mandated exclusion zones.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "BARC Trombay", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(72.925, 19.012, 0.025) },
  { name: "Tarapur Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(72.668, 19.831, 0.03) },
  { name: "Kalpakkam Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(80.176, 12.564, 0.03) },
  { name: "Kakrapar Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(73.35, 21.236, 0.03) },
  { name: "Rawatbhata Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(75.585, 24.881, 0.03) },
  { name: "Kudankulam Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(77.733, 8.168, 0.03) },
  { name: "Narora Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(78.399, 28.517, 0.025) },
  { name: "Kaiga Nuclear Plant", zoneType: "no_fly", minAltitudeM: 0, maxAltitudeM: 1500, category: "nuclear", geometry: circleZone(74.434, 14.854, 0.03) },

  // ═══════════════════════════════════════════════════════════════════════
  // RESTRICTED: Government / Parliament / Rashtrapati Bhavan
  // Flight allowed above maxAltitudeM (300 m). Overfly permitted at cruise.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Parliament House / Raisina Hill — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 450, category: "government", geometry: circleZone(77.208, 28.617, 0.015) },
  { name: "Rashtrapati Bhavan — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 450, category: "government", geometry: circleZone(77.199, 28.614, 0.01) },
  { name: "South Block / North Block (MoD) — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 400, category: "government", geometry: circleZone(77.21, 28.613, 0.008) },
  { name: "Maharashtra Vidhan Bhavan (Mumbai) — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "government", geometry: circleZone(72.829, 18.928, 0.008) },
  { name: "Vidhana Soudha (Bengaluru) — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "government", geometry: circleZone(77.592, 12.979, 0.008) },

  // ═══════════════════════════════════════════════════════════════════════
  // RESTRICTED: Military Cantonments
  // Ground-level restriction; overfly permitted above ceiling.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Delhi Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(77.168, 28.594, 0.025) },
  { name: "Pune Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(73.893, 18.51, 0.02) },
  { name: "Secunderabad Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(78.503, 17.45, 0.02) },
  { name: "Bengaluru Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(77.605, 12.993, 0.015) },
  { name: "Lucknow Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(80.91, 26.847, 0.018) },
  { name: "Mhow Cantonment — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(75.762, 22.554, 0.015) },
  { name: "Wellington Cantonment (Nilgiris) — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 350, category: "cantonment", geometry: circleZone(76.786, 11.364, 0.012) },

  // ═══════════════════════════════════════════════════════════════════════
  // RESTRICTED: Wildlife Sanctuaries / National Parks
  // Low-altitude restriction to protect fauna from rotor/noise disturbance.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Jim Corbett National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(78.72, 29.35, 79.25, 29.72) },
  { name: "Ranthambore National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(76.30, 25.90, 76.65, 26.10) },
  { name: "Kaziranga National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(93.00, 26.50, 93.70, 26.80) },
  { name: "Gir National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(70.70, 21.00, 71.20, 21.30) },
  { name: "Sundarbans National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(88.60, 21.80, 89.10, 22.10) },
  { name: "Bandipur National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(76.15, 11.58, 76.65, 11.85) },
  { name: "Periyar Wildlife Sanctuary — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(76.90, 9.30, 77.30, 9.60) },
  { name: "Kanha National Park — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 500, category: "wildlife", geometry: box(80.45, 22.20, 81.10, 22.60) },

  // ═══════════════════════════════════════════════════════════════════════
  // RESTRICTED: Sensitive Urban Cores
  // Dense population — noise/safety limit below maxAltitudeM.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "New Delhi — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(77.215, 28.625, 0.045) },
  { name: "Mumbai South — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(72.845, 18.94, 0.04) },
  { name: "Bengaluru CBD — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(77.595, 12.975, 0.025) },
  { name: "Hyderabad Secretariat — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(78.48, 17.4, 0.022) },
  { name: "Chennai Marina — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(80.285, 13.06, 0.022) },
  { name: "Kolkata Maidan — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(88.35, 22.56, 0.022) },
  { name: "Solapur CBD — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(75.91, 17.66, 0.03) },
  { name: "Jaipur Old City — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(75.824, 26.924, 0.02) },
  { name: "Varanasi Ghats — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(83.012, 25.313, 0.018) },
  { name: "Ahmedabad Old City — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 300, category: "urban_core", geometry: circleZone(72.588, 23.025, 0.02) },

  // ═══════════════════════════════════════════════════════════════════════
  // RESTRICTED: Border Security Zones
  // International border buffer — DGCA-mandated restriction.
  // ═══════════════════════════════════════════════════════════════════════
  { name: "Wagah-Attari Border Zone — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 600, category: "border", geometry: box(74.50, 31.55, 74.70, 31.65) },
  { name: "Pokhran Range — restricted", zoneType: "restricted", minAltitudeM: 0, maxAltitudeM: 1500, category: "military_range", geometry: box(71.50, 26.80, 72.10, 27.20) },
];

module.exports = { INDIA_ZONES, box, airportZone, circleZone };
