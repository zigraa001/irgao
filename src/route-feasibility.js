// Route feasibility check used at booking time.
//
// Uses the visibility-graph route planner to find a path that avoids no-fly
// zones. When an endpoint is inside a no-fly zone, suggests nearest safe spots
// computed algorithmically from zone boundary vertices (no hardcoded lists).
//
// Golden Hour (air ambulance) service can bypass no-fly restrictions when the
// admin toggle `emergencyNoFlyBypass` is enabled — the booking goes through
// with a warning instead of being blocked.
const { loadZones } = require("./route-routes");
const { planAvoidanceRoute } = require("./route-planner");
const { pointInPolygon } = require("./fuel-route");
const { haversineKm } = require("./pricing");
const { SERVICE_FUEL } = require("./fuel-route");
const platformSettings = require("./platform-settings");

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

// ── Algorithmic safe-spot finder ────────────────────────────────────────
// Projects outward from each boundary vertex of the blocking zone's polygon,
// picks the nearest points that land outside ALL no-fly zones, and labels
// them with compass direction relative to the zone centre.

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function bearing(lat1, lng1, lat2, lng2) {
  const dLng = lng2 - lng1;
  const dLat = lat2 - lat1;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return (angle + 360) % 360;
}
function compassLabel(deg) {
  return COMPASS[Math.round(deg / 45) % 8];
}

function suggestSafeSpots(lat, lng, zones) {
  const blocking = zones.filter((z) => isNoFly(z, lat, lng));
  if (!blocking.length) return [];

  const candidates = [];
  const MARGIN_DEG = 0.012;

  for (const z of blocking) {
    const baseName = cleanZoneName(z.name);
    const ring = z.geometry?.coordinates?.[0];
    if (!ring || ring.length < 4) continue;

    const n = ring.length - 1;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
    cx /= n; cy /= n;

    const step = Math.max(1, Math.floor(n / 16));
    for (let i = 0; i < n; i += step) {
      const vLng = ring[i][0], vLat = ring[i][1];
      const dx = vLng - cx, dy = vLat - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const sLng = round5(vLng + (dx / dist) * MARGIN_DEG);
      const sLat = round5(vLat + (dy / dist) * MARGIN_DEG);

      if (zones.some((oz) => isNoFly(oz, sLat, sLng))) continue;

      const dir = compassLabel(bearing(cy, cx, sLat, sLng));
      candidates.push({
        lat: sLat,
        lng: sLng,
        name: `${baseName} ${dir} Safe Spot`,
      });
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

  return unique.slice(0, 4).map((c) => ({
    lat: round5(c.lat),
    lng: round5(c.lng),
    name: c.name,
    distanceKm: c.distanceKm,
  }));
}

// ── Feasibility check ───────────────────────────────────────────────────

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

  const isEmergency = service === "golden";
  const bypassEnabled = platformSettings.get("emergencyNoFlyBypass");
  const emergencyBypass = isEmergency && bypassEnabled;

  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  const baseCruiseAltitudeM = profile.optimalAltitudeM;

  const zonesForPlanner = emergencyBypass ? [] : zones;

  const routePlan = planAvoidanceRoute({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    zones: zonesForPlanner,
    baseCruiseAltitudeM,
    service,
  });

  const pickupBlocked = zones.some((z) => isNoFly(z, pickupLat, pickupLng));
  const destBlocked = zones.some((z) => isNoFly(z, destLat, destLng));

  const blockedEndpoints = [];
  if (!emergencyBypass) {
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
  }

  const violations = [];
  const warnings = [];

  if (emergencyBypass && (pickupBlocked || destBlocked)) {
    const crossedNames = zones
      .filter((z) => isNoFly(z, pickupLat, pickupLng) || isNoFly(z, destLat, destLng))
      .map((z) => cleanZoneName(z.name));
    warnings.push(
      `Emergency bypass active — crossing no-fly zone${crossedNames.length > 1 ? "s" : ""}: ${crossedNames.join(", ")}. ` +
      "ATC clearance will be requested automatically."
    );
  }

  if (!emergencyBypass && !routePlan.feasible) {
    violations.push(
      routePlan.reason === "endpoint_in_no_fly"
        ? "Route starts or ends inside a no-fly zone"
        : "No safe route found — all paths cross no-fly zones"
    );
  }

  for (const seg of routePlan.segments) {
    for (const rz of seg.crossedRestricted) {
      warnings.push(
        `Restricted airspace ${rz.name}: climbing to ${seg.altitudeM} m (above ${rz.maxAltitudeM} m ceiling)`
      );
    }
  }
  const uniqueWarnings = [...new Set(warnings)];

  const feasible = emergencyBypass
    ? true
    : routePlan.feasible && !pickupBlocked && !destBlocked;

  return {
    feasible,
    emergencyBypass: emergencyBypass || false,
    violations,
    warnings: uniqueWarnings,
    blockedEndpoints,
    route: routePlan,
  };
}

module.exports = { checkRouteFeasibility, suggestSafeSpots };
