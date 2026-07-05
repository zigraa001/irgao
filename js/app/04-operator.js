// IraGo app — 04-operator.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Operator: assigned trips (US-009) ──
// Trips assigned to the logged-in operator, fetched from GET /api/operator/trips
// and cached so the details view can render without another round-trip.
let operatorTrips = [];

// Status -> { label, cls } for the operator-facing status badge. Covers every
// status an assigned trip can be in (a booking only reaches an operator once
// dispatch has set operatorId, i.e. status "assigned" onward).
const STATUS_BADGE = {
  requested: { label: 'Requested', cls: 'op-badge--gray' },
  assigned:  { label: 'Assigned',  cls: 'op-badge--blue' },
  accepted:  { label: 'Accepted',  cls: 'op-badge--green' },
  rejected:  { label: 'Rejected',  cls: 'op-badge--red' },
  dispatching: { label: 'Dispatching', cls: 'op-badge--amber' },
  enroute:   { label: 'En route',  cls: 'op-badge--amber' },
  at_pickup: { label: 'At Pickup', cls: 'op-badge--blue' },
  picked_up: { label: 'Picked up', cls: 'op-badge--amber' },
  flying:    { label: 'Flying',    cls: 'op-badge--amber' },
  arrived:   { label: 'Arrived',   cls: 'op-badge--green' },
  completed: { label: 'Completed', cls: 'op-badge--gray' },
  cancelled: { label: 'Cancelled', cls: 'op-badge--red' },
};

function statusBadgeHtml(status) {
  const b = STATUS_BADGE[status] || { label: status || 'Unknown', cls: 'op-badge--gray' };
  return '<span class="op-status-badge ' + b.cls + '">' + escapeHtml(b.label) + '</span>';
}

// Minimal HTML escaping for any DB-sourced text rendered via innerHTML.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function bookingRef(id) { return 'IRG-' + String(id).padStart(5, '0'); }
function fmtINR(n) { return '₹' + Math.round(n || 0).toLocaleString('en-IN'); }

// Fetch the operator's assigned trips and render the list (or the empty state).
async function loadOperatorTrips() {
  const host = document.getElementById('op-trips');
  if (!host) return;
  host.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Loading your trips…</div></div>';
  try {
    const res = await apiFetch('/api/operator/trips');
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    operatorTrips = Array.isArray(data.trips) ? data.trips : [];
  } catch (e) {
    operatorTrips = [];
    host.innerHTML = '<div class="op-empty"><div class="op-empty-title">Could not load trips</div>' +
      '<div class="op-empty-sub">Please try again in a moment.</div></div>';
    return;
  }
  renderOperatorTrips();
}

