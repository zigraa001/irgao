// IraGo app — 03-admin-profile.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Admin: paginated user management (6 per fetch, 50 per page) ──
const ADMIN_PAGE_SIZE = 50;
const ADMIN_FETCH_SIZE = 6;
let adminUserTab = 'customer';
let adminUserPage = 0;
let adminUsers = [];
let adminUsersTotal = 0;
let adminUsersLoading = false;
let adminUsersLoaded = false;
let adminLiveInited = false;
let adminCurrentSection = 'dashboard';
let adminUserDrawerUser = null;

// Flight zones for map overlays
let adminZoneMap = null;
let adminZoneLayers = [];
let adminLiveMap = null;
let adminLivePollInterval = null;
let operatorZoneLayers = [];
let bookingZoneLayers = [];
let flightZoneFetchCache = new Map();
let mapZoneRefreshTimers = new WeakMap();
let nearbyTaxiMarkers = [];
let nearbyTaxisPollInterval = null;
let demoTaxiMeta = [];
let opSelfMap = null;
let opSelfMarker = null;
let operatorWs = null;
let demoTaxiAnimInterval = null;
let animatedMarkers = new Map();
let markerAnimFrameId = null;
let operatorGpsInterval = null;
let operatorDispatchSource = null;
let activeDispatchOffer = null;
let dispatchCountdownTimer = null;

const ZONE_STYLES = {
  flight_corridor: { color: '#1D4ED8', fillColor: '#3B82F6', fillOpacity: 0.32, weight: 3, dashArray: '12 8' },
  restricted: { color: '#B45309', fillColor: '#F59E0B', fillOpacity: 0.55, weight: 4 },
  no_fly: { color: '#B91C1C', fillColor: '#EF4444', fillOpacity: 0.62, weight: 4 },
};

const ZONE_DRAW_ORDER = { flight_corridor: 0, restricted: 1, no_fly: 2 };

// Role -> { label, cls } for the role badge. Visually distinct per role,
// reusing the op-status-badge + op-badge--* styling (purple=admin from the
// Admin Console badge, blue=operator, gray=customer).
const ROLE_BADGE = {
  admin:    { label: 'Admin',    cls: 'op-badge--purple' },
  operator: { label: 'Operator', cls: 'op-badge--blue' },
  customer: { label: 'Passenger', cls: 'op-badge--gray' },
};

const ROLE_PROFILE = {
  admin:    { label: 'Admin',     dropdownClass: 'role-admin' },
  operator: { label: 'Operator',  dropdownClass: 'role-operator' },
  customer: { label: 'Passenger', dropdownClass: '' },
};

function profileInitial(user) {
  return (user && user.name) ? user.name.charAt(0).toUpperCase() : '?';
}

function syncProfileUI(user) {
  if (!user) return;
  const initial = profileInitial(user);
  const roleMeta = ROLE_PROFILE[user.role] || { label: user.role || 'User', dropdownClass: '' };

  document.querySelectorAll('.nav-profile-avatar').forEach(function (el) {
    el.textContent = initial;
    el.classList.toggle('admin-avatar', user.role === 'admin');
  });
  document.querySelectorAll('.profile-display-avatar').forEach(function (el) {
    el.textContent = initial;
    el.classList.toggle('admin-avatar', user.role === 'admin');
  });
  document.querySelectorAll('.profile-display-name').forEach(function (el) {
    el.textContent = user.name || 'User';
  });
  document.querySelectorAll('.profile-display-email').forEach(function (el) {
    el.textContent = user.email || '—';
  });
  document.querySelectorAll('.profile-display-role').forEach(function (el) {
    el.textContent = roleMeta.label;
  });
  document.querySelectorAll('.profile-display-verified').forEach(function (el) {
    el.textContent = user.emailVerified ? 'Email verified' : 'Email not verified';
  });

  const changeBlock = document.getElementById('profile-change-block');
  const deleteBlock = document.getElementById('profile-delete-block');
  const adminNote = document.getElementById('profile-admin-note');
  const phoneBlock = document.getElementById('profile-phone-block');
  const isAdmin = user.role === 'admin';
  if (changeBlock) changeBlock.style.display = isAdmin ? 'none' : '';
  if (deleteBlock) deleteBlock.style.display = isAdmin ? 'none' : '';
  if (phoneBlock) phoneBlock.style.display = isAdmin ? 'none' : '';
  if (adminNote) adminNote.style.display = isAdmin ? '' : 'none';
  if (typeof initProfilePhoneBlock === 'function') initProfilePhoneBlock(user);
}

// ── Profile dashboard (total overview) ────────────────────────────────
// Pulls role-scoped aggregates from /api/me/stats and renders stat cards +
// a service/status breakdown + recent trips inside the profile modal.
const INR = function (n) {
  return '\u20B9' + Math.round(Number(n) || 0).toLocaleString('en-IN');
};
const KM = function (n) {
  const v = Number(n) || 0;
  return (Math.round(v * 10) / 10).toLocaleString('en-IN') + ' km';
};
const CO2 = function (n) {
  const v = Number(n) || 0;
  return (Math.round(v * 10) / 10).toLocaleString('en-IN') + ' kg';
};

function pdStat(emoji, value, label, variant) {
  const cls = 'pd-stat' + (variant ? ' pd-stat--' + variant : '');
  return (
    '<div class="' + cls + '">' +
      '<div class="pd-stat-emoji">' + emoji + '</div>' +
      '<div class="pd-stat-value">' + value + '</div>' +
      '<div class="pd-stat-label">' + escapeHtml(label) + '</div>' +
    '</div>'
  );
}

