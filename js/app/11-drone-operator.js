// IraGo app — 11-drone-operator.js
// Campus drone dispatch console (food-delivery kitchen + live map).

let dopJobs = [];
let dopSelectedId = null;
let dopMap = null;
let dopLayer = null;
let dopMarker = null;
let dopPoll = null;
let dopTrackPoll = null;
let dopAnim = null;

const DOP_NEXT = {
  dispatched: { status: 'picked_up', label: 'Mark picked up' },
  picked_up: { status: 'flying', label: 'Launch drone' },
  flying: { status: 'arriving', label: 'Mark arriving' },
  arriving: { status: 'delivered', label: 'Mark delivered' },
  delivered: { status: 'returning', label: 'Return to pad' },
};

function initDroneOperatorConsole() {
  fillDopSendPoints();
  initDopMap();
  loadDopJobs();
  if (dopPoll) clearInterval(dopPoll);
  dopPoll = setInterval(loadDopJobs, 4000);
  setTimeout(function () { if (dopMap) dopMap.invalidateSize(); }, 400);
}

function fillDopSendPoints() {
  const fromSel = document.getElementById('dop-send-from');
  const toSel = document.getElementById('dop-send-to');
  if (!fromSel || !toSel || typeof campusDropOptions !== 'function') return;
  fromSel.innerHTML = campusDropOptions('Himalaya Mess');
  toSel.innerHTML = campusDropOptions('Central Library');
}

function initDopMap() {
  if (dopMap || typeof L === 'undefined') return;
  const el = document.getElementById('dop-map');
  if (!el) return;
  dopMap = L.map('dop-map', { zoomControl: false }).setView(IITM_COORD, 16);
  L.control.zoom({ position: 'topright' }).addTo(dopMap);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(dopMap);
  dopLayer = L.layerGroup().addTo(dopMap);
}

