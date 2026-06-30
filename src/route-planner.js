// Least-fuel route planner for air taxis.
//
// Builds a visibility graph where:
//   - No-fly zones are hard blocks: edges cannot cross them at any altitude.
//   - Restricted zones are soft blocks: edges CAN cross them, but at a higher
//     altitude (above the zone ceiling), which costs more fuel for climb.
//   - Boundary vertices of restricted zones are added so the algorithm can
//     also choose to ROUTE AROUND them at base cruise altitude.
//
// Dijkstra edge weights are FUEL COST (kg), not distance. This means the
// algorithm automatically decides "fly over at 450 m (more climb fuel)" vs.
// "detour 8 km around at 280 m (more cruise fuel)" — whichever burns less.
//
// The fuel model uses SERVICE_FUEL profiles from fuel-route.js:
//   cruiseKgPerKm — fuel per km at optimal altitude
//   climbKgPerM   — fuel per metre of altitude gain
//   optimalAltitudeM — sweet spot for cruise efficiency

const { haversineKm } = require("./pricing");
const { pointInPolygon, SERVICE_FUEL } = require("./fuel-route");

const MARGIN_DEG = 0.005; // ~550 m buffer outside zone boundaries
const MAX_GRAPH_NODES = 80;
const DESCENT_RECOVERY = 0.28; // 28% energy recovery on descent

// ── Geometry helpers ─────────────────────────────────────────────────────

function segmentIntersectsPolygon(ax, ay, bx, by, ring) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cx = ring[i][0], cy = ring[i][1];
    const dx = ring[j][0], dy = ring[j][1];
    if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true;
  }
  return false;
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSegment(ax, ay, bx, by, px, py) {
  return (
    Math.min(ax, bx) <= px + 1e-9 && px <= Math.max(ax, bx) + 1e-9 &&
    Math.min(ay, by) <= py + 1e-9 && py <= Math.max(ay, by) + 1e-9
  );
}

function midpoint(ax, ay, bx, by) {
  return [(ax + bx) / 2, (ay + by) / 2];
}

function segmentCrossesNoFly(lng1, lat1, lng2, lat2, noFlyZones) {
  for (const z of noFlyZones) {
    if (!z.geometry?.coordinates?.[0]) continue;
    const ring = z.geometry.coordinates[0];
    if (segmentIntersectsPolygon(lng1, lat1, lng2, lat2, ring)) return true;
    const [mx, my] = midpoint(lng1, lat1, lng2, lat2);
    if (pointInPolygon(mx, my, z.geometry)) return true;
  }
  return false;
}

// Which restricted zones does a segment cross? Returns list with required
// altitude for each (zone ceiling + 50 m buffer).
function segmentRestrictedZones(lng1, lat1, lng2, lat2, restrictedZones) {
  const crossed = [];
  for (const z of restrictedZones) {
    if (!z.geometry?.coordinates?.[0]) continue;
    const ring = z.geometry.coordinates[0];
    const [mx, my] = midpoint(lng1, lat1, lng2, lat2);
    const hits =
      segmentIntersectsPolygon(lng1, lat1, lng2, lat2, ring) ||
      pointInPolygon(mx, my, z.geometry) ||
      pointInPolygon(lng1, lat1, z.geometry) ||
      pointInPolygon(lng2, lat2, z.geometry);
    if (hits) {
      crossed.push({ zone: z, requiredAltitudeM: z.maxAltitudeM + 50 });
    }
  }
  return crossed;
}

function inflateVertex(lng, lat, centroidLng, centroidLat) {
  const dx = lng - centroidLng;
  const dy = lat - centroidLat;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return [lng + (dx / dist) * MARGIN_DEG, lat + (dy / dist) * MARGIN_DEG];
}

function polygonCentroid(ring) {
  let cx = 0, cy = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
  return [cx / n, cy / n];
}

// ── Fuel cost model ──────────────────────────────────────────────────────

// Parabolic penalty when cruising away from optimal altitude.
function altitudeFuelFactor(altitudeM, optimalM) {
  const delta = (altitudeM - optimalM) / 100;
  return 1 + 0.22 * delta * delta;
}

// Fuel cost (kg) for flying `distanceKm` at `altitudeM` for a given service.
// Includes climb cost from ground and partial descent recovery.
function segmentFuelKg(service, distanceKm, altitudeM) {
  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  const factor = altitudeFuelFactor(altitudeM, profile.optimalAltitudeM);
  const cruiseKg = distanceKm * profile.cruiseKgPerKm * factor;
  return cruiseKg;
}

// Extra fuel for climbing from baseAltitudeM to targetAltitudeM (one-way).
function climbFuelKg(service, baseAltitudeM, targetAltitudeM) {
  if (targetAltitudeM <= baseAltitudeM) return 0;
  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  const climbM = targetAltitudeM - baseAltitudeM;
  const climbCost = climbM * profile.climbKgPerM;
  const descentSaving = climbCost * DESCENT_RECOVERY;
  return climbCost - descentSaving;
}