function pdBreakdown(title, map, totalLabel) {
  const keys = Object.keys(map);
  if (!keys.length) return '';
  const max = Math.max.apply(null, keys.map(function (k) { return map[k]; })) || 1;
  const rows = keys.map(function (k) {
    const v = map[k];
    const pct = Math.max((v / max) * 100, 4);
    return (
      '<div class="pd-bar-row">' +
        '<span class="pd-bar-label">' + escapeHtml(k) + '</span>' +
        '<span class="pd-bar-track"><span class="pd-bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="pd-bar-val">' + v + '</span>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="pd-breakdown-card"><h5>' + escapeHtml(title) + '</h5>' + rows + '</div>'
  );
}

function pdRecent(recent) {
  if (!recent || !recent.length) {
    return '<div class="pd-recent"><h5>Recent trips</h5><div class="pd-recent-empty">No trips yet — your first booking will appear here.</div></div>';
  }
  const rows = recent.map(function (r) {
    const statusCls = 'pd-status--' + (r.status || '').replace(/_/g, '');
    return (
      '<div class="pd-recent-row">' +
        '<div class="pd-recent-route">' + escapeHtml(r.route) + '</div>' +
        '<div class="pd-recent-meta">' +
          '<span class="pd-status ' + statusCls + '">' + escapeHtml(r.status || '—') + '</span>' +
          '<span>' + escapeHtml(r.service || '') + '</span>' +
          (r.distanceKm != null ? '<span>' + KM(r.distanceKm) + '</span>' : '') +
          (r.fareEstimate != null ? '<span>' + INR(r.fareEstimate) + '</span>' : '') +
          (r.carbonSavedKg ? '<span>CO\u2082 ' + CO2(r.carbonSavedKg) + '</span>' : '') +
        '</div>' +
      '</div>'
    );
  }).join('');
  return '<div class="pd-recent"><h5>Recent trips</h5>' + rows + '</div>';
}

function renderProfileDashboard(stats) {
  const body = document.getElementById('profile-dashboard-body');
  if (!body) return;
  body.innerHTML = statsDashboardHtml(stats);
}

// Reusable: returns the dashboard HTML string for a stats payload. Used both by
// the self profile modal and the admin user-detail drawer.
function statsDashboardHtml(stats) {
  if (!stats) return '<div class="pd-error">Could not load dashboard.</div>';
  if (stats.scope === 'admin') {
    const t = stats.totals || {};
    html =
      '<div class="profile-stats-grid">' +
        pdStat('\uD83D\uDC65', t.totalUsers || 0, 'Total users') +
        pdStat('\u2708\uFE0F', t.totalBookings || 0, 'Total bookings') +
        pdStat('\uD83D\uDEE9\uFE0F', t.live || 0, 'Live flights', 'amber') +
        pdStat('\u2705', t.completed || 0, 'Completed', 'green') +
        pdStat('\uD83D\uDCB0', INR(t.revenueINR), 'Revenue') +
        pdStat('\uD83C\uDF31', CO2(t.carbonSavedKg), 'CO\u2082 saved', 'green') +
        pdStat('\uD83D\uDEEB', t.availableAircraft || 0, 'Aircraft available') +
        pdStat('\uD83D\uDCC5', t.cancelled || 0, 'Cancelled', 'red') +
        pdStat('\uD83D\uDCCF', KM(t.distanceKm), 'Distance flown') +
      '</div>' +
      (t.users ? '<div class="pd-breakdown">' + pdBreakdown('Users by role', t.users) + '</div>' : '');
  } else if (stats.scope === 'operator') {
    const t = stats.totals || {};
    html =
      '<div class="profile-stats-grid">' +
        pdStat('\u2708\uFE0F', t.assigned || 0, 'Missions assigned') +
        pdStat('\u2705', t.completed || 0, 'Completed', 'green') +
        pdStat('\uD83D\uDD7A\uFE0F', t.inProgress || 0, 'In progress', 'amber') +
        pdStat('\uD83D\uDCCF', KM(t.distanceFlownKm), 'Distance flown') +
        pdStat('\uD83D\uDCB0', INR(t.earningsINR), 'Earnings (60%)', 'green') +
        pdStat('\uD83C\uDF31', CO2(t.carbonSavedKg), 'CO\u2082 saved', 'green') +
      '</div>' +
      '<div class="pd-breakdown">' +
        (pdBreakdown('By service', stats.byService || {}) +
         pdBreakdown('By status', stats.byStatus || {})) +
      '</div>' +
      pdRecent(stats.recent);
  } else {
    const t = stats.totals || {};
    html =
      '<div class="profile-stats-grid">' +
        pdStat('\u2708\uFE0F', t.trips || 0, 'Total trips') +
        pdStat('\u2705', t.completed || 0, 'Completed', 'green') +
        pdStat('\uD83D\uDD7A\uFE0F', t.inProgress || 0, 'In progress', 'amber') +
        pdStat('\uD83D\uDCCF', KM(t.distanceKm), 'Distance flown') +
        pdStat('\uD83D\uDCB0', INR(t.spentINR), 'Total spent') +
        pdStat('\uD83C\uDF31', CO2(t.carbonSavedKg), 'CO\u2082 saved', 'green') +
        pdStat('\u2B50', (t.carbonCredits || 0).toLocaleString('en-IN'), 'Carbon Credits') +
      '</div>' +
      '<div class="pd-breakdown">' +
        (pdBreakdown('By service', stats.byService || {}) +
         pdBreakdown('By status', stats.byStatus || {})) +
      '</div>' +
      pdRecent(stats.recent);
  }
  return html;
}

async function loadProfileDashboard() {
  const body = document.getElementById('profile-dashboard-body');
  if (!body) return;
  body.innerHTML = '<div class="pd-loading">Loading your dashboard…</div>';
  try {
    const res = await apiFetch('/api/me/stats');
    const data = await res.json().catch(function () { return {}; });
    if (res.ok && data.stats) {
      renderProfileDashboard(data.stats);
    } else {
      renderProfileDashboard(null);
    }
  } catch (e) {
    renderProfileDashboard(null);
  }
}

async function loadProfileQuickStats() {
  var host = document.getElementById('profile-quick-stats');
  if (!host) return;
  try {
    var res = await apiFetch('/api/me/stats');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.stats) {
      var t = data.stats.totals || {};
      var user = AUTH.user;
      if (user && user.role === 'operator') {
        host.innerHTML =
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + (t.completed || 0) + '</div><div class="profile-quick-stat-label">Flights</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + KM(t.distanceFlownKm) + '</div><div class="profile-quick-stat-label">Distance</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + INR(t.earningsINR) + '</div><div class="profile-quick-stat-label">Earnings</div></div>';
      } else if (user && user.role === 'admin') {
        host.innerHTML =
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + (t.totalUsers || 0) + '</div><div class="profile-quick-stat-label">Users</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + (t.totalBookings || 0) + '</div><div class="profile-quick-stat-label">Bookings</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + INR(t.revenueINR) + '</div><div class="profile-quick-stat-label">Revenue</div></div>';
      } else {
        host.innerHTML =
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + (t.trips || 0) + '</div><div class="profile-quick-stat-label">Trips</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + KM(t.distanceKm) + '</div><div class="profile-quick-stat-label">Distance</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + CO2(t.carbonSavedKg) + '</div><div class="profile-quick-stat-label">CO₂ saved</div></div>' +
          '<div class="profile-quick-stat"><div class="profile-quick-stat-val">' + (t.carbonCredits || 0).toLocaleString('en-IN') + '</div><div class="profile-quick-stat-label">Credits</div></div>';
      }
    }
  } catch (e) { /* ignore */ }
}

function bindProfileActions() {
  document.querySelectorAll('.js-open-profile').forEach(function (btn) {
    if (btn.dataset.profileOpenBound) return;
    btn.dataset.profileOpenBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openProfileModal();
    });
  });
  document.querySelectorAll('.js-close-profile').forEach(function (btn) {
    if (btn.dataset.profileCloseBound) return;
    btn.dataset.profileCloseBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      closeProfileModal();
    });
  });
  document.querySelectorAll('.nav-profile-avatar').forEach(function (avatar) {
    if (avatar.dataset.profileAvatarBound) return;
    avatar.dataset.profileAvatarBound = '1';
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', function () { openProfileModal(); });
  });
  if (!window._profileEscapeBound) {
    window._profileEscapeBound = true;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeProfileModal();
    });
  }
}

