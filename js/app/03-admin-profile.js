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
let _addMemberCompanies = null;
let adminUserCompanyFilter = '';
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
  operator: { label: 'Pilot', cls: 'op-badge--blue' },
  customer: { label: 'Passenger', cls: 'op-badge--gray' },
  company:  { label: 'Partner',  cls: 'op-badge--blue' },
};

const ROLE_PROFILE = {
  admin:    { label: 'Admin',     dropdownClass: 'role-admin' },
  operator: { label: 'Pilot',  dropdownClass: 'role-operator' },
  customer: { label: 'Passenger', dropdownClass: '' },
  company:  { label: 'Partner',   dropdownClass: 'role-company' },
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
  const isAdmin = user.role === 'admin';
  if (changeBlock) changeBlock.style.display = isAdmin ? 'none' : '';
  if (deleteBlock) deleteBlock.style.display = isAdmin ? 'none' : '';
  if (adminNote) adminNote.style.display = isAdmin ? '' : 'none';
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
    return '<div class="pd-recent"><h5>Recent trips</h5><div class="pd-recent-empty">No trips yet -- your first booking will show up here.</div></div>';
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
  body.innerHTML = '<div class="pd-loading">Fetching your dashboard...</div>';
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
  if (role === 'company') return '/login/company';
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
  var navHighlight = name === 'add' ? 'users' : name;
  document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-admin-section') === navHighlight);
  });
  adminCurrentSection = name;
  // Collapse the rail on mobile after picking a section.
  const drawer = document.getElementById('admin-drawer');
  if (drawer && window.innerWidth <= 768) drawer.classList.remove('open');

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
  if (name === 'add') {
    toggleAddMemberCompany();
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
  if (name === 'approvals') {
    loadAdminApprovals();
  }
}

function settingsStatusChip(on, activeText, inactiveText) {
  var cls = on ? 'adm-toggle-chip adm-toggle-chip--on' : 'adm-toggle-chip';
  var text = on ? activeText : inactiveText;
  return '<span class="' + cls + '">' + text + '</span>';
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
    if (knob) knob.style.left = s.emergencyNoFlyBypass ? '23px' : '3px';
    if (track) track.style.background = s.emergencyNoFlyBypass ? 'var(--green)' : 'var(--gray-300)';
    const status = document.getElementById('admin-bypass-status');
    if (status) status.innerHTML = s.emergencyNoFlyBypass
      ? settingsStatusChip(true, 'Active', '') + ' Golden Hour bookings can enter no-fly zones with ATC clearance.'
      : settingsStatusChip(false, '', 'Disabled') + ' All services obey no-fly restrictions.';

    const dcb = document.getElementById('admin-toggle-demo-mode');
    const dknob = document.getElementById('admin-toggle-demo-knob');
    const dtrack = dknob?.previousElementSibling;
    if (dcb) dcb.checked = !!s.demoMode;
    if (dknob) dknob.style.left = s.demoMode ? '23px' : '3px';
    if (dtrack) dtrack.style.background = s.demoMode ? 'var(--green)' : 'var(--gray-300)';
    const dstatus = document.getElementById('admin-demo-status');
    if (dstatus) dstatus.innerHTML = s.demoMode
      ? settingsStatusChip(true, 'Active', '') + ' Paid bookings auto-run a demo pilot through the full ride.'
      : settingsStatusChip(false, '', 'Disabled') + ' Paid bookings dispatch to real on-duty pilots.';
  } catch {}
}

async function toggleDemoMode(on) {
  const knob = document.getElementById('admin-toggle-demo-knob');
  const track = knob?.previousElementSibling;
  if (knob) knob.style.left = on ? '23px' : '3px';
  if (track) track.style.background = on ? 'var(--green)' : 'var(--gray-300)';
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
    if (status) status.innerHTML = s.demoMode
      ? settingsStatusChip(true, 'Active', '') + ' Paid bookings auto-run a demo pilot through the full ride.'
      : settingsStatusChip(false, '', 'Disabled') + ' Paid bookings dispatch to real on-duty pilots.';
    showToast(s.demoMode ? 'Demo mode enabled' : 'Demo mode disabled', 'success');
  } catch {
    showToast('Network error', 'error');
  }
}

async function toggleEmergencyBypass(on) {
  const knob = document.getElementById('admin-toggle-knob');
  const track = knob?.previousElementSibling;
  if (knob) knob.style.left = on ? '23px' : '3px';
  if (track) track.style.background = on ? 'var(--green)' : 'var(--gray-300)';
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
    if (status) status.innerHTML = s.emergencyNoFlyBypass
      ? settingsStatusChip(true, 'Active', '') + ' Golden Hour bookings can enter no-fly zones with ATC clearance.'
      : settingsStatusChip(false, '', 'Disabled') + ' All services obey no-fly restrictions.';
    showToast(s.emergencyNoFlyBypass ? 'Emergency bypass enabled' : 'Emergency bypass disabled', 'success');
  } catch {
    showToast('Network error', 'error');
  }
}

