// IraGo app — 08-actions.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ════════════════════════════════════════════════════════════════════════
// CANCELLATION (Uber/Ola-style) + RATINGS + FARE BREAKDOWN + RIDE HISTORY
// ════════════════════════════════════════════════════════════════════════
let currentFareBreakdown = null;
let selectedRatingStars = 0;

function renderFareBreakdown(hostId, fare) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!fare) { host.innerHTML = ''; return; }
  const money = n => '&#8377;' + Number(n).toLocaleString('en-IN');
  var taxLabel = fare.taxLabel || 'Taxes';
  var discountRow = '';
  if (fare.discount && fare.discount.amount) {
    discountRow = '<div class="fb-row fb-discount"><span>' + escapeHtml(fare.discount.label) + '</span><span>-' + money(fare.discount.amount) + '</span></div>';
  }
  host.innerHTML =
    '<div class="fb-row"><span>Base fare</span><span>' + money(fare.base) + '</span></div>' +
    '<div class="fb-row"><span>Per-km (' + money(fare.perKm) + '/km &times; ' + fare.distanceKm + ' km)</span><span>' + money(fare.kmCharge) + '</span></div>' +
    (fare.surge ? '<div class="fb-row"><span>Surge</span><span>' + money(fare.surge) + '</span></div>' : '') +
    '<div class="fb-row" style="color:#888"><span>Subtotal</span><span>' + money(fare.subtotal) + '</span></div>' +
    discountRow +
    (fare.taxes ? '<div class="fb-row"><span>' + taxLabel + '</span><span>' + money(fare.taxes) + '</span></div>' : '') +
    '<div class="fb-total"><span>Total</span><span>' + money(fare.total) + '</span></div>';
}

// Customer cancels the active ride. Server applies Uber/Ola rules and returns
// the policy (free / fee). We surface it in the tracking sub-text.
async function cancelBooking() {
  if (!currentBooking || !currentBooking.id) return;
  if (!confirm('Cancel this ride? A fee may apply after your pilot is assigned and 5 minutes pass.')) return;
  const btn = document.getElementById('tracking-cancel-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/cancel', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.booking) {
      currentBooking = data.booking;
      applyTrackingStatus(currentBooking.status);
      const c = data.cancellation || {};
      const subEl = document.getElementById('tracking-sub');
      // Refund line: any amount the passenger gets back lands in 2 working days.
      const fare = Number(data.booking.fareEstimate) || 0;
      const refund = c.refund != null ? c.refund : fare;
      const refundLine = refund > 0
        ? '\nYour refund of ₹' + refund.toLocaleString('en-IN') + ' will be credited within 2 working days.'
        : '';
      const msg = c.policy === 'free'
        ? 'Trip cancelled — no charge applied.' + refundLine
        : 'Trip cancelled — a cancellation fee of ₹' + (c.fee || 0).toLocaleString('en-IN') + ' applies.' + refundLine;
      if (subEl) subEl.textContent = msg;
      showToast(msg, 'success');
      // Ride is over — stop tracking, remove the plane and all markers from map.
      stopTrackingPolling();
      trackOperatorGps = { lat: null, lng: null };
      clearAnimatedMarkersByPrefix('track-operator', map);
      clearAnimatedMarkersByPrefix('demo-', map);
      clearAnimatedMarkersByPrefix('real-', map);
      // Remove the mock aircraft marker too.
      if (trackAircraft) {
        map.removeLayer(trackAircraft);
        const acIdx = aircraftMarkers.indexOf(trackAircraft);
        if (acIdx >= 0) aircraftMarkers.splice(acIdx, 1);
        trackAircraft = null;
      }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Cancel ride'; }
      alert((data && data.error) || 'Could not cancel right now.');
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel ride'; }
    alert('Network error — please try again.');
  }
}

// Star selection for the post-ride rating prompt.
function selectRating(stars) {
  selectedRatingStars = stars;
  document.querySelectorAll('#tracking-rate-stars button').forEach(b => {
    b.classList.toggle('on', Number(b.getAttribute('data-star')) <= stars);
  });
}

async function submitRating() {
  if (!currentBooking || !currentBooking.id) return;
  if (selectedRatingStars < 1) {
    const err = document.getElementById('tracking-rate-error');
    if (err) err.textContent = 'Please pick a star rating.';
    return;
  }
  const comment = (document.getElementById('tracking-rate-comment') || {}).value || '';
  const btn = document.getElementById('tracking-rate-submit');
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/rate', {
      method: 'POST',
      body: JSON.stringify({ stars: selectedRatingStars, comment }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const box = document.getElementById('tracking-rate');
      if (box) box.innerHTML = '<div class="tracking-rate-title" style="font-size:20px;padding:12px 0;">Thanks for flying with IraGo! ⭐</div>';
      showToast('Rating submitted — thank you!', 'success');
      setTimeout(function () { endTracking(); }, 2500);
    } else {
      const err = document.getElementById('tracking-rate-error');
      if (err) err.textContent = (data && data.error) || 'Could not submit rating.';
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    const err = document.getElementById('tracking-rate-error');
    if (err) err.textContent = 'Network error — please try again.';
    if (btn) btn.disabled = false;
  }
}