function openProfileModal() {
  const user = AUTH.user;
  if (user) syncProfileUI(user);
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  hideAuthError('profile-change-error');
  const success = document.getElementById('profile-change-success');
  if (success) { success.style.display = 'none'; success.textContent = ''; }
  const cur = document.getElementById('profile-current-password');
  const neu = document.getElementById('profile-new-password');
  const del = document.getElementById('profile-delete-password');
  if (cur) cur.value = '';
  if (neu) neu.value = '';
  if (del) del.value = '';
  hideAuthError('profile-delete-error');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const refresh = document.getElementById('pd-refresh-btn');
  if (refresh && !refresh.dataset.pdBound) {
    refresh.dataset.pdBound = '1';
    refresh.addEventListener('click', loadProfileDashboard);
  }
  loadProfileDashboard();
  loadProfileQuickStats();
  loadRideHistory();
  const ridesRefresh = document.getElementById('rides-refresh-btn');
  if (ridesRefresh && !ridesRefresh.dataset.pdBound) {
    ridesRefresh.dataset.pdBound = '1';
    ridesRefresh.addEventListener('click', loadRideHistory);
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function doChangePassword() {
  const user = AUTH.user;
  if (!user || user.role === 'admin') return;
  const currentPassword = document.getElementById('profile-current-password').value;
  const newPassword = document.getElementById('profile-new-password').value;
  hideAuthError('profile-change-error');
  const success = document.getElementById('profile-change-success');
  if (success) { success.style.display = 'none'; success.textContent = ''; }
  if (!currentPassword || !newPassword) {
    return showAuthError('profile-change-error', 'Enter your current and new password.');
  }
  if (newPassword.length < 6) {
    return showAuthError('profile-change-error', 'New password must be at least 6 characters.');
  }
  setBusy('profile-change-submit', true, 'Updating…', 'Update password');
  try {
    const res = await fetch('/api/auth/change-password', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('profile-change-error', data.error || 'Could not update password.');
    }
    if (data.user) {
      AUTH.save(data.user, AUTH.token);
      syncProfileUI(data.user);
    }
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    if (success) {
      success.textContent = 'Password updated successfully.';
      success.style.display = 'block';
    }
  } catch (e) {
    showAuthError('profile-change-error', 'Could not reach the server.');
  } finally {
    setBusy('profile-change-submit', false, 'Updating…', 'Update password');
  }
}

async function doDeleteAccount() {
  const user = AUTH.user;
  if (!user || user.role === 'admin') return;
  const password = document.getElementById('profile-delete-password').value;
  hideAuthError('profile-delete-error');
  if (!password) {
    return showAuthError('profile-delete-error', 'Enter your password to confirm deletion.');
  }
  if (!window.confirm('Delete your IraGo account? This cannot be undone.')) return;
  setBusy('profile-delete-submit', true, 'Deleting…', 'Delete my account');
  try {
    const res = await fetch('/api/auth/delete-account', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('profile-delete-error', data.error || 'Could not delete account.');
    }
    closeProfileModal();
    AUTH.clear();
    showView('login-view');
    const portal = loginUrlForRole(user.role);
    window.location.href = portal + (portal.indexOf('?') >= 0 ? '&' : '?') + 'deleted=1';
  } catch (e) {
    showAuthError('profile-delete-error', 'Could not reach the server.');
  } finally {
    setBusy('profile-delete-submit', false, 'Deleting…', 'Delete my account');
  }
}

function loginUrlForRole(role) {
  if (role === 'operator') return '/login/operator';
  if (role === 'admin') return '/login/admin';
  return '/app.html';
}

function loginUrlForUser(user) {
  return loginUrlForRole(portalForDbRole(user && user.role));
}

function roleBadgeHtml(role) {
  const b = ROLE_BADGE[role] || { label: role || 'Unknown', cls: 'op-badge--gray' };
  return '<span class="op-status-badge ' + b.cls + '">' + escapeHtml(b.label) + '</span>';
}

// --- Admin drawer-based panel: section switching + user-detail drawer ---
function showAdminSection(name) {
  const section = document.getElementById('admin-section-' + name);
  if (!section) return;
  document.querySelectorAll('.admin-section').forEach(function (s) { s.hidden = true; });
  section.hidden = false;
  document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-admin-section') === name);
  });
  adminCurrentSection = name;
  // Collapse the rail on mobile after picking a section.
  const drawer = document.getElementById('admin-drawer');
  if (drawer && window.innerWidth <= 900) drawer.classList.remove('open');

  // Stop the live-flights poll when leaving the live section (saves compute).
  if (name !== 'live' && adminLivePollInterval) {
    clearInterval(adminLivePollInterval);
    adminLivePollInterval = null;
  }

  if (name === 'users' && !adminUsersLoaded) {
    adminUsersLoaded = true;
    loadAdminUsers();
  }
  if (name === 'live') {
    initAdminLiveFlights();
    setTimeout(function () { if (adminLiveMap) adminLiveMap.invalidateSize(); }, 250);
  }
  if (name === 'logs') {
    loadAdminLogs();
  }
  if (name === 'dashboard') {
    loadAdminPlatformStats();
  }
  if (name === 'settings') {
    loadAdminSettings();
  }
  if (name === 'companies') {
    loadAdminCompanies();
  }
  if (name === 'pricing') {
    loadAdminPricing();
  }
  if (name === 'revenue') {
    loadAdminRevenue();
  }
  if (name === 'compliance') {
    loadAdminCompliance();
  }
  if (name === 'drones') {
    droneAdminServicesLoaded = false;
    droneAdminOperatorsLoaded = false;
    droneAdminBookingsLoaded = false;
    showDroneAdminTab('services');
  }
}

async function loadAdminSettings() {
  try {
    const res = await apiFetch('/api/admin/settings');
    const data = await res.json();
    if (!res.ok) return;
    const s = data.settings || {};
    const cb = document.getElementById('admin-toggle-emergency-bypass');
    const knob = document.getElementById('admin-toggle-knob');
    const track = knob?.previousElementSibling;
    if (cb) cb.checked = !!s.emergencyNoFlyBypass;
    if (knob) knob.style.left = s.emergencyNoFlyBypass ? '25px' : '3px';
    if (track) track.style.background = s.emergencyNoFlyBypass ? 'var(--red)' : 'var(--gray-300)';
    const status = document.getElementById('admin-bypass-status');
    if (status) status.textContent = s.emergencyNoFlyBypass
      ? 'Active — Golden Hour bookings can enter no-fly zones with ATC clearance.'
      : 'Disabled — all services obey no-fly restrictions.';

    const dcb = document.getElementById('admin-toggle-demo-mode');
    const dknob = document.getElementById('admin-toggle-demo-knob');
    const dtrack = dknob?.previousElementSibling;
    if (dcb) dcb.checked = !!s.demoMode;
    if (dknob) dknob.style.left = s.demoMode ? '25px' : '3px';
    if (dtrack) dtrack.style.background = s.demoMode ? 'var(--blue)' : 'var(--gray-300)';
    const dstatus = document.getElementById('admin-demo-status');
    if (dstatus) dstatus.textContent = s.demoMode
      ? 'Active — paid bookings auto-run a demo pilot through the full ride.'
      : 'Disabled — paid bookings dispatch to real on-duty pilots.';
  } catch {}
}

async function toggleDemoMode(on) {
  const knob = document.getElementById('admin-toggle-demo-knob');
  const track = knob?.previousElementSibling;
  if (knob) knob.style.left = on ? '25px' : '3px';
  if (track) track.style.background = on ? 'var(--blue)' : 'var(--gray-300)';
  try {
    const res = await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'demoMode', value: on }),
    });
    if (!res.ok) { showToast('Failed to update setting', 'error'); return; }
    const data = await res.json();
    const s = data.settings || {};
    const status = document.getElementById('admin-demo-status');
    if (status) status.textContent = s.demoMode
      ? 'Active — paid bookings auto-run a demo pilot through the full ride.'
      : 'Disabled — paid bookings dispatch to real on-duty pilots.';
    showToast(s.demoMode ? 'Demo mode enabled' : 'Demo mode disabled', 'success');
  } catch {
    showToast('Network error', 'error');
  }
}

async function toggleEmergencyBypass(on) {
  const knob = document.getElementById('admin-toggle-knob');
  const track = knob?.previousElementSibling;
  if (knob) knob.style.left = on ? '25px' : '3px';
  if (track) track.style.background = on ? 'var(--red)' : 'var(--gray-300)';
  try {
    const res = await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'emergencyNoFlyBypass', value: on }),
    });
    if (!res.ok) {
      showToast('Failed to update setting', 'error');
      return;
    }
    const data = await res.json();
    const s = data.settings || {};
    const status = document.getElementById('admin-bypass-status');
    if (status) status.textContent = s.emergencyNoFlyBypass
      ? 'Active — Golden Hour bookings can enter no-fly zones with ATC clearance.'
      : 'Disabled — all services obey no-fly restrictions.';
    showToast(s.emergencyNoFlyBypass ? 'Emergency bypass enabled' : 'Emergency bypass disabled', 'success');
  } catch {
    showToast('Network error', 'error');
  }
}