async function loadAdminCompanies() {
  var listEl = document.getElementById('admin-companies-list');
  try {
    var res = await apiFetch('/api/admin/companies');
    var data = await res.json();
    if (!res.ok || !data.companies) { if (listEl) listEl.innerHTML = '<div class="op-empty-sub">Could not load companies. Please try again.</div>'; return; }
    if (!data.companies.length) {
      if (listEl) listEl.innerHTML = '<div class="partner-empty"><div class="partner-empty-icon"><svg width="40" height="40" fill="none" viewBox="0 0 24 24"><path stroke="var(--gray-300)" stroke-width="1.5" stroke-linecap="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></div><div class="partner-empty-title">No operator companies yet</div><div class="partner-empty-sub">Add your first operator company to start onboarding pilots.</div></div>';
      return;
    }
    if (listEl) {
      listEl.innerHTML = data.companies.map(function (c) {
        var code = escapeHtml(c.code || '');
        var monogram = code ? code.substring(0, 2) : escapeHtml(c.name || '').substring(0, 2).toUpperCase();
        var ratingHtml = '';
        if (c.rating) {
          var stars = '';
          for (var s = 0; s < 5; s++) stars += '<span class="' + (s < Math.round(c.rating) ? 'star-active' : 'star-inactive') + '">&#9733;</span>';
          ratingHtml = '<span class="partner-rating">' + stars + ' <span class="partner-rating-val">' + Number(c.rating).toFixed(1) + '</span></span>';
        }
        var statusClass = c.active ? 'op-badge--green' : 'op-badge--gray';
        var statusText = c.active ? 'Active' : 'Inactive';
        return '<div class="partner-card" data-company-id="' + c.id + '">' +
          '<div class="partner-card-header">' +
            '<div class="partner-monogram">' + monogram + '</div>' +
            '<div class="partner-info">' +
              '<div class="partner-name">' + escapeHtml(c.name) + (code ? ' <span class="partner-code">' + code + '</span>' : '') + '</div>' +
              ratingHtml +
            '</div>' +
            '<span class="op-status-badge ' + statusClass + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="partner-stats">' +
            '<div class="partner-stat"><svg class="partner-stat-icon" width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg><span class="partner-stat-val">' + (c.pilotCount || 0) + '</span><span class="partner-stat-label">pilots</span></div>' +
            '<div class="partner-stat"><svg class="partner-stat-icon" width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg><span class="partner-stat-val">' + (c.officeCount || 0) + '</span><span class="partner-stat-label">offices</span></div>' +
            '<div class="partner-stat"><svg class="partner-stat-icon" width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg><span class="partner-stat-val">' + (c.fleetSize || 0) + '</span><span class="partner-stat-label">fleet</span></div>' +
          '</div>' +
          '<button type="button" class="partner-offices-toggle" onclick="toggleCompanyOffices(this,' + c.id + ')">' +
            '<span>View offices</span><svg class="partner-chevron" width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="partner-offices" id="partner-offices-' + c.id + '"></div>' +
          '<button type="button" class="partner-offices-toggle" onclick="toggleCompanyPricing(this,' + c.id + ')">' +
            '<span>View pricing</span><svg class="partner-chevron" width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="partner-offices" id="partner-pricing-' + c.id + '"></div>' +
        '</div>';
      }).join('');
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="op-empty-sub">Network error loading companies.</div>';
  }
}

async function toggleCompanyOffices(btn, companyId) {
  var container = document.getElementById('partner-offices-' + companyId);
  if (!container) return;
  if (container.classList.contains('open')) {
    container.classList.remove('open');
    container.innerHTML = '';
    btn.querySelector('span').textContent = 'View offices';
    return;
  }
  btn.querySelector('span').textContent = 'Loading...';
  try {
    var res = await apiFetch('/api/admin/companies/' + companyId + '/offices');
    var data = await res.json();
    if (!res.ok || !data.offices) { container.innerHTML = '<div class="op-empty-sub">Could not load offices.</div>'; return; }
    if (!data.offices.length) {
      container.innerHTML = '<div class="partner-offices-empty">No regional offices yet.</div>';
    } else {
      container.innerHTML = data.offices.map(function (o) {
        return '<div class="partner-office-row">' +
          '<svg class="partner-office-icon" width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/></svg>' +
          '<div class="partner-office-city">' + escapeHtml(o.city) + '</div>' +
          '<div class="partner-office-meta">' +
            (o.address ? '<span>' + escapeHtml(o.address) + '</span>' : '') +
            (o.contactPhone ? '<span>' + escapeHtml(o.contactPhone) + '</span>' : '') +
          '</div>' +
          '<span class="op-status-badge ' + (o.active ? 'op-badge--green' : 'op-badge--gray') + ' op-status-badge-sm">' + (o.active ? 'Active' : 'Inactive') + '</span>' +
        '</div>';
      }).join('');
    }
    container.classList.add('open');
    btn.querySelector('span').textContent = 'Hide offices';
  } catch (e) {
    container.innerHTML = '<div class="op-empty-sub">Network error.</div>';
    container.classList.add('open');
    btn.querySelector('span').textContent = 'Hide offices';
  }
}

async function toggleCompanyPricing(btn, companyId) {
  var container = document.getElementById('partner-pricing-' + companyId);
  if (!container) return;
  if (container.classList.contains('open')) {
    container.classList.remove('open');
    container.innerHTML = '';
    btn.querySelector('span').textContent = 'View pricing';
    return;
  }
  btn.querySelector('span').textContent = 'Loading...';
  try {
    var res = await apiFetch('/api/admin/companies/' + companyId + '/pricing');
    var data = await res.json();
    if (!res.ok || !data.overrides) { container.innerHTML = '<div class="op-empty-sub">Could not load pricing.</div>'; return; }
    if (!data.overrides.length) {
      container.innerHTML = '<div class="partner-offices-empty">No pricing overrides -- using platform defaults.</div>';
    } else {
      container.innerHTML = data.overrides.map(function (o) {
        var svcLabel = (typeof SERVICE_LABELS !== 'undefined' && SERVICE_LABELS[o.service]) || o.service;
        return '<div class="partner-office-row">' +
          '<div class="partner-office-city">' + escapeHtml(svcLabel) + '</div>' +
          '<div class="partner-office-meta">' +
            '<span>Base: ' + INR(o.baseFare) + '</span>' +
            '<span>Per km: ' + INR(o.perKm) + '</span>' +
            '<span class="op-status-badge ' + (o.active ? 'op-badge--green' : 'op-badge--gray') + ' op-status-badge-sm">' + (o.active ? 'Active' : 'Inactive') + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
      if (data.changelog && data.changelog.length) {
        container.innerHTML += '<div style="padding:8px 0 4px;font-size:11px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.5px">Recent changes</div>';
        container.innerHTML += data.changelog.map(function (c) {
          var date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
          return '<div class="partner-office-row" style="padding:4px 0"><div class="partner-office-meta"><span>' + escapeHtml(c.actorName) + ' &middot; ' + date + '</span><span>' + escapeHtml(c.changes) + '</span></div></div>';
        }).join('');
      }
    }
    container.classList.add('open');
    btn.querySelector('span').textContent = 'Hide pricing';
  } catch (e) {
    container.innerHTML = '<div class="op-empty-sub">Network error.</div>';
    container.classList.add('open');
    btn.querySelector('span').textContent = 'Hide pricing';
  }
}

async function addOperatorCompany() {
  var name = (document.getElementById('admin-company-name') || {}).value || '';
  var code = (document.getElementById('admin-company-code') || {}).value || '';
  var errEl = document.getElementById('admin-company-error');
  if (!name.trim() || !code.trim()) {
    if (errEl) { errEl.textContent = 'Company name and code are required.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  try {
    var res = await apiFetch('/api/admin/companies', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), code: code.trim().toUpperCase() }),
    });
    var data = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = (data && data.error) || 'Failed to add company.'; errEl.style.display = 'block'; }
      return;
    }
    showToast('Company "' + name.trim() + '" added', 'success');
    document.getElementById('admin-company-name').value = '';
    document.getElementById('admin-company-code').value = '';
    _addMemberCompanies = null;
    loadAdminCompanies();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
  }
}

function toggleAdminDrawer() {
  const drawer = document.getElementById('admin-drawer');
  if (drawer) drawer.classList.toggle('open');
}

function admKpi(iconSvg, iconColor, value, label, chipHtml) {
  return (
    '<div class="adm-kpi">' +
      '<div class="adm-kpi-icon adm-kpi-icon--' + iconColor + '">' + iconSvg + '</div>' +
      '<div class="adm-kpi-label">' + escapeHtml(label) + '</div>' +
      '<div class="adm-kpi-value">' + value + '</div>' +
      (chipHtml || '') +
    '</div>'
  );
}

var ADM_ICONS = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  bookings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20c4 0 8.68-3.91 9-12z"/><path d="M2 2s7.59 1.94 11 6"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><line x1="14.5" y1="12.5" x2="11" y2="16"/><line x1="11.5" y1="9.5" x2="8" y2="13"/><line x1="8.5" y1="6.5" x2="5" y2="10"/></svg>',
  aircraft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22l1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="M14.5 6.5l3-3a2.12 2.12 0 0 1 3 3l-3 3"/><path d="M10 10l4 4"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><line x1="8" y1="6" x2="8.01" y2="6"/><line x1="16" y1="6" x2="16.01" y2="6"/><line x1="12" y1="6" x2="12.01" y2="6"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="16" y1="10" x2="16.01" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
};