// Previous rides in the profile (incl. cancelled). Customer-only.
async function loadRideHistory() {
  const box = document.getElementById('profile-rides');
  const body = document.getElementById('profile-rides-body');
  if (!box || !body) return;
  const user = AUTH && AUTH.user;
  if (!user || user.role !== 'customer') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  body.innerHTML = '<div class="pd-loading">Loading your rides…</div>';
  try {
    const res = await apiFetch('/api/bookings/history');
    const data = await res.json().catch(() => ({}));
    const rides = Array.isArray(data.rides) ? data.rides : [];
    if (!rides.length) {
      body.innerHTML = '<div class="pd-loading">No rides yet — your trips will appear here.</div>';
      return;
    }
    body.innerHTML = rides.map(function (r) {
      const route = escapeHtml(r.pickupName) + ' &rarr; ' + escapeHtml(r.destName);
      const fare = r.fareEstimate != null ? '₹' + Number(r.fareEstimate).toLocaleString('en-IN') : '—';
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '';
      const badge = statusBadgeHtml(r.status);
      const fee = r.cancellationFee ? ' · fee ₹' + r.cancellationFee : '';
      return '<div class="profile-ride-row">' +
        '<div><div class="profile-ride-route">' + route + '</div>' +
        '<div class="profile-ride-meta">' + escapeHtml(SERVICE_LABELS[r.service] || r.service) + ' · ' + date + fee + '</div></div>' +
        '<div style="text-align:right;">' + badge + '<div class="profile-ride-meta">' + fare + '</div></div>' +
      '</div>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<div class="pd-error">Could not load your rides.</div>';
  }
}

// ════════════════════════════════════════════════════════════════════════
// OPERATOR ON-DUTY / OFF-DUTY TOGGLE + WEB PUSH
// ════════════════════════════════════════════════════════════════════════
async function loadOperatorDuty() {
  const statusEl = document.getElementById('op-duty-status');
  const subEl = document.getElementById('op-duty-sub');
  const btn = document.getElementById('op-duty-toggle');
  if (!statusEl || !btn) return;
  try {
    const res = await apiFetch('/api/operator/duty');
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      renderOperatorDuty(!!data.onDuty, data.gps && data.gps.lat != null);
    } else {
      statusEl.textContent = 'Unavailable';
      if (subEl) subEl.textContent = 'Could not load duty status.';
    }
  } catch (e) {
    statusEl.textContent = 'Unavailable';
  }
}

function renderOperatorDuty(onDuty, hasGps) {
  const statusEl = document.getElementById('op-duty-status');
  const subEl = document.getElementById('op-duty-sub');
  const btn = document.getElementById('op-duty-toggle');
  if (statusEl) statusEl.textContent = onDuty ? 'On duty' : 'Off duty';
  if (btn) {
    btn.setAttribute('aria-pressed', onDuty ? 'true' : 'false');
    btn.disabled = false;
  }
  if (subEl) {
    if (!hasGps) subEl.textContent = 'Share your GPS to receive nearby offers.';
    else if (onDuty) subEl.textContent = 'You will receive dispatch offers.';
    else subEl.textContent = 'Toggle on to start receiving offers.';
  }
}

async function toggleOperatorDuty() {
  const btn = document.getElementById('op-duty-toggle');
  if (!btn) return;
  const currentlyOn = btn.getAttribute('aria-pressed') === 'true';
  const nextOn = !currentlyOn;
  btn.disabled = true;
  try {
    const res = await apiFetch('/api/operator/duty', {
      method: 'POST',
      body: JSON.stringify({ onDuty: nextOn }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      renderOperatorDuty(!!data.onDuty, true);
      if (data.onDuty) {
        requestNotificationPermission();
        showToast('You are on duty — dispatch offers will arrive', 'success');
      } else {
        showToast('Off duty — no dispatch offers', 'info');
      }
    } else {
      btn.disabled = false;
      showToast((data && data.error) || 'Could not change duty status.', 'error');
    }
  } catch (e) {
    btn.disabled = false;
    showToast('Network error — please try again.', 'error');
  }
}

// Subscribe this browser to Web Push so offers reach the pilot even when the
// tab is backgrounded. Requires a service worker (/sw.js) + VAPID keys on the
// server. No-ops gracefully if push isn't available or not configured.
async function subscribeOperatorPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sendPushSubscription(sub);
      return;
    }
    const keyRes = await apiFetch('/api/operator/push/vapid-public-key');
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyData.publicKey) return; // push not configured
    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await sendPushSubscription(sub);
  } catch (e) {
    // Permission denied or SW unavailable — silently fall back to SSE only.
  }
}