async function loadAdminCompanies() {
  var listEl = document.getElementById('admin-companies-list');
  var officesEl = document.getElementById('admin-offices-list');
  try {
    var res = await apiFetch('/api/admin/companies');
    var data = await res.json();
    if (!res.ok || !data.companies) { if (listEl) listEl.innerHTML = '<div style="color:var(--gray-500);">Could not load companies.</div>'; return; }
    if (listEl) {
      listEl.innerHTML = data.companies.map(function (c) {
        return '<div class="admin-form-card" style="min-width:200px;flex:1;max-width:300px;">' +
          '<div style="font-weight:700;font-size:15px;color:var(--gray-900);">' + escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">' + escapeHtml(c.headquarters || '') + '</div>' +
          '<div style="font-size:12px;color:var(--blue);margin-top:4px;">' + (c.officeCount || 0) + ' regional offices</div>' +
          '<div style="font-size:11px;margin-top:4px;color:' + (c.active ? 'var(--green-dark)' : 'var(--red)') + ';">' + (c.active ? 'Active' : 'Inactive') + '</div>' +
        '</div>';
      }).join('');
    }
    var offRes = await apiFetch('/api/admin/offices');
    var offData = await offRes.json();
    if (officesEl && offRes.ok && offData.offices) {
      officesEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;border-bottom:2px solid var(--gray-200);">' +
        '<th style="padding:6px 8px;">City</th><th style="padding:6px 8px;">Company</th><th style="padding:6px 8px;">Lat</th><th style="padding:6px 8px;">Lng</th><th style="padding:6px 8px;">Status</th>' +
        '</tr></thead><tbody>' +
        offData.offices.map(function (o) {
          return '<tr style="border-bottom:1px solid var(--gray-100);">' +
            '<td style="padding:6px 8px;font-weight:600;">' + escapeHtml(o.city) + '</td>' +
            '<td style="padding:6px 8px;">' + escapeHtml(o.companyName || '') + '</td>' +
            '<td style="padding:6px 8px;">' + (o.lat || '') + '</td>' +
            '<td style="padding:6px 8px;">' + (o.lng || '') + '</td>' +
            '<td style="padding:6px 8px;color:' + (o.active ? 'var(--green-dark)' : 'var(--red)') + ';">' + (o.active ? 'Active' : 'Inactive') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div style="color:var(--red);">Network error loading companies.</div>';
  }
}

async function addOperatorCompany() {
  var name = (document.getElementById('admin-company-name') || {}).value || '';
  var hq = (document.getElementById('admin-company-hq') || {}).value || '';
  var errEl = document.getElementById('admin-company-error');
  if (!name.trim()) {
    if (errEl) { errEl.textContent = 'Company name is required.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  try {
    var res = await apiFetch('/api/admin/companies', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), headquarters: hq.trim() || null }),
    });
    var data = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = (data && data.error) || 'Failed to add company.'; errEl.style.display = 'block'; }
      return;
    }
    showToast('Company "' + name.trim() + '" added', 'success');
    document.getElementById('admin-company-name').value = '';
    document.getElementById('admin-company-hq').value = '';
    loadAdminCompanies();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
  }
}

function toggleAdminDrawer() {
  const drawer = document.getElementById('admin-drawer');
  if (drawer) drawer.classList.toggle('open');
}

async function loadAdminPlatformStats() {
  const host = document.getElementById('admin-platform-stats');
  if (!host) return;
  host.innerHTML = '<div class="pd-loading">Loading platform stats…</div>';
  try {
    const res = await apiFetch('/api/me/stats');
    const data = await res.json().catch(function () { return {}; });
    if (res.ok && data.stats) {
      host.innerHTML = statsDashboardHtml(data.stats);
    } else {
      host.innerHTML = '<div class="pd-error">Could not load platform stats.</div>';
    }
  } catch (e) {
    host.innerHTML = '<div class="pd-error">Could not reach the server.</div>';
  }
}

function adminRoleLabel(role) {
  if (role === 'operator') return 'Operator';
  if (role === 'admin') return 'Admin';
  return 'Passenger';
}

function openAdminUserDrawer(userId) {
  const drawer = document.getElementById('admin-user-drawer');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('admin-drawer-open');
  loadAdminUserDetail(userId);
}

function closeAdminUserDrawer() {
  const drawer = document.getElementById('admin-user-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('admin-drawer-open');
  adminUserDrawerUser = null;
}

async function loadAdminUserDetail(userId) {
  const body = document.getElementById('admin-user-drawer-body');
  const actionsHost = document.getElementById('admin-ud-actions');
  const avatarEl = document.getElementById('admin-ud-avatar');
  const nameEl = document.getElementById('admin-ud-name');
  const emailEl = document.getElementById('admin-ud-email');
  const tagsEl = document.getElementById('admin-ud-tags');
  if (body) body.innerHTML = '<div class="pd-loading">Loading user…</div>';
  if (actionsHost) actionsHost.innerHTML = '';
  if (avatarEl) avatarEl.textContent = '?';
  if (nameEl) nameEl.textContent = '—';
  if (emailEl) emailEl.textContent = '—';
  if (tagsEl) tagsEl.innerHTML = '';

  try {
    const [profileRes, statsRes] = await Promise.all([
      apiFetch('/api/admin/users/' + userId),
      apiFetch('/api/admin/users/' + userId + '/stats'),
    ]);
    const profile = await profileRes.json().catch(function () { return {}; });
    if (!profileRes.ok || !profile.user) {
      if (body) body.innerHTML = '<div class="pd-error">' + escapeHtml(profile.error || 'Could not load user.') + '</div>';
      return;
    }
    const u = profile.user;
    adminUserDrawerUser = u;
    const initial = String((u.name || u.email || '?')).trim().charAt(0).toUpperCase() || '?';
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = u.name || '—';
    if (emailEl) emailEl.textContent = u.email || '';
    const tags = [];
    tags.push(roleBadgeHtml(u.role));
    if (u.banned) tags.push('<span class="op-status-badge op-badge--red">Banned</span>');
    if (u.mustResetPassword) tags.push('<span class="op-status-badge op-badge--amber">Must reset password</span>');
    if (u.emailVerified) tags.push('<span class="op-status-badge op-badge--green">Email verified</span>');
    if (u.gps) tags.push('<span class="op-status-badge op-badge--blue">GPS live</span>');
    if (tagsEl) tagsEl.innerHTML = tags.join(' ');

    // Action buttons (mirror the row actions; not shown for env-bootstrap admins).
    if (actionsHost) {
      if (u.role === 'admin' && !u.mustResetPassword) {
        actionsHost.innerHTML = '<span class="admin-user-note">Env-bootstrap admin — managed via .env</span>';
      } else {
        const btns = [];
        btns.push('<button type="button" class="admin-btn-sm primary" onclick="adminResetPassword(' + u.id + ')">Reset password</button>');
        if (u.role !== 'admin') {
          btns.push('<button type="button" class="admin-btn-sm" onclick="adminSendResetOtp(' + u.id + ')">Email OTP</button>');
          btns.push('<button type="button" class="admin-btn-sm" onclick="adminBanUser(' + u.id + ',' + (!u.banned) + ')">' + (u.banned ? 'Unban' : 'Ban') + '</button>');
          btns.push('<button type="button" class="admin-btn-sm danger" onclick="adminDeleteUser(' + u.id + ')">Delete</button>');
        }
        actionsHost.innerHTML = '<div class="admin-user-actions">' + btns.join('') + '</div>';
      }
    }

    const stats = await statsRes.json().catch(function () { return {}; });
    if (body) {
      let html = statsDashboardHtml(statsRes.ok && stats.stats ? stats.stats : null);
      if (u.gps) {
        html =
          '<div class="admin-ud-gps">Last GPS: ' +
          Number(u.gps.lat).toFixed(4) + ', ' + Number(u.gps.lng).toFixed(4) +
          (u.gps.updatedAt ? ' · ' + escapeHtml(String(u.gps.updatedAt)) : '') +
          '</div>' + html;
      }
      body.innerHTML = html;
    }
  } catch (e) {
    if (body) body.innerHTML = '<div class="pd-error">Could not reach the server.</div>';
  }
}

// Fetch users in chunks of 6 (up to 50 per page tab).
async function loadAdminUsers() {
  adminUserTab = adminUserTab || 'customer';
  adminUserPage = 0;
  adminUsers = [];
  adminUsersTotal = 0;
  await loadAdminUsersChunk(true);
}

function switchAdminUserTab(tab) {
  if (tab !== 'customer' && tab !== 'operator') return;
  adminUserTab = tab;
  adminUserPage = 0;
  adminUsers = [];
  adminUsersTotal = 0;
  document.querySelectorAll('.admin-tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.id === 'admin-tab-' + tab);
  });
  loadAdminUsersChunk(true);
}

