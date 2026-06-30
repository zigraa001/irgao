// Route feasibility check used at booking time.
//
// Uses the visibility-graph route planner to find a path that avoids no-fly
// zones. When an endpoint is inside a no-fly zone, suggests up to 3 nearest
// safe spots. Restricted zones are handled by altitude adjustments (fly above
// maxAltitudeM) rather than rerouting.
//
// Zone loading is best-effort: if the zones database is unreachable we degrade
// to "feasible" rather than blocking every booking.
const { loadZones } = require("./route-routes");
const { planAvoidanceRoute } = require("./route-planner");
const { pointInPolygon } = require("./fuel-route");
const { haversineKm } = require("./pricing");
const { SERVICE_FUEL } = require("./fuel-route");

function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

function isNoFly(z, lat, lng) {
  return (
    z.zoneType === "no_fly" &&
    z.geometry &&
    pointInPolygon(lng, lat, z.geometry)
  );
}

function cleanZoneName(name) {
  return (name || "").replace(/\s*[-—–]\s*no[_-]?fly\s*/gi, "").trim();
}

const VERTIPORT_SUGGESTIONS = {
  "Delhi IGI": [
    { lat: 28.5830, lng: 77.0780, name: "Dwarka Sector 21 Helipad" },
    { lat: 28.5260, lng: 77.1080, name: "Mahipalpur Vertiport" },
    { lat: 28.5700, lng: 77.1200, name: "Vasant Kunj Vertiport" },
  ],
  "Mumbai CSIA": [
    { lat: 19.1150, lng: 72.8700, name: "Andheri Vertiport" },
    { lat: 19.0650, lng: 72.8400, name: "BKC Helipad" },
    { lat: 19.0700, lng: 72.9000, name: "Powai Vertiport" },
  ],
  "Bengaluru KIAL": [
    { lat: 13.1700, lng: 77.6800, name: "Yelahanka Vertiport" },
    { lat: 13.2200, lng: 77.7300, name: "Devanahalli Vertiport" },
  ],
  "Chennai": [
    { lat: 13.0200, lng: 80.1850, name: "Pallavaram Vertiport" },
    { lat: 12.9700, lng: 80.1950, name: "Tambaram Vertiport" },
  ],
};

function suggestSafeSpots(lat, lng, zones) {
  const blocking = zones.filter((z) => isNoFly(z, lat, lng));
  if (!blocking.length) return [];

  const candidates = [];

  for (const z of blocking) {
    const baseName = cleanZoneName(z.name);
    const known = Object.entries(VERTIPORT_SUGGESTIONS).find(
      ([key]) => baseName.toLowerCase().includes(key.toLowerCase())
    );
    if (known) {
      for (const v of known[1]) {
        if (!zones.some((oz) => isNoFly(oz, v.lat, v.lng))) {
          candidates.push({ ...v });
        }
      }
    }

    if (candidates.length < 3) {
      const margin = 0.015;
      const ring = z.geometry?.coordinates?.[0];
      let cLat = lat, cLng = lng;
      if (ring) {
        const n = ring.length - 1;
        let sx = 0, sy = 0;
        for (let i = 0; i < n; i++) { sx += ring[i][0]; sy += ring[i][1]; }
        cLng = sx / n; cLat = sy / n;
      }
      const dirs = [
        { dLat: margin, dLng: 0, dir: "North" },
        { dLat: -margin, dLng: 0, dir: "South" },
        { dLat: 0, dLng: margin, dir: "East" },
        { dLat: 0, dLng: -margin, dir: "West" },
      ];
      for (const d of dirs) {
        const sLat = round5(cLat + d.dLat);
        const sLng = round5(cLng + d.dLng);
        if (!zones.some((oz) => isNoFly(oz, sLat, sLng))) {
          candidates.push({ lat: sLat, lng: sLng, name: `${baseName} ${d.dir} Vertiport` });
        }
      }
    }
  }

  for (const c of candidates) {
    c.distanceKm = Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10;
  }
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);

  const seen = new Set();
  const unique = candidates.filter((c) => {
    const key = c.lat + "," + c.lng;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 3).map((c) => ({
    lat: round5(c.lat),
    lng: round5(c.lng),
    name: c.name,
    distanceKm: c.distanceKm,
  }));
}

async function checkRouteFeasibility({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  service,
}) {
  let zones = [];
  try {
    zones = await loadZones(pickupLat, pickupLng, destLat, destLng);
  } catch {
    zones = [];
  }

  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  const baseCruiseAltitudeM = profile.optimalAltitudeM;

  const routePlan = planAvoidanceRoute({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    zones,
    baseCruiseAltitudeM,
    service,
  });

  const pickupBlocked = zones.some((z) => isNoFly(z, pickupLat, pickupLng));
  const destBlocked = zones.some((z) => isNoFly(z, destLat, destLng));

  const blockedEndpoints = [];
  if (pickupBlocked) {
    blockedEndpoints.push({
      which: "pickup",
      message: "Pickup is inside a no-fly zone. Choose a nearby spot.",
      suggestions: suggestSafeSpots(pickupLat, pickupLng, zones),
    });
  }
  if (destBlocked) {
    blockedEndpoints.push({
      which: "destination",
      message: "Destination is inside a no-fly zone. Choose a nearby spot.",
      suggestions: suggestSafeSpots(destLat, destLng, zones),
    });
  }

  const violations = [];
  const warnings = [];

  if (!routePlan.feasible) {
    violations.push(
      routePlan.reason === "endpoint_in_no_fly"
        ? "Route starts or ends inside a no-fly zone"
        : "No safe route found — all paths cross no-fly zones"
    );
  }

  // Collect restricted zone warnings from the altitude profile.
  for (const seg of routePlan.segments) {
    for (const rz of seg.crossedRestricted) {
      warnings.push(
        `Restricted airspace ${rz.name}: climbing to ${seg.altitudeM} m (above ${rz.maxAltitudeM} m ceiling)`
      );
    }
  }
  const uniqueWarnings = [...new Set(warnings)];

  return {
    feasible: routePlan.feasible && !pickupBlocked && !destBlocked,
    violations,
    warnings: uniqueWarnings,
    blockedEndpoints,
    route: routePlan,
  };
}

module.exports = { checkRouteFeasibility, suggestSafeSpots };
