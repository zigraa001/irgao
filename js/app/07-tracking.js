// IraGo app — 07-tracking.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Live Tracking ──
// The status STEPS reflect the REAL persisted booking status, polled from
// GET /api/bookings/:id (the operator advances it via US-010/US-011). The
// aircraft POSITION + ETA on the map are a MOCK/placeholder animation \u2014
// TO BE REPLACED with real GPS telemetry from the aircraft.
let trackingPollInterval = null;   // polls the persisted booking status
let trackingAnimInterval = null;   // mock aircraft animation (placeholder)
let trackPathPoints = [];
let trackCurrentFrac = 0;          // mock marker position along the route (0..1)
let trackTargetFrac = 0;           // position implied by the current status
let trackAircraft = null;
let trackOperatorGps = { lat: null, lng: null };

// ── Smooth map markers (lerp — no jumps) ──
function offsetKm(lat, lng, km, bearingDeg) {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const d = km / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

function startMarkerAnimationLoop() {
  if (markerAnimFrameId != null) return;
  function tick() {
    animatedMarkers.forEach(function (entry) {
      entry.cur[0] += (entry.tgt[0] - entry.cur[0]) * 0.14;
      entry.cur[1] += (entry.tgt[1] - entry.cur[1]) * 0.14;
      entry.layer.setLatLng(entry.cur);
    });
    markerAnimFrameId = requestAnimationFrame(tick);
  }
  markerAnimFrameId = requestAnimationFrame(tick);
}

function setAnimatedMapMarker(key, targetMap, lat, lng, iconHtml, popupHtml) {
  if (!targetMap) return;
  let entry = animatedMarkers.get(key);
  if (!entry) {
    const icon = L.divIcon({
      html: iconHtml,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const layer = L.marker([lat, lng], { icon: icon, zIndexOffset: 500 });
    layer.addTo(targetMap);
    if (popupHtml) layer.bindPopup(popupHtml);
    entry = { layer: layer, cur: [lat, lng], tgt: [lat, lng], map: targetMap };
    animatedMarkers.set(key, entry);
    startMarkerAnimationLoop();
  } else {
    entry.tgt = [lat, lng];
  }
}

function removeAnimatedMapMarker(key) {
  const entry = animatedMarkers.get(key);
  if (!entry) return;
  entry.map.removeLayer(entry.layer);
  animatedMarkers.delete(key);
}

function clearAnimatedMarkersByPrefix(prefix, targetMap) {
  const keys = [];
  animatedMarkers.forEach(function (_v, k) {
    if (k.indexOf(prefix) === 0) keys.push(k);
  });
  keys.forEach(function (k) {
    const entry = animatedMarkers.get(k);
    if (!targetMap || entry.map === targetMap) removeAnimatedMapMarker(k);
  });
}

// Static "parked" demo planes sit AT real vertiports near the pickup. Using
// the known vertiport coordinates (all verified clear of no-fly zones) means a
// plane is NEVER drawn inside a red restricted zone — unlike the old version,
// which placed planes on blind 5/10 km rings that sometimes landed in IGI's
// no-fly circle. They don't drift; they're stable scenery.
function buildDemoTaxisAroundPickup(lat, lng) {
  const MAX_KM = 60; // only show vertiports within ~60 km of the pickup
  const MAX_PLANES = 6;
  const ports = Object.keys(demoLocations).map(function (name) {
    const c = demoLocations[name];
    return { name: name, lat: c[0], lng: c[1], distanceKm: haversineKmClient(lat, lng, c[0], c[1]) };
  });
  return ports
    .filter(function (p) { return p.distanceKm > 0.5 && p.distanceKm <= MAX_KM; })
    .sort(function (a, b) { return a.distanceKm - b.distanceKm; })
    .slice(0, MAX_PLANES)
    .map(function (p, i) { return { id: i, lat: p.lat, lng: p.lng, name: p.name, distanceKm: Math.round(p.distanceKm) }; });
}

function renderDemoTaxisOnMap() {
  if (!map || !pickupCoord) return;
  clearAnimatedMarkersByPrefix('demo-', map);
  demoTaxiMeta = buildDemoTaxisAroundPickup(pickupCoord[0], pickupCoord[1]);
  demoTaxiMeta.forEach(function (tx) {
    setAnimatedMapMarker(
      'demo-' + tx.id,
      map,
      tx.lat,
      tx.lng,
      '<div class="nearby-taxi-marker" title="Parked air taxi">✈️</div>',
      '<b>' + escapeHtml(tx.name) + '</b><br>Available · ~' + tx.distanceKm + ' km away<br><span style="color:#64748B;font-size:11px">Parked at vertiport</span>'
    );
  });
}

// Parked planes are static scenery — no drift. Kept as a no-op so the existing
// start/stop call sites still work without change.
function startDemoTaxiDrift() { /* parked planes do not move */ }

function stopDemoTaxiDrift() {
  if (demoTaxiAnimInterval) {
    clearInterval(demoTaxiAnimInterval);
    demoTaxiAnimInterval = null;
  }
  clearAnimatedMarkersByPrefix('demo-', map);
  demoTaxiMeta = [];
}

// Persisted booking status -> tracking step index (0=confirmed .. 4=arrived)
// plus the customer-facing copy. The DB statuses requested/assigned/accepted
// all map to the "Confirmed" step (a pilot isn't yet en route).
const STATUS_DISPLAY = {
  requested: { step: 0, status: 'Assigning an air taxi...', sub: 'Complete payment to find your pilot' },
  dispatching: { step: 0, status: 'Assigning an air taxi...', sub: 'Searching for the nearest available pilot' },
  assigned:  { step: 0, status: 'Pilot found!', sub: 'Your pilot is preparing for departure' },
  accepted:  { step: 1, status: 'Pilot confirmed', sub: 'Your pilot is getting ready' },
  enroute:   { step: 1, status: 'Pilot en route', sub: 'Your aircraft is on its way to pick you up' },
  at_pickup: { step: 2, status: 'Pilot at pickup', sub: 'Share your OTP with the pilot to start ride' },
  picked_up: { step: 2, status: 'Ride started', sub: 'OTP verified — ride in progress' },
  flying:    { step: 3, status: 'In flight', sub: 'Enjoy the view! Flying to destination' },
  arrived:   { step: 4, status: 'Arriving now', sub: 'Prepare for landing' },
  completed: { step: 4, status: 'Ride complete!', sub: 'Thank you for flying with IraGo' },
  no_pilot:  { step: 0, status: 'Sorry — no pilot found', sub: 'Sorry, we couldn\u2019t find a pilot nearby. Please try again shortly.' },
  rejected:  { step: 0, status: 'Reassigning...', sub: 'Finding you another pilot' },
  cancelled: { step: 0, status: 'Booking cancelled', sub: 'This trip has been cancelled' },
};
// Statuses at which the customer view stops polling.
const TRACKING_TERMINAL = ['arrived', 'completed', 'cancelled', 'rejected', 'no_pilot'];

// Show/hide the empty state vs. the live tracking content.
function showTrackingEmpty(show) {
  document.getElementById('tracking-empty').style.display = show ? 'block' : 'none';
  document.getElementById('tracking-content').style.display = show ? 'none' : 'block';
}

// Fit the map to the whole pickup→dest trip (prefer the drawn route line if
// present). Marked as a programmatic move so it doesn't trigger the manual-pan
// auto-follow pause.
function fitRouteBounds() {
  if (!map) return;
  let bounds = null;
  if (routeLine && routeLine.getBounds) bounds = routeLine.getBounds();
  else if (pickupCoord && destCoord) bounds = L.latLngBounds([pickupCoord, destCoord]);
  if (!bounds || !bounds.isValid()) return;
  programmaticMapMove = true;
  map.fitBounds(bounds.pad(0.3));
  programmaticMapMove = false;
}

async function restoreActiveBooking() {
  try {
    var res = await apiFetch('/api/bookings/active');
    if (!res.ok) return;
    var data = await res.json();
    if (!data.booking) return;
    currentBooking = data.booking;
    pickupCoord = [data.booking.pickupLat, data.booking.pickupLng];
    destCoord = [data.booking.destLat, data.booking.destLng];
    if (data.company) currentBooking._company = data.company;
    if (map) {
      // Clear any markers already on the map so a refresh never double-draws.
      if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
      if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (pickupCoord) {
        pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
      }
      if (destCoord) {
        destMarker = createMarker(destCoord, 'dest').addTo(map);
      }
      if (pickupCoord && destCoord) {
        routeLine = L.polyline([pickupCoord, destCoord], { color: '#1E3A5F', weight: 3, dashArray: '8 4' }).addTo(map);
      }
    }
    startTracking();
    if (data.operator) {
      showPilotCard(data.operator, data.company, data.company ? data.company.officeCity : null);
      if (data.operator.gpsLat != null) {
        showAssignedPlane(data.operator.gpsLat, data.operator.gpsLng, data.operator.name);
      }
    }
    // Belt-and-suspenders for reload: the demo's GPS pushes only reach NEW
    // subscribers via SSE, so a freshly-restored page could sit frozen until the
    // next push. Poll the pilot GPS immediately and then every 2s until the
    // first live GPS arrives, so the plane never appears stuck after a reload.
    pollOperatorGpsForRide();
    var warmup = setInterval(function () {
      if (!currentBooking || TRACKING_TERMINAL.includes(currentBooking.status) ||
          trackOperatorGps.lat != null) { clearInterval(warmup); return; }
      pollOperatorGpsForRide();
    }, 2000);
    setTimeout(function () { clearInterval(warmup); }, 30000);
  } catch (e) {
    // Not just "no active booking" — a throw inside (e.g. in startTracking) used
    // to be silently swallowed here, hiding the real cause of a frozen ride.
    console.error('[restoreActiveBooking] threw:', e);
    RIDE_DEBUG.setupError = 'restore:' + ((e && e.message) || String(e));
    rideDebugBadge();
  }
}

function startTracking() {
  // Tear down any previous ride's timers/stream/GPS state first. Without this,
  // entering tracking a second time (refresh-restore, retry, next booking)
  // leaked the old setInterval handles and left trackOperatorGps stale — which
  // froze the mock plane + ETA for the new ride until its first GPS arrived.
  stopTrackingPolling();
  trackOperatorGps = { lat: null, lng: null };

  document.getElementById('confirm-overlay').classList.remove('active');
  document.getElementById('booking-panel').style.display = 'none';
  document.getElementById('tracking-panel').classList.add('active');

  // The booking->tracking layout change resizes the map container. Recompute
  // Leaflet's size so the route/plane aren't placed against a stale width
  // (which made the map look frozen/blank after payment).
  if (map) {
    map.invalidateSize(false);
    setTimeout(function () { if (map) map.invalidateSize(false); }, 120);
    setTimeout(function () { if (map) map.invalidateSize(false); }, 450);
  }

  // Empty state when there's no active booking to track.
  if (!currentBooking) {
    showTrackingEmpty(true);
    return;
  }
  showTrackingEmpty(false);

  // Fill static trip info from the SAVED booking.
  document.getElementById('tracking-pickup').textContent = currentBooking.pickupName;
  document.getElementById('tracking-dest').textContent = currentBooking.destName;
  document.getElementById('tracking-vehicle-name').textContent =
    selectedRide ? selectedRide.name : (SERVICE_LABELS[currentBooking.service] || currentBooking.service);
  document.getElementById('tracking-cost').textContent =
    '\u20B9' + Math.round(currentBooking.fareEstimate).toLocaleString('en-IN');
  const distKm = currentBooking.distanceKm != null ? currentBooking.distanceKm : calcDistance();
  document.getElementById('tracking-dist').textContent = Math.round(distKm) + ' km';
  document.getElementById('tracking-carbon').textContent =
    currentBooking.carbonSavedKg != null
      ? '-' + currentBooking.carbonSavedKg + ' kg CO\u2082'
      : (selectedRide ? '-' + selectedRide.co2 + ' kg CO\u2082' : '\u2014');

  if (currentBooking._company) {
    var subEl = document.getElementById('tracking-sub');
    if (subEl) subEl.textContent = 'Request sent to ' + currentBooking._company.name + (currentBooking._company.officeCity ? ' — ' + currentBooking._company.officeCity + ' Regional Office' : '');
  }

  // Map/route/marker setup. Wrapped so a throw here cannot abort the ride
  // stream subscription — previously a throw was silently swallowed by
  // restoreActiveBooking's try/catch, leaving WS: idle and the ride frozen
  // with no error banner. The stream + polling below ALWAYS run.
  try {
    fitRouteBounds();
    // Re-frame once the post-payment layout has settled. The booking→tracking
    // switch hides the 420px panel so #map grows; if Leaflet still held a stale
    // size when fitRouteBounds ran above, the route/plane landed in the blank
    // zone and the ride looked frozen. Re-fitting after the delayed
    // invalidateSize calls settle frames the route against the real width.
    setTimeout(fitRouteBounds, 160);
    setTimeout(fitRouteBounds, 480);

    // Build the flight path for the MOCK aircraft animation.
    trackPathPoints = [];
    if (routeLine) {
      routeLine.getLatLngs().forEach(ll => trackPathPoints.push([ll.lat, ll.lng]));
    } else if (pickupCoord && destCoord) {
      for (let t = 0; t <= 1; t += 0.02) {
        trackPathPoints.push([
          pickupCoord[0] + (destCoord[0] - pickupCoord[0]) * t,
          pickupCoord[1] + (destCoord[1] - pickupCoord[1]) * t,
        ]);
      }
    }

    // Reset + add the MOCK aircraft marker (placeholder for real GPS).
    if (map) aircraftMarkers.forEach(m => map.removeLayer(m));
    aircraftMarkers = [];
    trackCurrentFrac = 0;
    trackTargetFrac = 0;
    trackAircraft = null;
    if (trackPathPoints.length && map) {
      const acIcon = L.divIcon({
        html: '<div class="marker-aircraft" style="font-size:28px;">&#9992;&#65039;</div>',
        className: '', iconSize: [30, 30], iconAnchor: [15, 15]
      });
      trackAircraft = L.marker(trackPathPoints[0] || pickupCoord, { icon: acIcon, zIndexOffset: 1000 }).addTo(map);
      aircraftMarkers.push(trackAircraft);
    }

    // Render the status we already have.
    applyTrackingStatus(currentBooking.status);
    // Uber-style: stop showing the nearby fleet — the passenger now tracks only
    // their plane.
    stopNearbyTaxisPoll();
    stopDemoTaxiDrift();
    clearAnimatedMarkersByPrefix('demo-', map);
    clearAnimatedMarkersByPrefix('real-', map);
  } catch (setupErr) {
    RIDE_DEBUG.setupError = (setupErr && setupErr.message) || String(setupErr);
    console.error('[startTracking] setup threw:', setupErr);
    rideDebugBadge();
  }

  // Subscribe to the live ride stream (status + pilot GPS) — ALWAYS, even if the
  // map setup above threw, so the plane still moves and the ride isn't frozen.
  rideFollowOn = true;
  connectRideStream(currentBooking.id);
  // Keep a slow fallback poll in case the WebSocket drops silently.
  if (!TRACKING_TERMINAL.includes(currentBooking.status)) {
    trackingPollInterval = setInterval(function () {
      pollBookingStatus();
      pollOperatorGpsForRide();
    }, 8000);
  }
  pollOperatorGpsForRide();

  // MOCK animation loop — eases the marker toward the status-implied position
  // and updates the (mock) ETA. Stops mattering once real ride_gps arrives.
  trackingAnimInterval = setInterval(animateTrackingAircraft, 120);
}

// Reflect a persisted booking status onto the step UI + progress bar.
function applyTrackingStatus(status) {
  const info = STATUS_DISPLAY[status] || STATUS_DISPLAY.requested;
  document.getElementById('tracking-status').textContent = info.status;
  document.getElementById('tracking-sub').textContent = info.sub;

  const allSteps = document.querySelectorAll('.tracking-step');
  const done = status === 'arrived' || status === 'completed';
  allSteps.forEach((s, idx) => {
    s.classList.remove('done', 'active');
    if (idx < info.step) s.classList.add('done');
    else if (idx === info.step) s.classList.add(done ? 'done' : 'active');
  });

  const span = Math.max(1, allSteps.length - 1);
  document.getElementById('tracking-progress-bar').style.width = ((info.step / span) * 100) + '%';
  document.getElementById('tracking-dot').style.background =
    done ? '#22C55E' : (status === 'cancelled' || status === 'rejected' ? '#EF4444' : '');

  // Drive the MOCK aircraft toward the status-implied position along the
  // pickup→dest path. Skip entirely once REAL pilot GPS is driving the marker
  // — otherwise this yanks the assigned plane toward the destination and
  // fights the live ride_gps updates (the plane appeared at the wrong end).
  trackTargetFrac = info.step / span;
  if (trackOperatorGps.lat == null && trackPathPoints.length >= 2 && trackAircraft) {
    var ptIdx = Math.min(Math.round(trackTargetFrac * (trackPathPoints.length - 1)), trackPathPoints.length - 1);
    var pt = trackPathPoints[ptIdx];
    if (pt) trackAircraft.setLatLng(pt);
  }
  // Only set a mock ETA when there's no live GPS — handleRideGps owns the ETA
  // once the real pilot is reporting distance.
  if (trackOperatorGps.lat == null) {
    var nominalTotal = selectedRide ? selectedRide.time : 20;
    var remaining = Math.max(0, 1 - trackTargetFrac);
    document.getElementById('tracking-eta').textContent = done ? '0' : Math.max(1, Math.round(nominalTotal * remaining));
  } else if (done) {
    document.getElementById('tracking-eta').textContent = '0';
  }

  // Show the "search again" button only when dispatch gave up with no pilot.
  const retryBtn = document.getElementById('tracking-retry-btn');
  if (retryBtn) retryBtn.style.display = (status === 'no_pilot') ? 'block' : 'none';

  var otpCard = document.getElementById('tracking-otp-card');
  if (otpCard) {
    if (['enroute', 'at_pickup'].includes(status)) {
      fetchAndShowRideOtp();
    } else if (['flying', 'arrived', 'completed'].includes(status)) {
      otpCard.style.display = 'none';
    }
  }

  const cancelBtn = document.getElementById('tracking-cancel-btn');
  const endBtn = document.getElementById('tracking-end-btn');
  const terminal = ['completed', 'cancelled', 'no_pilot', 'rejected', 'arrived'].includes(status);
  // Cancellable until the passenger boards. at_pickup (pilot arrived, not yet
  // boarded) is still cancellable; once picked_up/flying it is not.
  const cancellable = !terminal && !['flying', 'picked_up'].includes(status);
  if (cancelBtn) {
    cancelBtn.style.display = cancellable ? 'inline-block' : 'none';
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel ride';
  }
  if (endBtn) {
    endBtn.style.display = terminal ? 'inline-block' : 'none';
  }

  // Rating prompt appears once the ride completes. The customer rates the
  // operator (1–5 + optional comment); the operator rates the customer on
  // their own console.
  const rateBox = document.getElementById('tracking-rate');
  if (rateBox) {
    if (status === 'completed') {
      rateBox.style.display = 'block';
      selectedRatingStars = 0;
      document.querySelectorAll('#tracking-rate-stars button').forEach(b => b.classList.remove('on'));
      const comment = document.getElementById('tracking-rate-comment');
      if (comment) comment.value = '';
      setTimeout(function () { rateBox.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 300);
    } else {
      rateBox.style.display = 'none';
    }
  }
}

// Poll the persisted booking status and re-render. Keeps the last known status
// on a transient error rather than blanking the view.
async function pollBookingStatus() {
  if (!currentBooking) return;
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (!data.booking) return;
    currentBooking = data.booking;
    applyTrackingStatus(currentBooking.status);
    pollOperatorGpsForRide();
    if (TRACKING_TERMINAL.includes(currentBooking.status)) stopTrackingPolling();
  } catch (err) {
    /* transient network error \u2014 keep showing the last known status */
  }
}

// MOCK aircraft animation \u2014 placeholder for real GPS. Eases the marker toward
// the position implied by the booking status and shows a nominal ETA.
function animateTrackingAircraft() {
  if (trackOperatorGps.lat != null) return;
  if (!trackAircraft || trackPathPoints.length < 2) return;
  trackCurrentFrac += (trackTargetFrac - trackCurrentFrac) * 0.08;
  const idx = Math.min(Math.round(trackCurrentFrac * (trackPathPoints.length - 1)), trackPathPoints.length - 1);
  trackAircraft.setLatLng(trackPathPoints[idx]);

  const nominalTotal = selectedRide ? selectedRide.time : 20; // minutes (mock)
  const remaining = Math.max(0, 1 - trackCurrentFrac);
  document.getElementById('tracking-eta').textContent = Math.round(nominalTotal * remaining);
}

// ── Uber-style customer ride stream (SSE) ────────────────────────────────
// After the passenger confirms + pays, we stop showing the nearby fleet and
// subscribe to this booking's ride stream. The server pushes ride_state (the
// current snapshot), ride_update (status changes), and ride_gps (the assigned
// pilot's live position). The passenger sees ONLY their plane — like Uber's
// "track your driver".
let rideStream = null;          // WebSocket to /ws/ride (null when closed)
let rideFollowOn = false;
let rideStreamBookingId = null;
let rideStreamReconnectTimer = null;
let rideStreamClosedByUs = false;

// ── DEBUG: live ride-stream badge (temporary — pinpoints the freeze) ──
const RIDE_DEBUG = {
  streamState: 'idle', updates: 0, gps: 0, lastStatus: '-',
  lastGpsLat: null, lastGpsAt: 0, opened: 0, errors: 0, setupError: null,
};
function rideDebugBadge() {
  var el = document.getElementById('ride-debug-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ride-debug-badge';
    el.style.cssText =
      'position:fixed;top:64px;left:10px;z-index:1500;background:rgba(17,24,39,0.92);' +
      'color:#fff;font:11px/1.45 monospace;padding:8px 10px;border-radius:8px;max-width:340px;' +
      'white-space:pre;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    document.body.appendChild(el);
  }
  var age = RIDE_DEBUG.lastGpsAt
    ? Math.round((Date.now() - RIDE_DEBUG.lastGpsAt) / 1000) + 's ago'
    : 'never';
  var sz = (map && map.getSize) ? map.getSize() : null;
  el.textContent =
    'BUILD ' + (window.__BUILD__ || '?') + '\n' +
    'booking #' + (currentBooking ? currentBooking.id : '-') +
    ' status=' + (currentBooking ? currentBooking.status : '-') + '\n' +
    'WS: ' + RIDE_DEBUG.streamState +
    (rideStream ? ' (rs=' + rideStream.readyState + ')' : '') +
    ' open=' + RIDE_DEBUG.opened + ' err=' + RIDE_DEBUG.errors + '\n' +
    'ride_update: ' + RIDE_DEBUG.updates + ' last=' + RIDE_DEBUG.lastStatus + '\n' +
    'ride_gps: ' + RIDE_DEBUG.gps + ' last=' + (RIDE_DEBUG.lastGpsLat || '-') +
    ' (' + age + ')\n' +
    'trackOperatorGps: ' + (trackOperatorGps.lat != null
      ? trackOperatorGps.lat.toFixed(4) + ',' + trackOperatorGps.lng.toFixed(4) : 'null') + '\n' +
    'mock trackAircraft: ' + (trackAircraft ? 'yes' : 'no') +
    ' frac=' + trackCurrentFrac.toFixed(2) + '->' + trackTargetFrac.toFixed(2) + '\n' +
    'followOn=' + rideFollowOn + ' mapSize=' + (sz ? sz.x + 'x' + sz.y : '-') +
    (RIDE_DEBUG.setupError ? '\nSETUP ERR: ' + RIDE_DEBUG.setupError : '');
}
setInterval(rideDebugBadge, 1000);

function disconnectRideStream() {
  rideStreamClosedByUs = true;
  if (rideStreamReconnectTimer) {
    clearTimeout(rideStreamReconnectTimer);
    rideStreamReconnectTimer = null;
  }
  if (rideStream) {
    try { rideStream.close(); } catch (e) { /* ignore */ }
    rideStream = null;
  }
}

function connectRideStream(bookingId) {
  if (!bookingId) return;
  disconnectRideStream();
  rideStreamClosedByUs = false;
  rideStreamBookingId = bookingId;
  openRideStream();
}

// Open the /ws/ride WebSocket. Auth is via the JWT in the
// `irago.customer.<token>` subprotocol (falls back to the session cookie the
// browser sends on the WS handshake). After auth_ok the client sends the
// bookingId it wants to track; the server validates ownership and pushes the
// initial ride_state, then ride_update / ride_gps / ride_path events.
function openRideStream() {
  if (!rideStreamBookingId) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = proto + '//' + location.host + '/ws/ride';
  const token = AUTH.token;
  const protocols = token ? ['irago.customer.' + token] : undefined;
  let ws;
  try {
    ws = new WebSocket(url, protocols);
  } catch (e) {
    RIDE_DEBUG.streamState = 'throw:' + e.message;
    rideDebugBadge();
    scheduleRideStreamReconnect();
    return;
  }
  rideStream = ws;
  RIDE_DEBUG.streamState = 'ws-connecting';
  rideDebugBadge();

  ws.onopen = function () {
    RIDE_DEBUG.streamState = 'ws-open';
    RIDE_DEBUG.opened++;
    rideDebugBadge();
    try { ws.send(JSON.stringify({ bookingId: rideStreamBookingId })); } catch (e) { /* ignore */ }
  };

  ws.onmessage = function (ev) {
    let d;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || !d.type) return;
    switch (d.type) {
      case 'auth_ok':
        RIDE_DEBUG.streamState = 'auth-ok';
        rideDebugBadge();
        break;
      case 'auth_denied':
        RIDE_DEBUG.streamState = 'auth-denied';
        rideDebugBadge();
        break;
      case 'error':
        RIDE_DEBUG.streamState = 'srv-error:' + (d.error || '?');
        rideDebugBadge();
        break;
      case 'ride_state':
        RIDE_DEBUG.streamState = 'open';
        if (d.status) RIDE_DEBUG.lastStatus = d.status;
        rideDebugBadge();
        handleRideState(d);
        break;
      case 'ride_update':
        RIDE_DEBUG.updates++;
        if (d.status) RIDE_DEBUG.lastStatus = d.status;
        rideDebugBadge();
        handleRideUpdate(d);
        break;
      case 'ride_gps':
        RIDE_DEBUG.gps++;
        if (d.lat != null && d.lng != null) {
          RIDE_DEBUG.lastGpsLat = d.lat.toFixed(4) + ',' + d.lng.toFixed(4);
          RIDE_DEBUG.lastGpsAt = Date.now();
        }
        rideDebugBadge();
        if (d.lat != null && d.lng != null) handleRideGps(d);
        break;
      case 'ride_path':
        handleRidePath(d);
        break;
      case 'dispatch_progress':
        handleDispatchProgress(d);
        break;
    }
  };

  ws.onclose = function () {
    RIDE_DEBUG.streamState = 'ws-closed';
    rideDebugBadge();
    // EventSource auto-reconnected; WebSocket does not, so reconnect ourselves
    // (unless we closed it on purpose). The 8s fallback poll also keeps status
    // fresh if the socket stays down.
    if (!rideStreamClosedByUs) scheduleRideStreamReconnect();
  };

  ws.onerror = function () {
    RIDE_DEBUG.errors++;
    RIDE_DEBUG.streamState = 'ws-error';
    rideDebugBadge();
  };
}

function scheduleRideStreamReconnect() {
  if (rideStreamClosedByUs) return;
  if (rideStreamReconnectTimer) return;
  rideStreamReconnectTimer = setTimeout(function () {
    rideStreamReconnectTimer = null;
    if (!rideStreamClosedByUs && rideStreamBookingId) openRideStream();
  }, 2000);
}

// ride_update handler — extracted so the WebSocket message path reuses it.
function handleRideUpdate(d) {
  if (d.status) {
    if (currentBooking) { currentBooking.status = d.status; }
    applyTrackingStatus(d.status);
    if (TRACKING_TERMINAL.includes(d.status)) {
      stopTrackingPolling();
      // Ride over — zoom back out to the whole trip so the map isn't left
      // parked wherever the plane stopped.
      fitRouteBounds();
    }
  }
  if (d.pilot) {
    showPilotCard(d.pilot, d.company, d.officeCity);
    // Draw the plane at the pilot's spawn point (~4.5 km out) the moment it
    // is assigned, so the passenger sees it BEFORE it starts flying in.
    if (d.pilot.lat != null && d.pilot.lng != null && trackOperatorGps.lat == null) {
      showAssignedPlane(d.pilot.lat, d.pilot.lng, d.pilot.name);
    }
  }
  if (d.estimatedPickupMin) {
    document.getElementById('tracking-eta').textContent = d.estimatedPickupMin;
  }
  if (d.status === 'assigned' || d.status === 'accepted' || d.status === 'enroute') {
    fetchAndShowRideOtp();
    pollOperatorGpsForRide();
  }
  if (d.status === 'picked_up') {
    document.getElementById('tracking-otp-card').style.display = 'none';
  }
}

// ride_path handler — redraw the route line as the curved no-fly-avoiding path.
function handleRidePath(d) {
  if (Array.isArray(d.waypoints) && d.waypoints.length >= 2 && map) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    routeLine = L.polyline(d.waypoints, { color: '#1E3A5F', weight: 3, dashArray: '8 4' }).addTo(map);
  }
}

// Initial snapshot from the server: set status + draw the assigned plane if any.
function handleRideState(d) {
  if (d.status) {
    if (currentBooking) { currentBooking.status = d.status; }
    applyTrackingStatus(d.status);
  }
  if (d.operator && d.operator.lat != null) {
    showAssignedPlane(d.operator.lat, d.operator.lng, d.operator.name);
  }
}

// Live GPS from the assigned pilot — move the plane marker + update ETA.
function handleRideGps(d) {
  trackOperatorGps = { lat: d.lat, lng: d.lng };
  showAssignedPlane(d.lat, d.lng);
  if (d.distanceKm != null) {
    // Same factor as estimatePickupMinutes so the ETA stays consistent with the
    // "dispatched — arriving in ~X min" message as the plane flies in.
    document.getElementById('tracking-eta').textContent = Math.max(1, Math.round(d.distanceKm * 2));
  }
  // Auto-follow the plane — but not while the user is manually exploring the
  // map. Resume 30s after their last pan/zoom.
  if (rideFollowOn && map && (Date.now() - userMovedMapAt > RIDE_FOLLOW_RESUME_MS)) {
    programmaticMapMove = true;
    map.panTo([d.lat, d.lng]);
    programmaticMapMove = false;
  }
}

function showPilotCard(pilot, company, officeCity) {
  var card = document.getElementById('tracking-pilot-card');
  if (!card || !pilot) return;
  card.style.display = 'flex';
  var avatar = document.getElementById('tracking-pilot-avatar');
  if (avatar) avatar.textContent = (pilot.name || 'P').charAt(0).toUpperCase();
  var nameEl = document.getElementById('tracking-pilot-name');
  if (nameEl) nameEl.textContent = pilot.name || 'Your Pilot';
  var metaEl = document.getElementById('tracking-pilot-meta');
  var parts = [];
  if (pilot.aircraftType) parts.push(pilot.aircraftType);
  if (pilot.aircraftReg) parts.push(pilot.aircraftReg);
  if (metaEl) metaEl.textContent = parts.length ? parts.join(' · ') : '';
  var compEl = document.getElementById('tracking-pilot-company');
  var compParts = [];
  if (company && company.name) compParts.push(company.name);
  if (officeCity) compParts.push(officeCity + ' Regional Office');
  if (compEl) compEl.textContent = compParts.length ? compParts.join(' — ') : '';
  var vn = document.getElementById('tracking-vehicle-name');
  if (vn) vn.textContent = (pilot.name || 'Your pilot') + ' · ' + (pilot.aircraftType || 'eVTOL');
}

async function fetchAndShowRideOtp() {
  if (!currentBooking || !currentBooking.id) return;
  try {
    var res = await apiFetch('/api/bookings/' + currentBooking.id + '/ride-otp');
    if (!res.ok) return;
    var data = await res.json();
    if (data.rideOtp) {
      document.getElementById('tracking-otp-card').style.display = '';
      document.getElementById('tracking-otp-code').textContent = data.rideOtp;
    }
  } catch (e) { /* OTP not yet available */ }
}

// Dispatch progress: shows the passenger which operator we're currently
// waiting on ("Waiting for operator 1 of 10…") or the final "sorry" message
// when no pilot could be found. Updates the tracking sub-text live without
// changing the persisted status step.
function handleDispatchProgress(d) {
  if (!d || !d.message) return;
  const subEl = document.getElementById('tracking-sub');
  if (subEl) subEl.textContent = d.message;
  if (d.final) {
    const statusEl = document.getElementById('tracking-status');
    if (statusEl) statusEl.textContent = 'Sorry — no pilot found';
  }
}

// Customer-initiated retry when dispatch gave up (status === 'no_pilot').
// Re-enters the nearest-pilot search via POST /api/bookings/:id/retry-dispatch.
async function retryDispatch() {
  if (!currentBooking || !currentBooking.id) return;
  const btn = document.getElementById('tracking-retry-btn');
  if (btn) { btn.disabled = true; }
  const subEl = document.getElementById('tracking-sub');
  if (subEl) subEl.textContent = 'Searching for a nearby pilot again…';
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/retry-dispatch', {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.booking) {
      currentBooking = data.booking;
      applyTrackingStatus(currentBooking.status);
      if (!rideStream) connectRideStream(currentBooking.id);
      // Restart the fallback poll: stopTrackingPolling() ran when we hit
      // no_pilot, so without this a silent SSE drop after retry would leave the
      // ride frozen with no recovery.
      if (!trackingPollInterval && !TRACKING_TERMINAL.includes(currentBooking.status)) {
        trackingPollInterval = setInterval(function () {
          pollBookingStatus();
          pollOperatorGpsForRide();
        }, 8000);
      }
    } else {
      if (subEl) subEl.textContent = (data && data.error) ? data.error : 'Could not retry right now. Please try again shortly.';
    }
  } catch (e) {
    if (subEl) subEl.textContent = 'Network error — please try again shortly.';
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// Render the ONE plane the passenger is allowed to see (Uber-style). Removes
// the fleet/nearby markers and the mock aircraft, replacing them with the
// assigned plane's live position.
function showAssignedPlane(lat, lng, name) {
  if (!map) return;
  // Drop any fleet markers — the passenger now tracks only their plane.
  stopNearbyTaxisPoll();
  stopDemoTaxiDrift();
  clearAnimatedMarkersByPrefix('demo-', map);
  clearAnimatedMarkersByPrefix('real-', map);
  // Remove the mock aircraft marker if present.
  if (trackAircraft) {
    map.removeLayer(trackAircraft);
    const idx = aircraftMarkers.indexOf(trackAircraft);
    if (idx >= 0) aircraftMarkers.splice(idx, 1);
    trackAircraft = null;
  }
  const label = name != null ? escapeHtml(name) : 'Your pilot';
  setAnimatedMapMarker(
    'track-operator',
    map,
    lat,
    lng,
    '<div class="marker-aircraft" style="font-size:30px;">&#9992;&#65039;</div>',
    '<b>' + label + '</b><br>Live GPS &middot; your air taxi'
  );
  if (name) {
    const vn = document.getElementById('tracking-vehicle-name');
    if (vn) vn.textContent = name + ' \u00B7 your pilot';
  }
}

function stopTrackingPolling() {
  if (trackingPollInterval) { clearInterval(trackingPollInterval); trackingPollInterval = null; }
  if (trackingAnimInterval) { clearInterval(trackingAnimInterval); trackingAnimInterval = null; }
  rideFollowOn = false;
  disconnectRideStream();
}

function endTracking() {
  stopTrackingPolling();
  trackAircraft = null;
  trackOperatorGps = { lat: null, lng: null };
  clearAnimatedMarkersByPrefix('track-operator', map);
  document.getElementById('tracking-panel').classList.remove('active');
  document.getElementById('booking-panel').style.display = 'flex';
  showTrackingEmpty(false);

  // Reset step states for the next ride.
  document.querySelectorAll('.tracking-step').forEach(s => s.classList.remove('done', 'active'));
  document.getElementById('step-confirmed').classList.add('done');
  document.getElementById('step-enroute').classList.add('active');
  document.getElementById('tracking-progress-bar').style.width = '0%';
  document.getElementById('tracking-dot').style.background = '';
  document.getElementById('tracking-eta').textContent = '--';
  document.getElementById('tracking-pilot-card').style.display = 'none';
  document.getElementById('tracking-otp-card').style.display = 'none';

  resetBooking();
}

