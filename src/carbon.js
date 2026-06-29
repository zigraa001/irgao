// Carbon savings estimate vs ground transport (mock — isolated for replacement).
const { haversineKm } = require("./pricing");

// kg CO2 saved per km vs equivalent car trip, by service tier.
const CO2_SAVED_PER_KM = {
  taxi: 0.42,
  golden: 0.55,
  shuttle: 0.28,
};

function estimateCarbonSavedKg(service, distanceKm) {
  const rate = CO2_SAVED_PER_KM[service] || CO2_SAVED_PER_KM.taxi;
  const km = Math.max(0, Number(distanceKm) || 0);
  return Math.round(rate * km * 10) / 10;
}

module.exports = { CO2_SAVED_PER_KM, estimateCarbonSavedKg, haversineKm };
