// ===== Company (Partner) Portal =====
// Scoped entirely to #company-view. Uses admin styling classes (.admin-shell,
// .admin-drawer, .adm-grid, .adm-kpi, .adm-skeleton) but behavior hooks on
// NEW names: sections = .company-section, nav = data-company-section.

var companyCurrentSection = null;
var companyDashboardLoaded = false;

function showCompanySection(name) {
  var section = document.getElementById('company-section-' + name);
  if (!section) return;
  var root = document.getElementById('company-view');
  if (!root) return;
  root.querySelectorAll('.company-section').forEach(function (s) { s.hidden = true; });
  section.hidden = false;
  root.querySelectorAll('.company-nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-company-section') === name);
  });
  companyCurrentSection = name;

  var drawer = document.getElementById('company-drawer');
  if (drawer && window.innerWidth <= 768) drawer.classList.remove('open');

  if (name === 'dashboard') loadCompanyDashboard();
  if (name === 'flights') loadCompanyFlights();
  if (name === 'pilots') loadCompanyPilots();
  if (name === 'pricing') loadCompanyPricing();
  if (name === 'profile') loadCompanyProfile();
}

function toggleCompanyDrawer() {
  var drawer = document.getElementById('company-drawer');
  if (drawer) drawer.classList.toggle('open');
}

function companyDashboardSkeleton() {
  var row = '<div class="adm-grid adm-grid--spaced">';
  for (var i = 0; i < 4; i++) row += '<div class="adm-span-3"><div class="adm-skeleton adm-skeleton-kpi"></div></div>';
  row += '</div>';
  var row2 = '<div class="adm-grid adm-grid--spaced">';
  for (var j = 0; j < 3; j++) row2 += '<div class="adm-span-4"><div class="adm-skeleton adm-skeleton-kpi"></div></div>';
  row2 += '</div>';
  return row + row2;
}

function companyDashboardHtml(data) {
  var k = data.kpis || {};
  var c = data.company || {};

  var primaryRow =
    '<div class="adm-grid adm-grid--spaced">' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.check, 'green', (k.completedFlights || 0).toLocaleString('en-IN'), 'Completed flights') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.calendar, 'blue', (k.completedThisMonth || 0).toLocaleString('en-IN'), 'This month') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.revenue, 'navy', INR(k.grossRevenue), 'Gross revenue') + '</div>' +
      '<div class="adm-span-3">' + admKpi(ADM_ICONS.revenue, 'green', INR(k.netPayout), 'Net payout') + '</div>' +
    '</div>';

  var secondaryRow =
    '<div class="adm-grid adm-grid--spaced">' +
      '<div class="adm-span-4">' + admKpi(ADM_ICONS.users, 'blue', (k.totalPilots || 0).toLocaleString('en-IN'), 'Total pilots',
        k.onDutyPilots ? '<div class="adm-kpi-chip adm-kpi-chip--green">' + k.onDutyPilots + ' on duty</div>' : '') + '</div>' +
      '<div class="adm-span-4">' + admKpi(ADM_ICONS.cancel, 'red', (k.cancelled || 0).toLocaleString('en-IN'), 'Cancelled') + '</div>' +
      '<div class="adm-span-4">' + admKpi(ADM_ICONS.plane, 'amber', (k.completedFlights || 0).toLocaleString('en-IN'), 'Flights flown') + '</div>' +
    '</div>';

  var emptyNote = '';
  if (!k.completedFlights && !k.totalPilots) {
    emptyNote =
      '<div class="adm-comp-card" style="text-align:center;padding:40px 20px;color:var(--gray-500)">' +
        '<div style="margin-bottom:8px">' + ADM_ICONS.plane + '</div>' +
        '<div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:4px">No flights yet</div>' +
        '<div style="font-size:13px">Your pilots\' completed IraGo trips will appear here.</div>' +
      '</div>';
  }

  return primaryRow + secondaryRow + emptyNote;
}

// ===== Company Flights Section =====
var companyFlights = [];
var companyFlightsTotal = 0;
var companyFlightsOffset = 0;
var companyFlightsLoaded = false;
var companyFlightsPilots = [];

function companyFlightsSkeleton() {
  var rows = '';
  for (var i = 0; i < 5; i++) {
    rows += '<div class="cf-row cf-skeleton-row">' +
      '<div class="adm-sk-row"><div class="adm-skeleton adm-sk-circle-32"></div>' +
      '<div style="--w:1"><div class="adm-skeleton adm-sk-text" style="--w:120px"></div>' +
      '<div class="adm-skeleton adm-sk-text-sm" style="--w:80px"></div></div></div>' +
      '<div class="adm-skeleton adm-sk-pill"></div>' +
      '<div class="adm-skeleton adm-sk-text" style="--w:140px"></div>' +
      '<div class="adm-skeleton adm-sk-text" style="--w:60px"></div>' +
      '<div class="adm-skeleton adm-sk-text" style="--w:70px"></div>' +
    '</div>';
  }
  return '<div class="cf-list-card">' + rows + '</div>';
}