function adminDashboardHtml(stats) {
  if (!stats || stats.scope !== 'admin') return '<div class="pd-error">Could not load dashboard.</div>';
  var t = stats.totals || {};

  var primaryRow =
    '<div class="adm-grid adm-grid--spaced">' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.users, 'blue', (t.totalUsers || 0).toLocaleString('en-IN'), 'Total users') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.bookings, 'navy', (t.totalBookings || 0).toLocaleString('en-IN'), 'Total bookings') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.plane, 'amber', (t.live || 0).toLocaleString('en-IN'), 'Live flights', '<div class="adm-kpi-chip adm-kpi-chip--amber">Live</div>') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.revenue, 'green', INR(t.revenueINR), 'Revenue') + '</div>' +
    '</div>';

  function compactKpi(iconSvg, color, value, label, chipHtml) {
    return admKpi(iconSvg, color, value, label, chipHtml).replace('adm-kpi"', 'adm-kpi adm-kpi--compact"');
  }
  var secondaryRow =
    '<div class="adm-grid-5 adm-grid--spaced">' +
      compactKpi(ADM_ICONS.check, 'green', (t.completed || 0).toLocaleString('en-IN'), 'Completed', '<div class="adm-kpi-chip adm-kpi-chip--green">Done</div>') +
      compactKpi(ADM_ICONS.cancel, 'red', (t.cancelled || 0).toLocaleString('en-IN'), 'Cancelled') +
      compactKpi(ADM_ICONS.leaf, 'green', CO2(t.carbonSavedKg), 'CO2 saved') +
      compactKpi(ADM_ICONS.ruler, 'blue', KM(t.distanceKm), 'Distance flown') +
      compactKpi(ADM_ICONS.aircraft, 'navy', (t.availableAircraft || 0).toLocaleString('en-IN'), 'Aircraft available') +
    '</div>';

  var usersCard = '';
  if (t.users) {
    var keys = Object.keys(t.users);
    var max = Math.max.apply(null, keys.map(function (k) { return t.users[k]; })) || 1;
    var bars = keys.map(function (k) {
      var v = t.users[k];
      var pct = Math.max((v / max) * 100, 4);
      return (
        '<div class="adm-bar-row">' +
          '<span class="adm-bar-label">' + escapeHtml(k) + '</span>' +
          '<span class="adm-bar-track"><span class="adm-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="adm-bar-val">' + v + '</span>' +
        '</div>'
      );
    }).join('');
    usersCard =
      '<div class="adm-span-6"><div class="adm-comp-card">' +
        '<div class="adm-comp-card-header"><span class="adm-comp-card-title">Users by role</span></div>' +
        bars +
      '</div></div>';
  }

  var liveCard =
    '<div class="adm-span-6"><div class="adm-comp-card">' +
      '<div class="adm-comp-card-header"><span class="adm-comp-card-title">Live operations</span></div>' +
      '<div class="adm-live-hero">' +
        '<div class="adm-live-hero-value">' + (t.live || 0) + '</div>' +
        '<div class="adm-live-hero-label">flights in progress</div>' +
        '<button type="button" class="adm-live-btn" onclick="showAdminSection(\'live\')">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' +
          'Open Live Map' +
        '</button>' +
      '</div>' +
    '</div></div>';

  var compRow = '<div class="adm-grid">' + usersCard + liveCard + '</div>';

  return primaryRow + secondaryRow + compRow;
}

function adminDashboardSkeleton() {
  var row1 = '<div class="adm-grid adm-grid--spaced">';
  for (var i = 0; i < 4; i++) row1 += '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>';
  row1 += '</div>';
  var row2 = '<div class="adm-grid-5 adm-grid--spaced">';
  for (var j = 0; j < 5; j++) row2 += '<div class="adm-skeleton adm-skeleton-kpi"></div>';
  row2 += '</div>';
  var row3 = '<div class="adm-grid">' +
    '<div class="adm-span-6"><div class="adm-skeleton adm-skeleton-comp"></div></div>' +
    '<div class="adm-span-6"><div class="adm-skeleton adm-skeleton-comp"></div></div>' +
  '</div>';
  return row1 + row2 + row3;
}

async function loadAdminPlatformStats() {
  var host = document.getElementById('admin-platform-stats');
  if (!host) return;
  host.innerHTML = adminDashboardSkeleton();
  var bar = document.getElementById('admin-summary-bar');
  if (bar) {
    var now = new Date();
    bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  refreshApprovalsBadge();
  try {
    var res = await apiFetch('/api/me/stats');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.stats) {
      host.innerHTML = adminDashboardHtml(data.stats);
    } else {
      host.innerHTML = '<div class="adm-error">Could not load platform stats. <button type="button" onclick="loadAdminPlatformStats()" class="adm-retry-btn">Retry</button></div>';
    }
  } catch (e) {
    host.innerHTML = '<div class="adm-error">Could not reach the server. <button type="button" onclick="loadAdminPlatformStats()" class="adm-retry-btn">Retry</button></div>';
  }
}

function adminRoleLabel(role) {
  if (role === 'operator') return 'Pilot';
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
  if (body) body.innerHTML = '<div class="pd-loading">Fetching user details...</div>';
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
  adminUserCompanyFilter = '';
  document.querySelectorAll('.admin-tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.id === 'admin-tab-' + tab);
  });
  var filterWrap = document.getElementById('admin-users-company-filter');
  if (filterWrap) {
    filterWrap.hidden = tab !== 'operator';
    if (tab === 'operator') populateCompanyFilter();
  }
  loadAdminUsersChunk(true);
}

async function populateCompanyFilter() {
  var sel = document.getElementById('admin-users-company-select');
  if (!sel) return;
  var companies = await ensureAddMemberCompanies();
  sel.innerHTML = '<option value="">All companies</option>' +
    companies.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    }).join('') +
    '<option value="_unassigned">Unassigned</option>';
}

