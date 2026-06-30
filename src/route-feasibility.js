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

function suggestSafeSpots(lat, lng, zones) {
  const blocking = zones.filter((z) => isNoFly(z, lat, lng));
  if (!blocking.length) return [];
  const margin = 0.01;
  const candidates = [];
  for (const z of blocking) {
    candidates.push({ lat: z.maxLat + margin, lng: round5(lng), label: `just north of ${z.name}` });
    candidates.push({ lat: z.minLat - margin, lng: round5(lng), label: `just south of ${z.name}` });
    candidates.push({ lat: round5(lat), lng: z.maxLng + margin, label: `just east of ${z.name}` });
    candidates.push({ lat: round5(lat), lng: z.minLng - margin, label: `just west of ${z.name}` });
  }
  const safe = candidates.filter(
    (c) => !zones.some((z) => isNoFly(z, c.lat, c.lng))
  );
  for (const c of safe) {
    c.distanceKm = Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10;
  }
  safe.sort((a, b) => a.distanceKm - b.distanceKm);
  return safe.slice(0, 3).map((c) => ({
    lat: round5(c.lat),
    lng: round5(c.lng),
    name: c.label,
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
