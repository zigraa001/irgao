// Fare breakdown for receipts and the customer-facing fare card.
//
// Pricing is still mock (see pricing.js), but the customer now sees the
// components (base + per-km) instead of one opaque rounded number. Surge and
// taxes are wired through as zero today so the UI can show them later without
// another schema change. `total` always equals estimateFare() so the displayed
// total never drifts from the persisted booking.fareEstimate.
const { SERVICE_PRICING, estimateFare } = require("./pricing");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function fareBreakdown(service, distanceKm) {
  const pricing = SERVICE_PRICING[service];
  if (!pricing) throw new Error(`Unknown service: ${service}`);
  const km = Math.max(0, Number(distanceKm) || 0);
  const kmCharge = round2(pricing.perKm * km);
  const surge = 0; // reserved for demand-based surge multiplier
  const taxes = 0; // reserved for GST etc.
  const total = estimateFare(service, km);
  return {
    service,
    base: pricing.base,
    perKm: pricing.perKm,
    distanceKm: round2(km),
    kmCharge,
    surge,
    taxes,
    // Unrounded sum of components — kept for the receipt; `total` is what the
    // customer is charged and what's stored on the booking.
    subtotal: round2(pricing.base + kmCharge + surge + taxes),
    total,
    currency: "INR",
  };
}

module.exports = { fareBreakdown, round2 };