function renderOperatorTrips() {
  const host = document.getElementById('op-trips');
  if (!host) return;
  if (!operatorTrips.length) {
    host.innerHTML =
      '<div class="op-empty" id="op-empty">' +
      '<div class="op-empty-title">No trips assigned yet</div>' +
      '<div class="op-empty-sub">When dispatch assigns you a mission, it will show up here.</div>' +
      '</div>';
    return;
  }
  host.innerHTML = operatorTrips.map(function (t) {
    const customer = (t.customer && t.customer.name) || 'Customer';
    const service = SERVICE_LABELS[t.service] || t.service;
    const aircraft = t.aircraft ? (t.aircraft.name + ' · ' + t.aircraft.model) : 'Unassigned';
    return (
      '<div class="op-trip-card" onclick="openTripDetails(' + t.id + ')">' +
        '<div class="op-trip-top">' +
          '<div class="op-trip-route">' +
            escapeHtml(t.pickupName) + '<span class="arrow">&rarr;</span>' + escapeHtml(t.destName) +
          '</div>' +
          statusBadgeHtml(t.status) +
        '</div>' +
        '<div class="op-trip-meta">' +
          '<span><b>' + escapeHtml(customer) + '</b></span>' +
          '<span>' + escapeHtml(service) + '</span>' +
          '<span>' + escapeHtml(aircraft) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderTripDetailsBody(t, fuelPlan) {
  const customer = t.customer || {};
  const service = SERVICE_LABELS[t.service] || t.service;
  const aircraft = t.aircraft ? (t.aircraft.name + ' · ' + t.aircraft.model) : 'Not yet assigned';
  const dist = (t.distanceKm != null ? Math.round(t.distanceKm * 10) / 10 : '—') + ' km';
  let fuelBlock = '<div class="op-detail-divider"></div><div class="op-detail-block">' +
    '<div class="op-detail-label">Fuel plan</div>' +
    '<div class="op-detail-sub">Computing least-fuel route…</div></div>';
  if (fuelPlan) {
    if (!fuelPlan.feasible) {
      fuelBlock =
        '<div class="op-detail-divider"></div>' +
        '<div class="op-detail-block">' +
          '<div class="op-detail-label">Fuel plan</div>' +
          '<div class="op-detail-value" style="color:#B91C1C">Route blocked</div>' +
          '<div class="op-detail-sub">' + escapeHtml((fuelPlan.violations || []).join('; ') || 'Airspace restriction') + '</div>' +
        '</div>';
    } else {
      fuelBlock =
        '<div class="op-detail-divider"></div>' +
        '<div class="op-detail-block">' +
          '<div class="op-detail-label">Least-fuel plan</div>' +
          '<div class="op-detail-value">' + fuelPlan.fuelKg + ' kg (' + fuelPlan.fuelLiters + ' L)</div>' +
          '<div class="op-detail-sub">Cruise ' + fuelPlan.cruiseAltitudeM + ' m AGL' +
            (fuelPlan.corridor ? ' · ' + escapeHtml(fuelPlan.corridor) : '') +
            (fuelPlan.warnings && fuelPlan.warnings.length ? '<br>Warning: ' + escapeHtml(fuelPlan.warnings.join('; ')) : '') +
          '</div>' +
        '</div>';
    }
  }

  return (
    '<div class="op-detail-card">' +
      '<div class="op-detail-head">' +
        '<div class="op-detail-id">' + bookingRef(t.id) + '</div>' +
        statusBadgeHtml(t.status) +
      '</div>' +
      '<div class="op-detail-grid">' +
        '<div class="op-detail-block">' +
          '<div class="op-detail-label">Pickup</div>' +
          '<div class="op-detail-value">' + escapeHtml(t.pickupName) + '</div>' +
          '<div class="op-detail-sub">' + t.pickupLat.toFixed(4) + ', ' + t.pickupLng.toFixed(4) + '</div>' +
        '</div>' +
        '<div class="op-detail-block">' +
          '<div class="op-detail-label">Destination</div>' +
          '<div class="op-detail-value">' + escapeHtml(t.destName) + '</div>' +
          '<div class="op-detail-sub">' + t.destLat.toFixed(4) + ', ' + t.destLng.toFixed(4) + '</div>' +
        '</div>' +
        '<div class="op-detail-divider"></div>' +
        '<div>' +
          '<div class="op-detail-label">Service</div>' +
          '<div class="op-detail-value">' + escapeHtml(service) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="op-detail-label">Distance</div>' +
          '<div class="op-detail-value">' + dist + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="op-detail-label">Fare estimate</div>' +
          '<div class="op-detail-value">' + fmtINR(t.fareEstimate) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="op-detail-label">Aircraft</div>' +
          '<div class="op-detail-value">' + escapeHtml(aircraft) + '</div>' +
        '</div>' +
        fuelBlock +
        '<div class="op-detail-divider"></div>' +
        '<div>' +
          '<div class="op-detail-label">Customer</div>' +
          '<div class="op-detail-value">' + escapeHtml(customer.name || '—') + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="op-detail-label">Contact</div>' +
          '<div class="op-detail-value">' + escapeHtml(customer.email || '—') + '</div>' +
        '</div>' +
      '</div>' +
      tripActionsHtml(t) +
      tripRatingHtml(t) +
    '</div>'
  );
}

function tripRatingHtml(t) {
  return '';
}

function selectOpRating(stars) {
  document.querySelectorAll('#op-rate-stars button').forEach(function (b) {
    b.classList.toggle('on', Number(b.getAttribute('data-star')) <= stars);
  });
}

async function submitOperatorRating(id) {
  const picked = document.querySelectorAll('#op-rate-stars button.on').length;
  const errEl = document.getElementById('op-rate-error');
  if (picked < 1) {
    if (errEl) { errEl.textContent = 'Please pick a star rating.'; errEl.classList.add('show'); }
    return;
  }
  const comment = (document.getElementById('op-rate-comment') || {}).value || '';
  const btn = document.getElementById('op-rate-submit');
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch('/api/bookings/' + id + '/rate', {
      method: 'POST',
      body: JSON.stringify({ stars: picked, comment }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const block = document.getElementById('op-rate-block');
      if (block) block.innerHTML = '<div class="op-detail-label">Thanks — rating submitted.</div>';
    } else {
      if (errEl) { errEl.textContent = (data && data.error) || 'Could not submit rating.'; errEl.classList.add('show'); }
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error — please try again.'; errEl.classList.add('show'); }
    if (btn) btn.disabled = false;
  }
}

async function openTripDetails(id) {
  const t = operatorTrips.find(function (x) { return x.id === id; });
  if (!t) return;

  document.getElementById('op-detail-body').innerHTML = renderTripDetailsBody(t, null);
  document.getElementById('op-list-section').style.display = 'none';
  document.getElementById('op-detail-section').style.display = 'block';

  let fuelPlan = null;
  try {
    const res = await apiFetch('/api/route/fuel-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupLat: t.pickupLat,
        pickupLng: t.pickupLng,
        destLat: t.destLat,
        destLng: t.destLng,
        service: t.service
      })
    });
    const data = await res.json().catch(function () { return {}; });
    if (data.plan) fuelPlan = data.plan;
  } catch (e) { /* fuel block stays loading/fallback */ }

  if (operatorTrips.some(function (x) { return x.id === id; })) {
    document.getElementById('op-detail-body').innerHTML = renderTripDetailsBody(t, fuelPlan);
    drawTripRouteOnOperatorMap(t);
  }
}

function drawTripRouteOnOperatorMap(t) {
  if (!opSelfMap) return;
  if (window._opRouteLayer) { opSelfMap.removeLayer(window._opRouteLayer); window._opRouteLayer = null; }
  if (window._opRouteDots) { window._opRouteDots.forEach(function (d) { opSelfMap.removeLayer(d); }); window._opRouteDots = []; }

  apiFetch('/api/bookings/feasibility', {
    method: 'POST',
    body: JSON.stringify({
      pickupLat: t.pickupLat, pickupLng: t.pickupLng,
      destLat: t.destLat, destLng: t.destLng,
      service: t.service,
    }),
  }).then(function (res) { return res.json(); }).then(function (fdata) {
    if (!opSelfMap) return;
    var route = fdata && fdata.route;
    var layers = [];

    if (route && route.segments && route.segments.length) {
      route.segments.forEach(function (seg) {
        var color = (seg.crossedRestricted && seg.crossedRestricted.length) ? '#F59E0B' : '#3B82F6';
        layers.push(L.polyline(
          [[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]],
          { color: color, weight: 3.5, opacity: 0.85, dashArray: (seg.crossedRestricted && seg.crossedRestricted.length) ? '8 5' : null }
        ));
      });

      window._opRouteDots = [];
      if (route.waypoints) {
        route.waypoints.forEach(function (wp, i) {
          if (i === 0 || i === route.waypoints.length - 1) return;
          var dot = L.circleMarker([wp.lat, wp.lng], {
            radius: 4, color: '#fff', fillColor: '#F59E0B', fillOpacity: 1, weight: 2
          }).addTo(opSelfMap);
          window._opRouteDots.push(dot);
        });
      }
    } else {
      layers.push(L.polyline(
        [[t.pickupLat, t.pickupLng], [t.destLat, t.destLng]],
        { color: '#3B82F6', weight: 3, opacity: 0.7, dashArray: '10 6' }
      ));
    }

    window._opRouteLayer = L.layerGroup(layers).addTo(opSelfMap);

    var pickupIcon = L.divIcon({ html: '<div style="font-size:20px;">&#128205;</div>', className: '', iconSize: [24, 24], iconAnchor: [12, 24] });
    var destIcon = L.divIcon({ html: '<div style="font-size:20px;">&#127919;</div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    var pMarker = L.marker([t.pickupLat, t.pickupLng], { icon: pickupIcon }).addTo(opSelfMap);
    var dMarker = L.marker([t.destLat, t.destLng], { icon: destIcon }).addTo(opSelfMap);
    if (!window._opRouteDots) window._opRouteDots = [];
    window._opRouteDots.push(pMarker, dMarker);

    opSelfMap.fitBounds(L.latLngBounds([[t.pickupLat, t.pickupLng], [t.destLat, t.destLng]]).pad(0.3));

    if (route && route.totalFuelKg) {
      var routeEl = document.querySelector('.op-detail-card');
      if (routeEl) {
        var routeInfo = document.createElement('div');
        routeInfo.className = 'op-route-info';
        routeInfo.innerHTML =
          '<div class="op-detail-divider"></div>' +
          '<div class="op-detail-block">' +
            '<div class="op-detail-label">Route plan</div>' +
            '<div class="op-detail-value">' + route.totalDistanceKm + ' km · ' + route.totalFuelKg + ' kg fuel</div>' +
            '<div class="op-detail-sub">' +
              'Altitude ' + (route.altitudeProfile ? route.altitudeProfile.min + '–' + route.altitudeProfile.max + ' m' : '—') +
              ' · Detour ' + (route.detourRatio > 1 ? route.detourRatio + 'x' : 'direct') +
              (route.reason && route.reason !== 'direct_clear' ? ' · ' + routeReasonLabel(route.reason) : '') +
            '</div>' +
          '</div>';
        routeEl.appendChild(routeInfo);
      }
    }
  }).catch(function () {});
}

// Accept / reject / progress controls. Only an assigned trip can be accepted
// or rejected; once accepted, the pilot advances the ride through the Uber-style
// lifecycle: en route → at pickup → take off → complete. #op-action-error
// surfaces a failed action inline.
function tripActionsHtml(t) {
  let html = '<div class="op-action-error" id="op-action-error"></div>';
  if (t.status === 'assigned') {
    html +=
      '<div class="op-actions">' +
        '<div style="color:var(--blue-dark);font-weight:600;margin-bottom:8px;">New ride request</div>' +
        '<button class="op-btn op-btn--accept" onclick="acceptAndStart(' + t.id + ')">Start → Pickup</button>' +
      '</div>';
  } else if (t.status === 'accepted') {
    html +=
      '<div class="op-actions">' +
        '<button class="op-btn op-btn--accept" onclick="advanceTrip(' + t.id + ', \'enroute\')">Start \u2192 Pickup</button>' +
      '</div>';
  } else if (t.status === 'enroute') {
    html +=
      '<div class="op-actions">' +
        '<button class="op-btn op-btn--accept" onclick="advanceTrip(' + t.id + ', \'pickup\')">Mark arrived at pickup</button>' +
      '</div>';
  } else if (t.status === 'at_pickup') {
    html +=
      '<div class="op-otp-verify">' +
        '<div class="op-otp-label">Enter 4-digit OTP from customer to start ride</div>' +
        '<input type="text" id="op-otp-input" class="op-otp-input" maxlength="4" placeholder="----" inputmode="numeric" pattern="[0-9]*">' +
        '<button class="op-btn op-btn--accept" onclick="verifyRideOtp(' + t.id + ')">Verify OTP &amp; Start Ride</button>' +
      '</div>';
  } else if (t.status === 'picked_up') {
    html +=
      '<div class="op-actions">' +
        '<button class="op-btn op-btn--accept" onclick="advanceTrip(' + t.id + ', \'takeoff\')">Take off</button>' +
      '</div>';
  } else if (t.status === 'flying') {
    html +=
      '<div class="op-actions">' +
        '<button class="op-btn op-btn--accept" onclick="advanceTrip(' + t.id + ', \'complete\')">Complete trip</button>' +
      '</div>';
  }
  return html;
}

function advanceTrip(id, action) { return actOnTrip(id, action); }

async function acceptAndStart(id) {
  var errEl = document.getElementById('op-action-error');
  if (errEl) errEl.classList.remove('show');
  document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = true; });
  try {
    var r1 = await apiFetch('/api/operator/trips/' + id + '/accept', { method: 'POST' });
    if (!r1.ok) {
      var d1 = await r1.json().catch(function () { return {}; });
      if (errEl) { errEl.textContent = (d1 && d1.error) || 'Could not accept trip.'; errEl.classList.add('show'); }
      document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = false; });
      return;
    }
    var r2 = await apiFetch('/api/operator/trips/' + id + '/enroute', { method: 'POST' });
    if (!r2.ok) {
      var d2 = await r2.json().catch(function () { return {}; });
      if (errEl) { errEl.textContent = (d2 && d2.error) || 'Could not start enroute.'; errEl.classList.add('show'); }
    }
    await loadOperatorTrips();
    if (operatorTrips.some(function (x) { return x.id === id; })) {
      openTripDetails(id);
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error. Please try again.'; errEl.classList.add('show'); }
    document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = false; });
  }
}