function filterAdminUsersByCompany() {
  var sel = document.getElementById('admin-users-company-select');
  adminUserCompanyFilter = sel ? sel.value : '';
  renderAdminUsers();
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

function adminUsersSkeleton() {
  var rows = '';
  var widths = [140, 120, 160, 130];
  var emailWidths = [180, 200, 170, 190];
  for (var i = 0; i < 4; i++) {
    rows +=
      '<div class="adm-skeleton-row">' +
        '<div class="adm-skeleton" style="width:40px;height:40px;border-radius:50%"></div>' +
        '<div style="flex:1">' +
          '<div class="adm-skeleton" style="height:14px;width:' + widths[i] + 'px;border-radius:4px;margin-bottom:6px"></div>' +
          '<div class="adm-skeleton" style="height:12px;width:' + emailWidths[i] + 'px;border-radius:4px"></div>' +
        '</div>' +
        '<div class="adm-skeleton" style="height:22px;width:' + (56 + i * 8) + 'px;border-radius:11px"></div>' +
      '</div>';
  }
  return rows;
}

async function loadAdminUsersChunk(showInitialLoading) {
  const listHost = document.getElementById('admin-users-list');
  if (!listHost || adminUsersLoading) return;

  if (showInitialLoading && adminUsers.length === 0) {
    listHost.innerHTML = adminUsersSkeleton();
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
        '<div class="adm-empty">' +
        '<div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>' +
        '<div class="adm-empty-title">Tailscale required</div>' +
        '<div class="adm-empty-sub">' + escapeHtml(data.error || 'Connect via Tailscale to use the admin panel.') + '</div>' +
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
      '<div class="adm-empty">' +
      '<div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
      '<div class="adm-empty-title">Could not load users</div>' +
      '<div class="adm-empty-sub">Please try again in a moment.</div></div>';
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
      ? 'Showing ' + (adminUsers.length ? (pageStart + 1) : 0) + '–' + showingEnd + ' of ' + adminUsersTotal
      : '';
  }

  if (!adminUsers.length) {
    listHost.innerHTML =
      '<div class="adm-empty">' +
      '<div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>' +
      '<div class="adm-empty-title">No ' + (adminUserTab === 'operator' ? 'pilots' : 'passengers') + ' found</div>' +
      '<div class="adm-empty-sub">New accounts will show up here once they register or are added by an admin.</div>' +
      '</div>';
  } else {
    var filtered = adminUsers;
    if (adminUserTab === 'operator' && adminUserCompanyFilter === '_unassigned') {
      filtered = adminUsers.filter(function (u) { return !u.companyId; });
    } else if (adminUserTab === 'operator' && adminUserCompanyFilter) {
      filtered = adminUsers.filter(function (u) {
        return String(u.companyId) === adminUserCompanyFilter;
      });
    }
    if (!filtered.length && adminUserCompanyFilter) {
      listHost.innerHTML =
        '<div class="adm-empty">' +
        '<div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>' +
        '<div class="adm-empty-title">No pilots in this company</div>' +
        '<div class="adm-empty-sub">Try a different company filter or add a pilot to this company.</div>' +
        '</div>';
    } else {
    listHost.innerHTML = filtered.map(function (u) {
      const initial = String((u.name || u.email || '?')).trim().charAt(0).toUpperCase() || '?';
      var tags = roleBadgeHtml(u.role);
      if (u.role === 'operator') {
        if (u.companyName) {
          tags += '<span class="op-status-badge op-badge--blue">' + escapeHtml(u.companyName) + '</span>';
        } else {
          tags += '<span class="op-status-badge op-badge--amber">Unassigned</span>';
        }
      }
      if (u.banned) {
        tags += '<span class="op-status-badge op-badge--red">Banned</span>';
      }
      var actions;
      if (u.role === 'admin') {
        actions = '<span class="admin-user-note">Password via .env bootstrap</span>';
      } else {
        actions =
          '<div class="admin-user-actions">' +
          '<button type="button" class="admin-btn-sm primary" onclick="event.stopPropagation();adminResetPassword(' + u.id + ')">Reset</button>' +
          '<button type="button" class="admin-btn-sm" onclick="event.stopPropagation();adminSendResetOtp(' + u.id + ')">OTP</button>' +
          '<button type="button" class="admin-btn-sm" onclick="event.stopPropagation();adminBanUser(' + u.id + ',' + (!u.banned) + ')">' +
            (u.banned ? 'Unban' : 'Ban') + '</button>' +
          '<button type="button" class="admin-btn-sm danger" onclick="event.stopPropagation();adminDeleteUser(' + u.id + ')">Delete</button>' +
          '</div>';
      }
      var chevronSvg = '<span class="admin-user-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg></span>';
      return (
        '<div class="admin-user-card" role="button" tabindex="0" onclick="openAdminUserDrawer(' + u.id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openAdminUserDrawer(' + u.id + ')}">' +
          '<div class="admin-user-id">' + escapeHtml(initial) + '</div>' +
          '<div class="admin-user-main">' +
            '<div class="admin-user-name">' + escapeHtml(u.name || '--') + '</div>' +
            '<div class="admin-user-email">' + escapeHtml(u.email || '') + '</div>' +
          '</div>' +
          '<div class="admin-user-tags">' + tags + '</div>' +
          actions +
          chevronSvg +
        '</div>'
      );
    }).join('');
    }
  }

  if (pagerHost) {
    var prevSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>';
    var nextSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>';
    var loadMore = adminPageCanLoadMore();
    pagerHost.innerHTML =
      '<span class="admin-pager-info">' +
        (adminUsersTotal ? 'Showing ' + (adminUsers.length ? (pageStart + 1) : 0) + '–' + showingEnd + ' of ' + adminUsersTotal : '') +
      '</span>' +
      '<div class="admin-pager-btns">' +
        '<button type="button" class="admin-pager-btn" onclick="adminUsersPrevPage()" ' +
          (adminUserPage <= 0 ? 'disabled' : '') + '>' + prevSvg + '</button>' +
        '<span class="admin-pager-page">' + (adminUserPage + 1) + ' / ' + adminPageCount() + '</span>' +
        '<button type="button" class="admin-pager-btn" onclick="adminUsersNextPage()" ' +
          (adminUserPage >= adminPageCount() - 1 ? 'disabled' : '') + '>' + nextSvg + '</button>' +
      '</div>' +
      (loadMore
        ? '<button type="button" class="admin-load-more" onclick="loadAdminUsersChunk(false)">Load more</button>'
        : '');
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

async function ensureAddMemberCompanies() {
  if (_addMemberCompanies) return _addMemberCompanies;
  try {
    var res = await apiFetch('/api/admin/companies');
    var data = await res.json();
    if (res.ok && data.companies) _addMemberCompanies = data.companies;
  } catch {}
  return _addMemberCompanies || [];
}

function toggleAddMemberCompany() {
  var role = (document.getElementById('admin-add-role') || {}).value;
  var companyField = document.getElementById('admin-add-company-field');
  var officeField = document.getElementById('admin-add-office-field');
  if (!companyField || !officeField) return;
  if (role === 'operator' || role === 'company') {
    companyField.style.display = '';
    officeField.style.display = role === 'operator' ? '' : 'none';
    loadAddMemberCompanyOptions();
  } else {
    companyField.style.display = 'none';
    officeField.style.display = 'none';
    document.getElementById('admin-add-company').value = '';
    document.getElementById('admin-add-office').innerHTML = '<option value="">None (optional)</option>';
  }
}

async function loadAddMemberCompanyOptions() {
  var sel = document.getElementById('admin-add-company');
  if (!sel) return;
  var companies = await ensureAddMemberCompanies();
  sel.innerHTML = '<option value="">Select a company</option>' +
    companies.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    }).join('');
}

async function onAddMemberCompanyChange() {
  var companyId = (document.getElementById('admin-add-company') || {}).value;
  var officeSel = document.getElementById('admin-add-office');
  if (!officeSel) return;
  officeSel.innerHTML = '<option value="">None (optional)</option>';
  if (!companyId) return;
  try {
    var res = await apiFetch('/api/admin/companies/' + companyId + '/offices');
    var data = await res.json();
    if (res.ok && data.offices && data.offices.length) {
      officeSel.innerHTML = '<option value="">None (optional)</option>' +
        data.offices.map(function (o) {
          return '<option value="' + o.id + '">' + escapeHtml(o.city + (o.address ? ' - ' + o.address : '')) + '</option>';
        }).join('');
    }
  } catch {}
}

