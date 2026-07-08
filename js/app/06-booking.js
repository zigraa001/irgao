// IraGo app — 06-booking.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Service Switching ──
function switchService(service) {
  currentService = service;
  currentRoute = null;
  document.querySelectorAll('.service-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-service="${service}"]`).classList.add('active');

  const bookingPanel = document.getElementById('booking-panel');
  const dronePanel = document.getElementById('drone-panel');
  const mapEl = document.getElementById('map');

  if (service === 'drones') {
    if (bookingPanel) bookingPanel.style.display = 'none';
    if (mapEl) mapEl.style.display = 'none';
    if (dronePanel) dronePanel.style.display = 'flex';
    loadDroneServices();
    loadDroneMyBookings();
    return;
  }

  if (bookingPanel) bookingPanel.style.display = 'flex';
  if (mapEl) mapEl.style.display = '';
  if (dronePanel) dronePanel.style.display = 'none';

  const btn = document.getElementById('search-btn');
  const btnText = document.getElementById('search-btn-text');
  const banner = document.getElementById('service-banner-area');
  const extra = document.getElementById('extra-fields-area');

  // Reset rides
  document.getElementById('rides-area').style.display = 'none';
  document.getElementById('book-btn').style.display = 'none';
  selectedRide = null;

  btn.className = 'search-btn';
  extra.innerHTML = '';
  banner.innerHTML = '';

  if (service === 'taxi') {
    btn.classList.add('search-btn-blue');
    btnText.textContent = 'Search flights';
    banner.innerHTML = `
      <div class="shuttle-info-banner">
        <strong>Urgency &middot; HNWI &middot; VIP &middot; Diplomat.</strong> Rooftop to rooftop — IGI to your hotel in 18 min. Zero ground transport.
      </div>`;
  } else if (service === 'golden') {
    btn.classList.add('search-btn-red');
    btnText.textContent = 'Dispatch Air Ambulance';
    banner.innerHTML = `
      <div class="emergency-banner" style="margin-bottom:4px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div><strong>For emergencies, call 112 first.</strong> This dispatches DGCA-certified air ambulances &mdash; accident to trauma care within the Golden Hour (T+35 min protocol).</div>
      </div>`;
    extra.innerHTML = `
      <div class="extra-field">
        <label>Nature of Emergency</label>
        <select><option>Accident / Trauma</option><option>Cardiac Emergency</option><option>Stroke</option><option>Burns</option><option>Organ Transport</option><option>Neonatal</option><option>Other Medical</option></select>
      </div>
      <div class="extra-field">
        <label>Contact Phone</label>
        <input type="tel" placeholder="+91 98765 43210">
      </div>`;
  } else {
    btn.classList.add('search-btn-green');
    btnText.textContent = 'Search shuttle routes';
    banner.innerHTML = `
      <div class="shuttle-info-banner">
        <strong>Joy Rides &middot; Tourism &amp; Religious Circuits.</strong> HP scenic corridors, Vaishno Devi &amp; Char Dham — all DGCA-certified.
      </div>`;
  }

  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];

  captureBookingDraft();
  renderPopularRoutes(service);
}