async function verifyRideOtp(bookingId) {
  var input = document.getElementById('op-otp-input');
  var errEl = document.getElementById('op-action-error');
  if (errEl) errEl.classList.remove('show');
  var otp = input ? input.value.trim() : '';
  if (otp.length !== 4) {
    if (errEl) { errEl.textContent = 'Enter the 4-digit OTP from the customer.'; errEl.classList.add('show'); }
    return;
  }
  document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = true; });
  try {
    var res = await apiFetch('/api/operator/bookings/' + bookingId + '/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ otp: otp }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      if (errEl) { errEl.textContent = (data && data.error) || 'Invalid OTP. Try again.'; errEl.classList.add('show'); }
      document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = false; });
      return;
    }
    showToast('OTP verified — ride started', 'success');
    await loadOperatorTrips();
    if (operatorTrips.some(function (x) { return x.id === bookingId; })) {
      openTripDetails(bookingId);
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error — try again.'; errEl.classList.add('show'); }
    document.querySelectorAll('.op-btn').forEach(function (b) { b.disabled = false; });
  }
}

// POST an accept/reject action, then refresh the trip list from the server so
// the customer tracking view and admin dashboard stay in sync with the change.
async function actOnTrip(id, action) {
  const errEl = document.getElementById('op-action-error');
  if (errEl) errEl.classList.remove('show');
  document.querySelectorAll('.op-btn').forEach(b => { b.disabled = true; });
  try {
    const res = await apiFetch('/api/operator/trips/' + id + '/' + action, { method: 'POST' });
    if (!res.ok) {
      let msg = 'Could not ' + action + ' this trip. Please try again.';
      try { const d = await res.json(); if (d && d.error) msg = d.error; } catch (e) {}
      if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
      document.querySelectorAll('.op-btn').forEach(b => { b.disabled = false; });
      return;
    }
    // Reload the assigned trips, then reopen this trip's details (a rejected
    // trip is no longer assigned to us, so fall back to the list).
    await loadOperatorTrips();
    if (operatorTrips.some(function (x) { return x.id === id; })) {
      openTripDetails(id);
    } else {
      closeTripDetails();
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error. Please try again.'; errEl.classList.add('show'); }
    document.querySelectorAll('.op-btn').forEach(b => { b.disabled = false; });
  }
}

function acceptTrip(id) { return actOnTrip(id, 'accept'); }
function rejectTrip(id) { return actOnTrip(id, 'reject'); }

// Return from the details view to the trip list.
function closeTripDetails() {
  const detail = document.getElementById('op-detail-section');
  const list = document.getElementById('op-list-section');
  if (detail) detail.style.display = 'none';
  if (list) list.style.display = 'block';
}

// ── Operator GPS + dispatch SSE ──
function playDispatchTing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.45);

    setTimeout(function () {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = 1174;
      o2.connect(g2);
      g2.connect(ctx.destination);
      g2.gain.setValueAtTime(0.15, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o2.start();
      o2.stop(ctx.currentTime + 0.6);
    }, 200);
  } catch (e) { /* audio optional */ }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    var n = new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      tag: tag || 'irago-dispatch',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 300],
    });
    n.onclick = function () {
      window.focus();
      n.close();
    };
    setTimeout(function () { n.close(); }, 35000);
  } catch (e) { /* notifications optional */ }
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {}
  }
}



