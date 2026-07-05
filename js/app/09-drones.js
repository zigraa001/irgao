// IraGo app — 09-drones.js
// Drone rental catalog, booking, and admin management.

// Monochrome drone mark used wherever a service needs a visual (matches the
// admin drawer icon; inherits currentColor from its tile).
const DRONE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>' +
    '<path d="M4 4l4 4M16 4l-4 4M4 20l4 -4M16 20l-4 -4"/>' +
    '<circle cx="4" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="20" r="2"/>' +
  '</svg>';

let droneServices = [];
let droneCategories = [];
let droneCurrentCategory = 'all';
let droneSelectedService = null;
let droneMyBookings = [];
let droneAdminServicesLoaded = false;
let droneAdminOperatorsLoaded = false;
let droneAdminBookingsLoaded = false;

// ── Customer: Load & render drone catalog ──

async function loadDroneServices() {
  const list = document.getElementById('drone-services-list');
  if (!list) return;
  try {
    const res = await apiFetch('/api/drones/services');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');
    droneServices = data.services || [];
    const cats = [...new Set(droneServices.map(s => s.category))].sort();
    droneCategories = cats;
    renderDroneCategoryFilter(cats);
    renderDroneServices();
  } catch (e) {
    list.innerHTML = '<div class="op-empty-sub">Could not load drone services.</div>';
  }
}

function renderDroneCategoryFilter(cats) {
  const wrap = document.getElementById('drone-category-filter');
  if (!wrap) return;
  let html = '<button type="button" class="dashboard-pill drone-cat-btn' + (droneCurrentCategory === 'all' ? ' active' : '') + '" data-cat="all" onclick="filterDroneCategory(\'all\')">All</button>';
  cats.forEach(c => {
    html += '<button type="button" class="dashboard-pill drone-cat-btn' + (droneCurrentCategory === c ? ' active' : '') + '" data-cat="' + c + '" onclick="filterDroneCategory(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</button>';
  });
  wrap.innerHTML = html;
}

function filterDroneCategory(cat) {
  droneCurrentCategory = cat;
  document.querySelectorAll('.drone-cat-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-cat') === cat);
  });
  renderDroneServices();
}