// ── Popular Routes per Service ──
const popularRoutes = {
  taxi: [
    { from: 'Aerocity Vertiport, Delhi', to: 'Hotel Leela Rooftop, Delhi', emoji: '&#128188;', meta: '18&ndash;25 min &middot; 2 pax &middot; &#8377;3,600&ndash;5,600', tag: 'Executive Shuttle' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Taj Mahal Vertiport, Agra', emoji: '&#128508;', meta: '55 min/way &middot; 4 pax &middot; &#8377;13,000&ndash;19,000', tag: 'Agra Express' },
    { from: 'Embassy Vertiport, Chanakyapuri', to: 'Hotel Leela Rooftop, Delhi', emoji: '&#128737;&#65039;', meta: 'Custom &middot; 2&ndash;4 pax &middot; &#8377;9,000&ndash;16,000', tag: 'Diplomatic' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Chandigarh Vertiport', emoji: '&#128640;', meta: '45 min/sector &middot; 6 pax &middot; &#8377;24,000&ndash;40,000', tag: 'Corporate Charter' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Dehradun Vertiport', emoji: '&#128640;', meta: '45 min/sector &middot; 6 pax &middot; &#8377;24,000&ndash;40,000', tag: 'Corporate Charter' },
    { from: 'Noida Sec 62 Vertiport', to: 'Gurugram Cyber Hub', emoji: '&#9992;&#65039;', meta: '22 min &middot; 40 km', tag: 'Inter-city' },
    { from: 'Dwarka Sector 21 Vertiport', to: 'Faridabad Vertiport', emoji: '&#127747;', meta: '16 min &middot; 30 km', tag: 'Inter-city' },
    { from: 'Navi Mumbai Vertiport', to: 'Powai Vertiport, Mumbai', emoji: '&#9992;&#65039;', meta: '12 min &middot; 22 km', tag: 'Business' },
    { from: 'Whitefield Vertiport', to: 'Electronic City Vertiport', emoji: '&#128187;', meta: '16 min &middot; 28 km', tag: 'Tech Hub' },
    { from: 'Hi-Tech City Vertiport', to: 'Shamshabad Vertiport', emoji: '&#9992;&#65039;', meta: '14 min &middot; 25 km', tag: 'Airport Link' },
  ],
  golden: [
    { from: 'Barmana Helipad, Bilaspur', to: 'AIIMS Bilaspur', emoji: '&#127973;', meta: '12 min &middot; Golden Hour corridor', tag: 'HP EMS' },
    { from: 'Bharmour Helipad, Chamba', to: 'Pt. JLN Medical College, Chamba', emoji: '&#128657;', meta: '22 min &middot; 66% fatality district', tag: 'Critical' },
    { from: 'Gagal Vertiport, Kangra', to: 'Dr. RPGMC Tanda, Kangra', emoji: '&#127973;', meta: '15 min &middot; max volume corridor', tag: 'HP EMS' },
    { from: 'Annadale Helipad, Shimla', to: 'IGMC Hospital, Shimla', emoji: '&#128657;', meta: '18 min &middot; high urban corridor', tag: 'HP EMS' },
    { from: 'Nalagarh Helipad, Baddi', to: 'MM Medical College, Solan', emoji: '&#127973;', meta: '14 min &middot; industrial corridor', tag: 'HP EMS' },
    { from: 'Dwarka Sector 21 Vertiport', to: 'Gurugram Medanta Hospital', emoji: '&#127973;', meta: '12 min &middot; 22 km', tag: 'Emergency' },
    { from: 'Thane Vertiport', to: 'Kokilaben Hospital, Mumbai', emoji: '&#127973;', meta: '14 min &middot; 26 km', tag: 'Emergency' },
    { from: 'OMR Vertiport, Chennai', to: 'Apollo Hospital, Chennai', emoji: '&#127973;', meta: '10 min &middot; 18 km', tag: 'Emergency' },
    { from: 'Sarjapur Vertiport', to: 'Narayana Health, Bengaluru', emoji: '&#128657;', meta: '10 min &middot; 18 km', tag: 'Emergency' },
    { from: 'Hi-Tech City Vertiport', to: 'Yashoda Hospital, Hyderabad', emoji: '&#128657;', meta: '6 min &middot; 8 km', tag: 'Emergency' },
    { from: 'Dehradun Vertiport', to: 'AIIMS Rishikesh', emoji: '&#127956;', meta: '12 min &middot; 22 km', tag: 'Remote' },
    { from: 'Leh Vertiport, Ladakh', to: 'SNM Hospital, Leh', emoji: '&#127956;', meta: '3 min &middot; 4 km', tag: 'Remote' },
  ],
  shuttle: [
    { from: 'Bhuntar Vertiport, Kullu', to: 'Manali Vertiport', emoji: '&#127956;', meta: '20 min &middot; &#8377;500&ndash;700 &middot; Pk &#8377;840', tag: 'Joy Ride' },
    { from: 'Gagal Vertiport, Kangra', to: 'Dharamshala Vertiport', emoji: '&#127956;', meta: '12 min &middot; &#8377;400&ndash;560 &middot; Pk &#8377;700', tag: 'Joy Ride' },
    { from: 'Shimla Vertiport', to: 'Kufri Helipad', emoji: '&#127794;', meta: '8 min &middot; &#8377;400&ndash;500 &middot; Pk &#8377;700', tag: 'Joy Ride' },
    { from: 'Manali Vertiport', to: 'Rohtang Pass Helipad', emoji: '&#10052;&#65039;', meta: '15 min &middot; &#8377;700&ndash;1,000 &middot; Pk &#8377;1,300', tag: 'Scenic' },
    { from: 'Katra Vertiport (Vaishno Devi)', to: 'Sanjichhat Helipad (Bhawan)', emoji: '&#128591;', meta: '8 min &middot; &#8377;350&ndash;550 per seat', tag: 'Vaishno Devi' },
    { from: 'Phata Helipad (Char Dham)', to: 'Kedarnath Helipad', emoji: '&#128591;', meta: '10 min &middot; &#8377;2,500&ndash;4,500/sector', tag: 'Char Dham' },
    { from: 'Noida Sec 62 Vertiport', to: 'Gurugram Cyber Hub', emoji: '&#128187;', meta: '22 min &middot; 40 km &middot; Daily 8 slots', tag: 'Business' },
    { from: 'Thane Vertiport', to: 'Navi Mumbai Vertiport', emoji: '&#9992;&#65039;', meta: '14 min &middot; 28 km &middot; Daily 14 slots', tag: 'Commuter' },
    { from: 'Whitefield Vertiport', to: 'Electronic City Vertiport', emoji: '&#128187;', meta: '14 min &middot; 28 km &middot; Daily 10 slots', tag: 'Tech Corridor' },
    { from: 'Hi-Tech City Vertiport', to: 'Shamshabad Vertiport', emoji: '&#128296;', meta: '14 min &middot; 25 km &middot; Daily 12 slots', tag: 'Commuter' },
  ],
};

var ROUTE_ICON_SVG = {
  taxi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.7.5-1.1z"/></svg>',
  golden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  shuttle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
};

function renderPopularRoutes(service) {
  const area = document.getElementById('popular-routes-area');
  const routes = popularRoutes[service] || [];
  const colorMap = { taxi: 'blue', golden: 'red', shuttle: 'green' };
  const color = colorMap[service];
  const hoverCls = service === 'golden' ? 'red-hover' : service === 'shuttle' ? 'green-hover' : '';
  const iconCls = `route-chip-icon-${color}`;
  const routeSvg = ROUTE_ICON_SVG[service] || ROUTE_ICON_SVG.taxi;

  const titleText = service === 'taxi' ? 'Popular Routes' : service === 'golden' ? 'Emergency Routes' : 'Shuttle Routes';
  var routeCount = routes.length;

  area.innerHTML = `
    <button type="button" class="disclosure-toggle popular-routes-toggle" onclick="togglePopularRoutes()" style="color:var(--${color})">
      <svg class="disclosure-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      ${routeSvg} ${titleText}
      <span class="disclosure-count">${routeCount}</span>
    </button>
    <div class="disclosure-content popular-routes-list" style="display:none;">
    ${routes.map(r => `
      <button class="route-chip ${hoverCls}" onclick="selectRoute('${r.from}','${r.to}')">
        <div class="route-chip-icon ${iconCls}">${routeSvg}</div>
        <div class="route-chip-info">
          <div class="route-chip-name">${r.from} &rarr; ${r.to}</div>
          <div class="route-chip-meta">
            <span>${r.meta}</span>
            <span class="route-tag-chip route-tag-chip--${color}">${r.tag}</span>
          </div>
        </div>
        <div class="route-chip-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </button>
    `).join('')}
    </div>
  `;
}

function togglePopularRoutes() {
  var area = document.getElementById('popular-routes-area');
  if (!area) return;
  var content = area.querySelector('.popular-routes-list');
  var toggle = area.querySelector('.popular-routes-toggle');
  if (!content || !toggle) return;
  var open = content.style.display !== 'none';
  content.style.display = open ? 'none' : 'block';
  toggle.classList.toggle('open', !open);
}

function toggleRidesDetails() {
  var wrap = document.getElementById('rides-details-toggle');
  if (!wrap) return;
  var content = document.getElementById('rides-details-content');
  var toggle = wrap.querySelector('.disclosure-toggle');
  if (!content || !toggle) return;
  var open = content.style.display !== 'none';
  content.style.display = open ? 'none' : 'block';
  toggle.classList.toggle('open', !open);
}

function selectRoute(from, to) {
  const fromCoord = demoLocations[from];
  const toCoord = demoLocations[to];
  if (fromCoord) setPickup(fromCoord, from, true);
  if (toCoord) setTimeout(() => setDest(toCoord, to, true), 200);
  var content = document.querySelector('.popular-routes-list');
  var toggle = document.querySelector('.popular-routes-toggle');
  if (content) content.style.display = 'none';
  if (toggle) toggle.classList.remove('open');
}

// ── Ride Data ──
const GST_RATE_CLIENT = 0.18;

// Hard ceiling on the total flight cost shown to a customer (INR, GST
// inclusive). Mirrors MAX_FLIGHT_COST in src/pricing.js — the server clamps
// the charged fare to the same value, so displayed prices never exceed it.
const MAX_FLIGHT_COST_CLIENT = 4380;

// eVTOL operating envelope: aircraft serve routes up to 500 km and roughly a
// 2-hour flight. Cruise ~250 km/h (500 km in 2 h) is used to estimate the
// straight-line flight time from the route distance so the range and time
// limits stay consistent. Mirrored server-side in src/booking-routes.js.
const EVTOL_MAX_RANGE_KM = 500;
const EVTOL_MAX_FLIGHT_MIN = 120;
const EVTOL_CRUISE_KMH = 250;
const rideOptions = {
  taxi: [
    { name: 'IraGo Lite', desc: '2-seater eVTOL, solo or duo', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 500, perKm: 200, baseTime: 18, co2: 2.1 },
    { name: 'IraGo Comfort', desc: '4-seater, spacious cabin', icon: 'gold', badge: '', badgeCls: '', base: 500, perKm: 280, baseTime: 22, co2: 3.4 },
    { name: 'IraGo Premium', desc: '6-seater luxury, lounge seats', icon: 'purple', badge: 'Premium', badgeCls: 'badge-premium', base: 500, perKm: 450, baseTime: 20, co2: 4.8 },
    { name: 'IraGo Eco', desc: 'Shared ride, lowest cost', icon: 'green', badge: 'Cheapest', badgeCls: 'badge-cheapest', base: 500, perKm: 150, baseTime: 32, co2: 1.2 },
  ],
  golden: [
    { name: 'Air Ambulance Basic', desc: 'Stretcher + paramedic', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 5000, perKm: 600, baseTime: 12, co2: 5.2 },
    { name: 'Air Ambulance ICU', desc: 'Full ICU + doctor on board', icon: 'purple', badge: 'Premium', badgeCls: 'badge-premium', base: 5000, perKm: 1100, baseTime: 15, co2: 7.8 },
    { name: 'Neonatal Transport', desc: 'Incubator + neonatal team', icon: 'gold', badge: '', badgeCls: '', base: 5000, perKm: 1200, baseTime: 14, co2: 6.1 },
  ],
  shuttle: [
    { name: 'Shuttle Standard', desc: 'Shared seat, scheduled route', icon: 'green', badge: 'Cheapest', badgeCls: 'badge-cheapest', base: 500, perKm: 80, baseTime: 15, co2: 0.8 },
    { name: 'Shuttle Business', desc: 'Priority boarding, lounge access', icon: 'purple', badge: '', badgeCls: '', base: 500, perKm: 130, baseTime: 12, co2: 1.1 },
    { name: 'Shuttle Express', desc: 'Non-stop, fastest route', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 500, perKm: 180, baseTime: 8, co2: 1.5 },
  ]
};

function calcDistance() {
  if (!pickupCoord || !destCoord) return 25;
  const R = 6371;
  const dLat = (destCoord[0] - pickupCoord[0]) * Math.PI / 180;
  const dLng = (destCoord[1] - pickupCoord[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(pickupCoord[0]*Math.PI/180)*Math.cos(destCoord[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Distance + estimated flight time for the currently selected route, and
// whether it fits the eVTOL envelope (500 km / ~2 h). Returns null until both
// endpoints are set. Single source of truth for the range check used by
// searchRides() and by the landing-point scan guard.
function currentRouteEnvelope() {
  if (!pickupCoord || !destCoord) return null;
  var km = calcDistance();
  var min = Math.round(km / EVTOL_CRUISE_KMH * 60);
  return { km: km, min: min, withinRange: km <= EVTOL_MAX_RANGE_KM && min <= EVTOL_MAX_FLIGHT_MIN };
}

async function searchRides() {
  hideLandingPicker();
  if (!pickupCoord && destCoord) {
    showAuthError('booking-error', 'Where are you flying from?');
    var pi = document.getElementById('pickup-input');
    if (pi) pi.focus();
    document.querySelector('.location-inputs').classList.add('highlight-pickup');
    setTimeout(function () {
      document.querySelector('.location-inputs').classList.remove('highlight-pickup');
    }, 2000);
    return;
  }
  if (!destCoord && pickupCoord) {
    showAuthError('booking-error', 'Where are you flying to?');
    var di = document.getElementById('dest-input');
    if (di) di.focus();
    return;
  }
  if (!pickupCoord && !destCoord) {
    showAuthError('booking-error', 'Set your pickup and destination to search flights');
    var pi2 = document.getElementById('pickup-input');
    if (pi2) pi2.focus();
    return;
  }

  // Source and destination can't be the same place (matches the server's
  // MIN_TRIP_KM guard). Both endpoints are set here, so calcDistance() is real.
  if (calcDistance() < 0.1) {
    showToast('Source and destination cannot be the same. Please pick a different destination.', 'error');
    var di2 = document.getElementById('dest-input');
    if (di2) di2.focus();
    return;
  }

  // eVTOL operating envelope: the selected source/destination must be within
  // range (500 km) and roughly a 2-hour flight. Both endpoints are set here.
  var envelope = currentRouteEnvelope();
  if (envelope && !envelope.withinRange) {
    showOutOfRangeWarning(envelope.km, envelope.min);
    return;
  }

  var searchBtnText = document.getElementById('search-btn-text');
  var searchBtnLabel = searchBtnText.textContent;
  searchBtnText.textContent = 'Searching…';
  document.getElementById('search-btn').disabled = true;

  const draft = captureBookingDraft();
  const dist = draft.distanceKm != null ? draft.distanceKm : calcDistance();
  const rides = rideOptions[currentService];
  const list = document.getElementById('rides-list');
  const area = document.getElementById('rides-area');
  const title = document.getElementById('rides-title');

  title.textContent = currentService === 'taxi' ? 'Choose your flight' : currentService === 'golden' ? 'Air ambulances nearby' : 'Shuttle routes';

  // Live badge: hide until we know operators are actually nearby
  var liveBadge = document.getElementById('rides-live-badge');
  if (liveBadge) liveBadge.style.display = 'none';

  // Route feasibility pre-check at booking time: alert the customer if the
  // route crosses / lands in a restricted (no-fly) zone and surface the 3
  // nearest safe spots as clickable suggestions. The server blocks a blocked
  // route at creation too; this gives a friendly heads-up before payment.
  try {
    const fres = await apiFetch('/api/bookings/feasibility', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: draft.pickup.lat,
        pickupLng: draft.pickup.lng,
        destLat: draft.dest.lat,
        destLng: draft.dest.lng,
        service: draft.service,
        bookingType: draft.service === 'golden' ? 'medical_emergency' : null,
      }),
    });
    const fdata = await fres.json().catch(() => ({}));
    currentRoute = (fdata && fdata.route) ? fdata.route : null;
    currentDiscount = (fdata && fdata.discount) ? fdata.discount : null;
    currentCarbonComparison = (fdata && fdata.carbonComparison) ? fdata.carbonComparison : null;
    currentNearbyOperators = (fdata && fdata.nearbyOperators) ? fdata.nearbyOperators : [];
    if (currentRoute && currentRoute.segments && currentRoute.segments.length) {
      drawRouteFromPlan();
    }
    if (fres.ok && fdata && fdata.feasible === false) {
      list.innerHTML = renderFeasibilityWarning(fdata);
      document.getElementById('book-btn').style.display = 'none';
      document.getElementById('panel-locations').style.display = 'none';
      area.style.display = 'block';
      area.scrollIntoView({ behavior: 'smooth' });
      searchBtnText.textContent = searchBtnLabel;
      document.getElementById('search-btn').disabled = false;
      return;
    }
    if (fres.ok && fdata && fdata.emergencyBypass && fdata.warnings && fdata.warnings.length) {
      const bypassBanner = '<div class="feasibility-warning" style="border-color:var(--amber,#f59e0b);background:rgba(245,158,11,0.08);">' +
        '<div style="font-weight:700;color:var(--amber-dark,#92400e);font-size:13px;">Emergency Clearance Active</div>' +
        '<div style="font-size:12px;color:var(--gray-600);margin-top:4px;">' + escapeHtml(fdata.warnings[0]) + '</div>' +
        '</div>';
      list.insertAdjacentHTML('beforeend', bypassBanner);
    }
  } catch (e) { /* degrade: if feasibility call fails, fall through to rides */ }

  // Live badge: show only when real nearby operators exist
  if (liveBadge) {
    var realOps = currentNearbyOperators.filter(function(c) { return c.name; });
    if (realOps.length > 0) {
      liveBadge.innerHTML = '<span class="live-dot"></span> ' + realOps.length + ' pilot' + (realOps.length === 1 ? '' : 's') + ' nearby';
      liveBadge.style.display = '';
    }
  }

  // Route summary card at top of results
  renderRouteSummary(draft);

  var hasDiscount = currentDiscount && currentDiscount.eligible;
  var discountRate = hasDiscount ? 0.50 : 0;
  var discountRemaining = hasDiscount ? currentDiscount.remaining : 0;

  list.innerHTML = rides.map((r, i) => {
    const subtotal = r.base + r.perKm * dist;
    const fullPrice = Math.min(MAX_FLIGHT_COST_CLIENT, Math.round(subtotal * (1 + GST_RATE_CLIENT) / 100) * 100);
    const price = hasDiscount ? Math.min(MAX_FLIGHT_COST_CLIENT, Math.round(fullPrice * (1 - discountRate) / 100) * 100) : fullPrice;
    const timeFactor = Math.max(0.7, Math.max(0.5, dist / 25) * 0.8);
    const time = Math.round(r.baseTime * timeFactor);
    const co2 = (r.co2 * Math.max(0.5, dist / 25)).toFixed(1);
    const roadTime = Math.round(time * 3.5);
    const discountBadge = hasDiscount
      ? '<span class="ride-badge badge-discount">50% OFF</span>'
      : '';
    const priceHtml = hasDiscount
      ? '<div class="ride-price-val">&#8377;' + price.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-original">&#8377;' + fullPrice.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-est">' + discountRemaining + ' discounted flight' + (discountRemaining === 1 ? '' : 's') + ' left</div>'
      : '<div class="ride-price-val">&#8377;' + price.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-est">incl. 18% GST</div>';
    // Company chip: cycle through nearby operators or show 'Independent operator'
    const opCompanies = currentNearbyOperators.filter(function(c) { return c.name; });
    const comp = opCompanies.length ? opCompanies[i % opCompanies.length] : null;
    const companyChipHtml = comp
      ? '<div class="ride-company-chip">' +
          '<span class="ride-company-monogram">' + escapeHtml((comp.code || comp.name.charAt(0)).slice(0, 3)) + '</span>' +
          '<span class="ride-company-name">' + escapeHtml(comp.name) + '</span>' +
          (comp.rating ? '<span class="ride-company-rating">' + String.fromCharCode(9733) + ' ' + comp.rating + '</span>' : '') +
        '</div>'
      : '<div class="ride-company-chip ride-company-independent">' +
          '<span class="ride-company-name">Independent operator</span>' +
        '</div>';
    return `
      <div class="ride-card" data-idx="${i}" onclick="selectRideCard(this, ${i}, ${price}, ${time}, '${co2}')">
        <div class="ride-card-top">
          <div class="ride-icon ride-icon-${r.icon}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.7.5-1.1z"/></svg>
          </div>
          <div class="ride-info">
            <div class="ride-name">
              ${r.name}
              ${discountBadge}
              ${r.badge ? `<span class="ride-badge ${r.badgeCls}">${r.badge}</span>` : ''}
            </div>
            <div class="ride-meta-line">${time} min &middot; ${Math.round(dist)} km</div>
          </div>
          <div class="ride-price">
            ${priceHtml}
          </div>
        </div>
        ${companyChipHtml}
        <div class="ride-stats">
          <div class="ride-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2"/></svg>
            ~3.5x faster than road
          </div>
          <div class="ride-stat carbon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><circle cx="12" cy="10" r="3"/></svg>
            -${co2} kg CO&#8322;
          </div>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.new-flyer-banner').forEach(function(el) { el.remove(); });
  if (hasDiscount) {
    list.insertAdjacentHTML('beforebegin',
      '<div class="new-flyer-banner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
        '<div><strong>New Flyer Offer!</strong> 50% off your first 3 flights -- ' + discountRemaining + ' remaining</div>' +
      '</div>'
    );
  }

  var detailsHtml = '';
  if (currentCarbonComparison) {
    detailsHtml += renderCarbonComparison(currentCarbonComparison);
  }

  if (currentRoute && currentRoute.feasible !== false) {
    var altProfile = currentRoute.altitudeProfile || {};
    detailsHtml +=
      '<div class="route-info-card">' +
        '<div class="route-info-title">Flight Route</div>' +
        '<div class="route-info-grid">' +
          '<div class="route-info-item"><span class="route-info-label">Distance</span><span class="route-info-val">' + (currentRoute.totalDistanceKm || '--') + ' km</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Fuel est.</span><span class="route-info-val">' + (currentRoute.totalFuelKg || '--') + ' kg</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Detour</span><span class="route-info-val">' + (currentRoute.detourRatio > 1 ? (currentRoute.detourRatio + 'x') : 'Direct') + '</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Altitude</span><span class="route-info-val">' + (altProfile.min || '--') + '--' + (altProfile.max || '--') + ' m</span></div>' +
        '</div>' +
        (currentRoute.reason && currentRoute.reason !== 'direct_clear' ?
          '<div class="route-info-note">' + routeReasonLabel(currentRoute.reason) + '</div>' : '') +
      '</div>';
  }

  var detailsToggle = document.getElementById('rides-details-toggle');
  var detailsContent = document.getElementById('rides-details-content');
  if (detailsHtml && detailsToggle && detailsContent) {
    detailsContent.innerHTML = detailsHtml;
    detailsContent.style.display = 'none';
    detailsToggle.style.display = 'block';
    var toggle = detailsToggle.querySelector('.disclosure-toggle');
    if (toggle) toggle.classList.remove('open');
  } else if (detailsToggle) {
    detailsToggle.style.display = 'none';
  }

  document.getElementById('panel-locations').style.display = 'none';
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth' });
  searchBtnText.textContent = searchBtnLabel;
  document.getElementById('search-btn').disabled = false;
}

// Out-of-range route: eVTOLs only fly within EVTOL_MAX_RANGE_KM. Surface a
// clear, unmissable message (revealed rides panel + toast) and keep the
// location inputs visible so the customer can pick a closer destination.
function showOutOfRangeWarning(km, min) {
  var maxHours = Math.round(EVTOL_MAX_FLIGHT_MIN / 60);
  var list = document.getElementById('rides-list');
  var area = document.getElementById('rides-area');
  var title = document.getElementById('rides-title');
  var routeSummary = document.getElementById('route-summary-card');
  if (routeSummary) { routeSummary.hidden = true; routeSummary.innerHTML = ''; }
  if (title) title.textContent = 'No flights for this route';
  if (list) {
    list.innerHTML =
      '<div class="feasibility-warning">' +
        '<div class="feas-head">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<div>' +
            '<div class="feas-title">Route out of range</div>' +
            '<div class="feas-sub">IraGo eVTOL flights are available only within a ' + EVTOL_MAX_RANGE_KM +
              ' km radius (about a ' + maxHours + '-hour flight). This route is about ' + Math.round(km) +
              ' km (~' + min + ' min).</div>' +
          '</div>' +
        '</div>' +
        '<div class="feas-foot">Pick a destination within ' + EVTOL_MAX_RANGE_KM +
          ' km of your pickup and search again.</div>' +
      '</div>';
  }
  document.getElementById('book-btn').style.display = 'none';
  // Keep #panel-locations visible so the inputs stay editable.
  if (area) { area.style.display = 'block'; area.scrollIntoView({ behavior: 'smooth' }); }
  showToast('eVTOL flights are available within ' + EVTOL_MAX_RANGE_KM + ' km. This route is ~' +
    Math.round(km) + ' km.', 'error');
}

// Render the "restricted area" alert with the 3 nearest safe spots, returned
// by the feasibility pre-check (or by a blocked booking-creation response).
function renderFeasibilityWarning(data) {
  const violations = (data && data.violations && data.violations.length)
    ? data.violations.map(escapeHtml).join('; ')
    : 'This route crosses or ends inside a restricted (no-fly) area.';
  const endpoints = (data && data.blockedEndpoints) || [];
  let endpointsHtml = '';
  endpoints.forEach(function (ep) {
    const label = ep.which === 'pickup' ? 'Pickup' : 'Destination';
    const chips = (ep.suggestions || []).slice(0, 3).map(function (s) {
      const nm = escapeHtml(s.name || (s.lat.toFixed(4) + ', ' + s.lng.toFixed(4)));
      const w = ep.which.replace(/'/g, "\\'");
      const n = (s.name || '').replace(/'/g, "\\'");
      return '<button type="button" class="feas-chip" onclick="chooseFeasibilitySuggestion(\'' +
        w + '\',' + Number(s.lat) + ',' + Number(s.lng) + ',\'' + n + '\')">' +
        '<span class="feas-chip-pin">\uD83D\uDCCD</span><span>' + nm + '</span></button>';
    }).join('');
    endpointsHtml +=
      '<div class="feas-endpoint">' +
        '<div class="feas-endpoint-title">' + escapeHtml(label) + ' is in a restricted area</div>' +
        '<div class="feas-endpoint-msg">' + escapeHtml(ep.message || 'Pick a nearby safe spot instead:') + '</div>' +
        '<div class="feas-suggestions">' + (chips || '<span class="feas-none">No safe alternatives found nearby.</span>') + '</div>' +
      '</div>';
  });
  return (
    '<div class="feasibility-warning">' +
      '<div class="feas-head">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<div>' +
          '<div class="feas-title">Restricted airspace on this route</div>' +
          '<div class="feas-sub">' + violations + '</div>' +
        '</div>' +
      '</div>' +
      (endpointsHtml || '') +
      '<div class="feas-foot">Choose a suggested spot to update your route and search again.</div>' +
    '</div>'
  );
}

// Customer picks one of the 3 nearest safe spots; update the endpoint and
// re-run the search so the warning clears if the new route is feasible.
function chooseFeasibilitySuggestion(which, lat, lng, name) {
  const label = name || (Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4));
  currentRoute = null;
  if (which === 'pickup') setPickup([lat, lng], label, true);
  else setDest([lat, lng], label, true);
  showToast('Updated ' + which + ' to ' + label, 'success');
  searchRides();
}

function selectRideCard(el, idx, price, time, co2) {
  document.querySelectorAll('.ride-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRide = { idx, price, time, co2, name: rideOptions[currentService][idx].name };
  document.getElementById('book-btn').style.display = 'flex';
  document.getElementById('book-btn').className = `search-btn search-btn-${currentService === 'golden' ? 'red' : currentService === 'shuttle' ? 'green' : 'blue'}`;
}

// startDemo() removed — demo mode now auto-triggers on book → pay.
// No separate button needed.

async function bookRide() {
  if (!selectedRide) return;
  hideAuthError('booking-error');

  // Re-capture and gate: a booking cannot be created unless pickup,
  // destination, and service are all set (the server enforces this too).
  const draft = captureBookingDraft();
  if (!bookingDraftReady()) {
    showAuthError('booking-error', 'Please set a pickup, destination, and service before booking.');
    return;
  }

  setBusy('book-btn', true, 'Booking\u2026', 'Confirm Booking');
  try {
    var bookingType = draft.service === 'golden' ? 'medical_emergency' : null;
    const res = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        pickupName: draft.pickup.name,
        pickupLat: draft.pickup.lat,
        pickupLng: draft.pickup.lng,
        destName: draft.dest.name,
        destLat: draft.dest.lat,
        destLng: draft.dest.lng,
        service: draft.service,
        bookingType: bookingType,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 && data && data.code === 'ROUTE_BLOCKED') {
        const list = document.getElementById('rides-list');
        const area = document.getElementById('rides-area');
        if (list) list.innerHTML = renderFeasibilityWarning(data);
        if (area) { area.style.display = 'block'; area.scrollIntoView({ behavior: 'smooth' }); }
        document.getElementById('book-btn').style.display = 'none';
        showAuthError('booking-error', 'This route is restricted. Pick a suggested spot and try again.');
      } else {
        showAuthError('booking-error', data.error || 'Could not create your booking. Please try again.');
      }
      return;
    }

    currentBooking = data.booking;
    currentFareBreakdown = data.fare || null;
    currentCarbonCredits = data.carbonCredits || null;
    if (data.company) currentBooking._company = data.company;
    if (data.weather) currentBooking._weather = data.weather;
    showPaymentOverlay(currentBooking);
  } catch (err) {
    showAuthError('booking-error', 'Network error \u2014 please check your connection and try again.');
  } finally {
    setBusy('book-btn', false, 'Booking\u2026', 'Confirm Booking');
  }
}

// Populate the confirmation overlay from a persisted booking record.
function fillConfirmation(booking) {
  document.getElementById('confirm-id').textContent = 'IRG-' + String(booking.id).padStart(5, '0');
  document.getElementById('confirm-pickup').textContent = booking.pickupName;
  document.getElementById('confirm-dest').textContent = booking.destName;
  document.getElementById('confirm-vehicle').textContent =
    (selectedRide ? selectedRide.name + ' \u00B7 ' : '') + (SERVICE_LABELS[booking.service] || booking.service);
  document.getElementById('confirm-time').textContent = selectedRide ? selectedRide.time + ' min' : '\u2014';
  document.getElementById('confirm-cost').textContent = '\u20B9' + Math.round(booking.fareEstimate).toLocaleString('en-IN');
  const carbon = booking.carbonSavedKg != null ? booking.carbonSavedKg : (selectedRide ? selectedRide.co2 : null);
  document.getElementById('confirm-carbon').textContent = carbon != null ? '-' + carbon + ' kg' : '\u2014';
  var companyEl = document.getElementById('confirm-company');
  if (companyEl) {
    var comp = currentBooking && currentBooking._company;
    companyEl.textContent = comp && comp.name ? comp.name + (comp.officeCity ? ' (' + comp.officeCity + ')' : '') : 'Independent operator';
  }
}

function renderWeatherBar(w) {
  var bar = document.getElementById('payment-weather-bar');
  if (!bar || !w) { if (bar) bar.style.display = 'none'; return; }
  var riskColors = { low: '#15803d', medium: '#b45309', high: '#dc2626' };
  var riskLabels = { low: 'Good', medium: 'Caution', high: 'Adverse' };
  var color = riskColors[w.riskLevel] || riskColors.low;
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span class="weather-condition">' + escapeHtml(w.condition) + ' &middot; ' + w.tempCelsius + '&deg;C</span>' +
    '<span class="weather-wind">Wind ' + w.windSpeedKmh + ' km/h</span>' +
    '<span class="weather-risk" style="color:' + color + '">' + (riskLabels[w.riskLevel] || 'Good') + ' for flight</span>';
}

function showPaymentOverlay(booking) {
  hideAuthError('payment-error');
  resetCoupon();
  document.getElementById('payment-booking-id').textContent = 'IRG-' + String(booking.id).padStart(5, '0');
  updatePaymentTotals(booking.fareEstimate);
  const carbon = booking.carbonSavedKg != null ? booking.carbonSavedKg : (selectedRide ? selectedRide.co2 : null);
  document.getElementById('payment-carbon').textContent = carbon != null ? '-' + carbon + ' kg' : '\u2014';
  renderWeatherBar(booking._weather || null);
  renderFareBreakdown('payment-fare-breakdown', currentFareBreakdown);

  // Carbon credits section \u2014 always visible
  var credSec = document.getElementById('payment-credits-section');
  var credEarn = document.getElementById('payment-credits-earn');
  var cb = document.getElementById('payment-use-credits');
  if (cb) cb.checked = false;
  var balance = currentCarbonCredits ? currentCarbonCredits.balance : 0;
  var willEarn = currentCarbonCredits ? currentCarbonCredits.willEarn : 0;
  credSec.style.display = 'block';
  if (balance > 0) {
    if (cb) cb.disabled = false;
    document.getElementById('payment-credits-balance').textContent =
      balance.toLocaleString('en-IN') + ' credits (= \u20B9' + balance.toLocaleString('en-IN') + ')';
    document.getElementById('payment-credits-detail').textContent = '';
  } else {
    if (cb) cb.disabled = true;
    document.getElementById('payment-credits-balance').textContent = '0 credits';
    document.getElementById('payment-credits-detail').textContent = 'No credits to apply yet';
  }
  if (willEarn > 0) {
    credEarn.style.display = 'block';
    credEarn.innerHTML = '<span class="credits-icon">&#9733;</span> You\'ll earn <strong>' +
      willEarn + ' carbon credits</strong> from this flight';
  } else {
    credEarn.style.display = 'none';
  }

  // Fetch available coupons
  loadAvailableCoupons(booking.id);

  paymentGoToStep(1);
  document.getElementById('payment-overlay').classList.add('active');
}

// ── Payment page steps: 1 = Review & Offers, 2 = Payment method ──
function paymentGoToStep(step) {
  var onStep2 = step === 2;
  var s1 = document.getElementById('payment-step-1');
  var s2 = document.getElementById('payment-step-2');
  var title = document.getElementById('payment-step-title');
  var contBtn = document.getElementById('payment-continue-btn');
  var payBtn = document.getElementById('payment-pay-btn');
  var d1 = document.getElementById('payment-dot-1');
  var d2 = document.getElementById('payment-dot-2');
  if (s1) s1.style.display = onStep2 ? 'none' : 'block';
  if (s2) s2.style.display = onStep2 ? 'block' : 'none';
  if (title) title.textContent = onStep2 ? 'Payment' : 'Review & Offers';
  if (contBtn) contBtn.style.display = onStep2 ? 'none' : 'block';
  if (payBtn) payBtn.style.display = onStep2 ? 'block' : 'none';
  if (d1) d1.classList.toggle('on', !onStep2);
  if (d2) d2.classList.toggle('on', onStep2);
  if (onStep2) updatePaymentRecap();
  var body = onStep2 ? s2 : s1;
  if (body) body.scrollTop = 0;
}

function paymentBack() {
  var s2 = document.getElementById('payment-step-2');
  if (s2 && s2.style.display !== 'none') paymentGoToStep(1);
  else closePayment();
}

// Keep the amount in sync in all three places: step-1 header, step-2 summary,
// and the sticky footer total.
function updatePaymentTotals(total) {
  var t = '₹' + Math.round(Number(total) || 0).toLocaleString('en-IN');
  var a1 = document.getElementById('payment-amount');
  var a2 = document.getElementById('payment-amount-2');
  var f = document.getElementById('payment-footer-total');
  if (a1) a1.textContent = t;
  if (a2) a2.textContent = t;
  if (f) f.textContent = t;
}

function updatePaymentRecap() {
  var recap = document.getElementById('payment-offers-recap');
  if (!recap) return;
  var fb = currentFareBreakdown;
  var parts = [];
  if (fb && fb.discount && fb.discount.amount) {
    parts.push('New flyer &minus;₹' + Number(fb.discount.amount).toLocaleString('en-IN'));
  }
  if (fb && fb.couponApplied && fb.couponApplied.amount) {
    parts.push(escapeHtml(fb.couponApplied.label) + ' &minus;₹' + Number(fb.couponApplied.amount).toLocaleString('en-IN'));
  }
  if (fb && fb.creditsApplied && fb.creditsApplied.amount) {
    parts.push('Carbon credits &minus;₹' + Number(fb.creditsApplied.amount).toLocaleString('en-IN'));
  }
  recap.innerHTML = parts.length ? parts.join(' &middot; ') : 'No offers applied';
}

async function loadAvailableCoupons(bookingId) {
  var chips = document.getElementById('coupon-chips');
  if (!chips) return;
  chips.innerHTML = '<div style="font-size:12px;color:var(--gray-400);">Loading coupons...</div>';
  try {
    var res = await apiFetch('/api/bookings/' + bookingId + '/coupons');
    var data = await res.json().catch(function () { return {}; });
    var coupons = Array.isArray(data.coupons) ? data.coupons : [];
    if (!coupons.length) {
      chips.innerHTML = '<div style="font-size:12px;color:var(--gray-400);">No coupons available right now</div>';
      return;
    }
    chips.innerHTML = coupons.map(function (c) {
      var saveText = c.discountType === 'percent'
        ? c.discountValue + '% off' + (c.maxDiscount ? ' (max \u20B9' + c.maxDiscount.toLocaleString('en-IN') + ')' : '')
        : '\u20B9' + c.discountValue.toLocaleString('en-IN') + ' off';
      return '<button type="button" class="coupon-chip" onclick="selectCouponChip(\'' + escapeHtml(c.code) + '\')">' +
        '<div class="coupon-chip-code">' + escapeHtml(c.code) + '</div>' +
        '<div class="coupon-chip-desc">' + escapeHtml(c.description) + '</div>' +
        '<div class="coupon-chip-save">Save \u20B9' + c.discount.toLocaleString('en-IN') + ' &middot; ' + saveText + '</div>' +
      '</button>';
    }).join('');
  } catch (e) {
    chips.innerHTML = '';
  }
}

function selectCouponChip(code) {
  var input = document.getElementById('coupon-input');
  if (input) { input.value = code; }
  applyCoupon();
}

var appliedCoupon = null;

// Fetch the authoritative payment quote (coupon + credits recomputed on the
// server) and re-render the fare breakdown + amount due from it. The client
// never does its own discount math — /quote is the same computation /pay runs.
async function refreshPaymentQuote(candidateCode) {
  if (!currentBooking) return null;
  var cb = document.getElementById('payment-use-credits');
  var body = {
    couponCode: candidateCode || (appliedCoupon && appliedCoupon.code) || null,
    useCredits: !!(cb && cb.checked && !cb.disabled),
  };
  try {
    var res = await apiFetch('/api/bookings/' + currentBooking.id + '/quote', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.fare) {
      currentFareBreakdown = data.fare;
      renderFareBreakdown('payment-fare-breakdown', data.fare);
      updatePaymentTotals(data.fare.total);
      updatePaymentRecap();
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function applyCoupon() {
  var input = document.getElementById('coupon-input');
  var msg = document.getElementById('coupon-msg');
  var btn = document.getElementById('coupon-apply-btn');
  if (!input || !currentBooking) return;
  var code = input.value.trim().toUpperCase();
  if (!code) { if (msg) msg.textContent = 'Enter a coupon code'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  var data = await refreshPaymentQuote(code);
  if (!data) {
    if (msg) msg.textContent = 'Network error — try again';
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    return;
  }
  if (data.coupon) {
    appliedCoupon = { code: data.coupon.code, discount: data.couponDiscount };
    input.value = data.coupon.code;
    input.disabled = true;
    if (btn) { btn.textContent = 'Applied'; btn.classList.add('applied'); }
    if (msg) {
      msg.innerHTML = '<span class="coupon-success">' + escapeHtml(data.coupon.code) +
        ' applied — ₹' + Number(data.couponDiscount).toLocaleString('en-IN') + ' off!</span>' +
        '<button type="button" class="coupon-remove" onclick="removeCoupon()">Remove</button>';
    }
  } else {
    appliedCoupon = null;
    if (msg) msg.innerHTML = '<span class="coupon-error">' + escapeHtml(data.couponError || 'Invalid coupon') + '</span>';
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  }
}

async function removeCoupon() {
  appliedCoupon = null;
  resetCouponUI();
  await refreshPaymentQuote();
}

function resetCouponUI() {
  var input = document.getElementById('coupon-input');
  var msg = document.getElementById('coupon-msg');
  var btn = document.getElementById('coupon-apply-btn');
  if (input) { input.value = ''; input.disabled = false; }
  if (msg) msg.textContent = '';
  if (btn) { btn.disabled = false; btn.textContent = 'Apply'; btn.classList.remove('applied'); }
}

function resetCoupon() {
  appliedCoupon = null;
  resetCouponUI();
}

async function toggleCredits() {
  var cb = document.getElementById('payment-use-credits');
  var detail = document.getElementById('payment-credits-detail');
  if (!cb) return;
  var data = await refreshPaymentQuote();
  if (!detail) return;
  if (cb.checked && data && data.creditsUsed > 0) {
    detail.innerHTML = 'Applying <strong>' + Number(data.creditsUsed).toLocaleString('en-IN') +
      ' credits (\u20B9' + Number(data.creditsUsed).toLocaleString('en-IN') + ' off)</strong> &middot; max 50% of fare';
  } else if (cb.checked) {
    detail.textContent = 'No credits available to apply';
  } else {
    detail.textContent = '';
  }
}

function closePayment() {
  document.getElementById('payment-overlay').classList.remove('active');
}

// Realistic pickup ETA (minutes) for the "aircraft dispatched" message, based
// on the assigned pilot's distance to the pickup. Matches the live-GPS ETA
// formula so the number is consistent as the plane flies in.
function estimatePickupMinutes(operator) {
  var distKm = 4.5;
  if (operator && operator.gpsLat != null && pickupCoord) {
    distKm = haversineKmClient(operator.gpsLat, operator.gpsLng, pickupCoord[0], pickupCoord[1]);
  }
  return Math.max(6, Math.min(14, Math.round(distKm * 2)));
}

async function payForBooking() {
  if (!currentBooking) return;
  hideAuthError('payment-error');
  setBusy('payment-pay-btn', true, 'Processing\u2026', 'Pay now');
  try {
    var useCredits = document.getElementById('payment-use-credits');
    var payData = {};
    if (useCredits && useCredits.checked) payData.useCredits = true;
    if (appliedCoupon && appliedCoupon.code) payData.couponCode = appliedCoupon.code;
    var payBody = Object.keys(payData).length ? JSON.stringify(payData) : undefined;
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/pay', { method: 'POST', body: payBody });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      showAuthError('payment-error', data.error || 'Payment failed. Please try again.');
      return;
    }
    currentBooking = data.booking;
    currentFareBreakdown = data.fare || currentFareBreakdown;
    closePayment();
    startTracking();
    // The server auto-assigned ONE demo pilot (demo mode). Draw that single
    // plane at its spawn point; the live ride stream animates it in.
    if (data.operator) {
      showPilotCard(data.operator, null, null);
      if (data.operator.gpsLat != null) {
        showAssignedPlane(data.operator.gpsLat, data.operator.gpsLng, data.operator.name);
      }
    }
    // Show a clear "aircraft dispatched — arriving in ~X min" state immediately,
    // instead of the vague "searching for a pilot" placeholder.
    var pickupEtaMin = estimatePickupMinutes(data.operator);
    var statusEl = document.getElementById('tracking-status');
    var subEl = document.getElementById('tracking-sub');
    var etaEl = document.getElementById('tracking-eta');
    if (statusEl) statusEl.textContent = 'Aircraft dispatched!';
    if (subEl) subEl.textContent = 'Your pilot is on the way — arriving in about ' + pickupEtaMin + ' min';
    if (etaEl) etaEl.textContent = pickupEtaMin;
    showToast('✈️ Aircraft dispatched! Arriving in ~' + pickupEtaMin + ' min', 'success');
  } catch (e) {
    showAuthError('payment-error', 'Network error — please try again.');
  } finally {
    setBusy('payment-pay-btn', false, 'Processing\u2026', 'Pay now');
  }
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('active');
  resetBooking();
}

function backToSearch() {
  hideLandingPicker();
  document.getElementById('rides-area').style.display = 'none';
  document.getElementById('book-btn').style.display = 'none';
  document.getElementById('panel-locations').style.display = 'block';
  var detailsToggle = document.getElementById('rides-details-toggle');
  if (detailsToggle) detailsToggle.style.display = 'none';
  var detailsContent = document.getElementById('rides-details-content');
  if (detailsContent) detailsContent.innerHTML = '';
  var summaryCard = document.getElementById('route-summary-card');
  if (summaryCard) summaryCard.hidden = true;
  hideAuthError('booking-error');
  selectedRide = null;
  renderPopularRoutes(currentService);
}

function renderCarbonComparison(cc) {
  if (!cc || !cc.comparisons) return '';
  var evKg = cc.electric.emissionsKg;
  var maxKg = Math.max.apply(null, cc.comparisons.map(function(c) { return c.emissionsKg; }));
  var barMax = maxKg || 1;

  var rows = cc.comparisons.map(function(c) {
    var pct = Math.round((c.emissionsKg / barMax) * 100);
    var colorMap = { conventionalJet: '#ef4444', turboprop: '#f59e0b', groundTaxi: '#6b7280' };
    var color = colorMap[c.key] || '#6b7280';
    return '<div class="cc-row">' +
      '<div class="cc-label">' + escapeHtml(c.label) + '</div>' +
      '<div class="cc-bar-track"><div class="cc-bar" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="cc-val">' + c.emissionsKg + ' kg</div>' +
      '<div class="cc-saved">-' + c.savedPercent + '%</div>' +
    '</div>';
  });

  var evPct = Math.max(3, Math.round((evKg / barMax) * 100));
  var evRow = '<div class="cc-row cc-row-ev">' +
    '<div class="cc-label">' + escapeHtml(cc.electric.label) + '</div>' +
    '<div class="cc-bar-track"><div class="cc-bar cc-bar-ev" style="width:' + evPct + '%"></div></div>' +
    '<div class="cc-val cc-val-ev">' + evKg + ' kg</div>' +
    '<div class="cc-saved cc-saved-ev">Your choice</div>' +
  '</div>';

  var bestSaving = cc.comparisons.reduce(function(best, c) {
    return c.savedPercent > best.savedPercent ? c : best;
  }, cc.comparisons[0]);

  return '<div class="carbon-comparison-card">' +
    '<div class="cc-header">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><circle cx="12" cy="10" r="3"/></svg>' +
      '<div>' +
        '<div class="cc-title">Carbon Savings Comparison</div>' +
        '<div class="cc-subtitle">CO&#8322; emissions for ' + cc.distanceKm + ' km flight</div>' +
      '</div>' +
    '</div>' +
    '<div class="cc-body">' +
      rows.join('') +
      '<div class="cc-divider"></div>' +
      evRow +
    '</div>' +
    '<div class="cc-footer">' +
      '<span class="cc-highlight">Up to ' + bestSaving.savedPercent + '% less CO&#8322;</span> vs ' + escapeHtml(bestSaving.label) +
    '</div>' +
  '</div>';
}

function renderRouteSummary(draft) {
  var host = document.getElementById('route-summary-card');
  if (!host) return;
  if (!draft || !draft.pickup || !draft.dest) { host.hidden = true; return; }
  var distKm = draft.distanceKm != null ? Math.round(draft.distanceKm) : Math.round(calcDistance());
  host.innerHTML =
    '<div class="route-summary-dots">' +
      '<span class="route-summary-dot route-summary-dot--pickup"></span>' +
      '<span class="route-summary-line"></span>' +
      '<span class="route-summary-dot route-summary-dot--dest"></span>' +
    '</div>' +
    '<div class="route-summary-text">' +
      '<span class="route-summary-label">' + escapeHtml(draft.pickup.name) + '</span>' +
      '<span class="route-summary-arrow">&rarr;</span>' +
      '<span class="route-summary-label">' + escapeHtml(draft.dest.name) + '</span>' +
      '<span class="route-summary-dist">&middot; ' + distKm + ' km</span>' +
    '</div>' +
    '<button type="button" class="route-summary-edit" id="route-summary-edit-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      ' Edit' +
    '</button>';
  host.hidden = false;
  var editBtn = document.getElementById('route-summary-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function () { editRouteFromSummary(); });
  }
}

function editRouteFromSummary() {
  document.getElementById('panel-locations').style.display = 'block';
  var summaryCard = document.getElementById('route-summary-card');
  if (summaryCard) summaryCard.hidden = true;
}

function resetBooking() {
  hideLandingPicker();
  document.getElementById('rides-area').style.display = 'none';
  document.getElementById('book-btn').style.display = 'none';
  document.getElementById('panel-locations').style.display = 'block';
  document.getElementById('booking-panel').style.display = 'flex';
  renderPopularRoutes(currentService);
  var summaryCard = document.getElementById('route-summary-card');
  if (summaryCard) summaryCard.hidden = true;
  var detailsToggle = document.getElementById('rides-details-toggle');
  if (detailsToggle) detailsToggle.style.display = 'none';
  var detailsContent = document.getElementById('rides-details-content');
  if (detailsContent) detailsContent.innerHTML = '';
  hideAuthError('booking-error');
  selectedRide = null;
  currentBooking = null;
  currentRoute = null;
  currentDiscount = null;
  currentCarbonComparison = null;
  currentCarbonCredits = null;
  currentNearbyOperators = [];
  pickupCoord = null;
  destCoord = null;
  bookingDraft = { pickup: null, dest: null, service: currentService, distanceKm: null };
  document.getElementById('pickup-input').value = '';
  document.getElementById('dest-input').value = '';
  document.getElementById('pickup-input').classList.remove('has-value', 'gps-filled');
  document.getElementById('dest-input').classList.remove('has-value');
  if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
  if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];
  stopDemoTaxiDrift();
  clearAnimatedMarkersByPrefix('real-', map);
  clearAnimatedMarkersByPrefix('track-operator', map);
  var refineRow = document.getElementById('lp-refine-row');
  if (refineRow) { refineRow.innerHTML = ''; refineRow.hidden = true; }
  // Re-default the source to IIT Madras campus (centres the map on IITM too)
  // so a fresh booking starts from the same default as first load.
  setPickup(IITM_COORD, 'IIT Madras Campus', true);
}