function reportOperatorLocation(lat, lng) {
  apiFetch('/api/operator/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: lat, lng: lng })
  }).catch(function () {});
}

function startOperatorGpsHeartbeat() {
  if (operatorGpsInterval) clearInterval(operatorGpsInterval);
  function tick() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        reportOperatorLocation(lat, lng);
        updateOpSelfMap(lat, lng);
      },
      function () {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
  }
  tick();
  operatorGpsInterval = setInterval(tick, 5000);
}

function connectOperatorDispatchStream() {
  if (operatorDispatchSource) {
    operatorDispatchSource.close();
    operatorDispatchSource = null;
  }
  if (typeof EventSource === 'undefined') return;
  const es = new EventSource('/api/operator/dispatch/stream');
  operatorDispatchSource = es;
  es.addEventListener('dispatch_offer', function (ev) {
    try {
      const payload = JSON.parse(ev.data || '{}');
      if (payload.playSound) playDispatchTing();
      showDispatchOffer(payload);
    } catch (e) { /* ignore */ }
  });
  es.addEventListener('dispatch_cancelled', function () {
    hideDispatchOffer();
  });
  es.onerror = function () { /* browser reconnects */ };
}

// WebSocket companion channel (real-time duplex alongside SSE).
function connectOperatorWebSocket() {
  if (operatorWs && operatorWs.readyState === WebSocket.OPEN) return;
  const user = AUTH.user;
  if (!user || user.role !== 'operator') return;
  const token = AUTH.token;
  if (!token) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Auth is verified server-side via the JWT carried in a WebSocket
  // subprotocol (`irago.operator.<token>`), not in the URL — the URL would
  // leak the token into access/proxy logs and referrer headers.
  const ws = new WebSocket(proto + '//' + location.host + '/ws/operator', 'irago.operator.' + token);
  operatorWs = ws;
  ws.onmessage = function (ev) {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_denied') { /* server rejected the token */ return; }
      if (msg.type === 'dispatch_offer') {
        if (msg.playSound) playDispatchTing();
        // Only show if SSE hasn't already shown it.
        if (!activeDispatchOffer || activeDispatchOffer.offerId !== msg.offerId) {
          showDispatchOffer(msg);
        }
      } else if (msg.type === 'dispatch_cancelled') {
        hideDispatchOffer();
      }
    } catch (e) { /* ignore */ }
  };
  ws.onclose = function () {
    // Auto-reconnect after 5s.
    setTimeout(connectOperatorWebSocket, 5000);
  };
  ws.onerror = function () { /* errors handled via onclose */ };
}