async function doAddUser() {
  const name = document.getElementById('admin-add-name').value.trim();
  const email = document.getElementById('admin-add-email').value.trim();
  const password = document.getElementById('admin-add-password').value;
  const role = document.getElementById('admin-add-role').value;
  const companyId = (document.getElementById('admin-add-company') || {}).value || '';
  const officeId = (document.getElementById('admin-add-office') || {}).value || '';
  hideAuthError('admin-add-error');
  hideAddSuccess();
  if (!name || !email || !password) {
    return showAuthError('admin-add-error', 'Name, email, and password are required.');
  }
  if (password.length < 6) {
    return showAuthError('admin-add-error', 'Password must be at least 6 characters.');
  }
  if (role !== 'operator' && role !== 'admin' && role !== 'company') {
    return showAuthError('admin-add-error', 'Role must be operator, admin, or company.');
  }
  if ((role === 'operator' || role === 'company') && !companyId) {
    return showAuthError('admin-add-error', 'Please select a company for this account.');
  }
  setBusy('admin-add-submit', true, 'Adding...', 'Add Team Member');
  var payload = { name: name, email: email, password: password, role: role };
  if (role === 'operator' || role === 'company') {
    payload.companyId = Number(companyId);
    if (officeId) payload.officeId = Number(officeId);
  }
  try {
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
    if (document.getElementById('admin-add-company')) document.getElementById('admin-add-company').value = '';
    if (document.getElementById('admin-add-office')) document.getElementById('admin-add-office').innerHTML = '<option value="">None (optional)</option>';
    toggleAddMemberCompany();
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
    setBusy('admin-add-submit', false, 'Adding...', 'Add Team Member');
  }
}

// ── Admin Pricing Config ─────────────────────────────────────────────────
var _adminPricingData = null;

var PRICING_GROUPS = [
  { heading: 'Taxes', fields: [
    { key: 'gstPercent', label: 'GST Rate', desc: 'Goods and Services Tax applied on all fares' },
  ]},
  { heading: 'Commission', fields: [
    { key: 'platformCommissionPercent', label: 'Platform Commission', desc: 'IraGo commission deducted from operator payouts' },
  ]},
  { heading: 'Surcharges', fields: [
    { key: 'emergencySurchargePercent', label: 'Medical Emergency Surcharge', desc: 'Added to Golden Hour (air ambulance) bookings' },
    { key: 'urgencySurchargePercent', label: 'Urgency Travel Surcharge', desc: 'Added to urgency-flagged bookings' },
    { key: 'weatherHighSurchargePercent', label: 'Adverse Weather Surcharge', desc: 'Applied when wind >40 km/h or visibility <3 km' },
    { key: 'weatherMediumSurchargePercent', label: 'Weather Caution Surcharge', desc: 'Applied when wind >20 km/h or visibility <5 km' },
  ]},
];

var PRICING_FIELDS = PRICING_GROUPS.reduce(function (acc, g) { return acc.concat(g.fields); }, []);

function adminPricingSkeleton() {
  var rows = '';
  for (var i = 0; i < 6; i++) {
    rows += '<div class="adm-skeleton" style="height:44px;margin-bottom:12px;width:' + (i % 2 === 0 ? '100%' : '80%') + '"></div>';
  }
  return '<div class="adm-skeleton" style="height:14px;width:100px;margin-bottom:16px"></div>' + rows;
}