// Total fuel for an edge: cruise cost + climb penalty if restricted zone
// forces a higher altitude.
function edgeFuelKg(service, distanceKm, baseCruiseAltitudeM, crossedRestricted) {
  if (!crossedRestricted.length) {
    return segmentFuelKg(service, distanceKm, baseCruiseAltitudeM);
  }
  // Must climb above the highest restricted zone ceiling along this edge.
  let requiredAlt = baseCruiseAltitudeM;
  for (const cr of crossedRestricted) {
    requiredAlt = Math.max(requiredAlt, cr.requiredAltitudeM);
  }
  const cruise = segmentFuelKg(service, distanceKm, requiredAlt);
  const climb = climbFuelKg(service, baseCruiseAltitudeM, requiredAlt);
  return cruise + climb;
}

// ── Visibility graph construction ────────────────────────────────────────

function buildFuelGraph(startLng, startLat, endLng, endLat, zones, service, baseCruiseAltitudeM) {
  const noFlyZones = zones.filter((z) => z.zoneType === "no_fly" && z.geometry);
  const restrictedZones = zones.filter((z) => z.zoneType === "restricted" && z.geometry);
  const obstacleZones = [...noFlyZones, ...restrictedZones];

  const nodes = [
    { id: 0, lng: startLng, lat: startLat, label: "start" },
    { id: 1, lng: endLng, lat: endLat, label: "end" },
  ];

  // Add inflated boundary vertices from no-fly zones (must route around).
  for (const z of noFlyZones) {
    if (!z.geometry?.coordinates?.[0]) continue;
    const ring = z.geometry.coordinates[0];
    const [cx, cy] = polygonCentroid(ring);
    const n = ring.length - 1;
    const step = Math.max(1, Math.floor(n / 12));
    for (let i = 0; i < n; i += step) {
      const [ilng, ilat] = inflateVertex(ring[i][0], ring[i][1], cx, cy);
      if (noFlyZones.some((oz) => oz !== z && oz.geometry && pointInPolygon(ilng, ilat, oz.geometry))) continue;
      nodes.push({ id: nodes.length, lng: ilng, lat: ilat, label: z.name });
    }
    if (nodes.length > MAX_GRAPH_NODES) break;
  }

  // Add inflated boundary vertices from restricted zones too, so the
  // algorithm has the option to go AROUND them at base cruise altitude
  // instead of flying through at higher altitude.
  for (const z of restrictedZones) {
    if (!z.geometry?.coordinates?.[0]) continue;
    const ring = z.geometry.coordinates[0];
    const [cx, cy] = polygonCentroid(ring);
    const n = ring.length - 1;
    const step = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += step) {
      const [ilng, ilat] = inflateVertex(ring[i][0], ring[i][1], cx, cy);
      if (noFlyZones.some((oz) => oz.geometry && pointInPolygon(ilng, ilat, oz.geometry))) continue;
      nodes.push({ id: nodes.length, lng: ilng, lat: ilat, label: z.name });
    }
    if (nodes.length > MAX_GRAPH_NODES) break;
  }

  // Build adjacency with FUEL COST as edge weight.
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];

      // Hard block: no-fly zones cannot be crossed.
      if (segmentCrossesNoFly(a.lng, a.lat, b.lng, b.lat, noFlyZones)) continue;

      const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
      const crossedRestricted = segmentRestrictedZones(a.lng, a.lat, b.lng, b.lat, restrictedZones);
      const fuelKg = edgeFuelKg(service, distKm, baseCruiseAltitudeM, crossedRestricted);

      // Determine altitude for this edge.
      let altitudeM = baseCruiseAltitudeM;
      for (const cr of crossedRestricted) {
        altitudeM = Math.max(altitudeM, cr.requiredAltitudeM);
      }

      const edge = { to: -1, fuelKg, distKm, altitudeM, crossedRestricted };
      adj.get(a.id).push({ ...edge, to: b.id });
      adj.get(b.id).push({ ...edge, to: a.id });
    }
  }

  return { nodes, adj, noFlyZones, restrictedZones };
}

// ── Dijkstra (fuel-weighted) ─────────────────────────────────────────────