function companyFlightsSummaryHtml(summary) {
  if (!summary || !summary.count) return '';
  return '<div class="cf-summary-strip">' +
    '<span class="cf-summary-item">' + ADM_ICONS.check + ' <strong>' + summary.count + '</strong> completed</span>' +
    '<span class="cf-summary-item">' + ADM_ICONS.revenue + ' <strong>' + INR(summary.gross) + '</strong> gross</span>' +
    '<span class="cf-summary-item cf-summary-payout">' + ADM_ICONS.revenue + ' <strong>' + INR(summary.net) + '</strong> net payout</span>' +
  '</div>';
}

function companyFlightRowHtml(f) {
  var pilotName = f.pilot && f.pilot.name ? escapeHtml(f.pilot.name) : 'Unassigned';
  var initials = f.pilot && f.pilot.name ? pilotInitials(f.pilot.name) : '?';
  var badge = statusBadgeHtml(f.status);
  var svcLabel = SERVICE_LABELS[f.service] || f.service || '';
  var route = escapeHtml(f.pickupName || '?') + ' &rarr; ' + escapeHtml(f.destName || '?');
  var date = f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  var fare = f.fareEstimate != null ? INR(f.fareEstimate) : '--';
  var payout = '';
  if (f.status === 'completed') {
    var payoutVal = f.payout != null ? INR(f.payout) : INR(Math.round((f.fareEstimate || 0) * 0.85));
    payout = payoutVal;
    if (f.payoutEstimated) payout += ' <span class="cf-est-hint">est.</span>';
  }
  var dist = f.distanceKm != null ? KM(f.distanceKm) : '--';
  var ref = bookingRef(f.id);
  var aircraft = f.pilot && f.pilot.aircraftType ? escapeHtml(f.pilot.aircraftType) : '';
  var customer = f.customer ? escapeHtml(f.customer) : '';

  return '<div class="cf-row">' +
    '<div class="cf-cell cf-cell-pilot">' +
      '<div class="adm-pilot-avatar">' + escapeHtml(initials) + '</div>' +
      '<div class="cf-pilot-info">' +
        '<div class="cf-pilot-name">' + pilotName + '</div>' +
        '<div class="cf-pilot-meta">' + (aircraft ? aircraft + ' &middot; ' : '') + ref + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cf-cell cf-cell-route">' +
      '<div class="cf-route">' + route + '</div>' +
      '<div class="cf-route-meta">' + svcLabel + (customer ? ' &middot; ' + customer : '') + '</div>' +
    '</div>' +
    '<div class="cf-cell cf-cell-status">' + badge + '</div>' +
    '<div class="cf-cell cf-cell-date">' + date + '</div>' +
    '<div class="cf-cell cf-cell-fare adm-num-cell">' + fare + '</div>' +
    '<div class="cf-cell cf-cell-payout adm-num-cell">' + payout + '</div>' +
  '</div>';
}

function renderCompanyFlights() {
  var body = document.getElementById('company-flights-body');
  var pagerHost = document.getElementById('company-flights-pager');
  var metaEl = document.getElementById('cf-meta');
  if (!body) return;

  if (!companyFlights.length) {
    var statusFilter = document.getElementById('cf-status-filter');
    var pilotFilter = document.getElementById('cf-pilot-filter');
    var hasFilters = (statusFilter && statusFilter.value) || (pilotFilter && pilotFilter.value);
    body.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon">' + ADM_ICONS.plane + '</div>' +
      '<div class="adm-empty-title">' + (hasFilters ? 'No flights match these filters' : 'No flights yet') + '</div>' +
      '<div class="adm-empty-sub">' + (hasFilters ? 'Try adjusting your filters above.' : 'Completed trips by your pilots will appear here.') + '</div></div>';
    if (pagerHost) pagerHost.innerHTML = '';
    if (metaEl) metaEl.textContent = '';
    return;
  }

  var html = '<div class="cf-list-card">' +
    '<div class="cf-header-row">' +
      '<div class="cf-cell cf-cell-pilot">Pilot</div>' +
      '<div class="cf-cell cf-cell-route">Route</div>' +
      '<div class="cf-cell cf-cell-status">Status</div>' +
      '<div class="cf-cell cf-cell-date">Date</div>' +
      '<div class="cf-cell cf-cell-fare">Fare</div>' +
      '<div class="cf-cell cf-cell-payout">Payout</div>' +
    '</div>';
  for (var i = 0; i < companyFlights.length; i++) {
    html += companyFlightRowHtml(companyFlights[i]);
  }
  html += '</div>';
  body.innerHTML = html;

  if (metaEl) metaEl.textContent = companyFlightsTotal + ' flight' + (companyFlightsTotal === 1 ? '' : 's');

  if (pagerHost) {
    var pageSize = 20;
    var start = companyFlightsOffset + 1;
    var end = companyFlightsOffset + companyFlights.length;
    var hasPrev = companyFlightsOffset > 0;
    var hasNext = companyFlightsOffset + companyFlights.length < companyFlightsTotal;
    pagerHost.innerHTML =
      '<div class="cf-pager">' +
        '<span class="admin-pager-info">Showing ' + start + '-' + end + ' of ' + companyFlightsTotal + '</span>' +
        '<div class="admin-pager-btns">' +
          '<button class="admin-pager-btn" onclick="companyFlightsPrev()"' + (hasPrev ? '' : ' disabled') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>' +
          '<button class="admin-pager-btn" onclick="companyFlightsNext()"' + (hasNext ? '' : ' disabled') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg></button>' +
        '</div>' +
      '</div>';
  }
}

