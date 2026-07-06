// IraGo app — 09-drones.js
// Drone rental catalog, booking, and admin management.

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
    list.innerHTML = '<div class="op-empty-sub">Could not load drone services. Please try again.</div>';
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
    list.innerHTML = '<div class="op-empty-sub">No drone services in this category yet. Check back soon.</div>';
    return;
  }
  let html = '<div class="drone-grid">';
  filtered.forEach(s => {
    const opBadge = s.operatorRequired ? '<span class="drone-op-badge">Operator included</span>' : '<span class="drone-op-badge drone-op-optional">Operator optional</span>';
    html += '<div class="drone-card" onclick="selectDroneService(' + s.id + ')">' +
      '<div class="drone-card-emoji">' + (s.imageEmoji || '🛸') + '</div>' +
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
      '<span class="drone-detail-emoji">' + (s.imageEmoji || '🛸') + '</span>' +
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
    wrap.innerHTML = '<div class="op-empty-sub">Could not load your drone bookings. Please try again.</div>';
  }
}

function renderDroneMyBookings() {
  const wrap = document.getElementById('drone-my-bookings');
  if (!wrap) return;
  if (!droneMyBookings.length) {
    wrap.innerHTML = '<div class="op-empty-sub">No drone bookings yet. Browse the services above to book your first drone.</div>';
    return;
  }
  let html = '';
  droneMyBookings.forEach(b => {
    const statusCls = b.status === 'confirmed' ? 'drone-status-confirmed' : b.status === 'completed' ? 'drone-status-completed' : b.status === 'cancelled' ? 'drone-status-cancelled' : 'drone-status-pending';
    const canCancel = b.status === 'confirmed' || b.status === 'pending';
    html += '<div class="drone-booking-card">' +
      '<div class="drone-booking-head">' +
        '<span class="drone-booking-emoji">' + (b.imageEmoji || '🛸') + '</span>' +
        '<div class="drone-booking-info">' +
          '<div class="drone-booking-name">' + escapeHtml(b.serviceName) + '</div>' +
          '<div class="drone-booking-meta">' + escapeHtml(b.category) + ' · ' + b.hours + ' hr' + (b.hours > 1 ? 's' : '') + (b.withOperator ? ' · With operator' : '') + '</div>' +
        '</div>' +
        '<span class="drone-status ' + statusCls + '">' + b.status + '</span>' +
      '</div>' +
      '<div class="drone-booking-details">' +
        (b.location ? '<div>📍 ' + escapeHtml(b.location) + '</div>' : '') +
        (b.scheduledDate ? '<div>📅 ' + b.scheduledDate + (b.scheduledTime ? ' at ' + b.scheduledTime : '') + '</div>' : '') +
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
    if (el) el.hidden = t !== tab;
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
  var list = document.getElementById('drone-admin-services-list');
  list.innerHTML = droneAdminSkeleton(3);
  try {
    var res = await apiFetch('/api/drones/admin/services', { headers: AUTH.headers() });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    renderDroneAdminServices(data.services || []);
  } catch (e) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div class="adm-empty-title">Could not load services</div><div class="adm-empty-sub">Please try again.</div></div>';
  }
}

function renderDroneAdminServices(services) {
  var list = document.getElementById('drone-admin-services-list');
  if (!services.length) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="adm-empty-title">No drone services configured yet</div><div class="adm-empty-sub">Add one to get started.</div></div>';
    return;
  }
  var html = '<div class="das-grid">';
  services.forEach(function(s) {
    var statusCls = s.active ? 'das-chip--green' : 'das-chip--gray';
    var statusTxt = s.active ? 'Active' : 'Inactive';
    html += '<div class="das-card" onclick="editDroneService(' + s.id + ')">' +
      '<div class="das-card-head">' +
        '<div class="das-card-name">' + escapeHtml(s.name) + '</div>' +
        '<span class="das-chip ' + statusCls + '">' + statusTxt + '</span>' +
      '</div>' +
      '<span class="das-cat-chip">' + escapeHtml(s.category) + '</span>' +
      '<div class="das-card-price">' +
        '<span class="das-price-val">' + INR(s.pricePerHour) + '<span class="das-price-unit">/hr</span></span>' +
      '</div>' +
      '<div class="das-card-meta">' +
        (s.operatorRequired ? '<span class="das-meta-tag">Operator required</span>' : '<span class="das-meta-tag das-meta-tag--muted">Operator optional</span>') +
        (s.operatorPricePerHour ? '<span class="das-meta-tag das-meta-tag--muted">Op ' + INR(s.operatorPricePerHour) + '/hr</span>' : '') +
      '</div>' +
      '<button type="button" class="das-edit-btn" onclick="editDroneService(' + s.id + ')"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>' +
    '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

function showDroneServiceForm(service) {
  var wrap = document.getElementById('drone-admin-service-form');
  var isEdit = !!service;
  var s = service || {};
  wrap.hidden = false;
  wrap.innerHTML =
    '<div class="drone-admin-form das-form">' +
      '<div class="drone-form-title">' + (isEdit ? 'Edit Service' : 'Add New Service') + '</div>' +
      '<div class="drone-form-grid">' +
        '<input id="dsf-name" class="pd-input" placeholder="Name" value="' + escapeHtml(s.name || '') + '">' +
        '<input id="dsf-category" class="pd-input" placeholder="Category" value="' + escapeHtml(s.category || '') + '">' +
        '<input id="dsf-price" class="pd-input" type="number" placeholder="Price/hr" value="' + (s.pricePerHour || '') + '">' +
        '<input id="dsf-opPrice" class="pd-input" type="number" placeholder="Operator ₹/hr" value="' + (s.operatorPricePerHour || 0) + '">' +
        '<input id="dsf-emoji" class="pd-input" placeholder="Emoji" value="' + (s.imageEmoji || '🛸') + '">' +
        '<input id="dsf-minH" class="pd-input" type="number" placeholder="Min hrs" value="' + (s.minHours || 1) + '">' +
        '<input id="dsf-maxH" class="pd-input" type="number" placeholder="Max hrs" value="' + (s.maxHours || 8) + '">' +
        '<label class="das-checkbox-label"><input type="checkbox" id="dsf-opReq"' + (s.operatorRequired ? ' checked' : '') + '> Operator required</label>' +
      '</div>' +
      '<input id="dsf-desc" class="pd-input drone-form-desc" placeholder="Description" value="' + escapeHtml(s.description || '') + '">' +
      '<div class="das-form-actions">' +
        '<button type="button" class="op-btn adm-drone-btn" onclick="saveDroneService(' + (s.id || 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button type="button" class="op-btn-secondary das-ghost-btn" onclick="hideDroneServiceForm()">Cancel</button>' +
      '</div>' +
    '</div>';
}

function hideDroneServiceForm() {
  const wrap = document.getElementById('drone-admin-service-form');
  wrap.hidden = true;
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
    imageEmoji: document.getElementById('dsf-emoji').value.trim() || '🛸',
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
  var list = document.getElementById('drone-admin-operators-list');
  list.innerHTML = droneAdminSkeleton(3);
  try {
    var res = await apiFetch('/api/drones/admin/operators', { headers: AUTH.headers() });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    renderDroneAdminOperators(data.operators || []);
  } catch (e) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div class="adm-empty-title">Could not load operators</div><div class="adm-empty-sub">Please try again.</div></div>';
  }
}

function renderDroneAdminOperators(operators) {
  var list = document.getElementById('drone-admin-operators-list');
  if (!operators.length) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="adm-empty-title">No drone operators registered yet</div><div class="adm-empty-sub">Add one to get started.</div></div>';
    return;
  }
  var html = '<div class="das-rows-card">';
  operators.forEach(function(op) {
    var initials = (op.name || '?').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
    var stars = '';
    var r = Number(op.rating) || 0;
    for (var i = 1; i <= 5; i++) {
      stars += '<svg viewBox="0 0 24 24" width="12" height="12" class="' + (i <= Math.round(r) ? 'star-active' : 'star-inactive') + '" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
    html += '<div class="das-row">' +
      '<div class="das-row-avatar">' + initials + '</div>' +
      '<div class="das-row-identity">' +
        '<div class="das-row-name">' + escapeHtml(op.name) + '</div>' +
        '<div class="das-row-meta">' + escapeHtml(op.email || 'No email') + '</div>' +
      '</div>' +
      '<div class="das-row-tags">' +
        (op.specialization ? '<span class="das-cat-chip">' + escapeHtml(op.specialization) + '</span>' : '') +
        '<span class="das-meta-tag das-meta-tag--muted">' + op.experienceYears + ' yr exp</span>' +
      '</div>' +
      '<div class="das-row-rating">' + stars + ' <span class="das-rating-val">' + Number(op.rating).toFixed(1) + '</span></div>' +
      '<span class="das-chip ' + (op.available ? 'das-chip--green' : 'das-chip--gray') + '">' + (op.available ? 'Available' : 'Unavailable') + '</span>' +
      '<button type="button" class="das-edit-btn" onclick="editDroneOperator(' + op.id + ')"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>' +
    '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

function showDroneOperatorForm(op) {
  var wrap = document.getElementById('drone-admin-operator-form');
  var isEdit = !!op;
  var o = op || {};
  wrap.hidden = false;
  wrap.innerHTML =
    '<div class="drone-admin-form das-form">' +
      '<div class="drone-form-title">' + (isEdit ? 'Edit Operator' : 'Add New Operator') + '</div>' +
      '<div class="drone-form-grid">' +
        '<input id="dof-name" class="pd-input" placeholder="Name" value="' + escapeHtml(o.name || '') + '">' +
        '<input id="dof-email" class="pd-input" placeholder="Email" value="' + escapeHtml(o.email || '') + '">' +
        '<input id="dof-phone" class="pd-input" placeholder="Phone" value="' + escapeHtml(o.phone || '') + '">' +
        '<input id="dof-spec" class="pd-input" placeholder="Specialization" value="' + escapeHtml(o.specialization || '') + '">' +
        '<input id="dof-exp" class="pd-input" type="number" placeholder="Years exp" value="' + (o.experienceYears || 1) + '">' +
        '<input id="dof-rating" class="pd-input" type="number" step="0.1" placeholder="Rating" value="' + (o.rating || 4.5) + '">' +
      '</div>' +
      '<div class="das-form-actions">' +
        '<button type="button" class="op-btn adm-drone-btn" onclick="saveDroneOperator(' + (o.id || 'null') + ')">' + (isEdit ? 'Save' : 'Create') + '</button>' +
        '<button type="button" class="op-btn-secondary das-ghost-btn" onclick="hideDroneOperatorForm()">Cancel</button>' +
      '</div>' +
    '</div>';
}

function hideDroneOperatorForm() {
  const wrap = document.getElementById('drone-admin-operator-form');
  wrap.hidden = true;
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
  var list = document.getElementById('drone-admin-bookings-list');
  var statsEl = document.getElementById('drone-admin-bookings-stats');
  list.innerHTML = droneAdminSkeleton(3);
  try {
    var res = await apiFetch('/api/drones/admin/bookings', { headers: AUTH.headers() });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    if (statsEl && data.stats) {
      var s = data.stats;
      statsEl.innerHTML =
        '<div class="adm-grid" style="margin-bottom:16px">' +
          '<div class="adm-span-3">' + admKpi(ADM_ICONS.bookings, 'blue', String(s.total || 0), 'Total').replace('adm-kpi"', 'adm-kpi adm-kpi--compact"') + '</div>' +
          '<div class="adm-span-3">' + admKpi(ADM_ICONS.check, 'green', String(s.confirmed || 0), 'Confirmed').replace('adm-kpi"', 'adm-kpi adm-kpi--compact"') + '</div>' +
          '<div class="adm-span-3">' + admKpi(ADM_ICONS.aircraft, 'navy', String(s.completed || 0), 'Completed').replace('adm-kpi"', 'adm-kpi adm-kpi--compact"') + '</div>' +
          '<div class="adm-span-3">' + admKpi(ADM_ICONS.revenue, 'green', INR(s.revenue || 0), 'Revenue').replace('adm-kpi"', 'adm-kpi adm-kpi--compact"') + '</div>' +
        '</div>';
    }
    var bookings = data.bookings || [];
    var countEl = document.querySelector('.das-booking-count');
    if (countEl) countEl.textContent = bookings.length + ' booking' + (bookings.length !== 1 ? 's' : '');
    renderDroneAdminBookings(bookings);
  } catch (e) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div class="adm-empty-title">Could not load bookings</div><div class="adm-empty-sub">Please try again.</div></div>';
  }
}

function renderDroneAdminBookings(bookings) {
  var list = document.getElementById('drone-admin-bookings-list');
  if (!bookings.length) {
    list.innerHTML = '<div class="adm-empty"><div class="adm-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="adm-empty-title">No drone bookings yet</div><div class="adm-empty-sub">Bookings will appear here once customers start booking.</div></div>';
    return;
  }
  var html = '<div class="das-rows-card">';
  bookings.forEach(function(b) {
    var custInitials = (b.customerName || '?').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
    html += '<div class="das-row">' +
      '<div class="das-row-avatar">' + custInitials + '</div>' +
      '<div class="das-row-identity">' +
        '<div class="das-row-name">' + escapeHtml(b.customerName || 'Unknown') + '</div>' +
        '<div class="das-row-meta">#' + b.id + ' · ' + escapeHtml(b.serviceName) + ' · ' + b.hours + 'h</div>' +
      '</div>' +
      '<div class="das-row-tags">' +
        '<span class="das-booking-price">' + INR(b.totalPrice) + '</span>' +
        '<span class="das-meta-tag das-meta-tag--muted">' + (b.scheduledDate || 'No date') + '</span>' +
      '</div>' +
      '<select class="drone-status-select das-status-select" onchange="updateDroneBookingStatus(' + b.id + ', this.value)">' +
        ['pending','confirmed','in_progress','completed','cancelled'].map(function(st) {
          return '<option value="' + st + '"' + (b.status === st ? ' selected' : '') + '>' + st + '</option>';
        }).join('') +
      '</select>' +
      (b.operatorName ? '<span class="das-meta-tag das-meta-tag--muted">' + escapeHtml(b.operatorName) + '</span>' : '') +
    '</div>';
  });
  html += '</div>';
  list.innerHTML = html;
}

async function updateDroneBookingStatus(id, status) {
  try {
    var res = await apiFetch('/api/drones/admin/bookings/' + id + '/status', {
      method: 'PATCH',
      headers: AUTH.headers(),
      body: JSON.stringify({ status }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast('Booking #' + id + ' -> ' + status, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function droneAdminSkeleton(count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    var w = [60, 45, 70][i % 3];
    html += '<div class="das-skeleton-row"><div class="adm-skeleton" style="width:32px;height:32px;border-radius:50%"></div><div style="flex:1"><div class="adm-skeleton" style="height:14px;width:' + w + '%;border-radius:4px;margin-bottom:6px"></div><div class="adm-skeleton" style="height:10px;width:' + (w - 20) + '%;border-radius:4px"></div></div></div>';
  }
  return html;
}
