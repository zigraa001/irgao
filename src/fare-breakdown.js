const { SERVICE_PRICING, NEW_FLYER_DISCOUNT, URGENCY_SURCHARGE, WEATHER_SURCHARGE, loadPricingConfig, getSurchargeRates } = require("./pricing");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

const GST_RATE = 0.18;

function fareBreakdown(service, distanceKm, discountInfo, creditsUsed, couponInfo, opts = {}) {
  const pricing = SERVICE_PRICING[service];
  if (!pricing) throw new Error(`Unknown service: ${service}`);
  const km = Math.max(0, Number(distanceKm) || 0);
  const kmCharge = round2(pricing.perKm * km);
  const baseAmount = round2(pricing.base + kmCharge);

  const rates = opts._rates || { urgency: URGENCY_SURCHARGE, weather: WEATHER_SURCHARGE, gst: GST_RATE };
  const urgencyRate = (rates.urgency || URGENCY_SURCHARGE)[opts.bookingType] || 0;
  const urgencySurcharge = round2(baseAmount * urgencyRate);

  const weatherRate = (rates.weather || WEATHER_SURCHARGE)[opts.weatherRisk] || 0;
  const weatherSurcharge = round2(baseAmount * weatherRate);

  const subtotal = round2(baseAmount + urgencySurcharge + weatherSurcharge);

  const hasDiscount = discountInfo && discountInfo.eligible;
  const discountAmount = hasDiscount ? round2(subtotal * NEW_FLYER_DISCOUNT) : 0;
  const afterDiscount = round2(subtotal - discountAmount);

  const couponAmt = (couponInfo && couponInfo.discount) ? Number(couponInfo.discount) : 0;
  const afterCoupon = round2(afterDiscount - couponAmt);

  const credits = Number(creditsUsed) || 0;
  const afterCredits = round2(afterCoupon - credits);

  const gstRate = typeof rates.gst === "number" ? rates.gst : GST_RATE;
  const gst = round2(Math.max(0, afterCredits) * gstRate);
  const total = Math.round((Math.max(0, afterCredits) + gst) / 100) * 100;

  const urgPct = Math.round(urgencyRate * 100);
  const urgencyLabel = opts.bookingType === "medical_emergency"
    ? `Medical Emergency (+${urgPct}%)`
    : opts.bookingType === "urgency_travel"
      ? `Urgency Travel (+${urgPct}%)`
      : null;

  const wxPct = Math.round(weatherRate * 100);
  const weatherLabel = opts.weatherRisk === "high"
    ? `Adverse Weather (+${wxPct}%)`
    : opts.weatherRisk === "medium"
      ? `Weather Caution (+${wxPct}%)`
      : null;

  const gstPct = Math.round(gstRate * 100);
  return {
    service,
    base: pricing.base,
    perKm: pricing.perKm,
    distanceKm: round2(km),
    kmCharge,
    urgencySurcharge: urgencySurcharge > 0 ? { label: urgencyLabel, amount: urgencySurcharge } : null,
    weatherSurcharge: weatherSurcharge > 0 ? { label: weatherLabel, amount: weatherSurcharge } : null,
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
    taxLabel: `GST (${gstPct}%)`,
    subtotal,
    total,
    currency: "INR",
  };
}

async function fareBreakdownWithConfig(service, distanceKm, discountInfo, creditsUsed, couponInfo, opts = {}) {
  const cfg = await loadPricingConfig();
  const rates = getSurchargeRates(cfg);
  return fareBreakdown(service, distanceKm, discountInfo, creditsUsed, couponInfo, { ...opts, _rates: rates });
}

module.exports = { fareBreakdown, fareBreakdownWithConfig, round2 };