function dijkstraFuel(nodes, adj, startId, endId) {
  const cost = new Map();
  const prev = new Map();
  const edgeUsed = new Map();
  const visited = new Set();

  for (const n of nodes) cost.set(n.id, Infinity);
  cost.set(startId, 0);

  while (true) {
    let u = -1, uCost = Infinity;
    for (const [id, c] of cost) {
      if (!visited.has(id) && c < uCost) { u = id; uCost = c; }
    }
    if (u === -1 || u === endId) break;
    visited.add(u);

    for (const edge of (adj.get(u) || [])) {
      const alt = uCost + edge.fuelKg;
      if (alt < cost.get(edge.to)) {
        cost.set(edge.to, alt);
        prev.set(edge.to, u);
        edgeUsed.set(edge.to, edge);
      }
    }
  }

  if (!Number.isFinite(cost.get(endId))) return null;

  const path = [];
  const edges = [];
  let cur = endId;
  while (cur !== undefined) {
    path.unshift(cur);
    if (edgeUsed.has(cur)) edges.unshift(edgeUsed.get(cur));
    cur = prev.get(cur);
  }
  return { path, edges, totalFuelKg: Math.round(cost.get(endId) * 10) / 10 };
}

// ── Build segments with altitude profile ─────────────────────────────────

function buildSegments(waypoints, edges, baseCruiseAltitudeM) {
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const edge = edges[i] || {};
    segments.push({
      from: { lat: a.lat, lng: a.lng },
      to: { lat: b.lat, lng: b.lng },
      distanceKm: Math.round((edge.distKm || haversineKm(a.lat, a.lng, b.lat, b.lng)) * 10) / 10,
      fuelKg: Math.round((edge.fuelKg || 0) * 10) / 10,
      altitudeM: Math.round(edge.altitudeM || baseCruiseAltitudeM),
      crossedRestricted: (edge.crossedRestricted || []).map((cr) => ({
        name: cr.zone.name,
        category: cr.zone.category || null,
        maxAltitudeM: cr.zone.maxAltitudeM,
        requiredAltitudeM: cr.requiredAltitudeM,
      })),
    });
  }
  return segments;
}

// ── Altitude profile summary ─────────────────────────────────────────────

