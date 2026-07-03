// IraGo app — 01-state.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── State ──
let map, pickupMarker, destMarker, routeLine, aircraftMarkers = [];
// Ride auto-follow pause: timestamp of the last MANUAL map pan/zoom. Auto-follow
// resumes RIDE_FOLLOW_RESUME_MS after the user stops interacting. programmaticMapMove
// is set true around our own panTo/fitBounds so they don't count as "manual".
let userMovedMapAt = 0;
let programmaticMapMove = false;
const RIDE_FOLLOW_RESUME_MS = 30000;

// Great-circle distance (km) between two [lat,lng] points. Frontend helper —
// the backend has its own haversineKm; this mirrors it for client-side use.
function haversineKmClient(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
let currentService = 'taxi';
let selectedRide = null;
let pickupCoord = null, destCoord = null;
// The persisted booking returned by POST /api/bookings (US-006). Source of
// truth for the confirmation screen and live tracking (US-007).
let currentBooking = null;
let currentRoute = null;
let currentDiscount = null;
let currentCarbonComparison = null;
let currentCarbonCredits = null;

// ── Booking draft (US-005) ──
// Single source of truth for the in-progress booking: the selected pickup and
// destination (name + lat/lng), the chosen service, and the computed distance.
// Populated whenever pickup, destination, or service changes so the fare step
// (US-006) and POST /api/bookings consume structured data instead of re-reading
// the DOM. pickup/dest are null until both a name and coordinates exist.
let bookingDraft = {
  pickup: null,      // { name, lat, lng }
  dest: null,        // { name, lat, lng }
  service: 'taxi',   // taxi | golden | shuttle
  distanceKm: null,  // haversine km, set only once both ends are chosen
};

// Service code -> human label (used for display + persistence).
const SERVICE_LABELS = { taxi: 'Air Taxi', golden: 'Golden Hour', shuttle: 'Air Shuttle' };

// Re-read the current selections into bookingDraft. Idempotent; safe to call
// after any change to pickup/destination/service. Returns the draft.
function captureBookingDraft() {
  const pickupName = (document.getElementById('pickup-input') || {}).value || '';
  const destName = (document.getElementById('dest-input') || {}).value || '';
  bookingDraft.pickup = pickupCoord
    ? { name: pickupName.trim() || 'Selected pickup', lat: pickupCoord[0], lng: pickupCoord[1] }
    : null;
  bookingDraft.dest = destCoord
    ? { name: destName.trim() || 'Selected destination', lat: destCoord[0], lng: destCoord[1] }
    : null;
  bookingDraft.service = currentService;
  bookingDraft.distanceKm = (pickupCoord && destCoord)
    ? Math.round(calcDistance() * 10) / 10
    : null;
  return bookingDraft;
}

// True only when pickup, destination, and service are all selected — the
// minimum required before a fare/booking can be created (US-006 gate).
function bookingDraftReady() {
  return !!(bookingDraft.pickup && bookingDraft.dest && bookingDraft.service);
}

// ── Demo Cities (Indian locations) ──
// Vertiport locations are positioned OUTSIDE airport no-fly zones (~3-4 km
// radius). Passengers board at vertiports, not runways.
const demoLocations = {
  // Delhi NCR — clear of Safdarjung/IGI/Central Delhi no-fly zones
  'Noida Sec 62 Vertiport':       [28.6270, 77.3650],
  'Greater Noida Vertiport':      [28.4744, 77.5040],
  'Faridabad Vertiport':          [28.4089, 77.3178],
  'Gurugram Cyber Hub':           [28.4950, 77.0880],
  'Gurugram Medanta Hospital':    [28.4396, 77.0426],
  'Dwarka Sector 21 Vertiport':   [28.5527, 77.0588],
  'Rohini Vertiport, Delhi':      [28.7360, 77.1120],
  'Ghaziabad Vertiport':          [28.6692, 77.4538],

  // Mumbai — inter-city clear routes
  'Navi Mumbai Vertiport':        [19.0330, 73.0297],
  'Thane Vertiport':              [19.2183, 72.9781],
  'BKC Vertiport, Mumbai':        [19.0554, 72.8822],
  'Andheri Vertiport, Mumbai':    [19.1400, 72.8500],
  'Powai Vertiport, Mumbai':      [19.1178, 72.9060],
  'Kokilaben Hospital, Mumbai':   [19.1310, 72.8265],
  'Lilavati Hospital, Mumbai':    [19.0509, 72.8289],
  'Navi Mumbai Apollo Hospital':  [19.0219, 73.0099],

  // Chennai — clear of Chennai airport (80.169, 12.994) and Tambaram AFB (80.124, 12.908) no-fly
  'Pallavaram Vertiport, Chennai':[13.0500, 80.1500],
  'Tambaram Vertiport, Chennai':  [12.8800, 80.0600],
  'OMR Vertiport, Chennai':       [12.8996, 80.2209],
  'Apollo Hospital, Chennai':     [13.0067, 80.2206],
  'MIOT Hospital, Chennai':       [13.0189, 80.1941],
  'Velachery Vertiport, Chennai': [12.9750, 80.2200],

  // Bengaluru — clear of restricted zones
  'Whitefield Vertiport':         [12.9698, 77.7500],
  'Electronic City Vertiport':    [12.8399, 77.6770],
  'Devanahalli Vertiport':        [13.2600, 77.7700],
  'Narayana Health, Bengaluru':   [12.8828, 77.5987],
  'Manipal Hospital, Bengaluru':  [12.9582, 77.6484],
  'Sarjapur Vertiport':           [12.9102, 77.6880],

  // Hyderabad
  'Hi-Tech City Vertiport':       [17.4435, 78.3772],
  'Shamshabad Vertiport':         [17.3050, 78.4500],
  'NIMS Hospital, Hyderabad':     [17.3941, 78.5012],
  'Yashoda Hospital, Hyderabad':  [17.4489, 78.3615],
  'Secunderabad Vertiport':       [17.4600, 78.5300],

  // Remote / Emergency
  'Leh Vertiport, Ladakh':        [34.1500, 77.5600],
  'SNM Hospital, Leh':            [34.1526, 77.5771],
  'Dehradun Vertiport':           [30.2050, 78.1950],
  'AIIMS Rishikesh':              [30.0688, 78.3137],
  'Shimla Vertiport':             [31.0950, 77.0800],
  'IGMC Hospital, Shimla':        [31.1048, 77.1734],
  'Port Blair Vertiport, Andaman':[11.6550, 92.7400],
  'GB Pant Hospital, Andaman':    [11.6683, 92.7358],
  'Dibrugarh Vertiport, Assam':   [27.4950, 95.0300],
  'AMCH Hospital, Dibrugarh':     [27.4728, 94.9120],
};