async function loadAdminPricing() {
  var host = document.getElementById('admin-pricing-form');
  if (!host) return;
  host.innerHTML = adminPricingSkeleton();
  try {
    var res = await apiFetch('/api/admin/pricing');
    var data = await res.json();
    if (!res.ok) { host.innerHTML = '<div class="pd-error">Could not load pricing configuration. Please try again.</div>'; return; }
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
  var lastSaved = '';
  PRICING_FIELDS.forEach(function (f) {
    if (config[f.key] && config[f.key].updatedAt) {
      var d = new Date(config[f.key].updatedAt);
      var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      if (!lastSaved || config[f.key].updatedAt > lastSaved) lastSaved = ts;
    }
  });
  var groups = PRICING_GROUPS.map(function (g) {
    var fields = g.fields.map(function (f) {
      var val = config[f.key] ? config[f.key].value : 0;
      return '<div class="pricing-field">' +
        '<label class="pricing-field-label">' + escapeHtml(f.label) + '</label>' +
        '<div class="pricing-field-desc">' + escapeHtml(f.desc) + '</div>' +
        '<div class="pricing-field-input">' +
          '<input type="number" id="pricing-' + f.key + '" class="pd-input pricing-input-sm" value="' + val + '" min="0" max="100" step="0.5">' +
          '<span class="pricing-field-unit">%</span>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="pricing-group">' +
      '<div class="pricing-group-heading">' + escapeHtml(g.heading) + '</div>' +
      '<div class="pricing-group-fields">' + fields + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = groups +
    '<div class="admin-form-footer">' +
      (lastSaved ? '<span class="pricing-last-saved">Last saved ' + lastSaved + '</span>' : '') +
      '<button type="button" class="btn-auth-primary pricing-save-btn" onclick="saveAdminPricing()">Save Pricing Config</button>' +
    '</div>' +
    '<div id="admin-pricing-msg" class="pricing-msg"></div>';
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
      if (msg) { msg.style.color = 'var(--green-dark)'; msg.textContent = 'Pricing config saved.'; }
      _adminPricingData = data.config || {};
      loadAdminPricing();
    } else {
      if (msg) { msg.style.color = 'var(--red-dark)'; msg.textContent = data.error || 'Save failed.'; }
    }
  } catch (e) {
    if (msg) { msg.style.color = 'var(--red-dark)'; msg.textContent = 'Could not reach server.'; }
  }
}

function renderPricingChangelog(changelog) {
  var host = document.getElementById('admin-pricing-changelog');
  if (!host) return;
  if (!changelog.length) {
    host.innerHTML = '<div class="admin-form-card adm-timeline-card">' +
      '<div class="adm-timeline-heading">Change History</div>' +
      '<div class="adm-timeline-empty">No changes recorded yet.</div>' +
    '</div>';
    return;
  }
  var rows = changelog.map(function (entry) {
    var d = new Date(entry.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return '<div class="adm-timeline-entry">' +
      '<div class="adm-timeline-dot"></div>' +
      '<div class="adm-timeline-body">' +
        '<div class="adm-timeline-who">' + escapeHtml(entry.adminName) + '</div>' +
        '<div class="adm-timeline-when">' + ts + '</div>' +
        '<div class="adm-timeline-what">' + escapeHtml(entry.changes) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="admin-form-card adm-timeline-card">' +
    '<div class="adm-timeline-heading">Change History</div>' +
    '<div class="adm-timeline-list">' + rows + '</div>' +
  '</div>';
}

// ── Admin Revenue Dashboard ─────────────────────────────────────────────
function adminRevenueSkeleton() {
  return '<div class="adm-grid adm-grid--spaced">' +
    '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>' +
    '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>' +
    '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>' +
    '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>' +
  '</div>' +
  '<div class="adm-skeleton adm-skeleton-chart"></div>';
}

async function loadAdminRevenue() {
  var kpiHost = document.getElementById('admin-revenue-kpis');
  if (!kpiHost) return;
  kpiHost.innerHTML = adminRevenueSkeleton();
  var chartHost = document.getElementById('admin-revenue-chart');
  if (chartHost) chartHost.innerHTML = '';
  var payHost = document.getElementById('admin-revenue-payouts');
  if (payHost) payHost.innerHTML = '';
  try {
    var res = await apiFetch('/api/admin/revenue');
    var data = await res.json();
    if (!res.ok) { kpiHost.innerHTML = '<div class="adm-error">Could not load revenue data. <button type="button" onclick="loadAdminRevenue()" class="adm-retry-btn">Retry</button></div>'; return; }
    renderRevenueKPIs(data);
    renderRevenueChart(data.dailyChart || []);
    renderRevenuePayouts(data.operatorPayouts || [], data.commissionRate);
  } catch (e) {
    kpiHost.innerHTML = '<div class="adm-error">Could not reach server. <button type="button" onclick="loadAdminRevenue()" class="adm-retry-btn">Retry</button></div>';
  }
}

function renderRevenueKPIs(data) {
  var host = document.getElementById('admin-revenue-kpis');
  if (!host) return;
  host.innerHTML =
    '<div class="adm-grid">' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.revenue, 'green', INR(data.totalRevenue), 'Total Revenue') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.calendar, 'blue', INR(data.monthRevenue), 'This Month') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.building, 'navy', INR(data.platformCommission), 'Platform Commission (' + data.commissionRate + '%)') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.check, 'green', (data.totalBookings || 0).toLocaleString('en-IN'), 'Completed Trips') + '</div>' +
    '</div>';
}

function renderRevenueChart(daily) {
  var host = document.getElementById('admin-revenue-chart');
  if (!host) return;
  if (!daily.length) {
    host.innerHTML = '<div class="adm-comp-card"><p class="adm-chart-empty">No revenue data for the last 30 days. Revenue will appear here once bookings are completed.</p></div>';
    return;
  }
  var maxRev = Math.max.apply(null, daily.map(function (d) { return d.revenue; })) || 1;
  var totalPeriod = daily.reduce(function (sum, d) { return sum + d.revenue; }, 0);
  var bars = daily.map(function (d) {
    var pct = Math.max((d.revenue / maxRev) * 100, 2);
    var dayLabel = new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return '<div class="admin-bar-col" title="' + dayLabel + ': ' + INR(d.revenue) + '">' +
      '<div class="admin-bar-fill" style="height:' + pct + '%;"></div>' +
      '<div class="admin-bar-label">' + dayLabel + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="adm-comp-card">' +
    '<div class="adm-chart-header">' +
      '<span class="adm-chart-title">Daily Revenue (30 days)</span>' +
      '<span class="adm-chart-total">' + INR(totalPeriod) + ' total</span>' +
    '</div>' +
    '<div class="adm-chart-area">' +
      '<div class="adm-chart-ymax">' + INR(maxRev) + '</div>' +
      '<div class="admin-bar-chart">' + bars + '</div>' +
    '</div>' +
  '</div>';
}

function renderRevenuePayouts(payouts, commRate) {
  var host = document.getElementById('admin-revenue-payouts');
  if (!host) return;
  if (!payouts.length) {
    host.innerHTML = '<div class="adm-comp-card"><p class="adm-chart-empty">No payouts yet. Payouts will appear here once pilots complete trips.</p></div>';
    return;
  }
  var rows = payouts.map(function (p) {
    var initials = pilotInitials(p.name);
    return '<tr>' +
      '<td><div class="adm-pilot-cell">' +
        '<div class="adm-pilot-avatar">' + escapeHtml(initials) + '</div>' +
        '<strong>' + escapeHtml(p.name) + '</strong>' +
      '</div></td>' +
      '<td class="adm-num-cell">' + p.trips + '</td>' +
      '<td class="adm-num-cell">' + INR(p.grossRevenue) + '</td>' +
      '<td class="adm-num-cell td-commission">' + INR(p.commission) + '</td>' +
      '<td class="adm-num-cell td-bold">' + INR(p.netPayout) + '</td>' +
    '</tr>';
  }).join('');
  host.innerHTML = '<div class="adm-comp-card">' +
    '<div class="adm-chart-header">' +
      '<span class="adm-chart-title">Pilot Payouts</span>' +
    '</div>' +
    '<div class="admin-table-wrap admin-payouts-wrap">' +
    '<table class="admin-table">' +
      '<thead><tr>' +
        '<th>Pilot</th>' +
        '<th class="adm-num-cell">Trips</th>' +
        '<th class="adm-num-cell">Gross</th>' +
        '<th class="adm-num-cell">Commission (' + commRate + '%)</th>' +
        '<th class="adm-num-cell">Net Payout</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>' +
  '</div>';
}

// ── Admin Compliance Monitor ────────────────────────────────────────────
function adminComplianceSkeleton() {
  var cards = '';
  for (var i = 0; i < 4; i++) {
    cards += '<div class="adm-span-3"><div class="adm-kpi"><div class="adm-skeleton" style="width:36px;height:36px;border-radius:50%"></div><div class="adm-skeleton" style="width:60px;height:10px;border-radius:4px;margin-top:8px"></div><div class="adm-skeleton" style="width:44px;height:24px;border-radius:4px;margin-top:6px"></div></div></div>';
  }
  return '<div class="adm-grid adm-grid--spaced">' + cards + '</div>';
}

async function loadAdminCompliance() {
  var summaryHost = document.getElementById('admin-compliance-summary');
  if (!summaryHost) return;
  summaryHost.innerHTML = adminComplianceSkeleton();
  try {
    var res = await apiFetch('/api/admin/compliance');
    var data = await res.json();
    if (!res.ok) { summaryHost.innerHTML = '<div class="adm-error">Could not load compliance data. <button class="adm-retry-btn" onclick="loadAdminCompliance()">Retry</button></div>'; return; }
    renderComplianceSummary(data.summary || {});
    renderComplianceMissing(data.operatorsMissingChecklist || []);
    renderComplianceFailed(data.failedChecklists || []);
    renderComplianceRecent(data.recentChecklists || []);
  } catch (e) {
    summaryHost.innerHTML = '<div class="adm-error">Could not reach server. <button class="adm-retry-btn" onclick="loadAdminCompliance()">Retry</button></div>';
  }
}

function renderComplianceSummary(s) {
  var host = document.getElementById('admin-compliance-summary');
  if (!host) return;
  host.innerHTML =
    '<div class="adm-grid adm-grid--spaced">' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.users, 'blue', (s.totalOperators || 0).toLocaleString('en-IN'), 'Total Pilots') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.shield, 'green', (s.withChecklist24h || 0).toLocaleString('en-IN'), 'Checked In (24h)') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.alert, 'amber', (s.missingChecklist24h || 0).toLocaleString('en-IN'), 'Missing Checklist') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.cancel, 'red', (s.failedLast7d || 0).toLocaleString('en-IN'), 'Failed (7 days)') + '</div>' +
    '</div>';
}

