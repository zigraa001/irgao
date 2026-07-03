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

// Pricing aligned with evtol.travel/air-taxi-cost (launch-era 2025-2027).
// Taxi uses mid-range launch ($4.50/mi ≈ ₹200/km), Golden Hour adds an
// emergency premium, Shuttle uses at-scale shared-ride rates with 50% savings.
// All amounts in INR (₹). base = flat boarding fee, perKm = per-kilometre.
// 18% GST is applied on top by estimateFare / fareBreakdown.
const SERVICE_PRICING = {
  taxi:    { base: 500, perKm: 200 },
  golden:  { base: 5000, perKm: 600 },
  shuttle: { base: 500,  perKm: 80 },
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

// Strict lat/lng parser. Returns null for anything that isn't a finite number
// in valid range — critically this rejects null/undefined/""/booleans, all of
// which Number() silently coerces to 0 (which previously created bookings at
// lat 0, lng 0). `kind` is "lat" ([-90, 90]) or "lng" ([-180, 180]).
function parseCoord(v, kind) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (kind === "lat" && (n < -90 || n > 90)) return null;
  if (kind === "lng" && (n < -180 || n > 180)) return null;
  return n;
}

const GST_RATE = 0.18;

function estimateFare(service, distanceKm) {
  const pricing = SERVICE_PRICING[service];
  if (!pricing) {
    throw new Error(`Unknown service: ${service}`);
  }
  const km = Math.max(0, Number(distanceKm) || 0);
  const subtotal = pricing.base + pricing.perKm * km;
  const withGst = subtotal * (1 + GST_RATE);
  return Math.round(withGst / 100) * 100;
}

const NEW_FLYER_DISCOUNT = 0.50;
const NEW_FLYER_MAX_FLIGHTS = 3;

function applyNewFlyerDiscount(fare, completedFlights) {
  const count = Number(completedFlights) || 0;
  if (count >= NEW_FLYER_MAX_FLIGHTS) return { fare, discount: 0, eligible: false, remaining: 0 };
  const discount = Math.round(fare * NEW_FLYER_DISCOUNT);
  return {
    fare: fare - discount,
    discount,
    eligible: true,
    remaining: NEW_FLYER_MAX_FLIGHTS - count,
  };
}

module.exports = {
  SERVICE_PRICING,
  SERVICES,
  haversineKm,
  estimateFare,
  parseCoord,
  applyNewFlyerDiscount,
  NEW_FLYER_DISCOUNT,
  NEW_FLYER_MAX_FLIGHTS,
};
