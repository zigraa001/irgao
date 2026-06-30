// Zone legend definitions — classification metadata for map overlays.
//
// Each zone type + category gets a color, icon, label, and description so the
// frontend can render a map legend and tooltip without hardcoding display logic.

const ZONE_TYPE_LEGENDS = {
  no_fly: {
    label: "No-Fly Zone",
    shortLabel: "NO FLY",
    color: "#FF0000",
    fillOpacity: 0.25,
    strokeColor: "#CC0000",
    strokeWidth: 2,
    icon: "⛔",
    description: "Absolute prohibition — flight banned at all altitudes. Route must avoid entirely.",
    altitudeRule: "Blocked at all altitudes (ground to unlimited)",
  },
  restricted: {
    label: "Restricted Zone",
    shortLabel: "RESTRICTED",
    color: "#FF8C00",
    fillOpacity: 0.18,
    strokeColor: "#CC6600",
    strokeWidth: 1.5,
    icon: "⚠️",
    description: "Conditional restriction — flight allowed above the zone ceiling altitude.",
    altitudeRule: "Blocked below maxAltitudeM; overfly permitted above ceiling",
  },
};

const ZONE_CATEGORY_LEGENDS = {
  airport: {
    label: "Airport CTR",
    icon: "✈️",
    color: "#FF0000",
    description: "Airport Control Zone — terminal area with active runways. DGCA prohibited zone.",
    authority: "DGCA / AAI",
  },
  military_airbase: {
    label: "Military Air Base",
    icon: "🛩️",
    color: "#B22222",
    description: "Indian Air Force / Navy air station with active military operations.",
    authority: "IAF / Indian Navy",
  },
  nuclear: {
    label: "Nuclear Facility",
    icon: "☢️",
    color: "#8B0000",
    description: "AERB-mandated exclusion zone around nuclear power plants and research reactors.",
    authority: "AERB (Atomic Energy Regulatory Board)",
  },
  government: {
    label: "Government Complex",
    icon: "🏛️",
    color: "#FF6347",
    description: "Parliament, Rashtrapati Bhavan, state legislatures, and defence ministry buildings.",
    authority: "MHA (Ministry of Home Affairs)",
  },
  cantonment: {
    label: "Military Cantonment",
    icon: "🪖",
    color: "#D2691E",
    description: "Army cantonment — restricted ground-level access; overfly permitted above ceiling.",
    authority: "Indian Army / Cantonment Board",
  },
  wildlife: {
    label: "Wildlife Sanctuary / National Park",
    icon: "🦁",
    color: "#228B22",
    description: "Protected fauna area — low-altitude flight restricted to prevent disturbance.",
    authority: "MoEFCC (Ministry of Environment)",
  },
  urban_core: {
    label: "Dense Urban Core",
    icon: "🏙️",
    color: "#FF8C00",
    description: "High population density — noise and safety restrictions apply below ceiling.",
    authority: "DGCA / Local Municipal Authority",
  },
  border: {
    label: "International Border Zone",
    icon: "🚧",
    color: "#DC143C",
    description: "International border buffer — DGCA-mandated restriction near sensitive borders.",
    authority: "BSF / DGCA",
  },
  military_range: {
    label: "Military Test Range",
    icon: "💥",
    color: "#800000",
    description: "Active weapons testing / firing range — flight prohibited during exercises.",
    authority: "DRDO / Indian Army",
  },
};

const ALTITUDE_BANDS = [
  { label: "Ground Level", minM: 0, maxM: 50, color: "#4CAF50", description: "Takeoff/landing zone" },
  { label: "Low Altitude", minM: 50, maxM: 150, color: "#8BC34A", description: "Below most restricted zone ceilings" },
  { label: "Standard Cruise", minM: 150, maxM: 350, color: "#2196F3", description: "Typical eVTOL cruise band" },
  { label: "High Cruise", minM: 350, maxM: 500, color: "#3F51B5", description: "Above urban restricted zones" },
  { label: "Extended Cruise", minM: 500, maxM: 914, color: "#673AB7", description: "Above wildlife / cantonment zones" },
  { label: "High Altitude", minM: 914, maxM: 1500, color: "#9C27B0", description: "Above airport CTR ceilings" },
];

function getZoneLegend(zoneType, category) {
  const typeLegend = ZONE_TYPE_LEGENDS[zoneType] || ZONE_TYPE_LEGENDS.restricted;
  const catLegend = category ? ZONE_CATEGORY_LEGENDS[category] : null;
  return {
    ...typeLegend,
    category: catLegend || null,
    displayColor: catLegend?.color || typeLegend.color,
    displayIcon: catLegend?.icon || typeLegend.icon,
    displayLabel: catLegend?.label || typeLegend.label,
  };
}

function getAltitudeBand(altitudeM) {
  for (const band of ALTITUDE_BANDS) {
    if (altitudeM >= band.minM && altitudeM < band.maxM) return band;
  }
  return ALTITUDE_BANDS[ALTITUDE_BANDS.length - 1];
}

module.exports = {
  ZONE_TYPE_LEGENDS,
  ZONE_CATEGORY_LEGENDS,
  ALTITUDE_BANDS,
  getZoneLegend,
  getAltitudeBand,
};