function adminPageCount() {
  return Math.max(1, Math.ceil(adminUsersTotal / ADMIN_PAGE_SIZE));
}

function adminPageStartOffset() {
  return adminUserPage * ADMIN_PAGE_SIZE;
}

function adminPageCanLoadMore() {
  const pageStart = adminPageStartOffset();
  const pageCap = pageStart + ADMIN_PAGE_SIZE;
  const nextFetch = pageStart + adminUsers.length;
  return nextFetch < pageCap && nextFetch < adminUsersTotal;
}

async function loadAdminUsersChunk(showInitialLoading) {
  const listHost = document.getElementById('admin-users-list');
  if (!listHost || adminUsersLoading) return;

  if (showInitialLoading && adminUsers.length === 0) {
    listHost.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Loading users…</div></div>';
  }

  const fetchOffset = adminPageStartOffset() + adminUsers.length;
  if (adminUsers.length >= ADMIN_PAGE_SIZE) {
    renderAdminUsers();
    return;
  }
  if (adminUsersTotal > 0 && fetchOffset >= adminUsersTotal) {
    renderAdminUsers();
    return;
  }
  if (adminUsersTotal > 0 && fetchOffset >= adminPageStartOffset() + ADMIN_PAGE_SIZE) {
    renderAdminUsers();
    return;
  }

  adminUsersLoading = true;
  try {
    const res = await apiFetch(
      '/api/admin/users?role=' + encodeURIComponent(adminUserTab) +
      '&limit=' + ADMIN_FETCH_SIZE + '&offset=' + fetchOffset
    );
    const data = await res.json().catch(function () { return {}; });
    if (res.status === 403 && data.code === 'TAILSCALE_REQUIRED') {
      adminUsers = [];
      adminUsersTotal = 0;
      listHost.innerHTML =
        '<div class="op-empty">' +
        '<div class="op-empty-icon">🔒</div>' +
        '<div class="op-empty-title">Tailscale required</div>' +
        '<div class="op-empty-sub">' + escapeHtml(data.error || 'Connect via Tailscale to use the admin panel.') + '</div>' +
        '</div>';
      document.getElementById('admin-users-pager').innerHTML = '';
      document.getElementById('admin-users-meta').textContent = '';
      return;
    }
    if (!res.ok) throw new Error('load failed');
    const batch = Array.isArray(data.users) ? data.users : [];
    adminUsers = adminUsers.concat(batch);
    adminUsersTotal = typeof data.total === 'number' ? data.total : adminUsers.length;
  } catch (e) {
    adminUsers = [];
    adminUsersTotal = 0;
    listHost.innerHTML =
      '<div class="op-empty"><div class="op-empty-title">Could not load users</div>' +
      '<div class="op-empty-sub">Please try again in a moment.</div></div>';
    document.getElementById('admin-users-pager').innerHTML = '';
    return;
  } finally {
    adminUsersLoading = false;
  }
  renderAdminUsers();
}

function adminUsersPrevPage() {
  if (adminUserPage <= 0) return;
  adminUserPage--;
  adminUsers = [];
  loadAdminUsersChunk(true);
}

function adminUsersNextPage() {
  if (adminUserPage >= adminPageCount() - 1) return;
  adminUserPage++;
  adminUsers = [];
  loadAdminUsersChunk(true);
}

function renderAdminUsers() {
  const listHost = document.getElementById('admin-users-list');
  const metaHost = document.getElementById('admin-users-meta');
  const pagerHost = document.getElementById('admin-users-pager');
  if (!listHost) return;

  const pageStart = adminPageStartOffset();
  const showingEnd = Math.min(pageStart + adminUsers.length, adminUsersTotal);

  if (metaHost) {
    metaHost.textContent = adminUsersTotal
      ? 'Showing ' + (adminUsers.length ? (pageStart + 1) : 0) + '–' + showingEnd + ' of ' + adminUsersTotal +
        ' · Page ' + (adminUserPage + 1) + ' of ' + adminPageCount() + ' · loads 6 at a time'
      : '';
  }

  if (!adminUsers.length) {
    listHost.innerHTML =
      '<div class="op-empty">' +
      '<div class="op-empty-icon">👥</div>' +
      '<div class="op-empty-title">No ' + (adminUserTab === 'operator' ? 'operators' : 'passengers') + ' yet</div>' +
      '<div class="op-empty-sub">Accounts will appear here when they register or are added.</div>' +
      '</div>';
  } else {
    listHost.innerHTML = adminUsers.map(function (u) {
      const initial = String((u.name || u.email || '?')).trim().charAt(0).toUpperCase() || '?';
      const bannedBadge = u.banned
        ? ' <span class="op-status-badge op-badge--red">Banned</span>'
        : '';
      let actions;
      if (u.role === 'admin') {
        actions = '<span class="admin-user-note">Password via .env bootstrap</span>';
      } else {
        actions =
          '<div class="admin-user-actions">' +
          '<button type="button" class="admin-btn-sm primary" onclick="event.stopPropagation();adminResetPassword(' + u.id + ')">Reset password</button>' +
          '<button type="button" class="admin-btn-sm" onclick="event.stopPropagation();adminSendResetOtp(' + u.id + ')">Email OTP</button>' +
          '<button type="button" class="admin-btn-sm" onclick="event.stopPropagation();adminBanUser(' + u.id + ',' + (!u.banned) + ')">' +
            (u.banned ? 'Unban' : 'Ban') + '</button>' +
          '<button type="button" class="admin-btn-sm danger" onclick="event.stopPropagation();adminDeleteUser(' + u.id + ')">Delete</button>' +
          '</div>';
      }
      const chevron = '<span class="admin-user-chevron" aria-hidden="true">›</span>';
      return (
        '<div class="admin-user-card" role="button" tabindex="0" onclick="openAdminUserDrawer(' + u.id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openAdminUserDrawer(' + u.id + ')}">' +
          '<div class="admin-user-id">' + escapeHtml(initial) + '</div>' +
          '<div class="admin-user-main">' +
            '<div class="admin-user-name">' + escapeHtml(u.name || '—') + bannedBadge + '</div>' +
            '<div class="admin-user-email">' + escapeHtml(u.email || '') + '</div>' +
          '</div>' +
          roleBadgeHtml(u.role) +
          actions +
          chevron +
        '</div>'
      );
    }).join('');
  }

  if (pagerHost) {
    const loadMore = adminPageCanLoadMore();
    pagerHost.innerHTML =
      '<div class="admin-pager-btns">' +
        '<button type="button" class="admin-load-more" onclick="adminUsersPrevPage()" ' +
          (adminUserPage <= 0 ? 'disabled' : '') + '>← Prev page</button>' +
        '<button type="button" class="admin-load-more" onclick="adminUsersNextPage()" ' +
          (adminUserPage >= adminPageCount() - 1 ? 'disabled' : '') + '>Next page →</button>' +
      '</div>' +
      (loadMore
        ? '<button type="button" class="admin-load-more" onclick="loadAdminUsersChunk(false)">Load 6 more on this page</button>'
        : '<span class="admin-users-meta" style="margin:0;">All loaded for this page</span>');
  }
}