async function loadDopJobs() {
  const wrap = document.getElementById('dop-jobs');
  if (!wrap) return;
  try {
    const res = await apiFetch('/api/drones/operator/jobs', { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load jobs');
    dopJobs = data.jobs || [];
    renderDopJobs();
    if (dopSelectedId) {
      const still = dopJobs.find(function (j) { return Number(j.booking && j.booking.id) === Number(dopSelectedId); });
      if (still) {
        drawDopJob(still);
        if (document.getElementById('dop-detail-section').style.display !== 'none') {
          renderDopDetail(still);
        }
      }
    }
  } catch (e) {
    wrap.innerHTML = '<div class="op-empty-sub">' + escapeHtml(e.message || 'Could not load orders.') + '</div>';
  }
}

function renderDopJobs() {
  const wrap = document.getElementById('dop-jobs');
  if (!wrap) return;
  if (!dopJobs.length) {
    wrap.innerHTML = '<div class="op-empty"><div class="op-empty-title">No campus orders yet</div><div class="op-empty-sub">New food and parcel hops will land here.</div></div>';
    return;
  }
  let html = '';
  dopJobs.forEach(function (item) {
    const b = item.booking || item;
    const route = (b.pickupName && b.dropName) ? (b.pickupName + ' → ' + b.dropName) : (b.location || 'Campus hop');
    const active = Number(b.id) === Number(dopSelectedId) ? ' dop-job-card--active' : '';
    html += '<button type="button" class="dop-job-card' + active + '" onclick="selectDopJob(' + b.id + ')">' +
      '<div class="drone-booking-head">' +
        '<span class="drone-booking-emoji">' + (b.imageEmoji || '📦') + '</span>' +
        '<div class="drone-booking-info">' +
          '<div class="drone-booking-name">' + escapeHtml(route) + '</div>' +
          '<div class="drone-booking-meta">' + escapeHtml(b.customerName || 'Passenger') +
            (b.parcelType ? ' · ' + escapeHtml(b.parcelType) : '') +
            (b.droneCallsign ? ' · ' + escapeHtml(b.droneCallsign) : '') +
          '</div>' +
        '</div>' +
        '<span class="drone-status ' + droneStatusClass(b.status) + '">' + escapeHtml(droneStatusLabel(b.status)) + '</span>' +
      '</div>' +
    '</button>';
  });
  wrap.innerHTML = html;
}

function selectDopJob(id) {
  dopSelectedId = id;
  const item = dopJobs.find(function (j) { return Number(j.booking && j.booking.id) === Number(id); });
  if (!item) return;
  document.getElementById('dop-jobs-section').style.display = 'none';
  const sendSec = document.getElementById('dop-send-section');
  if (sendSec) sendSec.style.display = 'none';
  document.getElementById('dop-detail-section').style.display = '';
  renderDopDetail(item);
  drawDopJob(item);
  renderDopJobs();
  if (dopTrackPoll) clearInterval(dopTrackPoll);
  dopTrackPoll = setInterval(function () { refreshDopSelected(); }, 2000);
  if (dopAnim) clearInterval(dopAnim);
  dopAnim = setInterval(tickDopAnim, 160);
}

function closeDopJob() {
  dopSelectedId = null;
  if (dopTrackPoll) { clearInterval(dopTrackPoll); dopTrackPoll = null; }
  if (dopAnim) { clearInterval(dopAnim); dopAnim = null; }
  document.getElementById('dop-detail-section').style.display = 'none';
  document.getElementById('dop-jobs-section').style.display = '';
  const sendSec = document.getElementById('dop-send-section');
  if (sendSec) sendSec.style.display = '';
  renderDopJobs();
}

function renderDopDetail(item) {
  const b = item.booking || item;
  const host = document.getElementById('dop-detail');
  if (!host) return;
  const route = (b.pickupName && b.dropName) ? (b.pickupName + ' → ' + b.dropName) : (b.location || 'Campus hop');
  const next = DOP_NEXT[b.status];
  let actions = '';
  if (b.status === 'pending' || b.status === 'confirmed') {
    actions =
      '<div class="drone-form" style="margin-top:12px;">' +
        '<div class="drone-form-row"><label>Drone ID / callsign</label>' +
          '<input id="dop-callsign" class="pd-input" placeholder="IITM-D1" value="' + escapeHtml(b.droneCallsign || 'IITM-D1') + '"></div>' +
        '<div class="drone-form-row"><label>Battery %</label>' +
          '<input id="dop-battery" class="pd-input" type="number" min="1" max="100" value="' + (b.batteryPct || 92) + '"></div>' +
        '<div class="drone-form-row"><label>ETA (minutes)</label>' +
          '<input id="dop-eta" class="pd-input" type="number" min="1" max="60" value="' + (b.etaMin || 8) + '"></div>' +
        '<div class="drone-form-row"><label>Dispatch notes</label>' +
          '<input id="dop-notes" class="pd-input" placeholder="Pad, payload, contact" value="' + escapeHtml(b.dispatchNotes || '') + '"></div>' +
        '<button type="button" class="op-btn drone-book-btn" onclick="submitDopDispatch(' + b.id + ')">Dispatch drone</button>' +
        '<div id="dop-detail-error" class="field-error" style="margin-top:6px;"></div>' +
      '</div>';
  } else if (next) {
    actions =
      '<div class="dop-advance">' +
        (b.droneCallsign ? '<div class="drone-booking-meta">Drone ' + escapeHtml(b.droneCallsign) +
          (b.batteryPct != null ? ' · ' + b.batteryPct + '%' : '') +
          (item.etaRemainingMin != null ? ' · ' + item.etaRemainingMin + ' min ETA' : '') +
        '</div>' : '') +
        '<button type="button" class="op-btn drone-book-btn" onclick="advanceDopStatus(' + b.id + ', \'' + next.status + '\')">' + next.label + '</button>' +
        '<div id="dop-detail-error" class="field-error" style="margin-top:6px;"></div>' +
      '</div>';
  } else {
    actions = '<div class="op-empty-sub">This order is ' + escapeHtml(droneStatusLabel(b.status)) + '.</div>';
  }
  if (b.trackingKey || b.recipientEmail) {
    actions += '<button type="button" class="drone-track-btn" onclick="resendDopTrack(' + b.id + ')">Resend tracking email</button>';
  }

  host.innerHTML =
    '<div class="drone-booking-card" style="margin:0;">' +
      '<div class="drone-booking-head">' +
        '<span class="drone-booking-emoji">' + (b.imageEmoji || '📦') + '</span>' +
        '<div class="drone-booking-info">' +
          '<div class="drone-booking-name">' + escapeHtml(route) + '</div>' +
          '<div class="drone-booking-meta">' + escapeHtml(b.customerName || b.recipientEmail || 'Passenger') +
            (b.trackingKey ? ' · ' + escapeHtml(b.trackingKey) : '') +
            (b.notes ? ' · ' + escapeHtml(b.notes) : '') +
          '</div>' +
        '</div>' +
        '<span class="drone-status ' + droneStatusClass(b.status) + '">' + escapeHtml(droneStatusLabel(b.status)) + '</span>' +
      '</div>' +
      '<div class="drone-booking-details">' +
        (b.parcelType ? '<div>Parcel: ' + escapeHtml(b.parcelType) + '</div>' : '') +
        '<div class="drone-booking-price">₹' + Number(b.totalPrice).toLocaleString('en-IN') + '</div>' +
      '</div>' +
      actions +
    '</div>';
}

function tickDopAnim() {
  if (!dopSelectedId || !dopMarker) return;
  const item = dopJobs.find(function (j) { return Number(j.booking && j.booking.id) === Number(dopSelectedId); });
  if (!item) return;
  const b = item.booking || item;
  const pos = typeof clientDronePos === 'function' ? clientDronePos(b) : null;
  if (pos && pos.lat != null) dopMarker.setLatLng([pos.lat, pos.lng]);
}

function drawDopJob(item) {
  if (!dopMap) initDopMap();
  if (!dopLayer) return;
  dopLayer.clearLayers();
  dopMarker = null;
  const b = item.booking || item;
  const from = (b.pickupLat != null && b.pickupLng != null) ? [Number(b.pickupLat), Number(b.pickupLng)] : null;
  const to = (b.dropLat != null && b.dropLng != null) ? [Number(b.dropLat), Number(b.dropLng)] : null;
  if (from) {
    L.circleMarker(from, { radius: 8, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }).addTo(dopLayer).bindTooltip('Pickup');
  }
  if (to) {
    L.circleMarker(to, { radius: 8, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }).addTo(dopLayer).bindTooltip('Drop');
  }
  if (from && to) {
    L.polyline([from, to], { color: '#0f766e', weight: 3, dashArray: '6 8' }).addTo(dopLayer);
    dopMap.fitBounds([from, to], { padding: [40, 40], maxZoom: 17 });
  }
  const pos = item.drone || (typeof clientDronePos === 'function' ? clientDronePos(b) : null);
  if (pos && pos.lat != null) {
    dopMarker = L.marker([pos.lat, pos.lng], { icon: campusDroneIcon(pos.heading || 0), zIndexOffset: 600 }).addTo(dopLayer);
  }
}

async function refreshDopSelected() {
  if (!dopSelectedId) return;
  try {
    const res = await apiFetch('/api/drones/track/' + dopSelectedId, { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) return;
    const idx = dopJobs.findIndex(function (j) { return Number(j.booking && j.booking.id) === Number(dopSelectedId); });
    if (idx >= 0) dopJobs[idx] = data;
    drawDopJob(data);
    if (document.getElementById('dop-detail-section').style.display !== 'none') renderDopDetail(data);
  } catch (e) {}
}

async function submitDopDispatch(id) {
  const err = document.getElementById('dop-detail-error');
  if (err) err.textContent = '';
  const body = {
    droneCallsign: (document.getElementById('dop-callsign') || {}).value,
    batteryPct: Number((document.getElementById('dop-battery') || {}).value),
    etaMin: Number((document.getElementById('dop-eta') || {}).value),
    notes: (document.getElementById('dop-notes') || {}).value,
  };
  try {
    const res = await apiFetch('/api/drones/operator/jobs/' + id + '/dispatch', {
      method: 'POST',
      headers: AUTH.headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Dispatch failed');
    showToast('Drone dispatched', 'success');
    const idx = dopJobs.findIndex(function (j) { return Number(j.booking && j.booking.id) === Number(id); });
    if (idx >= 0) dopJobs[idx] = data;
    renderDopDetail(data);
    drawDopJob(data);
    loadDopJobs();
  } catch (e) {
    if (err) err.textContent = e.message;
    else showToast(e.message, 'error');
  }
}

async function advanceDopStatus(id, status) {
  const err = document.getElementById('dop-detail-error');
  if (err) err.textContent = '';
  try {
    const res = await apiFetch('/api/drones/operator/jobs/' + id + '/status', {
      method: 'POST',
      headers: AUTH.headers(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    showToast(droneStatusLabel(status), 'success');
    const idx = dopJobs.findIndex(function (j) { return Number(j.booking && j.booking.id) === Number(id); });
    if (idx >= 0) dopJobs[idx] = data;
    if (status === 'completed') {
      closeDopJob();
      loadDopJobs();
      return;
    }
    renderDopDetail(data);
    drawDopJob(data);
  } catch (e) {
    if (err) err.textContent = e.message;
    else showToast(e.message, 'error');
  }
}

async function submitDopSend() {
  const err = document.getElementById('dop-send-error');
  const btn = document.getElementById('dop-send-btn');
  if (err) err.textContent = '';
  const email = ((document.getElementById('dop-send-email') || {}).value || '').trim();
  const fromName = (document.getElementById('dop-send-from') || {}).value;
  const toName = (document.getElementById('dop-send-to') || {}).value;
  if (!email) {
    if (err) err.textContent = "Enter the recipient's email.";
    return;
  }
  if (fromName && toName && fromName === toName) {
    if (err) err.textContent = 'Pickup and destination must be different.';
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }
  try {
    const res = await apiFetch('/api/drones/operator/send', {
      method: 'POST',
      headers: AUTH.headers(),
      body: JSON.stringify({
        recipientEmail: email,
        pickupName: fromName,
        dropName: toName,
        parcelType: (document.getElementById('dop-send-parcel') || {}).value,
        droneCallsign: (document.getElementById('dop-send-callsign') || {}).value,
        batteryPct: Number((document.getElementById('dop-send-battery') || {}).value),
        etaMin: Number((document.getElementById('dop-send-eta') || {}).value),
        notes: (document.getElementById('dop-send-notes') || {}).value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send this drop.');
    const key = data.trackingKey || (data.booking && data.booking.trackingKey);
    showToast(
      (data.emailed ? 'Tracking email sent to ' : 'Drop dispatched. Give them key ') +
        (data.emailed ? email : (key || email)) +
        (data.emailed && key ? ' · ' + key : ''),
      'success'
    );
    const emailEl = document.getElementById('dop-send-email');
    if (emailEl) emailEl.value = '';
    await loadDopJobs();
    const booking = data.booking || data;
    if (booking && booking.id) selectDopJob(booking.id);
  } catch (e) {
    if (err) err.textContent = e.message;
    else showToast(e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send & dispatch';
    }
  }
}

async function resendDopTrack(id) {
  try {
    const res = await apiFetch('/api/drones/operator/jobs/' + id + '/resend-track', {
      method: 'POST',
      headers: AUTH.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not resend.');
    showToast(data.emailed ? 'Tracking email resent' : ('Key ' + (data.trackingKey || '') + ' — email not sent'), data.emailed ? 'success' : 'info');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
