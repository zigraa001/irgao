// Route planning API — least-fuel estimates using flight_zones catalog.
const express = require("express");
const { requireAuth } = require("./auth");
const { SERVICES } = require("./pricing");
const { planLeastFuelRoute, publicFuelPlan } = require("./fuel-route");
const { routeEnvelope } = require("./zone-geometry");
const { queryZonesInBounds } = require("./zone-routes");

const router = express.Router();

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadZones(pickupLat, pickupLng, destLat, destLng) {
  const bounds = routeEnvelope(pickupLat, pickupLng, destLat, destLng);
  return queryZonesInBounds(bounds);
}

function parseBody(b) {
  return {
    pickupLat: num(b.pickupLat),
    pickupLng: num(b.pickupLng),
    destLat: num(b.destLat),
    destLng: num(b.destLng),
    service: typeof b.service === "string" ? b.service : "taxi",
  };
}

// POST /api/route/fuel-plan — least-fuel plan for a segment.
// Operators/admins receive full plan (incl. cruise altitude). Passengers get fuel only.
router.post("/fuel-plan", requireAuth, async (req, res) => {
  const { pickupLat, pickupLng, destLat, destLng, service } = parseBody(
    req.body || {}
  );

  if (
    pickupLat === null ||
    pickupLng === null ||
    destLat === null ||
    destLng === null
  ) {
    return res.status(400).json({
      error: "pickupLat, pickupLng, destLat, destLng are required",
    });
  }
  if (!SERVICES.includes(service)) {
    return res.status(400).json({ error: "A valid service is required" });
  }

  const zones = await loadZones(pickupLat, pickupLng, destLat, destLng);
  const plan = planLeastFuelRoute({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    service,
    zones,
  });

  if (!plan.feasible) {
    return res.status(409).json({
      error: "Route is not feasible with current airspace restrictions.",
      code: "ROUTE_BLOCKED",
      plan:
        req.user.role === "customer"
          ? publicFuelPlan(plan)
          : plan,
    });
  }

  if (req.user.role === "customer") {
    return res.json({ plan: publicFuelPlan(plan) });
  }

  res.json({ plan });
});

module.exports = { router, loadZones };