function adminFindUser(userId) {
  return adminUsers.find(function (u) { return u.id === userId; })
    || (adminUserDrawerUser && adminUserDrawerUser.id === userId ? adminUserDrawerUser : null);
}

async function adminBanUser(userId, banned) {
  const user = adminFindUser(userId);
  const label = banned ? 'Ban' : 'Unban';
  if (!window.confirm(label + ' ' + (user ? user.email : 'this user') + '?')) return;
  try {
    const res = await apiFetch('/api/admin/users/' + userId + '/ban', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned: !!banned })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      alert(data.error || 'Could not update ban status.');
      return;
    }
    showAddSuccess(data.message || 'Updated.');
    adminUsers = [];
    await loadAdminUsersChunk(true);
    if (adminUserDrawerUser && adminUserDrawerUser.id === userId) loadAdminUserDetail(userId);
  } catch (e) {
    alert('Could not reach the server.');
  }
}

async function adminDeleteUser(userId) {
  const user = adminFindUser(userId);
  if (!window.confirm('Delete account for ' + (user ? user.email : 'this user') + '? This cannot be undone.')) return;
  try {
    const res = await apiFetch('/api/admin/users/' + userId, { method: 'DELETE' });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      alert(data.error || 'Could not delete account.');
      return;
    }
    showAddSuccess(data.message || 'Account deleted.');
    if (adminUserDrawerUser && adminUserDrawerUser.id === userId) closeAdminUserDrawer();
    adminUsers = [];
    adminUsersTotal = Math.max(0, adminUsersTotal - 1);
    await loadAdminUsersChunk(true);
  } catch (e) {
    alert('Could not reach the server.');
  }
}

async function adminResetPassword(userId) {
  const user = adminFindUser(userId);
  const email = user ? user.email : 'this user';
  const newPassword = window.prompt('Set a new password for ' + email + ' (min 6 characters):');
  if (!newPassword) return;
  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }
  try {
    const res = await apiFetch('/api/admin/users/' + userId + '/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Could not reset password.');
      return;
    }
    showAddSuccess(data.message || 'Password updated.');
    if (adminUserDrawerUser && adminUserDrawerUser.id === userId) loadAdminUserDetail(userId);
  } catch (e) {
    alert('Could not reach the server.');
  }
}

async function adminSendResetOtp(userId) {
  const user = adminFindUser(userId);
  const email = user ? user.email : '';
  try {
    const res = await apiFetch('/api/admin/users/' + userId + '/send-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send OTP.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      alert(msg);
      return;
    }
    showAddSuccess(data.message || ('Reset code sent to ' + email + '.'));
  } catch (e) {
    alert('Could not reach the server.');
  }
}

