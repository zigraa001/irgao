// Route feasibility check used at booking time.
//
// Decides whether a pickup→destination segment is flyable against the airspace
// catalog: does the great-circle path cross a no-fly zone, and is either
// endpoint inside one? When an endpoint is blocked we also compute up to three
// "nearest safe spots" just outside the blocking zone's bounding box so the
// customer can pick a legal pickup/drop instead of guessing.
//
// Zone loading is best-effort: if the zones database is unreachable we degrade
// to "feasible" rather than blocking every booking (the in-app map overlay
// still shows zones client-side). pointInPolygon / zonesAtPoint are reused from
// fuel-route so this stays consistent with the planner.
const { loadZones } = require("./route-routes");
const { planLeastFuelRoute, pointInPolygon } = require("./fuel-route");
const { haversineKm } = require("./pricing");

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

// Up to 3 nearest points just outside the blocking no-fly zone's bbox, verified
// to not fall inside any other no-fly zone in the loaded set.
function suggestSafeSpots(lat, lng, zones) {
  const blocking = zones.filter((z) => isNoFly(z, lat, lng));
  if (!blocking.length) return [];
  const margin = 0.01; // ~1.1 km nudge past the bbox edge
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
    // Zones DB unreachable — degrade to feasible (client map still shows zones).
    zones = [];
  }

  const plan = planLeastFuelRoute({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    service,
    zones,
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

  return {
    feasible: plan.feasible && !pickupBlocked && !destBlocked,
    violations: plan.violations,
    warnings: plan.warnings,
    blockedEndpoints,
  };
}

module.exports = { checkRouteFeasibility, suggestSafeSpots };