function buildAltitudeProfile(segments, baseCruiseAltitudeM) {
  if (!segments.length) return { min: baseCruiseAltitudeM, max: baseCruiseAltitudeM, transitions: [] };
  const transitions = [];
  let prevAlt = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.altitudeM !== prevAlt) {
      transitions.push({
        atSegment: i,
        from: prevAlt || 0,
        to: seg.altitudeM,
        reason: seg.crossedRestricted.length
          ? `Climbing above ${seg.crossedRestricted.map((r) => r.name).join(", ")}`
          : i === 0 ? "Takeoff climb" : "Returning to cruise altitude",
      });
      prevAlt = seg.altitudeM;
    }
  }
  return {
    min: Math.min(...segments.map((s) => s.altitudeM)),
    max: Math.max(...segments.map((s) => s.altitudeM)),
    baseCruiseM: baseCruiseAltitudeM,
    transitions,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────

function planAvoidanceRoute({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  zones,
  baseCruiseAltitudeM,
  service,
}) {
  service = service || "taxi";
  const profile = SERVICE_FUEL[service] || SERVICE_FUEL.taxi;
  baseCruiseAltitudeM = baseCruiseAltitudeM || profile.optimalAltitudeM;

  const noFlyZones = zones.filter((z) => z.zoneType === "no_fly" && z.geometry);
  const restrictedZones = zones.filter((z) => z.zoneType === "restricted" && z.geometry);

  const pickupInsideNoFly = noFlyZones.some((z) =>
    pointInPolygon(pickupLng, pickupLat, z.geometry)
  );
  const destInsideNoFly = noFlyZones.some((z) =>
    pointInPolygon(destLng, destLat, z.geometry)
  );

  const directKm = Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;

  if (pickupInsideNoFly || destInsideNoFly) {
    return {
      feasible: false,
      reason: "endpoint_in_no_fly",
      waypoints: [],
      segments: [],
      altitudeProfile: { min: 0, max: 0, transitions: [] },
      totalDistanceKm: directKm,
      directDistanceKm: directKm,
      totalFuelKg: 0,
      directFuelKg: 0,
      fuelSavingKg: 0,
      detourRatio: 1,
      algorithm: "least_fuel_dijkstra_v2",
    };
  }

  // Check if direct path crosses any no-fly zone.
  const directCrossesNoFly = segmentCrossesNoFly(
    pickupLng, pickupLat, destLng, destLat, noFlyZones
  );

  // Check if direct path crosses any restricted zone.
  const directCrossedRestricted = segmentRestrictedZones(
    pickupLng, pickupLat, destLng, destLat, restrictedZones
  );

  // Direct fuel: what it would cost to fly straight (at whatever altitude).
  const directFuelKg = Math.round(
    edgeFuelKg(service, directKm, baseCruiseAltitudeM, directCrossedRestricted) * 10
  ) / 10;

  // Fast path: no no-fly zones in the way AND no restricted zones either
  // → straight line at base cruise altitude is optimal.
  if (!directCrossesNoFly && !directCrossedRestricted.length) {
    const waypoints = [
      { lat: pickupLat, lng: pickupLng, label: "pickup" },
      { lat: destLat, lng: destLng, label: "destination" },
    ];
    const segments = [{
      from: { lat: pickupLat, lng: pickupLng },
      to: { lat: destLat, lng: destLng },
      distanceKm: directKm,
      fuelKg: directFuelKg,
      altitudeM: baseCruiseAltitudeM,
      crossedRestricted: [],
    }];
    return {
      feasible: true,
      reason: "direct_clear",
      waypoints,
      segments,
      altitudeProfile: buildAltitudeProfile(segments, baseCruiseAltitudeM),
      totalDistanceKm: directKm,
      directDistanceKm: directKm,
      totalFuelKg: directFuelKg,
      directFuelKg,
      fuelSavingKg: 0,
      detourRatio: 1,
      algorithm: "least_fuel_dijkstra_v2",
    };
  }

  // Build fuel-weighted visibility graph and run Dijkstra.
  const { nodes, adj } = buildFuelGraph(
    pickupLng, pickupLat, destLng, destLat, zones, service, baseCruiseAltitudeM
  );
  const result = dijkstraFuel(nodes, adj, 0, 1);

  if (!result) {
    return {
      feasible: false,
      reason: "no_path_found",
      waypoints: [],
      segments: [],
      altitudeProfile: { min: 0, max: 0, transitions: [] },
      totalDistanceKm: 0,
      directDistanceKm: directKm,
      totalFuelKg: 0,
      directFuelKg,
      fuelSavingKg: 0,
      detourRatio: Infinity,
      algorithm: "least_fuel_dijkstra_v2",
    };
  }

  const waypoints = result.path.map((id) => {
    const n = nodes.find((node) => node.id === id);
    return { lat: n.lat, lng: n.lng, label: n.label };
  });

  const segments = buildSegments(waypoints, result.edges, baseCruiseAltitudeM);
  const totalKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
  const totalFuelKg = Math.round(result.totalFuelKg * 10) / 10;

  // Determine the reason: did we reroute around no-fly, or fly over restricted?
  const crossedAnyRestricted = segments.some((s) => s.crossedRestricted.length > 0);
  let reason;
  if (directCrossesNoFly && crossedAnyRestricted) {
    reason = "rerouted_no_fly_and_overfly_restricted";
  } else if (directCrossesNoFly) {
    reason = "rerouted_around_no_fly";
  } else {
    reason = crossedAnyRestricted
      ? "overfly_restricted_least_fuel"
      : "rerouted_around_restricted";
  }

  return {
    feasible: true,
    reason,
    waypoints,
    segments,
    altitudeProfile: buildAltitudeProfile(segments, baseCruiseAltitudeM),
    totalDistanceKm: Math.round(totalKm * 10) / 10,
    directDistanceKm: directKm,
    totalFuelKg,
    directFuelKg,
    fuelSavingKg: Math.round((directFuelKg - totalFuelKg) * 10) / 10,
    detourRatio: Math.round((totalKm / directKm) * 100) / 100,
    algorithm: "least_fuel_dijkstra_v2",
  };
}

// Legacy exports for tests + compatibility.
function computeAltitudeProfile(waypoints, allZones, baseCruiseAltitudeM) {
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const mLng = (a.lng + b.lng) / 2;
    const mLat = (a.lat + b.lat) / 2;
    let requiredAltitudeM = baseCruiseAltitudeM;
    const crossedRestricted = [];
    for (const z of allZones) {
      if (z.zoneType !== "restricted" || !z.geometry) continue;
      const hits =
        pointInPolygon(mLng, mLat, z.geometry) ||
        pointInPolygon(a.lng, a.lat, z.geometry) ||
        pointInPolygon(b.lng, b.lat, z.geometry);
      if (hits) {
        crossedRestricted.push(z);
        requiredAltitudeM = Math.max(requiredAltitudeM, z.maxAltitudeM + 50);
      }
    }
    segments.push({
      from: { lat: a.lat, lng: a.lng },
      to: { lat: b.lat, lng: b.lng },
      distanceKm: haversineKm(a.lat, a.lng, b.lat, b.lng),
      altitudeM: Math.round(requiredAltitudeM),
      crossedRestricted: crossedRestricted.map((z) => ({
        name: z.name,
        maxAltitudeM: z.maxAltitudeM,
      })),
    });
  }
  return segments;
}

module.exports = {
  planAvoidanceRoute,
  segmentCrossesNoFly,
  segmentRestrictedZones,
  buildFuelGraph,
  dijkstraFuel,
  computeAltitudeProfile,
  inflateVertex,
  segmentsIntersect,
  edgeFuelKg,
  climbFuelKg,
  segmentFuelKg,
  altitudeFuelFactor,
};