function companyFlightsPrev() {
  companyFlightsOffset = Math.max(0, companyFlightsOffset - 20);
  loadCompanyFlights(true);
}

function companyFlightsNext() {
  companyFlightsOffset += 20;
  loadCompanyFlights(true);
}

function companyFlightsFilter() {
  companyFlightsOffset = 0;
  loadCompanyFlights(true);
}

async function loadCompanyFlights(skipPilotLoad) {
  var body = document.getElementById('company-flights-body');
  var summaryHost = document.getElementById('company-flights-summary');
  if (!body) return;
  body.innerHTML = companyFlightsSkeleton();

  var statusFilter = document.getElementById('cf-status-filter');
  var pilotFilter = document.getElementById('cf-pilot-filter');
  var qs = '?limit=20&offset=' + companyFlightsOffset;
  if (statusFilter && statusFilter.value) qs += '&status=' + encodeURIComponent(statusFilter.value);
  if (pilotFilter && pilotFilter.value) qs += '&pilotId=' + encodeURIComponent(pilotFilter.value);

  try {
    var res = await apiFetch('/api/company/flights' + qs);
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.flights) {
      companyFlights = data.flights;
      companyFlightsTotal = data.total || 0;
      if (summaryHost) summaryHost.innerHTML = companyFlightsSummaryHtml(data.summary);
      renderCompanyFlights();

      if (!skipPilotLoad && !companyFlightsLoaded) {
        companyFlightsLoaded = true;
        populateCompanyPilotFilter();
      }
    } else {
      body.innerHTML = '<div class="adm-error">Could not load flights. <button type="button" onclick="loadCompanyFlights()" class="adm-retry-btn">Retry</button></div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="adm-error">Could not reach the server. <button type="button" onclick="loadCompanyFlights()" class="adm-retry-btn">Retry</button></div>';
  }
}

function populateCompanyPilotFilter() {
  var sel = document.getElementById('cf-pilot-filter');
  if (!sel) return;
  var seen = {};
  for (var i = 0; i < companyFlights.length; i++) {
    var p = companyFlights[i].pilot;
    if (p && p.id && !seen[p.id]) {
      seen[p.id] = p.name || 'Pilot ' + p.id;
    }
  }
  var html = '<option value="">All pilots</option>';
  for (var id in seen) {
    html += '<option value="' + escapeHtml(id) + '">' + escapeHtml(seen[id]) + '</option>';
  }
  sel.innerHTML = html;
}

// ===== Company Pilots Section =====
var companyPilots = [];
var companyPilotsLoaded = false;
var companyOffices = [];
var companyOfficesLoaded = false;

function companyPilotsSkeleton() {
  var rows = '';
  for (var i = 0; i < 4; i++) {
    rows += '<div class="cp-row cp-skeleton-row">' +
      '<div class="adm-sk-row"><div class="adm-skeleton adm-sk-circle-40"></div>' +
      '<div style="--w:1"><div class="adm-skeleton adm-sk-text" style="--w:130px"></div>' +
      '<div class="adm-skeleton adm-sk-text-sm" style="--w:100px"></div></div></div>' +
      '<div class="adm-skeleton adm-sk-pill"></div>' +
      '<div class="adm-skeleton adm-sk-text" style="--w:80px"></div>' +
      '<div class="adm-skeleton adm-sk-text" style="--w:60px"></div>' +
      '<div class="adm-skeleton adm-sk-pill"></div>' +
    '</div>';
  }
  return '<div class="cp-list-card">' + rows + '</div>';
}

function companyPilotDutyPill(pilot) {
  if (pilot.bannedAt) return '<span class="cp-duty-pill cp-duty-pill--banned">Deactivated</span>';
  if (pilot.onDuty) return '<span class="cp-duty-pill cp-duty-pill--on">On duty</span>';
  return '<span class="cp-duty-pill cp-duty-pill--off">Off duty</span>';
}

function companyPilotGpsFreshness(pilot) {
  if (!pilot.gpsUpdatedAt) return '<span class="cp-gps cp-gps--none" title="No GPS reported">--</span>';
  var diff = Date.now() - new Date(pilot.gpsUpdatedAt).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 5) return '<span class="cp-gps cp-gps--fresh" title="GPS fresh">' + mins + 'm ago</span>';
  if (mins < 60) return '<span class="cp-gps cp-gps--stale" title="GPS stale">' + mins + 'm ago</span>';
  var hours = Math.floor(mins / 60);
  return '<span class="cp-gps cp-gps--stale" title="GPS stale">' + hours + 'h ago</span>';
}

