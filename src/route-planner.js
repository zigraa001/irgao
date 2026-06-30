// Route planner: visibility-graph pathfinder that routes around no-fly zones
// and handles altitude for restricted zones.
//
// Algorithm:
// 1. Sample the direct path — if clear, return the straight line.
// 2. Otherwise build a visibility graph: start + end + all no-fly zone
//    boundary vertices, with edges between mutually-visible pairs.
// 3. Run Dijkstra on the graph to find the shortest safe path.
// 4. For restricted zones along the path, compute altitude adjustments
//    (fly above maxAltitudeM) rather than routing around.
// 5. Return ordered waypoints with per-segment altitude profiles.

const { haversineKm } = require("./pricing");
const { pointInPolygon } = require("./fuel-route");

const MARGIN_DEG = 0.005; // ~550 m buffer outside zone boundaries
const MAX_WAYPOINTS = 60;

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

// Check if a line segment (lng1,lat1)→(lng2,lat2) crosses the interior
// of any no-fly zone. "Crosses" = edge intersection OR midpoint inside.
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

// Push a vertex outward from the zone centroid by MARGIN_DEG so the
// path doesn't graze the zone boundary.
function inflateVertex(lng, lat, centroidLng, centroidLat) {
  const dx = lng - centroidLng;
  const dy = lat - centroidLat;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return [lng + (dx / dist) * MARGIN_DEG, lat + (dy / dist) * MARGIN_DEG];
}

function polygonCentroid(ring) {
  let cx = 0, cy = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    cx += ring[i][0];
    cy += ring[i][1];
  }
  return [cx / n, cy / n];
}

// ── Visibility graph construction ────────────────────────────────────────

function buildVisibilityGraph(startLng, startLat, endLng, endLat, noFlyZones) {
  const nodes = [
    { id: 0, lng: startLng, lat: startLat, label: "start" },
    { id: 1, lng: endLng, lat: endLat, label: "end" },
  ];

  // Add inflated boundary vertices from each no-fly zone.
  for (const z of noFlyZones) {
    if (!z.geometry?.coordinates?.[0]) continue;
    const ring = z.geometry.coordinates[0];
    const [cx, cy] = polygonCentroid(ring);
    const n = ring.length - 1;
    // Sample vertices (skip duplicate closing vertex). For large polygons
    // take every Nth vertex to keep the graph tractable.
    const step = Math.max(1, Math.floor(n / 12));
    for (let i = 0; i < n; i += step) {
      const [ilng, ilat] = inflateVertex(ring[i][0], ring[i][1], cx, cy);
      // Skip vertices that land inside another no-fly zone.
      const insideAnother = noFlyZones.some(
        (oz) => oz !== z && oz.geometry && pointInPolygon(ilng, ilat, oz.geometry)
      );
      if (insideAnother) continue;
      nodes.push({ id: nodes.length, lng: ilng, lat: ilat, label: z.name });
    }
    if (nodes.length > MAX_WAYPOINTS) break;
  }

  // Build adjacency: edge exists iff the segment doesn't cross any no-fly zone.
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (!segmentCrossesNoFly(a.lng, a.lat, b.lng, b.lat, noFlyZones)) {
        const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
        adj.get(a.id).push({ to: b.id, dist });
        adj.get(b.id).push({ to: a.id, dist });
      }
    }
  }

  return { nodes, adj };
}

// ── Dijkstra shortest path ───────────────────────────────────────────────

function dijkstra(nodes, adj, startId, endId) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();

  for (const n of nodes) dist.set(n.id, Infinity);
  dist.set(startId, 0);

  while (true) {
    let u = -1, uDist = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < uDist) { u = id; uDist = d; }
    }
    if (u === -1 || u === endId) break;
    visited.add(u);

    for (const edge of (adj.get(u) || [])) {
      const alt = uDist + edge.dist;
      if (alt < dist.get(edge.to)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, u);
      }
    }
  }

  if (!Number.isFinite(dist.get(endId))) return null;

  const path = [];
  let cur = endId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { path, totalKm: Math.round(dist.get(endId) * 10) / 10 };
}

// ── Altitude profile ─────────────────────────────────────────────────────