async function initOpSelfMap() {
  const el = document.getElementById('op-combined-map');
  if (!el) return;
  const zoneOpts = { showAltitude: true, altitudeHostId: 'operator-zone-altitude' };
  if (!opSelfMap) {
    opSelfMap = L.map('op-combined-map', { zoomControl: true, attributionControl: false })
      .setView([22.5, 79.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
    }).addTo(opSelfMap);
    bindMapZoneLoader(opSelfMap, operatorZoneLayers, zoneOpts);
    opSelfMap.whenReady(function () {
      scheduleMapZoneRefresh(opSelfMap, operatorZoneLayers, zoneOpts, 80);
    });
  }
  scheduleMapZoneRefresh(opSelfMap, operatorZoneLayers, zoneOpts, 300);
  scheduleMapZoneRefresh(opSelfMap, operatorZoneLayers, zoneOpts, 1000);
}

function scheduleMapZoneRefresh(targetMap, layerStore, options, delayMs) {
  setTimeout(function () {
    if (!targetMap) return;
    targetMap.invalidateSize();
    refreshMapZones(targetMap, layerStore, options);
  }, delayMs);
}

// Called after each GPS tick — moves the pilot marker on the combined map.
function updateOpSelfMap(lat, lng) {
  if (!opSelfMap) return;
  const iconHtml = '<div style="font-size:26px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))">🛩️</div>';
  if (!opSelfMarker) {
    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
    opSelfMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 })
      .bindPopup('<b>Your location</b><br>Live GPS · every 5s')
      .addTo(opSelfMap);
    opSelfMap.setView([lat, lng], Math.max(opSelfMap.getZoom(), 12));
    refreshMapZones(opSelfMap, operatorZoneLayers, {
      showAltitude: true,
      altitudeHostId: 'operator-zone-altitude',
    });
  } else {
    opSelfMarker.setLatLng([lat, lng]);
  }
}