function companyPilotRowHtml(p) {
  var initials = pilotInitials(p.name || '?');
  var avatarClass = p.bannedAt ? 'adm-pilot-avatar cp-avatar--banned' : 'adm-pilot-avatar';
  var aircraft = p.aircraftType ? escapeHtml(p.aircraftType) : '';
  var reg = p.aircraftReg ? escapeHtml(p.aircraftReg) : '';
  var aircraftStr = aircraft + (reg ? ' (' + reg + ')' : '');

  var actionBtn = '';
  if (p.bannedAt) {
    actionBtn = '<button type="button" class="cp-action-btn cp-action-btn--activate" onclick="companyTogglePilot(' + p.id + ', true)">Reactivate</button>';
  } else {
    actionBtn = '<button type="button" class="cp-action-btn cp-action-btn--deactivate" onclick="companyTogglePilot(' + p.id + ', false)">Deactivate</button>';
  }

  return '<div class="cp-row' + (p.bannedAt ? ' cp-row--banned' : '') + '">' +
    '<div class="cp-cell cp-cell-pilot">' +
      '<div class="' + avatarClass + '">' + escapeHtml(initials) + '</div>' +
      '<div class="cp-pilot-info">' +
        '<div class="cp-pilot-name">' + escapeHtml(p.name || '') + '</div>' +
        '<div class="cp-pilot-meta">' + escapeHtml(p.email || '') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cp-cell cp-cell-duty">' + companyPilotDutyPill(p) + companyPilotGpsFreshness(p) + '</div>' +
    '<div class="cp-cell cp-cell-aircraft">' + (aircraftStr || '<span class="cp-no-val">--</span>') + '</div>' +
    '<div class="cp-cell cp-cell-trips adm-num-cell">' + (p.completedTrips || 0) + '</div>' +
    '<div class="cp-cell cp-cell-payout adm-num-cell">' + INR(p.netPayout || 0) + '</div>' +
    '<div class="cp-cell cp-cell-action">' + actionBtn + '</div>' +
  '</div>';
}

function renderCompanyPilots() {
  var body = document.getElementById('company-pilots-body');
  if (!body) return;

  if (!companyPilots.length) {
    body.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon">' + ADM_ICONS.users + '</div>' +
      '<div class="adm-empty-title">No pilots yet</div>' +
      '<div class="adm-empty-sub">Add your first pilot to start flying with IraGo.</div></div>';
    return;
  }

  var html = '<div class="cp-list-card">' +
    '<div class="cp-header-row">' +
      '<div class="cp-cell cp-cell-pilot">Pilot</div>' +
      '<div class="cp-cell cp-cell-duty">Status</div>' +
      '<div class="cp-cell cp-cell-aircraft">Aircraft</div>' +
      '<div class="cp-cell cp-cell-trips">Trips</div>' +
      '<div class="cp-cell cp-cell-payout">Payout</div>' +
      '<div class="cp-cell cp-cell-action"></div>' +
    '</div>';
  for (var i = 0; i < companyPilots.length; i++) {
    html += companyPilotRowHtml(companyPilots[i]);
  }
  html += '</div>';
  body.innerHTML = html;
}

async function loadCompanyPilots() {
  var body = document.getElementById('company-pilots-body');
  if (!body) return;
  body.innerHTML = companyPilotsSkeleton();

  try {
    var res = await apiFetch('/api/company/pilots');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.pilots) {
      companyPilots = data.pilots;
      renderCompanyPilots();
    } else {
      body.innerHTML = '<div class="adm-error">Could not load pilots. <button type="button" onclick="loadCompanyPilots()" class="adm-retry-btn">Retry</button></div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="adm-error">Could not reach the server. <button type="button" onclick="loadCompanyPilots()" class="adm-retry-btn">Retry</button></div>';
  }
}

function showCompanyAddPilot() {
  var form = document.getElementById('company-add-pilot-form');
  if (!form) return;
  form.hidden = false;
  var errEl = document.getElementById('cp-pilot-error');
  var successEl = document.getElementById('cp-pilot-success');
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (successEl) { successEl.hidden = true; successEl.textContent = ''; }
  loadCompanyOfficesSelect();
  var nameInput = document.getElementById('cp-pilot-name');
  if (nameInput) nameInput.focus();
}

function hideCompanyAddPilot() {
  var form = document.getElementById('company-add-pilot-form');
  if (form) form.hidden = true;
  document.getElementById('cp-pilot-name') && (document.getElementById('cp-pilot-name').value = '');
  document.getElementById('cp-pilot-email') && (document.getElementById('cp-pilot-email').value = '');
  document.getElementById('cp-pilot-password') && (document.getElementById('cp-pilot-password').value = '');
  var officeSelect = document.getElementById('cp-pilot-office');
  if (officeSelect) officeSelect.selectedIndex = 0;
}

async function loadCompanyOfficesSelect() {
  if (companyOfficesLoaded) return;
  var sel = document.getElementById('cp-pilot-office');
  if (!sel) return;
  try {
    var res = await apiFetch('/api/company/offices');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.offices) {
      companyOffices = data.offices;
      companyOfficesLoaded = true;
      var html = '<option value="">None (assign later)</option>';
      for (var i = 0; i < companyOffices.length; i++) {
        var o = companyOffices[i];
        html += '<option value="' + o.id + '">' + escapeHtml(o.city || 'Office ' + o.id) + '</option>';
      }
      sel.innerHTML = html;
    }
  } catch (e) {
    // silently keep the default option
  }
}

