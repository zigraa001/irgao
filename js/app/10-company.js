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
