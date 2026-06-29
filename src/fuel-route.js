// Least-fuel route planner (mock — uses zone altitude bands + distance).
//
// Picks a cruise altitude inside overlapping flight corridors that minimises
// modelled fuel burn, checks no-fly / restricted footprints along the path,
// and returns fuel estimates for operator dispatch (not shown to passengers).
const { haversineKm } = require("./pricing");

const SERVICE_FUEL = {
  taxi: { cruiseKgPerKm: 2.8, climbKgPerM: 0.12, optimalAltitudeM: 280 },
  golden: { cruiseKgPerKm: 4.2, climbKgPerM: 0.18, optimalAltitudeM: 350 },
  shuttle: { cruiseKgPerKm: 3.2, climbKgPerM: 0.14, optimalAltitudeM: 300 },
};

const ROUTE_SAMPLES = 24;

function pointInPolygon(lng, lat, geometry) {
  if (!geometry || geometry.type !== "Polygon" || !geometry.coordinates?.[0]) {
    return false;
  }
  const ring = geometry.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function zonesAtPoint(lng, lat, zones) {
  return zones.filter((z) => z.geometry && pointInPolygon(lng, lat, z.geometry));
}

function sampleRoutePoints(pickupLat, pickupLng, destLat, destLng, steps = ROUTE_SAMPLES) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      lat: pickupLat + t * (destLat - pickupLat),
      lng: pickupLng + t * (destLng - pickupLng),
    });
  }
  return points;
}

// Parabolic penalty vs optimal cruise altitude (lower = less fuel).
function altitudeFuelFactor(altitudeM, optimalM) {
  const delta = (altitudeM - optimalM) / 100;
  return 1 + 0.22 * delta * delta;
}

function corridorCruiseAltitude(zone, serviceProfile) {
  const span = zone.maxAltitudeM - zone.minAltitudeM;
  const midBand = zone.minAltitudeM + span * 0.55;
  const target = serviceProfile.optimalAltitudeM;
  return Math.round(
    Math.min(zone.maxAltitudeM, Math.max(zone.minAltitudeM, midBand))
  );
}

function pickCruiseAltitude(zones, pickup, dest, service) {
  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  const midLat = (pickup.lat + dest.lat) / 2;
  const midLng = (pickup.lng + dest.lng) / 2;

  const corridors = zones.filter((z) => z.zoneType === "flight_corridor");
  const candidates = [];

  for (const z of corridors) {
    const hitsMid = pointInPolygon(midLng, midLat, z.geometry);
    const hitsPickup = pointInPolygon(pickup.lng, pickup.lat, z.geometry);
    const hitsDest = pointInPolygon(dest.lng, dest.lat, z.geometry);
    if (!hitsMid && !hitsPickup && !hitsDest) continue;

    const alt = corridorCruiseAltitude(z, profile);
    const factor = altitudeFuelFactor(alt, profile.optimalAltitudeM);
    candidates.push({ zone: z, altitudeM: alt, factor });
  }

  if (!candidates.length) {
    const alt = profile.optimalAltitudeM;
    return { altitudeM: alt, corridor: null, factor: 1 };
  }

  candidates.sort((a, b) => a.factor - b.factor);
  const best = candidates[0];
  return {
    altitudeM: best.altitudeM,
    corridor: best.zone.name,
    factor: best.factor,
  };
}

function analyseRouteZones(points, zones, cruiseAltitudeM) {
  const violations = [];
  const warnings = [];
  let detourFactor = 1;

  for (const p of points) {
    const at = zonesAtPoint(p.lng, p.lat, zones);
    for (const z of at) {
      if (z.zoneType === "no_fly") {
        violations.push(`Route crosses no-fly zone: ${z.name}`);
      }
      if (z.zoneType === "restricted" && cruiseAltitudeM <= z.maxAltitudeM) {
        warnings.push(
          `Restricted airspace ${z.name}: climb above ${z.maxAltitudeM} m or reroute`
        );
        detourFactor = Math.max(detourFactor, 1.12);
      }
    }
  }

  const pickupZones = zonesAtPoint(points[0].lng, points[0].lat, zones);
  const destZones = zonesAtPoint(
    points[points.length - 1].lng,
    points[points.length - 1].lat,
    zones
  );
  for (const z of [...pickupZones, ...destZones]) {
    if (z.zoneType === "no_fly") {
      violations.push(`Endpoint inside no-fly zone: ${z.name}`);
    }
  }

  return { violations: [...new Set(violations)], warnings: [...new Set(warnings)], detourFactor };
}

function estimateFuelKg(service, distanceKm, cruiseAltitudeM, detourFactor = 1) {
  const profile = SERVICE_FUEL[service];
  if (!profile) throw new Error(`Unknown service: ${service}`);

  const dist = Math.max(0, distanceKm) * detourFactor;
  const altFactor = altitudeFuelFactor(cruiseAltitudeM, profile.optimalAltitudeM);
  const climbKg = cruiseAltitudeM * profile.climbKgPerM;
  const descentRecovery = climbKg * 0.28;
  const cruiseKg = dist * profile.cruiseKgPerKm * altFactor;

  return Math.round((climbKg + cruiseKg - descentRecovery) * 10) / 10;
}

/**
 * Plan a least-fuel path for a pickup → destination pair against zone catalog.
 * @returns {object} fuel plan (includes altitudeM for operator/admin only at API layer)
 */
function planLeastFuelRoute({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  service,
  zones = [],
}) {
  const pickup = { lat: pickupLat, lng: pickupLng };
  const dest = { lat: destLat, lng: destLng };
  const distanceKm =
    Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;

  const { altitudeM, corridor, factor } = pickCruiseAltitude(
    zones,
    pickup,
    dest,
    service
  );
  const points = sampleRoutePoints(pickupLat, pickupLng, destLat, destLng);
  const { violations, warnings, detourFactor } = analyseRouteZones(
    points,
    zones,
    altitudeM
  );

  const effectiveDistanceKm =
    Math.round(distanceKm * detourFactor * 10) / 10;
  const fuelKg = estimateFuelKg(service, distanceKm, altitudeM, detourFactor);
  const feasible = violations.length === 0;

  return {
    feasible,
    distanceKm,
    effectiveDistanceKm,
    detourFactor: Math.round(detourFactor * 100) / 100,
    cruiseAltitudeM: altitudeM,
    corridor: corridor || null,
    altitudeEfficiency: Math.round(factor * 100) / 100,
    fuelKg,
    fuelLiters: Math.round((fuelKg / 0.8) * 10) / 10,
    violations,
    warnings,
    algorithm: "least_fuel_v1",
  };
}

/** Strip altitude fields for passenger-facing responses. */
function publicFuelPlan(plan) {
  if (!plan) return plan;
  const {
    cruiseAltitudeM,
    corridor,
    altitudeEfficiency,
    fuelLiters,
    ...rest
  } = plan;
  return {
    ...rest,
    fuelEstimateKg: plan.fuelKg,
    note: "Fuel estimate only — cruise altitude withheld from passenger view.",
  };
}

module.exports = {
  SERVICE_FUEL,
  pointInPolygon,
  zonesAtPoint,
  planLeastFuelRoute,
  publicFuelPlan,
  estimateFuelKg,
};