async function doCompanyAddPilot() {
  var nameEl = document.getElementById('cp-pilot-name');
  var emailEl = document.getElementById('cp-pilot-email');
  var passEl = document.getElementById('cp-pilot-password');
  var officeEl = document.getElementById('cp-pilot-office');
  var errEl = document.getElementById('cp-pilot-error');
  var successEl = document.getElementById('cp-pilot-success');

  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (successEl) { successEl.hidden = true; successEl.textContent = ''; }

  var name = nameEl ? nameEl.value.trim() : '';
  var email = emailEl ? emailEl.value.trim() : '';
  var password = passEl ? passEl.value : '';
  var officeId = officeEl && officeEl.value ? Number(officeEl.value) : null;

  if (!name || !email || !password) {
    if (errEl) { errEl.textContent = 'All fields are required.'; errEl.hidden = false; }
    return;
  }
  if (password.length < 6) {
    if (errEl) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.hidden = false; }
    return;
  }

  var payload = { name: name, email: email, password: password };
  if (officeId) payload.officeId = officeId;

  try {
    var res = await apiFetch('/api/company/pilots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.user) {
      if (successEl) {
        successEl.textContent = 'Pilot created! They must change the temporary password on first login.';
        successEl.hidden = false;
      }
      if (nameEl) nameEl.value = '';
      if (emailEl) emailEl.value = '';
      if (passEl) passEl.value = '';
      if (officeEl) officeEl.selectedIndex = 0;
      loadCompanyPilots();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Could not create pilot.'; errEl.hidden = false; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Could not reach the server.'; errEl.hidden = false; }
  }
}

async function companyTogglePilot(pilotId, activate) {
  if (!activate) {
    var pilot = null;
    for (var i = 0; i < companyPilots.length; i++) {
      if (companyPilots[i].id === pilotId) { pilot = companyPilots[i]; break; }
    }
    var pilotName = pilot ? pilot.name : 'this pilot';
    if (!confirm('Deactivate ' + pilotName + '? They will not be able to log in or receive dispatch offers.')) return;
  }

  try {
    var res = await apiFetch('/api/company/pilots/' + pilotId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: activate }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok) {
      loadCompanyPilots();
    } else {
      alert(data.error || 'Could not update pilot status.');
    }
  } catch (e) {
    alert('Could not reach the server.');
  }
}

// ===== Company Pricing Section =====
var companyPricingData = null;
var companyPricingLoaded = false;

function companyPricingSkeleton() {
  var html = '<div class="cpr-grid">';
  for (var i = 0; i < 3; i++) {
    html += '<div class="cpr-card"><div class="adm-skeleton adm-skeleton-kpi" style="--w:100%;height:200px"></div></div>';
  }
  html += '</div>';
  return html;
}

function companyPricingCardHtml(svc) {
  var label = SERVICE_LABELS[svc.service] || svc.service;
  var p = svc.platform;
  var ov = svc.override;
  var b = svc.bounds;
  var hasOverride = ov && ov.active;
  var currentBase = hasOverride ? ov.baseFare : p.base;
  var currentPerKm = hasOverride ? ov.perKm : p.perKm;

  var html = '<div class="cpr-card">' +
    '<div class="cpr-card-header">' +
      '<div class="cpr-svc-name">' + escapeHtml(label) + '</div>' +
      (hasOverride
        ? '<span class="cpr-badge cpr-badge--active">Custom rate</span>'
        : '<span class="cpr-badge cpr-badge--default">Platform default</span>') +
    '</div>' +
    '<div class="cpr-defaults">' +
      '<span class="cpr-default-label">Platform default:</span> ' +
      '<span class="cpr-default-val">' + INR(p.base) + ' base + ' + INR(p.perKm) + '/km</span>' +
    '</div>' +
    '<div class="cpr-form" id="cpr-form-' + svc.service + '">' +
      '<div class="cpr-field">' +
        '<label class="cpr-label">Base fare (INR)</label>' +
        '<input type="number" class="pd-input cpr-input" id="cpr-base-' + svc.service + '" value="' + currentBase + '" min="' + b.minBase + '" max="' + b.maxBase + '" step="1">' +
        '<div class="cpr-bounds">Min ' + INR(b.minBase) + ' - Max ' + INR(b.maxBase) + '</div>' +
      '</div>' +
      '<div class="cpr-field">' +
        '<label class="cpr-label">Per km (INR)</label>' +
        '<input type="number" class="pd-input cpr-input" id="cpr-perkm-' + svc.service + '" value="' + currentPerKm + '" min="' + b.minPerKm + '" max="' + b.maxPerKm + '" step="1">' +
        '<div class="cpr-bounds">Min ' + INR(b.minPerKm) + ' - Max ' + INR(b.maxPerKm) + '</div>' +
      '</div>' +
      '<div class="cpr-note">Changes take effect immediately for new bookings.</div>' +
      '<div id="cpr-error-' + svc.service + '" class="auth-error" hidden></div>' +
      '<div class="cpr-actions">' +
        '<button type="button" class="admin-add-member-btn cpr-save-btn" id="cpr-save-' + svc.service + '" onclick="saveCompanyPricing(\'' + svc.service + '\')">Save ' + escapeHtml(label) + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  return html;
}