// Green success banner for the add-user form (mirrors showAuthError's red state).
function showAddSuccess(msg) {
  const el = document.getElementById('admin-add-success');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function hideAddSuccess() {
  const el = document.getElementById('admin-add-success');
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}

// Provision an operator/admin via POST /api/admin/users (bearer via apiFetch),
// then clear the form, confirm, and refresh the list. Client validation mirrors
// the server (all fields required, password >= 6, role in operator|admin).
async function doAddUser() {
  const name = document.getElementById('admin-add-name').value.trim();
  const email = document.getElementById('admin-add-email').value.trim();
  const password = document.getElementById('admin-add-password').value;
  const role = document.getElementById('admin-add-role').value;
  hideAuthError('admin-add-error');
  hideAddSuccess();
  if (!name || !email || !password) {
    return showAuthError('admin-add-error', 'Name, email, and password are required.');
  }
  if (password.length < 6) {
    return showAuthError('admin-add-error', 'Password must be at least 6 characters.');
  }
  if (role !== 'operator' && role !== 'admin') {
    return showAuthError('admin-add-error', 'Role must be operator or admin.');
  }
  setBusy('admin-add-submit', true, 'Adding…', 'Add Team Member');
  try {
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.error || 'Could not add the team member.';
      if (res.status === 409) msg = data.error || 'That email is already in use.';
      else if (res.status === 403) msg = 'You do not have permission to add users.';
      return showAuthError('admin-add-error', msg);
    }
    // Success: clear the form, confirm, and refresh the list to include the new user.
    document.getElementById('admin-add-name').value = '';
    document.getElementById('admin-add-email').value = '';
    document.getElementById('admin-add-password').value = '';
    document.getElementById('admin-add-role').value = 'operator';
    const added = data.user || {};
    const label = (ROLE_BADGE[added.role] || {}).label || added.role || role;
    showAddSuccess(
      (added.name || 'The new member') + ' was added as ' + label +
      '. Share the temp password — they must change it on first login.'
    );
    await loadAdminUsers();
  } catch (e) {
    showAuthError('admin-add-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('admin-add-submit', false, 'Adding…', 'Add Team Member');
  }
}

// ── Admin Pricing Config ─────────────────────────────────────────────────
var _adminPricingData = null;

var PRICING_FIELDS = [
  { key: 'gstPercent', label: 'GST Rate', desc: 'Goods and Services Tax applied on all fares' },
  { key: 'platformCommissionPercent', label: 'Platform Commission', desc: 'IraGo commission deducted from operator payouts' },
  { key: 'emergencySurchargePercent', label: 'Medical Emergency Surcharge', desc: 'Added to Golden Hour (air ambulance) bookings' },
  { key: 'urgencySurchargePercent', label: 'Urgency Travel Surcharge', desc: 'Added to urgency-flagged bookings' },
  { key: 'weatherHighSurchargePercent', label: 'Adverse Weather Surcharge', desc: 'Applied when wind >40 km/h or visibility <3 km' },
  { key: 'weatherMediumSurchargePercent', label: 'Weather Caution Surcharge', desc: 'Applied when wind >20 km/h or visibility <5 km' },
];

async function loadAdminPricing() {
  var host = document.getElementById('admin-pricing-form');
  if (!host) return;
  host.innerHTML = '<div class="pd-loading">Loading pricing config…</div>';
  try {
    var res = await apiFetch('/api/admin/pricing');
    var data = await res.json();
    if (!res.ok) { host.innerHTML = '<div class="pd-error">Failed to load pricing.</div>'; return; }
    _adminPricingData = data.config || {};
    renderPricingForm(_adminPricingData);
    renderPricingChangelog(data.changelog || []);
  } catch (e) {
    host.innerHTML = '<div class="pd-error">Could not reach server.</div>';
  }
}

function renderPricingForm(config) {
  var host = document.getElementById('admin-pricing-form');
  if (!host) return;
  var rows = PRICING_FIELDS.map(function (f) {
    var val = config[f.key] ? config[f.key].value : 0;
    return '<div style="margin-bottom:14px;">' +
      '<label style="font-weight:600;font-size:14px;color:var(--gray-900);display:block;">' + escapeHtml(f.label) + '</label>' +
      '<div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">' + escapeHtml(f.desc) + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<input type="number" id="pricing-' + f.key + '" value="' + val + '" min="0" max="100" step="0.5" ' +
          'style="width:80px;padding:6px 10px;border:1px solid var(--gray-300);border-radius:6px;font-size:14px;">' +
        '<span style="font-size:14px;color:var(--gray-600);">%</span>' +
      '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = rows +
    '<button type="button" class="btn-auth-primary" style="margin-top:8px;width:100%;" onclick="saveAdminPricing()">Save Pricing Config</button>' +
    '<div id="admin-pricing-msg" style="margin-top:8px;font-size:13px;"></div>';
}

async function saveAdminPricing() {
  var changes = {};
  PRICING_FIELDS.forEach(function (f) {
    var el = document.getElementById('pricing-' + f.key);
    if (el) changes[f.key] = parseFloat(el.value) || 0;
  });
  var msg = document.getElementById('admin-pricing-msg');
  if (msg) { msg.style.color = 'var(--gray-600)'; msg.textContent = 'Saving…'; }
  try {
    var res = await apiFetch('/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes })
    });
    var data = await res.json();
    if (res.ok && data.saved) {
      if (msg) { msg.style.color = '#16A34A'; msg.textContent = 'Pricing config saved.'; }
      _adminPricingData = data.config || {};
      loadAdminPricing();
    } else {
      if (msg) { msg.style.color = '#DC2626'; msg.textContent = data.error || 'Save failed.'; }
    }
  } catch (e) {
    if (msg) { msg.style.color = '#DC2626'; msg.textContent = 'Could not reach server.'; }
  }
}

function renderPricingChangelog(changelog) {
  var host = document.getElementById('admin-pricing-changelog');
  if (!host || !changelog.length) { if (host) host.innerHTML = ''; return; }
  var rows = changelog.map(function (entry) {
    var d = new Date(entry.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return '<div style="padding:8px 0;border-bottom:1px solid var(--gray-200);font-size:13px;">' +
      '<span style="font-weight:600;">' + escapeHtml(entry.adminName) + '</span>' +
      '<span style="color:var(--gray-500);margin-left:8px;">' + ts + '</span>' +
      '<div style="color:var(--gray-700);margin-top:2px;">' + escapeHtml(entry.changes) + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:640px;">' +
    '<div class="op-section-title" style="font-size:14px;">Change History</div>' + rows + '</div>';
}

// ── Admin Revenue Dashboard ─────────────────────────────────────────────
async function loadAdminRevenue() {
  var kpiHost = document.getElementById('admin-revenue-kpis');
  if (!kpiHost) return;
  kpiHost.innerHTML = '<div class="pd-loading">Loading revenue data…</div>';
  try {
    var res = await apiFetch('/api/admin/revenue');
    var data = await res.json();
    if (!res.ok) { kpiHost.innerHTML = '<div class="pd-error">Failed to load revenue.</div>'; return; }
    renderRevenueKPIs(data);
    renderRevenueChart(data.dailyChart || []);
    renderRevenuePayouts(data.operatorPayouts || [], data.commissionRate);
  } catch (e) {
    kpiHost.innerHTML = '<div class="pd-error">Could not reach server.</div>';
  }
}

function renderRevenueKPIs(data) {
  var host = document.getElementById('admin-revenue-kpis');
  if (!host) return;
  host.innerHTML =
    pdStat('💰', INR(data.totalRevenue), 'Total Revenue') +
    pdStat('📅', INR(data.monthRevenue), 'This Month') +
    pdStat('🏢', INR(data.platformCommission), 'Platform Commission (' + data.commissionRate + '%)') +
    pdStat('✈️', data.totalBookings || 0, 'Completed Trips');
}

function renderRevenueChart(daily) {
  var host = document.getElementById('admin-revenue-chart');
  if (!host) return;
  if (!daily.length) { host.innerHTML = '<div class="admin-form-card" style="max-width:640px;"><p class="admin-users-meta">No revenue data for the last 30 days.</p></div>'; return; }
  var maxRev = Math.max.apply(null, daily.map(function (d) { return d.revenue; })) || 1;
  var bars = daily.map(function (d) {
    var pct = Math.max((d.revenue / maxRev) * 100, 2);
    var dayLabel = new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return '<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:20px;" title="' + dayLabel + ': ' + INR(d.revenue) + '">' +
      '<div style="width:100%;max-width:24px;background:var(--primary, #2563EB);border-radius:3px 3px 0 0;height:' + pct + '%;min-height:2px;"></div>' +
      '<div style="font-size:9px;color:var(--gray-500);margin-top:2px;writing-mode:vertical-rl;transform:rotate(180deg);height:40px;overflow:hidden;">' + dayLabel + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:640px;">' +
    '<div class="op-section-title" style="font-size:14px;">Daily Revenue (30 days)</div>' +
    '<div style="display:flex;align-items:flex-end;height:120px;gap:2px;padding:0 4px;">' + bars + '</div>' +
  '</div>';
}

function renderRevenuePayouts(payouts, commRate) {
  var host = document.getElementById('admin-revenue-payouts');
  if (!host) return;
  if (!payouts.length) { host.innerHTML = ''; return; }
  var rows = payouts.map(function (p) {
    return '<tr>' +
      '<td style="padding:6px 10px;font-size:13px;">' + escapeHtml(p.name) + '</td>' +
      '<td style="padding:6px 10px;font-size:13px;">' + p.trips + '</td>' +
      '<td style="padding:6px 10px;font-size:13px;">' + INR(p.grossRevenue) + '</td>' +
      '<td style="padding:6px 10px;font-size:13px;color:#B45309;">' + INR(p.commission) + '</td>' +
      '<td style="padding:6px 10px;font-size:13px;font-weight:600;">' + INR(p.netPayout) + '</td>' +
    '</tr>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:800px;">' +
    '<div class="op-section-title" style="font-size:14px;">Operator Payouts</div>' +
    '<div style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="border-bottom:2px solid var(--gray-300);text-align:left;">' +
        '<th style="padding:6px 10px;font-size:12px;color:var(--gray-600);">Operator</th>' +
        '<th style="padding:6px 10px;font-size:12px;color:var(--gray-600);">Trips</th>' +
        '<th style="padding:6px 10px;font-size:12px;color:var(--gray-600);">Gross</th>' +
        '<th style="padding:6px 10px;font-size:12px;color:var(--gray-600);">Commission (' + commRate + '%)</th>' +
        '<th style="padding:6px 10px;font-size:12px;color:var(--gray-600);">Net Payout</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';
}

// ── Admin Compliance Monitor ────────────────────────────────────────────
async function loadAdminCompliance() {
  var summaryHost = document.getElementById('admin-compliance-summary');
  if (!summaryHost) return;
  summaryHost.innerHTML = '<div class="pd-loading">Loading compliance data…</div>';
  try {
    var res = await apiFetch('/api/admin/compliance');
    var data = await res.json();
    if (!res.ok) { summaryHost.innerHTML = '<div class="pd-error">Failed to load compliance data.</div>'; return; }
    renderComplianceSummary(data.summary || {});
    renderComplianceMissing(data.operatorsMissingChecklist || []);
    renderComplianceFailed(data.failedChecklists || []);
    renderComplianceRecent(data.recentChecklists || []);
  } catch (e) {
    summaryHost.innerHTML = '<div class="pd-error">Could not reach server.</div>';
  }
}

function renderComplianceSummary(s) {
  var host = document.getElementById('admin-compliance-summary');
  if (!host) return;
  host.innerHTML =
    pdStat('👥', s.totalOperators || 0, 'Total Operators') +
    pdStat('✅', s.withChecklist24h || 0, 'Checked In (24h)', 'green') +
    pdStat('⚠️', s.missingChecklist24h || 0, 'Missing Checklist', 'amber') +
    pdStat('❌', s.failedLast7d || 0, 'Failed (7 days)', 'red');
}

function renderComplianceMissing(operators) {
  var host = document.getElementById('admin-compliance-missing');
  if (!host) return;
  if (!operators.length) { host.innerHTML = ''; return; }
  var rows = operators.map(function (op) {
    var lastStr = op.lastChecklist
      ? new Date(op.lastChecklist).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : 'Never';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-200);">' +
      '<div><span style="font-weight:600;font-size:14px;">' + escapeHtml(op.name) + '</span>' +
        '<span style="color:var(--gray-500);font-size:12px;margin-left:8px;">' + escapeHtml(op.email) + '</span></div>' +
      '<div style="font-size:12px;color:#B45309;">Last: ' + lastStr + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:640px;">' +
    '<div class="op-section-title" style="font-size:14px;color:#B45309;">Missing Checklist (24h)</div>' + rows + '</div>';
}

function renderComplianceFailed(checklists) {
  var host = document.getElementById('admin-compliance-failed');
  if (!host) return;
  if (!checklists.length) { host.innerHTML = ''; return; }
  var rows = checklists.slice(0, 10).map(function (c) {
    var d = new Date(c.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return '<div style="padding:8px 0;border-bottom:1px solid var(--gray-200);font-size:13px;">' +
      '<span style="font-weight:600;">' + escapeHtml(c.operatorName || 'Unknown') + '</span>' +
      '<span style="color:var(--gray-500);margin-left:8px;">' + ts + '</span>' +
      '<span style="color:#DC2626;margin-left:8px;font-weight:600;">FAIL</span>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:640px;">' +
    '<div class="op-section-title" style="font-size:14px;color:#DC2626;">Failed Checklists (7 days)</div>' + rows + '</div>';
}

function renderComplianceRecent(checklists) {
  var host = document.getElementById('admin-compliance-recent');
  if (!host) return;
  if (!checklists.length) { host.innerHTML = ''; return; }
  var rows = checklists.slice(0, 15).map(function (c) {
    var d = new Date(c.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    var statusCls = c.overallStatus === 'pass' ? 'color:#16A34A' : 'color:#DC2626';
    return '<div style="padding:8px 0;border-bottom:1px solid var(--gray-200);font-size:13px;">' +
      '<span style="font-weight:600;">' + escapeHtml(c.operatorName || 'Unknown') + '</span>' +
      '<span style="color:var(--gray-500);margin-left:8px;">' + ts + '</span>' +
      '<span style="' + statusCls + ';margin-left:8px;font-weight:600;text-transform:uppercase;">' + c.overallStatus + '</span>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card" style="max-width:640px;margin-top:16px;">' +
    '<div class="op-section-title" style="font-size:14px;">Recent Checklists</div>' + rows + '</div>';
}

// ── Operator Earnings ────────────────────────────────────────────────────
async function loadOperatorEarnings() {
  var host = document.getElementById('op-earnings-body');
  if (!host) return;
  host.innerHTML = '<div class="op-empty-sub">Loading earnings…</div>';
  try {
    var res = await apiFetch('/api/operator/earnings');
    var data = await res.json();
    if (!res.ok) { host.innerHTML = '<div class="op-empty-sub">Could not load earnings.</div>'; return; }
    renderOperatorEarnings(data);
  } catch (e) {
    host.innerHTML = '<div class="op-empty-sub">Could not reach server.</div>';
  }
}

function renderOperatorEarnings(data) {
  var host = document.getElementById('op-earnings-body');
  if (!host) return;
  var kpis = '<div class="profile-stats-grid" style="margin-bottom:12px;">' +
    pdStat('💰', INR(data.totalGross), 'Total Gross') +
    pdStat('✅', INR(data.totalNet), 'Net Earnings', 'green') +
    pdStat('🏢', INR(data.totalCommission), 'Commission (' + data.commissionRate + '%)') +
    pdStat('✈️', data.completedTrips || 0, 'Completed Trips') +
  '</div>';
  var monthKpis = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
    '<div style="flex:1;min-width:120px;background:var(--gray-100);padding:10px;border-radius:8px;">' +
      '<div style="font-size:12px;color:var(--gray-500);">This Month</div>' +
      '<div style="font-size:18px;font-weight:700;">' + INR(data.monthGross) + '</div>' +
      '<div style="font-size:12px;color:#16A34A;">' + INR(data.monthNet) + ' net</div>' +
    '</div>' +
    '<div style="flex:1;min-width:120px;background:var(--gray-100);padding:10px;border-radius:8px;">' +
      '<div style="font-size:12px;color:var(--gray-500);">Month Trips</div>' +
      '<div style="font-size:18px;font-weight:700;">' + (data.monthTrips || 0) + '</div>' +
    '</div>' +
  '</div>';
  var recentHtml = '';
  if (data.recentTrips && data.recentTrips.length) {
    recentHtml = '<div style="margin-top:8px;"><div style="font-weight:600;font-size:13px;margin-bottom:6px;">Recent Trips</div>';
    data.recentTrips.forEach(function (t) {
      var d = new Date(t.createdAt);
      var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      recentHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-200);font-size:13px;">' +
        '<div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(t.route) + '</div>' +
        '<div style="flex-shrink:0;margin-left:8px;">' + INR(t.net) + '<span style="color:var(--gray-400);margin-left:4px;">' + ts + '</span></div>' +
      '</div>';
    });
    recentHtml += '</div>';
  }
  host.innerHTML = kpis + monthKpis + recentHtml;
}

// ── Operator Compliance Checklist ────────────────────────────────────────
async function submitComplianceChecklist() {
  var body = {
    firstAidKit: document.getElementById('op-ck-firstAid').checked,
    fireExtinguisher: document.getElementById('op-ck-fireExt').checked,
    emergencyLocator: document.getElementById('op-ck-elt').checked,
    pilotBriefingDone: document.getElementById('op-ck-briefing').checked,
    aircraftInspected: document.getElementById('op-ck-inspect').checked,
    weatherChecked: document.getElementById('op-ck-weather').checked,
    fuelSufficient: document.getElementById('op-ck-fuel').checked,
    communicationEquipment: document.getElementById('op-ck-comms').checked,
    notes: (document.getElementById('op-ck-notes') || {}).value || '',
  };
  var statusEl = document.getElementById('op-compliance-status');
  if (statusEl) { statusEl.style.color = 'var(--gray-600)'; statusEl.textContent = 'Submitting…'; }
  try {
    var res = await apiFetch('/api/operator/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (res.ok) {
      var passed = data.overallStatus === 'pass';
      if (statusEl) {
        statusEl.style.color = passed ? '#16A34A' : '#DC2626';
        statusEl.textContent = passed ? 'Checklist PASSED — you are cleared for flight.' : 'Checklist FAILED — not all critical items checked.';
      }
      loadComplianceHistory();
    } else {
      if (statusEl) { statusEl.style.color = '#DC2626'; statusEl.textContent = data.error || 'Submission failed.'; }
    }
  } catch (e) {
    if (statusEl) { statusEl.style.color = '#DC2626'; statusEl.textContent = 'Could not reach server.'; }
  }
}

async function loadComplianceHistory() {
  var host = document.getElementById('op-compliance-history');
  if (!host) return;
  try {
    var res = await apiFetch('/api/operator/compliance');
    var data = await res.json();
    if (!res.ok || !data.checklists || !data.checklists.length) { host.innerHTML = ''; return; }
    var rows = data.checklists.slice(0, 5).map(function (c) {
      var d = new Date(c.createdAt);
      var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
               d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      var statusCls = c.overallStatus === 'pass' ? 'color:#16A34A' : 'color:#DC2626';
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-200);font-size:13px;">' +
        '<span>' + ts + '</span>' +
        '<span style="' + statusCls + ';font-weight:600;text-transform:uppercase;">' + c.overallStatus + '</span>' +
      '</div>';
    }).join('');
    host.innerHTML = '<div style="font-weight:600;font-size:13px;margin-bottom:4px;">Recent Submissions</div>' + rows;
  } catch (e) { /* ignore */ }
}

