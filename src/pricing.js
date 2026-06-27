// IraGo fare estimation.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  MOCK PRICING — TO BE REPLACED                                        │
// │  This is the single, isolated place where trip fares are computed.    │
// │  It uses a simple `base + per-km` model per service. Swap this out    │
// │  for the real pricing/quoting engine (surge, time-of-day, demand,     │
// │  taxes, etc.) when it exists — callers should keep using estimateFare │
// │  so nothing else needs to change.                                     │
// └─────────────────────────────────────────────────────────────────────┘

// Allowed service codes and their mock pricing. Keep these in sync with the
// client SERVICE_LABELS map in app.html (taxi / golden / shuttle).
// All amounts are in INR (₹). base = flat boarding fee, perKm = per-kilometre.
const SERVICE_PRICING = {
  taxi: { base: 4000, perKm: 320 }, // Air Taxi
  golden: { base: 35000, perKm: 1500 }, // Golden Hour (air ambulance)
  shuttle: { base: 1500, perKm: 90 }, // Air Shuttle
};

const SERVICES = Object.keys(SERVICE_PRICING);

// Great-circle distance between two lat/lng points, in kilometres. Lives here
// because the fare depends on it; the server computes distance authoritatively
// rather than trusting a client-supplied number.
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Mock fare estimate for a service over a distance. Returns an INR amount
// rounded to the nearest ₹100 for tidy display. Throws on an unknown service.
function estimateFare(service, distanceKm) {
  const pricing = SERVICE_PRICING[service];
  if (!pricing) {
    throw new Error(`Unknown service: ${service}`);
  }
  const km = Math.max(0, Number(distanceKm) || 0);
  const raw = pricing.base + pricing.perKm * km;
  return Math.round(raw / 100) * 100;
}

module.exports = { SERVICE_PRICING, SERVICES, haversineKm, estimateFare };