function companyPricingChangelogHtml(changelog) {
  if (!changelog || !changelog.length) return '';
  var html = '<div class="cpr-changelog-card">' +
    '<div class="cpr-changelog-title">Change history</div>';
  for (var i = 0; i < changelog.length; i++) {
    var c = changelog[i];
    var date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    html += '<div class="cpr-changelog-entry">' +
      '<div class="cpr-changelog-meta">' + escapeHtml(c.actorName || '') + ' &middot; ' + date + '</div>' +
      '<div class="cpr-changelog-diff">' + escapeHtml(c.changes || '') + '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function renderCompanyPricing() {
  var body = document.getElementById('company-pricing-body');
  if (!body || !companyPricingData) return;

  var html = '<div class="cpr-grid">';
  var svcs = companyPricingData.services || [];
  for (var i = 0; i < svcs.length; i++) {
    html += companyPricingCardHtml(svcs[i]);
  }
  html += '</div>';
  html += companyPricingChangelogHtml(companyPricingData.changelog);
  body.innerHTML = html;
}

async function loadCompanyPricing() {
  var body = document.getElementById('company-pricing-body');
  if (!body) return;
  body.innerHTML = companyPricingSkeleton();

  try {
    var res = await apiFetch('/api/company/pricing');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.services) {
      companyPricingData = data;
      companyPricingLoaded = true;
      renderCompanyPricing();
    } else {
      body.innerHTML = '<div class="adm-error">Could not load pricing. <button type="button" onclick="loadCompanyPricing()" class="adm-retry-btn">Retry</button></div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="adm-error">Could not reach the server. <button type="button" onclick="loadCompanyPricing()" class="adm-retry-btn">Retry</button></div>';
  }
}

async function saveCompanyPricing(service) {
  var baseEl = document.getElementById('cpr-base-' + service);
  var perKmEl = document.getElementById('cpr-perkm-' + service);
  var errEl = document.getElementById('cpr-error-' + service);
  var saveBtn = document.getElementById('cpr-save-' + service);
  if (!baseEl || !perKmEl) return;

  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

  var baseFare = Number(baseEl.value);
  var perKm = Number(perKmEl.value);

  if (!baseFare || baseFare <= 0 || !perKm || perKm <= 0) {
    if (errEl) { errEl.textContent = 'Both values must be positive numbers.'; errEl.hidden = false; }
    return;
  }

  var origText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) { saveBtn.textContent = 'Saving...'; saveBtn.disabled = true; }

  try {
    var res = await apiFetch('/api/company/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: service, baseFare: baseFare, perKm: perKm }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.ok) {
      loadCompanyPricing();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Could not save.'; errEl.hidden = false; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Could not reach the server.'; errEl.hidden = false; }
  } finally {
    if (saveBtn) { saveBtn.textContent = origText; saveBtn.disabled = false; }
  }
}

async function loadCompanyDashboard() {
  var host = document.getElementById('company-dashboard-body');
  if (!host) return;
  host.innerHTML = companyDashboardSkeleton();
  try {
    var res = await apiFetch('/api/company/dashboard');
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.kpis) {
      host.innerHTML = companyDashboardHtml(data);
      var welcome = document.getElementById('company-welcome');
      if (welcome && data.company && data.company.name) {
        welcome.textContent = 'Good day, ' + data.company.name;
      }
      var codeBadge = document.getElementById('company-code-badge');
      if (codeBadge && data.company && data.company.code) {
        codeBadge.textContent = data.company.code;
        codeBadge.hidden = false;
      }
    } else {
      host.innerHTML = '<div class="adm-error">Could not load dashboard. <button type="button" onclick="loadCompanyDashboard()" class="adm-retry-btn">Retry</button></div>';
    }
  } catch (e) {
    host.innerHTML = '<div class="adm-error">Could not reach the server. <button type="button" onclick="loadCompanyDashboard()" class="adm-retry-btn">Retry</button></div>';
  }
}

// ===== Company Profile (US-129) =====

var _cpProfileData = null;
var _cpEditMode = false;

function cpProfileSkeleton() {
  return '<div class="adm-grid"><div class="adm-span-12"><div class="adm-skeleton" style="height:200px;border-radius:12px"></div></div></div>' +
    '<div class="adm-grid adm-grid--spaced" style="margin-top:16px"><div class="adm-span-12"><div class="adm-skeleton" style="height:120px;border-radius:12px"></div></div></div>';
}

function cpEsc(v) {
  if (v === null || v === undefined) return '';
  var d = document.createElement('div');
  d.textContent = String(v);
  return d.innerHTML;
}