function computeAltitudeProfile(waypoints, allZones, baseCruiseAltitudeM) {
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const mLng = (a.lng + b.lng) / 2;
    const mLat = (a.lat + b.lat) / 2;

    let requiredAltitudeM = baseCruiseAltitudeM;
    const crossedRestricted = [];

    for (const z of allZones) {
      if (z.zoneType !== "restricted") continue;
      if (!z.geometry) continue;
      // Check if this segment's midpoint or endpoints are inside the zone.
      const hits =
        pointInPolygon(mLng, mLat, z.geometry) ||
        pointInPolygon(a.lng, a.lat, z.geometry) ||
        pointInPolygon(b.lng, b.lat, z.geometry);
      if (hits) {
        crossedRestricted.push(z);
        // Must fly above the restricted zone's ceiling.
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

// ── Main entry point ─────────────────────────────────────────────────────

function planAvoidanceRoute({
  pickupLat,
  pickupLng,
  destLat,
  destLng,
  zones,
  baseCruiseAltitudeM,
}) {
  const noFlyZones = zones.filter(
    (z) => z.zoneType === "no_fly" && z.geometry
  );

  // Fast path: direct route has no no-fly violations → straight line.
  const directClear = !segmentCrossesNoFly(
    pickupLng, pickupLat, destLng, destLat, noFlyZones
  );
  const pickupInsideNoFly = noFlyZones.some((z) =>
    pointInPolygon(pickupLng, pickupLat, z.geometry)
  );
  const destInsideNoFly = noFlyZones.some((z) =>
    pointInPolygon(destLng, destLat, z.geometry)
  );

  if (pickupInsideNoFly || destInsideNoFly) {
    return {
      feasible: false,
      reason: "endpoint_in_no_fly",
      waypoints: [],
      segments: [],
      totalDistanceKm: haversineKm(pickupLat, pickupLng, destLat, destLng),
      directDistanceKm: haversineKm(pickupLat, pickupLng, destLat, destLng),
      detourRatio: 1,
      algorithm: "visibility_graph_v1",
    };
  }

  if (directClear) {
    const dist = Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;
    const waypoints = [
      { lat: pickupLat, lng: pickupLng, label: "pickup" },
      { lat: destLat, lng: destLng, label: "destination" },
    ];
    const segments = computeAltitudeProfile(waypoints, zones, baseCruiseAltitudeM);
    return {
      feasible: true,
      reason: "direct_clear",
      waypoints,
      segments,
      totalDistanceKm: dist,
      directDistanceKm: dist,
      detourRatio: 1,
      algorithm: "visibility_graph_v1",
    };
  }

  // Build visibility graph and find shortest path around no-fly zones.
  const { nodes, adj } = buildVisibilityGraph(
    pickupLng, pickupLat, destLng, destLat, noFlyZones
  );
  const result = dijkstra(nodes, adj, 0, 1);

  if (!result) {
    return {
      feasible: false,
      reason: "no_path_found",
      waypoints: [],
      segments: [],
      totalDistanceKm: 0,
      directDistanceKm: haversineKm(pickupLat, pickupLng, destLat, destLng),
      detourRatio: Infinity,
      algorithm: "visibility_graph_v1",
    };
  }

  const waypoints = result.path.map((id) => {
    const n = nodes.find((node) => node.id === id);
    return { lat: n.lat, lng: n.lng, label: n.label };
  });

  const directKm = haversineKm(pickupLat, pickupLng, destLat, destLng);
  const segments = computeAltitudeProfile(waypoints, zones, baseCruiseAltitudeM);
  const totalKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);

  return {
    feasible: true,
    reason: "rerouted_around_no_fly",
    waypoints,
    segments,
    totalDistanceKm: Math.round(totalKm * 10) / 10,
    directDistanceKm: Math.round(directKm * 10) / 10,
    detourRatio: Math.round((totalKm / directKm) * 100) / 100,
    algorithm: "visibility_graph_v1",
  };
}

module.exports = {
  planAvoidanceRoute,
  segmentCrossesNoFly,
  buildVisibilityGraph,
  dijkstra,
  computeAltitudeProfile,
  inflateVertex,
  segmentsIntersect,
};