function showDispatchOffer(payload) {
  activeDispatchOffer = payload;
  const b = payload.booking || {};

  var isEmergencyRide = b.service === 'golden';
  var nTitle = isEmergencyRide ? 'EMERGENCY Mission Offer' : 'New Ride Request';
  var nBody = (b.pickupName || 'Pickup') + ' → ' + (b.destName || 'Destination') +
    '\nFare: ' + fmtINR(b.fareEstimate) + ' · ' + (b.distanceKm || '?') + ' km';
  sendBrowserNotification(nTitle, nBody, 'dispatch-' + (payload.offerId || ''));

  // Mission id + emergency badge so the pilot can see WHICH request this is
  // and immediately spot air-ambulance (golden) missions that need urgent action.
  const tagsEl = document.getElementById('dispatch-tags');
  if (tagsEl) {
    const isEmergency = b.service === 'golden';
    tagsEl.innerHTML =
      '<span class="dispatch-tag dispatch-tag--mission">Mission #' + escapeHtml(b.id != null ? b.id : payload.requestId != null ? payload.requestId : '?') + '</span>' +
      (isEmergency
        ? '<span class="dispatch-tag dispatch-tag--emergency">Emergency</span>'
        : '') +
      (payload.attempt && payload.maxAttempts
        ? '<span class="dispatch-tag">Request ' + payload.attempt + ' of ' + payload.maxAttempts + '</span>'
        : '');
  }

  document.getElementById('dispatch-route').textContent =
    (b.pickupName || 'Pickup') + ' → ' + (b.destName || 'Destination');
  var companyLine = '';
  if (payload.company && payload.company.name) {
    companyLine = '<br><span style="color:var(--blue);font-weight:600;">' + escapeHtml(payload.company.name) + '</span>';
    if (payload.officeCity) companyLine += ' — ' + escapeHtml(payload.officeCity) + ' Office';
  }
  var etaLine = '';
  if (payload.estimatedPickupMin) {
    etaLine = '<br>ETA to pickup: ~' + payload.estimatedPickupMin + ' min';
  }
  document.getElementById('dispatch-meta').innerHTML =
    'Fare ' + fmtINR(b.fareEstimate) + ' · ' + (b.distanceKm != null ? b.distanceKm + ' km' : '—') +
    '<br>You are ~' + (payload.operatorDistanceKm != null ? payload.operatorDistanceKm : '?') + ' km from pickup' +
    etaLine + companyLine +
    '<br><strong>' + escapeHtml((b.pickupName || 'Pickup')) + '</strong> → <strong>' + escapeHtml((b.destName || 'Destination')) + '</strong>';
  const secs = payload.expiresInSeconds || 30;
  document.getElementById('dispatch-timer').textContent = 'New ride request — auto-accepting...';
  document.getElementById('dispatch-overlay').classList.add('active');
  if (dispatchCountdownTimer) clearInterval(dispatchCountdownTimer);
  setTimeout(function () { respondDispatchOffer(true); }, 1500);
}

