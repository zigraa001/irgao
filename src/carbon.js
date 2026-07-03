// Carbon emissions comparison: conventional aviation fuel vs electric battery.
//
// Sources: ICAO Carbon Emissions Calculator, IATA Fact Sheet on Climate Change,
// EEA Transport & Environment Database, Eviation/Heart Aerospace published specs.
// All values in grams CO2 per passenger-km.
const EMISSIONS = {
  conventionalJet: {
    label: 'Conventional Jet (Jet A-1)',
    gCO2perPaxKm: 133,
    breakdown: { directCombustion: 115, fuelProduction: 12, infrastructure: 6 },
  },
  turboprop: {
    label: 'Turboprop (ATR 72-class)',
    gCO2perPaxKm: 104,
    breakdown: { directCombustion: 88, fuelProduction: 10, infrastructure: 6 },
  },
  groundTaxi: {
    label: 'Ground Taxi / Car (India avg)',
    gCO2perPaxKm: 142,
    breakdown: { directCombustion: 120, fuelProduction: 14, infrastructure: 8 },
  },
  electricBattery: {
    label: 'Electric eVTOL (IraGo fleet)',
    gCO2perPaxKm: 22,
    breakdown: { gridElectricity: 15, batteryLifecycle: 5, infrastructure: 2 },
  },
};

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

function carbonComparison(distanceKm, passengers) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const pax = Math.max(1, Number(passengers) || 1);

  const ev = EMISSIONS.electricBattery;
  const comparisons = [
    { key: 'conventionalJet', ...EMISSIONS.conventionalJet },
    { key: 'turboprop', ...EMISSIONS.turboprop },
    { key: 'groundTaxi', ...EMISSIONS.groundTaxi },
  ];

  const evTotalG = ev.gCO2perPaxKm * km * pax;
  const results = comparisons.map(c => {
    const convTotalG = c.gCO2perPaxKm * km * pax;
    const savedG = convTotalG - evTotalG;
    return {
      key: c.key,
      label: c.label,
      emissionsG: Math.round(convTotalG),
      emissionsKg: Math.round(convTotalG / 100) / 10,
      savedG: Math.round(savedG),
      savedKg: Math.round(savedG / 100) / 10,
      savedPercent: Math.round((savedG / convTotalG) * 100),
    };
  });

  return {
    electric: {
      label: ev.label,
      emissionsG: Math.round(evTotalG),
      emissionsKg: Math.round(evTotalG / 100) / 10,
      breakdown: ev.breakdown,
    },
    comparisons: results,
    distanceKm: km,
    passengers: pax,
  };
}

// Carbon credits: earned per completed flight based on distance and service.
// 1 credit = ₹1 redeemable on future flights.
const CREDITS_PER_KM = {
  taxi: 10,
  golden: 15,
  shuttle: 5,
};

function computeCreditsEarned(service, distanceKm) {
  const rate = CREDITS_PER_KM[service] || CREDITS_PER_KM.taxi;
  const km = Math.max(0, Number(distanceKm) || 0);
  return Math.round(rate * km);
}

module.exports = {
  CO2_SAVED_PER_KM, EMISSIONS, CREDITS_PER_KM,
  estimateCarbonSavedKg, carbonComparison, computeCreditsEarned,
};