async function sendPushSubscription(sub) {
  const payload = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys ? sub.keys.p256dh : null,
      auth: sub.keys ? sub.keys.auth : null,
    },
  };
  try {
    await apiFetch('/api/operator/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) { /* best-effort */ }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// ADMIN LOG VIEWER (last 50 on scroll-up) + ZOOM-GATED OPERATOR PROFILES
// ════════════════════════════════════════════════════════════════════════
let adminLogsLoading = false;
let adminLogsOldestTs = null;
let adminLogsHasMore = true;

async function loadAdminLogs() {
  const list = document.getElementById('admin-logs-list');
  const scroll = document.getElementById('admin-logs-scroll');
  const meta = document.getElementById('admin-logs-meta');
  if (!list) return;
  // Newest-first page; the list renders column-reverse so newest sit at the
  // bottom (top of the user's view), and older pages prepend above on scroll-up.
  adminLogsOldestTs = null;
  adminLogsHasMore = true;
  list.innerHTML = '';
  await fetchAdminLogsPage(true);
  if (scroll) {
    // Jump to the bottom (newest) on first load.
    scroll.scrollTop = scroll.scrollHeight;
    scroll.onscroll = onAdminLogsScroll;
  }
  if (meta) meta.textContent = 'Most recent 50 entries shown first. Scroll up to load older logs.';
}

async function fetchAdminLogsPage(firstPage) {
  if (adminLogsLoading || (!firstPage && !adminLogsHasMore)) return;
  adminLogsLoading = true;
  const loadingEl = document.getElementById('admin-logs-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  try {
    const url = '/api/admin/logs?limit=50' + (adminLogsOldestTs ? '&before=' + encodeURIComponent(adminLogsOldestTs) : '');
    const res = await apiFetch(url);
    const data = await res.json().catch(() => ({}));
    const logs = Array.isArray(data.logs) ? data.logs : [];
    adminLogsHasMore = !!data.hasMore;
    const list = document.getElementById('admin-logs-list');
    if (list) {
      // Server returns newest-first. Render oldest-first so the newest entry
      // sits at the bottom (chat-style); older pages prepend above on scroll-up.
      const pageLogs = logs.slice().reverse();
      const html = pageLogs.map(function (l) {
        const ts = l.ts ? new Date(l.ts).toLocaleTimeString('en-IN', { hour12: false }) : '';
        return '<div class="admin-log-line ' + (l.level === 'error' ? 'error' : '') + '">' +
          '<span class="admin-log-ts">' + escapeHtml(ts) + '</span>' + escapeHtml(l.msg || '') + '</div>';
      }).join('');
      if (firstPage) {
        list.innerHTML = html;
      } else {
        list.insertAdjacentHTML('afterbegin', html);
      }
    }
    if (logs.length) {
      // Page is newest-first; oldest in this page is the last entry.
      adminLogsOldestTs = logs[logs.length - 1].ts;
    }
  } catch (e) { /* ignore transient */ }
  if (loadingEl) loadingEl.style.display = 'none';
  adminLogsLoading = false;
}

function onAdminLogsScroll() {
  const scroll = document.getElementById('admin-logs-scroll');
  if (!scroll) return;
  // Near the top → load an older page.
  if (scroll.scrollTop < 40) {
    const prevHeight = scroll.scrollHeight;
    fetchAdminLogsPage(false).then(function () {
      // Keep the user's viewport stable after prepending older logs.
      const newHeight = scroll.scrollHeight;
      scroll.scrollTop = newHeight - prevHeight;
    });
  }
}

// Make admin live-map pilot markers clickable when zoomed in: at zoom >= 10,
// clicking a pilot opens their profile drawer (zoom-gated observation).
function attachAdminMapZoomProfiles() {
  if (!adminLiveMap || adminLiveMap._iragoZoomWired) return;
  adminLiveMap._iragoZoomWired = true;
  adminLiveMap.on('zoomend', updateAdminMapZoomHint);
  adminLiveMap.on('click', function (e) {
    // Clicking a marker also fires map click; only treat bare-map clicks.
    if (e.originalEvent && e.originalEvent._stopped) return;
  });
  updateAdminMapZoomHint();
}
function updateAdminMapZoomHint() {
  const meta = document.getElementById('admin-live-meta');
  if (!meta || !adminLiveMap) return;
  // The refresh loop overwrites meta text; we just annotate via a data flag.
  const z = adminLiveMap.getZoom();
  adminLiveMap._iragoZoomProfileEnabled = z >= 10;
  const hint = adminLiveMap._iragoZoomProfileEnabled
    ? 'Click a pilot marker to open their profile.'
    : 'Zoom in closer (10+) to click a pilot and view their profile.';
  const cur = meta.getAttribute('data-irago-hint') || '';
  if (cur !== hint) {
    meta.setAttribute('data-irago-hint', hint);
    meta.title = hint;
  }
}