function cpPendingBanner(pending) {
  if (!pending) return '';
  var payload;
  try { payload = typeof pending.payload === 'string' ? JSON.parse(pending.payload) : pending.payload; } catch (e) { payload = {}; }
  var rows = '';
  var keys = Object.keys(payload);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var d = payload[k];
    rows += '<tr><td class="cprf-diff-field">' + cpEsc(k) + '</td>' +
      '<td class="cprf-diff-old">' + cpEsc(d.from || '(empty)') + '</td>' +
      '<td class="cprf-diff-arrow">&#x2192;</td>' +
      '<td class="cprf-diff-new">' + cpEsc(d.to || '(empty)') + '</td></tr>';
  }
  return '<div class="cprf-pending-banner">' +
    '<div class="cprf-pending-title">Pending change request</div>' +
    '<p class="cprf-pending-sub">Submitted ' + new Date(pending.createdAt).toLocaleDateString('en-IN') + ' &mdash; awaiting IraGo admin approval</p>' +
    '<table class="cprf-diff-table"><thead><tr><th>Field</th><th>Current</th><th></th><th>Proposed</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<button type="button" class="cprf-cancel-btn" onclick="cancelCompanyRequest(' + pending.id + ')">Cancel request</button>' +
    '</div>';
}

function cpProfileReadView(c, offices, pending) {
  var logo = c.logoUrl ? '<img src="' + cpEsc(c.logoUrl) + '" alt="Logo" class="cprf-logo">' : '<div class="cprf-logo-placeholder">No logo</div>';
  var officeList = '';
  if (offices && offices.length) {
    for (var i = 0; i < offices.length; i++) {
      var o = offices[i];
      officeList += '<div class="cprf-office">' + cpEsc(o.city) + (o.address ? ' &mdash; ' + cpEsc(o.address) : '') + '</div>';
    }
  } else {
    officeList = '<div class="cprf-office cprf-empty">No offices on file</div>';
  }

  return cpPendingBanner(pending) +
    '<div class="cprf-card">' +
      '<div class="cprf-card-head">' +
        '<div class="cprf-logo-wrap">' + logo + '</div>' +
        '<div class="cprf-title-wrap">' +
          '<h2 class="cprf-name">' + cpEsc(c.name) + '</h2>' +
          '<span class="cprf-code-chip">' + cpEsc(c.code) + '</span>' +
        '</div>' +
        '<button type="button" class="cprf-edit-btn" onclick="enterCompanyProfileEdit()"' + (pending ? ' disabled title="Cancel pending request first"' : '') + '>Edit profile</button>' +
      '</div>' +
      '<div class="cprf-details">' +
        '<div class="cprf-detail-row"><span class="cprf-label">Contact email</span><span class="cprf-value">' + cpEsc(c.contactEmail || '(not set)') + '</span></div>' +
        '<div class="cprf-detail-row"><span class="cprf-label">Contact phone</span><span class="cprf-value">' + cpEsc(c.contactPhone || '(not set)') + '</span></div>' +
        '<div class="cprf-detail-row"><span class="cprf-label">Description</span><span class="cprf-value">' + cpEsc(c.description || '(not set)') + '</span></div>' +
        '<div class="cprf-detail-row"><span class="cprf-label">Rating</span><span class="cprf-value">' + (c.rating || 'N/A') + '</span></div>' +
        '<div class="cprf-detail-row"><span class="cprf-label">Fleet size</span><span class="cprf-value">' + (c.fleetSize || 0) + '</span></div>' +
      '</div>' +
      '<div class="cprf-offices-section">' +
        '<h3 class="cprf-section-title">Regional Offices</h3>' +
        officeList +
      '</div>' +
    '</div>';
}