function hideDispatchOffer() {
  document.getElementById('dispatch-overlay').classList.remove('active');
  activeDispatchOffer = null;
  if (dispatchCountdownTimer) {
    clearInterval(dispatchCountdownTimer);
    dispatchCountdownTimer = null;
  }
}

async function respondDispatchOffer(accept) {
  if (!activeDispatchOffer || !activeDispatchOffer.offerId) return;
  const id = activeDispatchOffer.offerId;
  const path = '/api/operator/dispatch/offers/' + id + '/' + (accept ? 'accept' : 'reject');
  document.getElementById('dispatch-accept-btn').disabled = true;
  document.getElementById('dispatch-reject-btn').disabled = true;
  try {
    const res = await apiFetch(path, { method: 'POST' });
    hideDispatchOffer();
    if (accept && res.ok) {
      const data = await res.json().catch(function () { return {}; });
      showToast('Mission accepted — heading to pickup', 'success');
      await loadOperatorTrips();
      if (data.booking && data.booking.id) openTripDetails(data.booking.id);
    } else if (!accept) {
      showToast('Mission declined', 'info');
    }
  } catch (e) {
    hideDispatchOffer();
    showToast('Connection error — try again', 'error');
  } finally {
    document.getElementById('dispatch-accept-btn').disabled = false;
    document.getElementById('dispatch-reject-btn').disabled = false;
  }
}


function startNearbyTaxisPoll() {
  if (nearbyTaxisPollInterval) clearInterval(nearbyTaxisPollInterval);
  nearbyTaxisPollInterval = setInterval(refreshNearbyTaxis, 5000);
  refreshNearbyTaxis();
}

function stopNearbyTaxisPoll() {
  if (nearbyTaxisPollInterval) { clearInterval(nearbyTaxisPollInterval); nearbyTaxisPollInterval = null; }
  clearAnimatedMarkersByPrefix('real-', map);
}