function renderComplianceMissing(operators) {
  var host = document.getElementById('admin-compliance-missing');
  if (!host) return;
  var countEl = document.getElementById('admin-compliance-missing-count');
  if (countEl) countEl.textContent = operators.length || '';
  if (!operators.length) {
    host.innerHTML = '<div class="adm-comp-empty adm-comp-empty--positive"><svg class="adm-comp-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>All pilots checked in during the last 24 hours</div>';
    return;
  }
  var rows = operators.map(function (op) {
    var initials = pilotInitials(op.name || 'U');
    var lastStr = op.lastChecklist
      ? new Date(op.lastChecklist).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : 'Never';
    return '<div class="adm-comp-row">' +
      '<div class="adm-comp-avatar adm-comp-avatar--amber">' + escapeHtml(initials) + '</div>' +
      '<div class="adm-comp-identity"><div class="adm-comp-name">' + escapeHtml(op.name) + '</div>' +
        '<div class="adm-comp-meta">' + escapeHtml(op.email) + '</div></div>' +
      '<div class="adm-comp-meta">Last: ' + lastStr + '</div>' +
    '</div>';
  }).join('');
  host.innerHTML = rows;
}

function renderComplianceFailed(checklists) {
  var host = document.getElementById('admin-compliance-failed');
  if (!host) return;
  var countEl = document.getElementById('admin-compliance-failed-count');
  if (countEl) countEl.textContent = checklists.length || '';
  if (!checklists.length) {
    host.innerHTML = '<div class="adm-comp-empty adm-comp-empty--positive"><svg class="adm-comp-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>No failed checklists in the last 7 days</div>';
    return;
  }
  var rows = checklists.slice(0, 10).map(function (c) {
    var initials = pilotInitials(c.operatorName || 'U');
    var d = new Date(c.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return '<div class="adm-comp-row">' +
      '<div class="adm-comp-avatar adm-comp-avatar--red">' + escapeHtml(initials) + '</div>' +
      '<div class="adm-comp-identity"><div class="adm-comp-name">' + escapeHtml(c.operatorName || 'Unknown') + '</div>' +
        '<div class="adm-comp-meta">' + ts + '</div></div>' +
      '<span class="op-status-badge op-badge--red">FAIL</span>' +
    '</div>';
  }).join('');
  host.innerHTML = rows;
}

function renderComplianceRecent(checklists) {
  var host = document.getElementById('admin-compliance-recent');
  if (!host) return;
  if (!checklists.length) { host.innerHTML = ''; return; }
  var rows = checklists.slice(0, 15).map(function (c) {
    var initials = pilotInitials(c.operatorName || 'U');
    var d = new Date(c.createdAt);
    var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
             d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    var badgeCls = c.overallStatus === 'pass' ? 'op-badge--green' : 'op-badge--red';
    return '<div class="adm-comp-row">' +
      '<div class="adm-comp-avatar">' + escapeHtml(initials) + '</div>' +
      '<div class="adm-comp-identity"><div class="adm-comp-name">' + escapeHtml(c.operatorName || 'Unknown') + '</div>' +
        '<div class="adm-comp-meta">' + ts + '</div></div>' +
      '<span class="op-status-badge ' + badgeCls + '">' + c.overallStatus.toUpperCase() + '</span>' +
    '</div>';
  }).join('');
  host.innerHTML = '<div class="adm-comp-card adm-comp-card--recent">' +
    '<div class="adm-comp-card-header">Recent Checklists</div>' + rows + '</div>';
}

// ── Operator Earnings ────────────────────────────────────────────────────
async function loadOperatorEarnings() {
  var host = document.getElementById('op-earnings-body');
  if (!host) return;
  host.innerHTML = '<div class="op-empty-sub">Fetching your earnings...</div>';
  try {
    var res = await apiFetch('/api/operator/earnings');
    var data = await res.json();
    if (!res.ok) { host.innerHTML = '<div class="op-empty-sub">Could not load earnings. Please try again.</div>'; return; }
    renderOperatorEarnings(data);
  } catch (e) {
    host.innerHTML = '<div class="op-empty-sub">Could not reach server.</div>';
  }
}

function renderOperatorEarnings(data) {
  var host = document.getElementById('op-earnings-body');
  if (!host) return;
  var kpis = '<div class="profile-stats-grid earnings-kpis">' +
    pdStat('💰', INR(data.totalGross), 'Total Gross') +
    pdStat('✅', INR(data.totalNet), 'Net Earnings', 'green') +
    pdStat('🏢', INR(data.totalCommission), 'Commission (' + data.commissionRate + '%)') +
    pdStat('✈️', data.completedTrips || 0, 'Completed Trips') +
  '</div>';
  var monthKpis = '<div class="earnings-month-grid">' +
    '<div class="earnings-month-card">' +
      '<div class="earnings-month-label">This Month</div>' +
      '<div class="earnings-month-val">' + INR(data.monthGross) + '</div>' +
      '<div class="earnings-month-net">' + INR(data.monthNet) + ' net</div>' +
    '</div>' +
    '<div class="earnings-month-card">' +
      '<div class="earnings-month-label">Month Trips</div>' +
      '<div class="earnings-month-val">' + (data.monthTrips || 0) + '</div>' +
    '</div>' +
  '</div>';
  var recentHtml = '';
  if (data.recentTrips && data.recentTrips.length) {
    recentHtml = '<div class="earnings-recent"><div class="earnings-recent-title">Recent Trips</div>';
    data.recentTrips.forEach(function (t) {
      var d = new Date(t.createdAt);
      var ts = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      recentHtml += '<div class="earnings-trip-row">' +
        '<div class="earnings-trip-route">' + escapeHtml(t.route) + '</div>' +
        '<div class="earnings-trip-amount">' + INR(t.net) + '<span class="earnings-trip-date">' + ts + '</span></div>' +
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
        statusEl.style.color = passed ? 'var(--green-dark)' : 'var(--red-dark)';
        statusEl.textContent = passed ? 'Checklist PASSED — you are cleared for flight.' : 'Checklist FAILED — not all critical items checked.';
      }
      loadComplianceHistory();
    } else {
      if (statusEl) { statusEl.style.color = 'var(--red-dark)'; statusEl.textContent = data.error || 'Submission failed.'; }
    }
  } catch (e) {
    if (statusEl) { statusEl.style.color = 'var(--red-dark)'; statusEl.textContent = 'Could not reach server.'; }
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
      var statusCls = c.overallStatus === 'pass' ? 'compliance-status--pass' : 'compliance-status--fail';
      return '<div class="compliance-history-row">' +
        '<span>' + ts + '</span>' +
        '<span class="compliance-status ' + statusCls + '">' + c.overallStatus + '</span>' +
      '</div>';
    }).join('');
    host.innerHTML = '<div class="compliance-recent-title">Recent Submissions</div>' + rows;
  } catch (e) { /* ignore */ }
}

// ===== Admin Approvals (US-130) =====

var _apprCurrentTab = 'pending';

function apprEsc(v) {
  if (v === null || v === undefined) return '';
  var d = document.createElement('div');
  d.textContent = String(v);
  return d.innerHTML;
}

async function refreshApprovalsBadge() {
  var badge = document.getElementById('admin-approvals-badge');
  if (!badge) return;
  try {
    var res = await apiFetch('/api/admin/company-requests/count');
    var data = await res.json().catch(function () { return {}; });
    var cnt = data.count || 0;
    badge.textContent = cnt;
    badge.hidden = cnt === 0;
  } catch (e) { /* ignore */ }
}