function cpProfileEditForm(c) {
  return '<div class="cprf-card">' +
    '<div class="cprf-card-head">' +
      '<h2 class="cprf-name">Edit Company Profile</h2>' +
      '<span class="cprf-code-chip">' + cpEsc(c.code) + ' (read-only)</span>' +
    '</div>' +
    '<div class="cprf-form">' +
      '<div class="cprf-field"><label class="cprf-field-label">Company name</label><input type="text" id="cprf-name" class="cprf-input" value="' + cpEsc(c.name || '') + '" maxlength="255"></div>' +
      '<div class="cprf-field"><label class="cprf-field-label">Logo URL</label><input type="text" id="cprf-logo" class="cprf-input" value="' + cpEsc(c.logoUrl || '') + '" maxlength="512" placeholder="https://..."></div>' +
      '<div class="cprf-field"><label class="cprf-field-label">Contact email</label><input type="email" id="cprf-email" class="cprf-input" value="' + cpEsc(c.contactEmail || '') + '" maxlength="255"></div>' +
      '<div class="cprf-field"><label class="cprf-field-label">Contact phone</label><input type="text" id="cprf-phone" class="cprf-input" value="' + cpEsc(c.contactPhone || '') + '" maxlength="32"></div>' +
      '<div class="cprf-field"><label class="cprf-field-label">Description</label><textarea id="cprf-desc" class="cprf-input cprf-textarea" maxlength="512" rows="3">' + cpEsc(c.description || '') + '</textarea></div>' +
      '<div id="cprf-error" class="auth-error" hidden></div>' +
      '<div id="cprf-success" class="admin-add-success" hidden></div>' +
      '<div class="cprf-form-actions">' +
        '<button type="button" class="das-ghost-btn" onclick="exitCompanyProfileEdit()">Cancel</button>' +
        '<button type="button" class="cprf-submit-btn" onclick="submitCompanyProfileRequest()">Submit for approval</button>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function cpRequestHistoryHtml(requests) {
  if (!requests || !requests.length) return '';
  var statusClass = { pending: 'cprf-chip--amber', approved: 'cprf-chip--green', rejected: 'cprf-chip--red', superseded: 'cprf-chip--gray', cancelled: 'cprf-chip--gray' };
  var html = '<div class="cprf-history"><h3 class="cprf-section-title">Request History</h3>';
  for (var i = 0; i < requests.length; i++) {
    var r = requests[i];
    var cls = statusClass[r.status] || 'cprf-chip--gray';
    var payload;
    try { payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload; } catch (e) { payload = {}; }
    var fields = Object.keys(payload).join(', ');
    html += '<div class="cprf-history-item">' +
      '<div class="cprf-history-head">' +
        '<span class="cprf-chip ' + cls + '">' + cpEsc(r.status) + '</span>' +
        '<span class="cprf-history-date">' + new Date(r.createdAt).toLocaleDateString('en-IN') + '</span>' +
      '</div>' +
      '<div class="cprf-history-fields">Fields: ' + cpEsc(fields || 'none') + '</div>' +
      (r.adminNote ? '<div class="cprf-history-note">Admin note: ' + cpEsc(r.adminNote) + '</div>' : '') +
    '</div>';
  }
  html += '</div>';
  return html;
}

function renderCompanyProfile() {
  var host = document.getElementById('company-profile-body');
  if (!host || !_cpProfileData) return;
  var d = _cpProfileData;
  if (_cpEditMode) {
    host.innerHTML = cpProfileEditForm(d.company);
  } else {
    host.innerHTML = cpProfileReadView(d.company, d.offices, d.pending) + cpRequestHistoryHtml(d.requests || []);
  }
}

async function loadCompanyProfile() {
  var host = document.getElementById('company-profile-body');
  if (!host) return;
  host.innerHTML = cpProfileSkeleton();
  _cpEditMode = false;
  try {
    var resp = await fetch('/api/company/profile', { credentials: 'include' });
    if (!resp.ok) throw new Error('status ' + resp.status);
    var data = await resp.json();
    var histResp = await fetch('/api/company/requests', { credentials: 'include' });
    var histData = histResp.ok ? await histResp.json() : { requests: [] };
    _cpProfileData = Object.assign({}, data, { requests: histData.requests || [] });
    renderCompanyProfile();
  } catch (e) {
    host.innerHTML = '<div class="adm-error">Could not load profile. <button type="button" onclick="loadCompanyProfile()" class="adm-retry-btn">Retry</button></div>';
  }
}

function enterCompanyProfileEdit() {
  _cpEditMode = true;
  renderCompanyProfile();
}

function exitCompanyProfileEdit() {
  _cpEditMode = false;
  renderCompanyProfile();
}

async function submitCompanyProfileRequest() {
  var errEl = document.getElementById('cprf-error');
  var sucEl = document.getElementById('cprf-success');
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  if (sucEl) { sucEl.hidden = true; sucEl.textContent = ''; }

  var changes = {};
  var nameVal = (document.getElementById('cprf-name') || {}).value;
  var logoVal = (document.getElementById('cprf-logo') || {}).value;
  var emailVal = (document.getElementById('cprf-email') || {}).value;
  var phoneVal = (document.getElementById('cprf-phone') || {}).value;
  var descVal = (document.getElementById('cprf-desc') || {}).value;

  if (nameVal !== undefined) changes.name = nameVal.trim();
  if (logoVal !== undefined) changes.logoUrl = logoVal.trim();
  if (emailVal !== undefined) changes.contactEmail = emailVal.trim();
  if (phoneVal !== undefined) changes.contactPhone = phoneVal.trim();
  if (descVal !== undefined) changes.description = descVal.trim();

  try {
    var resp = await fetch('/api/company/profile-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ changes: changes })
    });
    var data = await resp.json();
    if (!resp.ok) {
      if (errEl) { errEl.textContent = data.error || 'Failed to submit.'; errEl.hidden = false; }
      return;
    }
    if (sucEl) { sucEl.textContent = 'Sent for IraGo approval!'; sucEl.hidden = false; }
    setTimeout(function () { loadCompanyProfile(); }, 1200);
  } catch (e) {
    if (errEl) { errEl.textContent = 'Could not reach server.'; errEl.hidden = false; }
  }
}

async function cancelCompanyRequest(requestId) {
  if (!confirm('Cancel this pending change request?')) return;
  try {
    var resp = await fetch('/api/company/requests/' + requestId + '/cancel', {
      method: 'POST',
      credentials: 'include'
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'Failed to cancel.');
      return;
    }
    loadCompanyProfile();
  } catch (e) {
    alert('Could not reach server.');
  }
}
