const { SERVICE_PRICING, estimateFare, NEW_FLYER_DISCOUNT } = require("./pricing");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

const GST_RATE = 0.18;

function fareBreakdown(service, distanceKm, discountInfo, creditsUsed, couponInfo) {
  const pricing = SERVICE_PRICING[service];
  if (!pricing) throw new Error(`Unknown service: ${service}`);
  const km = Math.max(0, Number(distanceKm) || 0);
  const kmCharge = round2(pricing.perKm * km);
  const surge = 0;
  const subtotal = round2(pricing.base + kmCharge + surge);

  const hasDiscount = discountInfo && discountInfo.eligible;
  const discountAmount = hasDiscount ? round2(subtotal * NEW_FLYER_DISCOUNT) : 0;
  const afterDiscount = round2(subtotal - discountAmount);

  const couponAmt = (couponInfo && couponInfo.discount) ? Number(couponInfo.discount) : 0;
  const afterCoupon = round2(afterDiscount - couponAmt);

  const credits = Number(creditsUsed) || 0;
  const afterCredits = round2(afterCoupon - credits);

  const gst = round2(Math.max(0, afterCredits) * GST_RATE);
  const total = Math.round((Math.max(0, afterCredits) + gst) / 100) * 100;
  return {
    service,
    base: pricing.base,
    perKm: pricing.perKm,
    distanceKm: round2(km),
    kmCharge,
    surge,
    discount: hasDiscount ? {
      label: `New Flyer (50% off — ${discountInfo.remaining} flight${discountInfo.remaining === 1 ? '' : 's'} left)`,
      amount: discountAmount,
    } : null,
    couponApplied: couponAmt > 0 ? {
      label: `Coupon (${couponInfo.code})`,
      amount: couponAmt,
    } : null,
    creditsApplied: credits > 0 ? { label: "Carbon Credits", amount: credits } : null,
    taxes: gst,
    taxLabel: "GST (18%)",
    subtotal,
    total,
    currency: "INR",
  };
}

module.exports = { fareBreakdown, round2 };