async function refreshNearbyTaxis() {
  if (!map || !pickupCoord) return;
  // Once a ride is active, the passenger tracks ONLY their single allocated
  // plane — never the ambient fleet. Bail out so the swarm can't reappear.
  var trackingActive = document.getElementById('tracking-panel');
  if (trackingActive && trackingActive.classList.contains('active')) {
    clearAnimatedMarkersByPrefix('demo-', map);
    clearAnimatedMarkersByPrefix('real-', map);
    return;
  }
  if (pickupCoord && destCoord) {
    if (!demoTaxiMeta.length) renderDemoTaxisOnMap();
    if (!demoTaxiAnimInterval) startDemoTaxiDrift();
  }
  try {
    const res = await apiFetch(
      '/api/tracking/nearby?lat=' +
        encodeURIComponent(pickupCoord[0]) +
        '&lng=' +
        encodeURIComponent(pickupCoord[1])
    );
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) return;
    // Re-check after await: tracking may have started while the fetch was in flight.
    var tp = document.getElementById('tracking-panel');
    if (tp && tp.classList.contains('active')) return;
    clearAnimatedMarkersByPrefix('real-', map);
    (data.taxis || []).forEach(function (t) {
      setAnimatedMapMarker(
        'real-' + t.operatorId,
        map,
        t.lat,
        t.lng,
        '<div class="nearby-taxi-marker" title="Live">✈️</div>',
        '<b>' + escapeHtml(t.operatorName || 'Pilot') + '</b><br>' + escapeHtml(t.tripStatus || 'in transit') +
          '<br>~' + t.distanceKm + ' km'
      );
    });
  } catch (e) { /* ignore */ }
}

async function pollOperatorGpsForRide() {
  if (!currentBooking || !currentBooking.id || !map) return;
  try {
    const res = await apiFetch('/api/tracking/my-ride/' + currentBooking.id);
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.operator || data.operator.lat == null) return;
    trackOperatorGps = { lat: data.operator.lat, lng: data.operator.lng };
    if (trackAircraft) {
      map.removeLayer(trackAircraft);
      const idx = aircraftMarkers.indexOf(trackAircraft);
      if (idx >= 0) aircraftMarkers.splice(idx, 1);
      trackAircraft = null;
    }
    setAnimatedMapMarker(
      'track-operator',
      map,
      data.operator.lat,
      data.operator.lng,
      '<div class="marker-aircraft" style="font-size:28px;">&#9992;&#65039;</div>',
      '<b>' + escapeHtml(data.operator.name || 'Your pilot') + '</b><br>Live GPS'
    );
    if (data.operator.distanceKm != null) {
      document.getElementById('tracking-eta').textContent = Math.max(
        1,
        Math.round(data.operator.distanceKm * 3)
      );
    }
  } catch (e) { /* ignore */ }
}

// Show one top-level .view and hide the rest.
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(viewId);
  if (view) view.classList.add('active');
}

function logout() {
  AUTH.clear();
  window.location.href = '/logout';
}

// On load, restore session via /api/me (cookie + Bearer). Keeps dashboard on reload.
async function restoreSession() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('logout') === '1') {
    AUTH.clear();
    showView('login-view');
    showLoginCard();
    if (window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    return;
  }

  if (params.has('register')) return;

  const cached = AUTH.user;
  if (cached && cached.mustResetPassword) {
    showForcedResetOverlay(cached);
  } else if (cached) {
    routeForRole(cached);
  }

  try {
    const res = await fetch('/api/me', AUTH.fetchOpts({ headers: AUTH.headers() }));
    if (res.status === 401) {
      AUTH.clear();
      showView('login-view');
      showLoginCard();
      return;
    }
    if (!res.ok) {
      if (!cached) showView('login-view');
      return;
    }
    const data = await res.json();
    if (data.user) {
      AUTH.save(data.user, AUTH.token);
      if (data.user.mustResetPassword) {
        showForcedResetOverlay(data.user);
      } else {
        routeForRole(data.user);
      }
    } else if (!cached) {
      showView('login-view');
    }
  } catch (e) {
    if (!cached) showView('login-view');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initAuthPortal();
  bindProfileActions();
  restoreSession();
  const acc = document.getElementById('dispatch-accept-btn');
  const rej = document.getElementById('dispatch-reject-btn');
  if (acc) acc.addEventListener('click', function () { respondDispatchOffer(true); });
  if (rej) rej.addEventListener('click', function () { respondDispatchOffer(false); });
});

window.logout = logout;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;