function renderDroneServices() {
  const list = document.getElementById('drone-services-list');
  if (!list) return;
  const filtered = droneCurrentCategory === 'all' ? droneServices : droneServices.filter(s => s.category === droneCurrentCategory);
  if (!filtered.length) {
    list.innerHTML = '<div class="op-empty-sub">No drone services found in this category.</div>';
    return;
  }
  let html = '<div class="drone-grid">';
  filtered.forEach(s => {
    const opBadge = s.operatorRequired ? '<span class="drone-op-badge">Operator included</span>' : '<span class="drone-op-badge drone-op-optional">Operator optional</span>';
    html += '<div class="drone-card" onclick="selectDroneService(' + s.id + ')">' +
      '<div class="drone-card-icon">' + DRONE_ICON_SVG + '</div>' +
      '<div class="drone-card-body">' +
        '<div class="drone-card-name">' + escapeHtml(s.name) + '</div>' +
        '<div class="drone-card-cat">' + escapeHtml(s.category) + '</div>' +
        '<div class="drone-card-price">₹' + Number(s.pricePerHour).toLocaleString('en-IN') + '/hr</div>' +
        opBadge +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

function selectDroneService(id) {
  const service = droneServices.find(s => s.id === id);
  if (!service) return;
  droneSelectedService = service;
  document.getElementById('drone-services-list').style.display = 'none';
  document.getElementById('drone-category-filter').style.display = 'none';
  const section = document.getElementById('drone-book-section');
  section.style.display = 'block';
  renderDroneBookingCard(service);
}

function closeDroneBooking() {
  droneSelectedService = null;
  document.getElementById('drone-book-section').style.display = 'none';
  document.getElementById('drone-services-list').style.display = '';
  document.getElementById('drone-category-filter').style.display = 'flex';
}

function renderDroneBookingCard(s) {
  const card = document.getElementById('drone-book-card');
  const minH = s.minHours || 1;
  const maxH = s.maxHours || 8;
  const opReq = s.operatorRequired;

  let specsHtml = '';
  if (s.specs) {
    const specStr = String(s.specs);
    specsHtml = '<div class="drone-specs">';
    specStr.split('·').forEach(part => {
      const t = part.trim();
      if (t) specsHtml += '<span class="drone-spec-item">' + escapeHtml(t) + '</span>';
    });
    specsHtml += '</div>';
  }

  card.innerHTML =
    '<div class="drone-detail-head">' +
      '<span class="drone-detail-icon">' + DRONE_ICON_SVG + '</span>' +
      '<div>' +
        '<div class="drone-detail-name">' + escapeHtml(s.name) + '</div>' +
        '<div class="drone-card-cat">' + escapeHtml(s.category) + '</div>' +
      '</div>' +
    '</div>' +
    (s.description ? '<p class="drone-desc">' + escapeHtml(s.description) + '</p>' : '') +
    specsHtml +
    '<div class="drone-form">' +
      '<div class="drone-form-row">' +
        '<label>Hours</label>' +
        '<div class="drone-hour-picker">' +
          '<button type="button" class="drone-hour-btn" onclick="adjustDroneHours(-1)">−</button>' +
          '<input type="number" id="drone-hours" value="' + minH + '" min="' + minH + '" max="' + maxH + '" onchange="updateDroneQuote()">' +
          '<button type="button" class="drone-hour-btn" onclick="adjustDroneHours(1)">+</button>' +
          '<span class="drone-hour-range">' + minH + '–' + maxH + ' hrs</span>' +
        '</div>' +
      '</div>' +
      '<div class="drone-form-row">' +
        '<label>' +
          '<input type="checkbox" id="drone-with-operator"' + (opReq ? ' checked disabled' : '') + ' onchange="updateDroneQuote()"> ' +
          (opReq ? 'Operator included (required)' : 'Add drone operator (+₹' + Number(s.operatorPricePerHour).toLocaleString('en-IN') + '/hr)') +
        '</label>' +
      '</div>' +
      '<div class="drone-form-row">' +
        '<label>Location</label>' +
        '<input type="text" id="drone-location" placeholder="e.g. Farm plot, Sector 62, Noida" class="pd-input">' +
      '</div>' +
      '<div class="drone-form-row">' +
        '<label>Date</label>' +
        '<input type="date" id="drone-date" class="pd-input">' +
      '</div>' +
      '<div class="drone-form-row">' +
        '<label>Time</label>' +
        '<input type="time" id="drone-time" class="pd-input">' +
      '</div>' +
      '<div class="drone-form-row">' +
        '<label>Notes (optional)</label>' +
        '<input type="text" id="drone-notes" placeholder="Any special instructions" class="pd-input">' +
      '</div>' +
      '<div id="drone-quote-summary" class="drone-quote"></div>' +
      '<button type="button" class="op-btn drone-book-btn" id="drone-book-btn" onclick="bookDrone()">Book Now</button>' +
      '<div id="drone-book-error" class="field-error" style="margin-top:6px;"></div>' +
    '</div>';

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('drone-date').value = today;
  document.getElementById('drone-date').min = today;
  document.getElementById('drone-time').value = '09:00';

  updateDroneQuote();
}

function adjustDroneHours(delta) {
  const inp = document.getElementById('drone-hours');
  const val = Math.max(Number(inp.min), Math.min(Number(inp.max), Number(inp.value) + delta));
  inp.value = val;
  updateDroneQuote();
}

async function updateDroneQuote() {
  const s = droneSelectedService;
  if (!s) return;
  const hours = Number(document.getElementById('drone-hours').value) || s.minHours;
  const withOp = document.getElementById('drone-with-operator').checked;
  const summary = document.getElementById('drone-quote-summary');

  try {
    const res = await apiFetch('/api/drones/quote', {
      method: 'POST',
      headers: AUTH.headers(),
      body: JSON.stringify({ serviceId: s.id, hours, withOperator: withOp }),
    });
    const data = await res.json();
    if (!res.ok) { summary.textContent = 'Could not get quote'; return; }

    let html = '<div class="drone-quote-line"><span>Service (' + data.hours + ' hrs × ₹' + Number(s.pricePerHour).toLocaleString('en-IN') + ')</span><span>₹' + Number(data.servicePrice).toLocaleString('en-IN') + '</span></div>';
    if (data.withOperator || data.operatorRequired) {
      html += '<div class="drone-quote-line"><span>Operator (' + data.hours + ' hrs × ₹' + Number(s.operatorPricePerHour).toLocaleString('en-IN') + ')</span><span>₹' + Number(data.operatorPrice).toLocaleString('en-IN') + '</span></div>';
    }
    html += '<div class="drone-quote-line"><span>GST (18%)</span><span>₹' + Number(data.gst).toLocaleString('en-IN') + '</span></div>';
    html += '<div class="drone-quote-total"><span>Total</span><span>₹' + Number(data.total).toLocaleString('en-IN') + '</span></div>';
    summary.innerHTML = html;
  } catch (e) {
    summary.textContent = 'Quote unavailable';
  }
}

async function bookDrone() {
  const s = droneSelectedService;
  if (!s) return;
  const errEl = document.getElementById('drone-book-error');
  const btn = document.getElementById('drone-book-btn');
  errEl.textContent = '';

  const location = document.getElementById('drone-location').value.trim();
  const scheduledDate = document.getElementById('drone-date').value;
  const scheduledTime = document.getElementById('drone-time').value;
  if (!location) { errEl.textContent = 'Please enter a location.'; return; }
  if (!scheduledDate) { errEl.textContent = 'Please select a date.'; return; }

  btn.disabled = true;
  btn.textContent = 'Booking…';
  try {
    const res = await apiFetch('/api/drones/book', {
      method: 'POST',
      headers: AUTH.headers(),
      body: JSON.stringify({
        serviceId: s.id,
        hours: Number(document.getElementById('drone-hours').value) || s.minHours,
        withOperator: document.getElementById('drone-with-operator').checked,
        location,
        scheduledDate,
        scheduledTime: scheduledTime || null,
        notes: document.getElementById('drone-notes').value.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');

    closeDroneBooking();
    loadDroneMyBookings();
    showToast('Drone booked! Booking #' + data.booking.id, 'success');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Book Now';
  }
}

// ── Customer: My drone bookings ──

async function loadDroneMyBookings() {
  const wrap = document.getElementById('drone-my-bookings');
  if (!wrap) return;
  try {
    const res = await apiFetch('/api/drones/my-bookings', { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    droneMyBookings = data.bookings || [];
    renderDroneMyBookings();
  } catch (e) {
    wrap.innerHTML = '<div class="op-empty-sub">Could not load your drone bookings.</div>';
  }
}

function renderDroneMyBookings() {
  const wrap = document.getElementById('drone-my-bookings');
  if (!wrap) return;
  if (!droneMyBookings.length) {
    wrap.innerHTML = '<div class="op-empty-sub">No drone bookings yet. Browse services above to book!</div>';
    return;
  }
  let html = '';
  droneMyBookings.forEach(b => {
    const statusCls = b.status === 'confirmed' ? 'drone-status-confirmed' : b.status === 'completed' ? 'drone-status-completed' : b.status === 'cancelled' ? 'drone-status-cancelled' : 'drone-status-pending';
    const canCancel = b.status === 'confirmed' || b.status === 'pending';
    html += '<div class="drone-booking-card">' +
      '<div class="drone-booking-head">' +
        '<span class="drone-booking-icon">' + DRONE_ICON_SVG + '</span>' +
        '<div class="drone-booking-info">' +
          '<div class="drone-booking-name">' + escapeHtml(b.serviceName) + '</div>' +
          '<div class="drone-booking-meta">' + escapeHtml(b.category) + ' · ' + b.hours + ' hr' + (b.hours > 1 ? 's' : '') + (b.withOperator ? ' · With operator' : '') + '</div>' +
        '</div>' +
        '<span class="drone-status ' + statusCls + '">' + b.status + '</span>' +
      '</div>' +
      '<div class="drone-booking-details">' +
        (b.location ? '<div>' + escapeHtml(b.location) + '</div>' : '') +
        (b.scheduledDate ? '<div>' + b.scheduledDate + (b.scheduledTime ? ' at ' + b.scheduledTime : '') + '</div>' : '') +
        '<div class="drone-booking-price">₹' + Number(b.totalPrice).toLocaleString('en-IN') + '</div>' +
      '</div>' +
      (canCancel ? '<button type="button" class="drone-cancel-btn" onclick="cancelDroneBooking(' + b.id + ')">Cancel Booking</button>' : '') +
    '</div>';
  });
  wrap.innerHTML = html;
}

async function cancelDroneBooking(id) {
  if (!confirm('Cancel this drone booking?')) return;
  try {
    const res = await apiFetch('/api/drones/' + id + '/cancel', {
      method: 'POST',
      headers: AUTH.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cancel failed');
    showToast('Booking cancelled.', 'info');
    loadDroneMyBookings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Admin: Drone management ──

function showDroneAdminTab(tab) {
  ['services', 'operators', 'bookings'].forEach(t => {
    const el = document.getElementById('drone-admin-' + t);
    const btn = document.getElementById('drone-admin-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'services' && !droneAdminServicesLoaded) {
    droneAdminServicesLoaded = true;
    loadDroneAdminServices();
  }
  if (tab === 'operators' && !droneAdminOperatorsLoaded) {
    droneAdminOperatorsLoaded = true;
    loadDroneAdminOperators();
  }
  if (tab === 'bookings' && !droneAdminBookingsLoaded) {
    droneAdminBookingsLoaded = true;
    loadDroneAdminBookings();
  }
}

// Admin: Services
async function loadDroneAdminServices() {
  const list = document.getElementById('drone-admin-services-list');
  try {
    const res = await apiFetch('/api/drones/admin/services', { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    renderDroneAdminServices(data.services || []);
  } catch (e) {
    list.innerHTML = '<div class="op-empty-sub">Could not load services.</div>';
  }
}

function renderDroneAdminServices(services) {
  const list = document.getElementById('drone-admin-services-list');
  if (!services.length) { list.innerHTML = '<div class="op-empty-sub">No services configured.</div>'; return; }
  let html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Category</th><th>₹/hr</th><th>Operator ₹/hr</th><th>Operator</th><th>Status</th><th></th></tr></thead><tbody>';
  services.forEach(s => {
    html += '<tr>' +
      '<td class="cell-strong">' + escapeHtml(s.name) + '</td>' +
      '<td>' + escapeHtml(s.category) + '</td>' +
      '<td class="cell-num">₹' + Number(s.pricePerHour).toLocaleString('en-IN') + '</td>' +
      '<td class="cell-num">₹' + Number(s.operatorPricePerHour).toLocaleString('en-IN') + '</td>' +
      '<td>' + (s.operatorRequired ? '<span class="cell-check">✓ Required</span>' : '<span class="cell-dash">Optional</span>') + '</td>' +
      '<td><span class="op-status-badge ' + (s.active ? 'op-badge--green">Active' : 'op-badge--gray">Off') + '</span></td>' +
      '<td><button type="button" class="admin-btn-sm" onclick="editDroneService(' + s.id + ')">Edit</button></td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  list.innerHTML = html;
}

function showDroneServiceForm(service) {
  const wrap = document.getElementById('drone-admin-service-form');
  const isEdit = !!service;
  const s = service || {};
  wrap.style.display = 'block';
  wrap.innerHTML =
    '<div class="drone-admin-form">' +
      '<div class="drone-form-title">' + (isEdit ? 'Edit Service' : 'Add New Service') + '</div>' +
      '<div class="drone-form-grid">' +
        '<input id="dsf-name" class="pd-input" placeholder="Name" value="' + escapeHtml(s.name || '') + '">' +
        '<input id="dsf-category" class="pd-input" placeholder="Category" value="' + escapeHtml(s.category || '') + '">' +
        '<input id="dsf-price" class="pd-input" type="number" placeholder="Price/hr" value="' + (s.pricePerHour || '') + '">' +
        '<input id="dsf-opPrice" class="pd-input" type="number" placeholder="Operator ₹/hr" value="' + (s.operatorPricePerHour || 0) + '">' +
        '<input id="dsf-minH" class="pd-input" type="number" placeholder="Min hrs" value="' + (s.minHours || 1) + '">' +
        '<input id="dsf-maxH" class="pd-input" type="number" placeholder="Max hrs" value="' + (s.maxHours || 8) + '">' +
        '<label><input type="checkbox" id="dsf-opReq"' + (s.operatorRequired ? ' checked' : '') + '> Operator required</label>' +
      '</div>' +
      '<input id="dsf-desc" class="pd-input" placeholder="Description" value="' + escapeHtml(s.description || '') + '" style="width:100%;margin-top:6px;">' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button type="button" class="op-btn" onclick="saveDroneService(' + (s.id || 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button type="button" class="op-btn-secondary" onclick="hideDroneServiceForm()">Cancel</button>' +
      '</div>' +
    '</div>';
}

function hideDroneServiceForm() {
  const wrap = document.getElementById('drone-admin-service-form');
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

async function editDroneService(id) {
  try {
    const res = await apiFetch('/api/drones/admin/services', { headers: AUTH.headers() });
    const data = await res.json();
    const s = (data.services || []).find(x => x.id === id);
    if (s) showDroneServiceForm(s);
  } catch (e) { showToast('Could not load service', 'error'); }
}

async function saveDroneService(id) {
  const body = {
    name: document.getElementById('dsf-name').value.trim(),
    category: document.getElementById('dsf-category').value.trim(),
    pricePerHour: Number(document.getElementById('dsf-price').value),
    operatorPricePerHour: Number(document.getElementById('dsf-opPrice').value) || 0,
    minHours: Number(document.getElementById('dsf-minH').value) || 1,
    maxHours: Number(document.getElementById('dsf-maxH').value) || 8,
    operatorRequired: document.getElementById('dsf-opReq').checked,
    description: document.getElementById('dsf-desc').value.trim(),
  };
  if (!body.name || !body.category || !body.pricePerHour) {
    showToast('Name, category, and price are required.', 'error');
    return;
  }
  try {
    const url = id ? '/api/drones/admin/services/' + id : '/api/drones/admin/services';
    const method = id ? 'PATCH' : 'POST';
    const res = await apiFetch(url, { method, headers: AUTH.headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    hideDroneServiceForm();
    loadDroneAdminServices();
    showToast(id ? 'Service updated' : 'Service created', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// Admin: Operators
async function loadDroneAdminOperators() {
  const list = document.getElementById('drone-admin-operators-list');
  try {
    const res = await apiFetch('/api/drones/admin/operators', { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    renderDroneAdminOperators(data.operators || []);
  } catch (e) {
    list.innerHTML = '<div class="op-empty-sub">Could not load operators.</div>';
  }
}

function renderDroneAdminOperators(operators) {
  const list = document.getElementById('drone-admin-operators-list');
  if (!operators.length) { list.innerHTML = '<div class="op-empty-sub">No operators found.</div>'; return; }
  let html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Specialization</th><th>Experience</th><th>Rating</th><th>Status</th><th></th></tr></thead><tbody>';
  operators.forEach(op => {
    html += '<tr>' +
      '<td><span class="cell-strong">' + escapeHtml(op.name) + '</span><br><span class="cell-sub">' + escapeHtml(op.email || '—') + '</span></td>' +
      '<td>' + escapeHtml(op.specialization || '—') + '</td>' +
      '<td class="cell-num">' + op.experienceYears + ' yr</td>' +
      '<td class="cell-num">' + Number(op.rating).toFixed(1) + ' ★</td>' +
      '<td><span class="op-status-badge ' + (op.available ? 'op-badge--green">Available' : 'op-badge--gray">Off duty') + '</span></td>' +
      '<td><button type="button" class="admin-btn-sm" onclick="editDroneOperator(' + op.id + ')">Edit</button></td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  list.innerHTML = html;
}

function showDroneOperatorForm(op) {
  const wrap = document.getElementById('drone-admin-operator-form');
  const isEdit = !!op;
  const o = op || {};
  wrap.style.display = 'block';
  wrap.innerHTML =
    '<div class="drone-admin-form">' +
      '<div class="drone-form-title">' + (isEdit ? 'Edit Operator' : 'Add New Operator') + '</div>' +
      '<div class="drone-form-grid">' +
        '<input id="dof-name" class="pd-input" placeholder="Name" value="' + escapeHtml(o.name || '') + '">' +
        '<input id="dof-email" class="pd-input" placeholder="Email" value="' + escapeHtml(o.email || '') + '">' +
        '<input id="dof-phone" class="pd-input" placeholder="Phone" value="' + escapeHtml(o.phone || '') + '">' +
        '<input id="dof-spec" class="pd-input" placeholder="Specialization" value="' + escapeHtml(o.specialization || '') + '">' +
        '<input id="dof-exp" class="pd-input" type="number" placeholder="Years exp" value="' + (o.experienceYears || 1) + '">' +
        '<input id="dof-rating" class="pd-input" type="number" step="0.1" placeholder="Rating" value="' + (o.rating || 4.5) + '">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button type="button" class="op-btn" onclick="saveDroneOperator(' + (o.id || 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button type="button" class="op-btn-secondary" onclick="hideDroneOperatorForm()">Cancel</button>' +
      '</div>' +
    '</div>';
}

function hideDroneOperatorForm() {
  const wrap = document.getElementById('drone-admin-operator-form');
  wrap.style.display = 'none';
  wrap.innerHTML = '';
}

async function editDroneOperator(id) {
  try {
    const res = await apiFetch('/api/drones/admin/operators', { headers: AUTH.headers() });
    const data = await res.json();
    const op = (data.operators || []).find(x => x.id === id);
    if (op) showDroneOperatorForm(op);
  } catch (e) { showToast('Could not load operator', 'error'); }
}

async function saveDroneOperator(id) {
  const body = {
    name: document.getElementById('dof-name').value.trim(),
    email: document.getElementById('dof-email').value.trim() || null,
    phone: document.getElementById('dof-phone').value.trim() || null,
    specialization: document.getElementById('dof-spec').value.trim() || null,
    experienceYears: Number(document.getElementById('dof-exp').value) || 1,
    rating: Number(document.getElementById('dof-rating').value) || 4.5,
  };
  if (!body.name) { showToast('Name is required.', 'error'); return; }
  try {
    const url = id ? '/api/drones/admin/operators/' + id : '/api/drones/admin/operators';
    const method = id ? 'PATCH' : 'POST';
    const res = await apiFetch(url, { method, headers: AUTH.headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    hideDroneOperatorForm();
    loadDroneAdminOperators();
    showToast(id ? 'Operator updated' : 'Operator created', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// Admin: Bookings
async function loadDroneAdminBookings() {
  const list = document.getElementById('drone-admin-bookings-list');
  const statsEl = document.getElementById('drone-admin-bookings-stats');
  try {
    const res = await apiFetch('/api/drones/admin/bookings', { headers: AUTH.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    if (statsEl && data.stats) {
      statsEl.innerHTML =
        '<div class="drone-admin-stats">' +
          '<div class="drone-stat-card"><div class="drone-stat-val">' + (data.stats.total || 0) + '</div><div class="drone-stat-label">Total</div></div>' +
          '<div class="drone-stat-card"><div class="drone-stat-val">' + (data.stats.confirmed || 0) + '</div><div class="drone-stat-label">Confirmed</div></div>' +
          '<div class="drone-stat-card"><div class="drone-stat-val">' + (data.stats.completed || 0) + '</div><div class="drone-stat-label">Completed</div></div>' +
          '<div class="drone-stat-card"><div class="drone-stat-val">₹' + Number(data.stats.revenue || 0).toLocaleString('en-IN') + '</div><div class="drone-stat-label">Revenue</div></div>' +
        '</div>';
    }
    renderDroneAdminBookings(data.bookings || []);
  } catch (e) {
    list.innerHTML = '<div class="op-empty-sub">Could not load bookings.</div>';
  }
}

function renderDroneAdminBookings(bookings) {
  const list = document.getElementById('drone-admin-bookings-list');
  if (!bookings.length) { list.innerHTML = '<div class="op-empty-sub">No drone bookings yet.</div>'; return; }
  let html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ID</th><th>Customer</th><th>Service</th><th>Hours</th><th>Total</th><th>Date</th><th>Status</th><th>Operator</th></tr></thead><tbody>';
  bookings.forEach(b => {
    html += '<tr>' +
      '<td class="cell-num">#' + b.id + '</td>' +
      '<td class="cell-strong">' + escapeHtml(b.customerName || '—') + '</td>' +
      '<td>' + escapeHtml(b.serviceName) + '</td>' +
      '<td class="cell-num">' + b.hours + ' h</td>' +
      '<td class="cell-num">₹' + Number(b.totalPrice).toLocaleString('en-IN') + '</td>' +
      '<td class="cell-num">' + (b.scheduledDate || '—') + '</td>' +
      '<td><select class="drone-status-select" onchange="updateDroneBookingStatus(' + b.id + ', this.value)">' +
        ['pending','confirmed','in_progress','completed','cancelled'].map(st =>
          '<option value="' + st + '"' + (b.status === st ? ' selected' : '') + '>' + st.replace('_', ' ') + '</option>'
        ).join('') +
      '</select></td>' +
      '<td>' + (b.operatorName ? escapeHtml(b.operatorName) : '<span class="cell-dash">—</span>') + '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  list.innerHTML = html;
}

async function updateDroneBookingStatus(id, status) {
  try {
    const res = await apiFetch('/api/drones/admin/bookings/' + id + '/status', {
      method: 'PATCH',
      headers: AUTH.headers(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast('Booking #' + id + ' → ' + status, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}