function switchApprovalTab(tab) {
  _apprCurrentTab = tab;
  var pendingBtn = document.getElementById('appr-tab-pending');
  var decidedBtn = document.getElementById('appr-tab-decided');
  if (pendingBtn) pendingBtn.classList.toggle('appr-tab--active', tab === 'pending');
  if (decidedBtn) decidedBtn.classList.toggle('appr-tab--active', tab === 'decided');
  loadAdminApprovals();
}

function apprDiffRows(payload) {
  var parsed;
  try { parsed = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { parsed = {}; }
  var keys = Object.keys(parsed);
  if (!keys.length) return '<div class="appr-no-diff">No changes</div>';
  var rows = '';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var d = parsed[k];
    rows += '<tr><td class="appr-diff-field">' + apprEsc(k) + '</td>' +
      '<td class="appr-diff-old">' + apprEsc(d.from || '(empty)') + '</td>' +
      '<td class="appr-diff-arrow">&#x2192;</td>' +
      '<td class="appr-diff-new">' + apprEsc(d.to || '(empty)') + '</td></tr>';
  }
  return '<table class="appr-diff-table"><thead><tr><th>Field</th><th>Current</th><th></th><th>Proposed</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function apprMonogram(name) {
  if (!name) return '?';
  return name.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
}

function apprRelativeTime(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function apprPendingCardHtml(r) {
  return '<div class="appr-card" id="appr-card-' + r.id + '">' +
    '<div class="appr-card-head">' +
      '<div class="appr-monogram">' + apprMonogram(r.companyName) + '</div>' +
      '<div class="appr-card-title">' +
        '<div class="appr-company-name">' + apprEsc(r.companyName) + ' <span class="appr-code">' + apprEsc(r.companyCode) + '</span></div>' +
        '<div class="appr-meta">Requested by ' + apprEsc(r.requesterName || 'Unknown') + ' &middot; ' + apprRelativeTime(r.createdAt) + '</div>' +
      '</div>' +
    '</div>' +
    apprDiffRows(r.payload) +
    '<div class="appr-actions">' +
      '<button type="button" class="appr-approve-btn" onclick="approveRequest(' + r.id + ')">Approve</button>' +
      '<button type="button" class="appr-reject-toggle" onclick="toggleRejectNote(' + r.id + ')">Reject</button>' +
    '</div>' +
    '<div class="appr-reject-form" id="appr-reject-' + r.id + '" hidden>' +
      '<textarea class="appr-reject-note" id="appr-note-' + r.id + '" placeholder="Reason for rejection (optional)" rows="2" maxlength="512"></textarea>' +
      '<button type="button" class="appr-reject-confirm" onclick="rejectRequest(' + r.id + ')">Confirm rejection</button>' +
    '</div>' +
  '</div>';
}

function apprDecidedCardHtml(r) {
  var statusClass = { approved: 'appr-chip--green', rejected: 'appr-chip--red', superseded: 'appr-chip--gray', cancelled: 'appr-chip--gray' };
  var cls = statusClass[r.status] || 'appr-chip--gray';
  return '<div class="appr-card appr-card--decided">' +
    '<div class="appr-card-head">' +
      '<div class="appr-monogram">' + apprMonogram(r.companyName) + '</div>' +
      '<div class="appr-card-title">' +
        '<div class="appr-company-name">' + apprEsc(r.companyName) + ' <span class="appr-code">' + apprEsc(r.companyCode) + '</span></div>' +
        '<div class="appr-meta">by ' + apprEsc(r.requesterName || 'Unknown') + ' &middot; ' + apprRelativeTime(r.createdAt) +
          (r.decidedAt ? ' &middot; decided ' + apprRelativeTime(r.decidedAt) : '') + '</div>' +
      '</div>' +
      '<span class="appr-chip ' + cls + '">' + apprEsc(r.status) + '</span>' +
    '</div>' +
    apprDiffRows(r.payload) +
    (r.adminNote ? '<div class="appr-admin-note">Admin note: ' + apprEsc(r.adminNote) + '</div>' : '') +
  '</div>';
}

async function loadAdminApprovals() {
  var host = document.getElementById('admin-approvals-body');
  if (!host) return;
  host.innerHTML = '<div class="adm-skeleton" style="height:120px;border-radius:12px;margin-bottom:12px"></div><div class="adm-skeleton" style="height:120px;border-radius:12px"></div>';
  var status = _apprCurrentTab === 'decided' ? 'all' : 'pending';
  try {
    var res = await apiFetch('/api/admin/company-requests?status=' + status);
    var data = await res.json().catch(function () { return {}; });
    var requests = data.requests || [];
    if (_apprCurrentTab === 'decided') {
      requests = requests.filter(function (r) { return r.status !== 'pending'; });
    }
    if (!requests.length) {
      host.innerHTML = '<div class="appr-empty"><div class="appr-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>' +
        '<div class="appr-empty-title">' + (_apprCurrentTab === 'pending' ? 'No pending requests' : 'No decided requests yet') + '</div>' +
        '<div class="appr-empty-sub">Partner change requests will appear here.</div></div>';
      return;
    }
    var html = '';
    for (var i = 0; i < requests.length; i++) {
      if (_apprCurrentTab === 'pending') {
        html += apprPendingCardHtml(requests[i]);
      } else {
        html += apprDecidedCardHtml(requests[i]);
      }
    }
    host.innerHTML = html;
  } catch (e) {
    host.innerHTML = '<div class="adm-error">Could not load requests. <button type="button" onclick="loadAdminApprovals()" class="adm-retry-btn">Retry</button></div>';
  }
}

function toggleRejectNote(reqId) {
  var form = document.getElementById('appr-reject-' + reqId);
  if (form) form.hidden = !form.hidden;
}

async function approveRequest(reqId) {
  var card = document.getElementById('appr-card-' + reqId);
  var btn = card ? card.querySelector('.appr-approve-btn') : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Approving...'; }
  try {
    var res = await apiFetch('/api/admin/company-requests/' + reqId + '/approve', { method: 'POST' });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok) {
      if (card) card.style.opacity = '0.4';
      setTimeout(function () { loadAdminApprovals(); refreshApprovalsBadge(); }, 600);
    } else {
      alert(data.error || 'Could not approve.');
      if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
    }
  } catch (e) {
    alert('Could not reach server.');
    if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
  }
}

async function rejectRequest(reqId) {
  var noteEl = document.getElementById('appr-note-' + reqId);
  var note = noteEl ? noteEl.value.trim() : '';
  var card = document.getElementById('appr-card-' + reqId);
  var btn = card ? card.querySelector('.appr-reject-confirm') : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting...'; }
  try {
    var res = await apiFetch('/api/admin/company-requests/' + reqId + '/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note })
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok) {
      if (card) card.style.opacity = '0.4';
      setTimeout(function () { loadAdminApprovals(); refreshApprovalsBadge(); }, 600);
    } else {
      alert(data.error || 'Could not reject.');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm rejection'; }
    }
  } catch (e) {
    alert('Could not reach server.');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm rejection'; }
  }
}

