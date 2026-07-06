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
