// IIT Madras campus drop points for drone delivery.
// Approximate coordinates (good enough for in-campus live tracking).
const CAMPUS_POINTS = {
  "IIT Madras Main Gate": [12.9915, 80.2337],
  "Taramani Gate": [12.9858, 80.2410],
  "Gajendra Circle": [12.9906, 80.2339],
  "Central Library": [12.9908, 80.2334],
  "Himalaya Mess": [12.9938, 80.2315],
  "CRC / Academic Complex": [12.9916, 80.2358],
  "SAC": [12.9892, 80.2318],
  "Hostel Zone": [12.9940, 80.2308],
  "NAC-2 / MInT": [12.9898, 80.2375],
  "Department of Aerospace": [12.9904, 80.2365],
};

const CAMPUS_NAMES = Object.keys(CAMPUS_POINTS);

function normalizeCampusName(name) {
  return String(name || "")
    .replace(/,?\s*IIT Madras Campus/i, "")
    .trim()
    .toLowerCase();
}

function lookupCampusPoint(name) {
  const want = normalizeCampusName(name);
  if (!want) return null;
  for (const [label, coord] of Object.entries(CAMPUS_POINTS)) {
    if (normalizeCampusName(label) === want) {
      return { name: label, lat: coord[0], lng: coord[1] };
    }
  }
  return null;
}

function parseCampusRoute(location, pickupName, dropName) {
  let fromName = pickupName || null;
  let toName = dropName || null;
  if ((!fromName || !toName) && location && String(location).includes("→")) {
    const [a, b] = String(location).split("→");
    fromName = fromName || a;
    toName = toName || b;
  }
  const from = lookupCampusPoint(fromName);
  const to = lookupCampusPoint(toName);
  return { from, to };
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const PRE_FLIGHT = new Set(["pending", "confirmed", "dispatched", "picked_up"]);
const DONE = new Set(["delivered", "completed"]);
const DRONE_ANIM_SPEED = 3;

function flightDurationMs(booking) {
  return (Math.max(1, Number(booking.etaMin) || 8) * 60 * 1000) / DRONE_ANIM_SPEED;
}

function computeDronePosition(booking, now = Date.now()) {
  const pLat = Number(booking.pickupLat);
  const pLng = Number(booking.pickupLng);
  const dLat = Number(booking.dropLat);
  const dLng = Number(booking.dropLng);
  const status = String(booking.status || "");
  const heading =
    Number.isFinite(pLat) && Number.isFinite(dLat)
      ? bearingDeg(pLat, pLng, dLat, dLng)
      : 0;

  const gpsLat = Number(booking.gpsLat);
  const gpsLng = Number(booking.gpsLng);
  const gpsAt = booking.gpsUpdatedUnix
    ? Number(booking.gpsUpdatedUnix) * 1000
    : booking.gpsUpdatedAt
      ? new Date(booking.gpsUpdatedAt).getTime()
      : 0;
  const gpsFresh = Number.isFinite(gpsLat) && Number.isFinite(gpsLng) && now - gpsAt < 20000;

  if (gpsFresh && !DONE.has(status) && !PRE_FLIGHT.has(status)) {
    return { lat: gpsLat, lng: gpsLng, progress: null, heading, source: "gps" };
  }

  if (!Number.isFinite(pLat) || !Number.isFinite(dLat)) {
    return null;
  }

  if (DONE.has(status)) {
    return { lat: dLat, lng: dLng, progress: 1, heading, source: "drop" };
  }
  if (PRE_FLIGHT.has(status) || (!booking.flightStartedAt && booking.flightStartedUnix == null)) {
    return { lat: pLat, lng: pLng, progress: 0, heading, source: "pickup" };
  }
  if (status === "arriving") {
    return {
      lat: lerp(pLat, dLat, 0.92),
      lng: lerp(pLng, dLng, 0.92),
      progress: 0.92,
      heading,
      source: "eta",
    };
  }

  const etaMs = flightDurationMs(booking);
  const started = booking.flightStartedUnix
    ? Number(booking.flightStartedUnix) * 1000
    : booking.flightStartedAt
      ? new Date(booking.flightStartedAt).getTime()
      : now;
  const t = Math.min(1, Math.max(0, (now - started) / etaMs));
  return {
    lat: lerp(pLat, dLat, t),
    lng: lerp(pLng, dLng, t),
    progress: t,
    heading,
    source: "eta",
  };
}

const STATUS_LABELS = {
  pending: "Order placed",
  confirmed: "Kitchen confirmed",
  dispatched: "Drone assigned",
  picked_up: "Parcel picked up",
  flying: "Drone en route",
  arriving: "Arriving at drop",
  delivered: "Delivered",
  completed: "Delivered",
  cancelled: "Cancelled",
  in_progress: "In progress",
};

function etaRemainingMin(booking, pos, now = Date.now()) {
  if (!booking || ["delivered", "completed", "cancelled"].includes(booking.status)) return 0;
  if (booking.status === "arriving") return 1;
  if (["pending", "confirmed", "dispatched", "picked_up"].includes(booking.status)) {
    return Math.max(1, Math.ceil((Number(booking.etaMin) || 8) / DRONE_ANIM_SPEED));
  }
  if (!booking.flightStartedAt && booking.flightStartedUnix == null) {
    return Math.max(1, Math.ceil((Number(booking.etaMin) || 8) / DRONE_ANIM_SPEED));
  }
  const etaMs = flightDurationMs(booking);
  const started = booking.flightStartedUnix
    ? Number(booking.flightStartedUnix) * 1000
    : new Date(booking.flightStartedAt).getTime();
  return Math.max(0, Math.ceil((etaMs - (now - started)) / 60000));
}

module.exports = {
  CAMPUS_POINTS,
  CAMPUS_NAMES,
  lookupCampusPoint,
  parseCampusRoute,
  computeDronePosition,
  etaRemainingMin,
  STATUS_LABELS,
  DRONE_ANIM_SPEED,
};
