// ⚠️ GENERATED FILE — do not edit by hand.
// Built from js/app/*.js by scripts/build-app-js.js (npm run build:js).
// Edit the source modules in js/app/ and re-run the build.


// ===== 01-state.js =====

// IraGo app — 01-state.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── State ──
let map, pickupMarker, destMarker, routeLine, aircraftMarkers = [];
// Ride auto-follow pause: timestamp of the last MANUAL map pan/zoom. Auto-follow
// resumes RIDE_FOLLOW_RESUME_MS after the user stops interacting. programmaticMapMove
// is set true around our own panTo/fitBounds so they don't count as "manual".
let userMovedMapAt = 0;
let programmaticMapMove = false;
const RIDE_FOLLOW_RESUME_MS = 30000;

// Great-circle distance (km) between two [lat,lng] points. Frontend helper —
// the backend has its own haversineKm; this mirrors it for client-side use.
function haversineKmClient(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
let currentService = 'taxi';
let selectedRide = null;
let pickupCoord = null, destCoord = null;
// The persisted booking returned by POST /api/bookings (US-006). Source of
// truth for the confirmation screen and live tracking (US-007).
let currentBooking = null;
let currentRoute = null;
let currentDiscount = null;
let currentCarbonComparison = null;
let currentCarbonCredits = null;

// ── Booking draft (US-005) ──
// Single source of truth for the in-progress booking: the selected pickup and
// destination (name + lat/lng), the chosen service, and the computed distance.
// Populated whenever pickup, destination, or service changes so the fare step
// (US-006) and POST /api/bookings consume structured data instead of re-reading
// the DOM. pickup/dest are null until both a name and coordinates exist.
let bookingDraft = {
  pickup: null,      // { name, lat, lng }
  dest: null,        // { name, lat, lng }
  service: 'taxi',   // taxi | golden | shuttle
  distanceKm: null,  // haversine km, set only once both ends are chosen
};

// Service code -> human label (used for display + persistence).
const SERVICE_LABELS = { taxi: 'Air Taxi', golden: 'Golden Hour', shuttle: 'Air Shuttle' };

// Re-read the current selections into bookingDraft. Idempotent; safe to call
// after any change to pickup/destination/service. Returns the draft.
function captureBookingDraft() {
  const pickupName = (document.getElementById('pickup-input') || {}).value || '';
  const destName = (document.getElementById('dest-input') || {}).value || '';
  bookingDraft.pickup = pickupCoord
    ? { name: pickupName.trim() || 'Selected pickup', lat: pickupCoord[0], lng: pickupCoord[1] }
    : null;
  bookingDraft.dest = destCoord
    ? { name: destName.trim() || 'Selected destination', lat: destCoord[0], lng: destCoord[1] }
    : null;
  bookingDraft.service = currentService;
  bookingDraft.distanceKm = (pickupCoord && destCoord)
    ? Math.round(calcDistance() * 10) / 10
    : null;
  return bookingDraft;
}

// True only when pickup, destination, and service are all selected — the
// minimum required before a fare/booking can be created (US-006 gate).
function bookingDraftReady() {
  return !!(bookingDraft.pickup && bookingDraft.dest && bookingDraft.service);
}

// ── Demo Cities (Indian locations) ──
// Vertiport locations are positioned OUTSIDE airport no-fly zones (~3-4 km
// radius). Passengers board at vertiports, not runways.
const demoLocations = {
  // Delhi NCR — clear of Safdarjung/IGI/Central Delhi no-fly zones
  'Noida Sec 62 Vertiport':       [28.6270, 77.3650],
  'Greater Noida Vertiport':      [28.4744, 77.5040],
  'Faridabad Vertiport':          [28.4089, 77.3178],
  'Gurugram Cyber Hub':           [28.4950, 77.0880],
  'Gurugram Medanta Hospital':    [28.4396, 77.0426],
  'Dwarka Sector 21 Vertiport':   [28.5527, 77.0588],
  'Rohini Vertiport, Delhi':      [28.7360, 77.1120],
  'Ghaziabad Vertiport':          [28.6692, 77.4538],

  // Mumbai — inter-city clear routes
  'Navi Mumbai Vertiport':        [19.0330, 73.0297],
  'Thane Vertiport':              [19.2183, 72.9781],
  'BKC Vertiport, Mumbai':        [19.0554, 72.8822],
  'Andheri Vertiport, Mumbai':    [19.1400, 72.8500],
  'Powai Vertiport, Mumbai':      [19.1178, 72.9060],
  'Kokilaben Hospital, Mumbai':   [19.1310, 72.8265],
  'Lilavati Hospital, Mumbai':    [19.0509, 72.8289],
  'Navi Mumbai Apollo Hospital':  [19.0219, 73.0099],

  // Chennai — clear of Chennai airport (80.169, 12.994) and Tambaram AFB (80.124, 12.908) no-fly
  'Pallavaram Vertiport, Chennai':[13.0500, 80.1500],
  'Tambaram Vertiport, Chennai':  [12.8800, 80.0600],
  'OMR Vertiport, Chennai':       [12.8996, 80.2209],
  'Apollo Hospital, Chennai':     [13.0067, 80.2206],
  'MIOT Hospital, Chennai':       [13.0189, 80.1941],
  'Velachery Vertiport, Chennai': [12.9750, 80.2200],

  // Bengaluru — clear of restricted zones
  'Whitefield Vertiport':         [12.9698, 77.7500],
  'Electronic City Vertiport':    [12.8399, 77.6770],
  'Devanahalli Vertiport':        [13.2600, 77.7700],
  'Narayana Health, Bengaluru':   [12.8828, 77.5987],
  'Manipal Hospital, Bengaluru':  [12.9582, 77.6484],
  'Sarjapur Vertiport':           [12.9102, 77.6880],

  // Hyderabad
  'Hi-Tech City Vertiport':       [17.4435, 78.3772],
  'Shamshabad Vertiport':         [17.3050, 78.4500],
  'NIMS Hospital, Hyderabad':     [17.3941, 78.5012],
  'Yashoda Hospital, Hyderabad':  [17.4489, 78.3615],
  'Secunderabad Vertiport':       [17.4600, 78.5300],

  // Remote / Emergency
  'Leh Vertiport, Ladakh':        [34.1500, 77.5600],
  'SNM Hospital, Leh':            [34.1526, 77.5771],
  'Dehradun Vertiport':           [30.2050, 78.1950],
  'AIIMS Rishikesh':              [30.0688, 78.3137],
  'Shimla Vertiport':             [31.0950, 77.0800],
  'IGMC Hospital, Shimla':        [31.1048, 77.1734],
  'Port Blair Vertiport, Andaman':[11.6550, 92.7400],
  'GB Pant Hospital, Andaman':    [11.6683, 92.7358],
  'Dibrugarh Vertiport, Assam':   [27.4950, 95.0300],
  'AMCH Hospital, Dibrugarh':     [27.4728, 94.9120],

  // B2B Delhi-NCR premium (Executive Shuttle · Agra Express · Diplomatic)
  'Aerocity Vertiport, Delhi':    [28.5535, 77.1220],
  'Hotel Leela Rooftop, Delhi':   [28.5983, 77.1892],
  'Embassy Vertiport, Chanakyapuri': [28.5900, 77.1850],
  'Taj Mahal Vertiport, Agra':    [27.1680, 78.0500],
  'Chandigarh Vertiport':         [30.7046, 76.7179],

  // HP tourism corridors (B2C joy rides)
  'Bhuntar Vertiport, Kullu':     [31.8763, 77.1550],
  'Manali Vertiport':             [32.2396, 77.1887],
  'Gagal Vertiport, Kangra':      [32.1650, 76.2634],
  'Dharamshala Vertiport':        [32.2190, 76.3234],
  'Kufri Helipad':                [31.0976, 77.2674],
  'Rohtang Pass Helipad':         [32.3667, 77.2484],

  // Religious circuits (Vaishno Devi · Char Dham)
  'Katra Vertiport (Vaishno Devi)': [32.9917, 74.9310],
  'Sanjichhat Helipad (Bhawan)':  [33.0245, 74.9440],
  'Phata Helipad (Char Dham)':    [30.5533, 78.9877],
  'Kedarnath Helipad':            [30.7346, 79.0669],

  // HP EMS trauma network (B2G Golden Hour corridors)
  'Barmana Helipad, Bilaspur':    [31.4404, 76.8420],
  'AIIMS Bilaspur':               [31.3260, 76.7050],
  'Bharmour Helipad, Chamba':     [32.4420, 76.5390],
  'Pt. JLN Medical College, Chamba': [32.5534, 76.1258],
  'Dr. RPGMC Tanda, Kangra':      [32.1109, 76.2800],
  'Annadale Helipad, Shimla':     [31.1030, 77.1550],
  'Nalagarh Helipad, Baddi':      [31.0430, 76.7220],
  'MM Medical College, Solan':    [30.8577, 77.0966],
};



// ===== 02-auth.js =====

// IraGo app — 02-auth.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Auth ──
// JWT is stored in an HttpOnly cookie (primary) and sessionStorage Bearer backup
// so reload survives cookie quirks on localhost. User profile is cached for fast UI.
const AUTH = {
  userKey: 'irago_user',
  tokenKey: 'irago_token',
  get user() {
    try { return JSON.parse(sessionStorage.getItem(this.userKey) || 'null'); }
    catch (e) { return null; }
  },
  get token() {
    return sessionStorage.getItem(this.tokenKey) || '';
  },
  save(user, token) {
    sessionStorage.setItem(this.userKey, JSON.stringify(user));
    if (token) sessionStorage.setItem(this.tokenKey, token);
  },
  clear() {
    sessionStorage.removeItem(this.userKey);
    sessionStorage.removeItem(this.tokenKey);
  },
  headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.token;
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  },
  fetchOpts(opts = {}) {
    return { credentials: 'include', ...opts };
  }
};

// Pending OTP flows (email + role + expiry/resend timers).
const pendingOtp = { email: '', purpose: '', role: 'passenger', resendTimerId: null };
let authRole = 'passenger';

const SIGNUP_CONFIG = {
  passenger: {
    purpose: 'signup_passenger',
    requestPath: '/api/auth/passenger/signup-request',
    phoneOtpPath: '/api/auth/passenger/send-phone-otp',
    verifyPath: '/api/auth/passenger/verify-signup',
    loginPath: '/api/auth/passenger/login',
    loginUrl: '/app.html',
    signupUrl: '/app.html?register=1',
    cardId: 'register-passenger-card',
    errorId: 'register-passenger-error',
    submitId: 'register-passenger-submit',
    submitLabel: 'Send OTP',
    otpTitle: 'Verify passenger account',
    loginTitle: 'Passenger sign in',
    loginSub: 'Book Air Taxi, Golden Hour, and Air Shuttle rides.',
    loginHint: 'New passenger? Create an account below.',
    registerBtn: 'Create passenger account',
  },
  operator: {
    purpose: 'signup_operator',
    requestPath: '/api/auth/operator/signup-request',
    verifyPath: '/api/auth/operator/verify-signup',
    loginPath: '/api/auth/operator/login',
    loginUrl: '/login/operator',
    signupUrl: '/login/operator',
    cardId: 'register-operator-card',
    errorId: 'register-operator-error',
    submitId: 'register-operator-submit',
    submitLabel: 'Send OTP',
    otpTitle: 'Verify operator account',
    loginTitle: 'Operator sign in',
    loginSub: 'Flight rider / pilot console — assigned missions and fleet trips.',
    loginHint: 'Operator accounts are created by an admin only. Contact your administrator to be provisioned.',
    // Public self-signup is closed — only admins create operator accounts.
    signupDisabled: true,
  },
  admin: {
    loginPath: '/api/auth/admin/login',
    loginUrl: '/login/admin',
    loginTitle: 'Admin sign in',
    loginSub: 'Platform admin — team management and fleet oversight.',
    loginHint: '',
    loginOnly: true,
  },
};

function parsePortalFromLocation() {
  const path = window.location.pathname;
  if (path.endsWith('app.html') || path === '/app') {
    const params = new URLSearchParams(window.location.search);
    return { mode: params.has('register') ? 'signup' : 'login', role: 'passenger' };
  }
  const m = path.match(/^\/(login|signup)\/(operator|admin)\/?$/);
  if (m) return { mode: m[1], role: m[2] };
  return { mode: 'login', role: 'passenger' };
}

function portalForDbRole(role) {
  if (role === 'customer') return 'passenger';
  if (role === 'operator' || role === 'admin') return role;
  return 'passenger';
}

function applyPortalLabels(role) {
  authRole = role;
  const cfg = SIGNUP_CONFIG[role] || SIGNUP_CONFIG.passenger;
  const title = document.getElementById('login-card-title');
  const sub = document.getElementById('login-card-sub');
  const hint = document.getElementById('login-role-hint');
  const regBtn = document.getElementById('login-register-btn');
  const regRow = document.getElementById('login-register-row');
  const forgotRow = document.getElementById('login-forgot-row');
  const loginOnly = Boolean(cfg.loginOnly);
  const signupDisabled = Boolean(cfg.signupDisabled);
  if (title) title.textContent = cfg.loginTitle;
  if (sub) sub.textContent = cfg.loginSub;
  if (hint) hint.textContent = cfg.loginHint;
  if (regBtn && cfg.registerBtn) regBtn.textContent = cfg.registerBtn;
  if (regRow) regRow.style.display = loginOnly || signupDisabled ? 'none' : '';
  if (forgotRow) forgotRow.style.display = loginOnly ? 'none' : '';
  document.title = cfg.loginTitle + ' — IraGo';
}

function switchLoginRole(role) {
  applyPortalLabels(role);
  document.querySelectorAll('.auth-role-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-role') === role);
  });
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  hideAuthError('login-error');
  var successEl = document.getElementById('login-success');
  if (successEl) successEl.classList.remove('show');
  showLoginCard();
}

function goToLoginPortal() {
  const cfg = SIGNUP_CONFIG[authRole] || SIGNUP_CONFIG.passenger;
  window.location.href = cfg.loginUrl;
}

function goToSignupPortal() {
  const cfg = SIGNUP_CONFIG[authRole] || SIGNUP_CONFIG.passenger;
  if (cfg.loginOnly || cfg.signupDisabled) return;
  window.location.href = cfg.signupUrl;
}

function initAuthPortal() {
  const portal = parsePortalFromLocation();
  authRole = portal.role;
  if (portal.role === 'admin' && portal.mode === 'signup') {
    window.location.replace('/login/admin');
    return;
  }
  // Operator self-signup is closed — redirect any /signup/operator to login.
  if (portal.role === 'operator' && portal.mode === 'signup') {
    window.location.replace('/login/operator');
    return;
  }
  applyPortalLabels(portal.role);

  // Handle Google OAuth redirects (success / error / pending phone).
  const params = new URLSearchParams(window.location.search);
  if (params.has('google_success') || params.has('google_error') || params.has('google_pending')) {
    showView('login-view');
    handleGoogleAuthOnLoad();
    return;
  }

  if (!AUTH.user) {
    showView('login-view');
    if (portal.mode === 'signup') showRoleRegister();
    else showLoginCard();
  }
}

function setAuthRole(role) { applyPortalLabels(role); }

function showRoleRegister() {
  applyPortalLabels(authRole);
  hideAllAuthCards();
  const cfg = SIGNUP_CONFIG[authRole] || SIGNUP_CONFIG.passenger;
  resetRegisterOtpStep(authRole);
  const card = document.getElementById(cfg.cardId);
  if (card) card.style.display = 'block';
  hideAuthError(cfg.errorId);
  document.title = 'Create account — IraGo';
}

function setRegisterSignupFieldsVisible(role, visible) {
  document.querySelectorAll('.register-' + role + '-signup-field').forEach(function (el) {
    el.style.display = visible ? '' : 'none';
  });
}

function resetRegisterStep(role) {
  setRegisterSignupFieldsVisible(role, true);
  hideAuthError('register-' + role + '-error');
  setRegisterStepIndicator(role, 1);
}

function setRegisterStepIndicator(role, step) {
  const root = document.getElementById('register-' + role + '-steps');
  if (!root) return;
  const steps = root.querySelectorAll('.auth-step');
  const line = root.querySelector('.auth-step-line');
  steps.forEach(function (el, idx) {
    el.classList.remove('active', 'done');
    if (idx + 1 < step) el.classList.add('done');
    if (idx + 1 === step) el.classList.add('active');
  });
  if (line) line.classList.toggle('done', step > 1);
}

function backToRegisterFromOtp() {
  const role = pendingOtp.role || authRole || 'passenger';
  const cfg = SIGNUP_CONFIG[role] || SIGNUP_CONFIG.passenger;
  clearOtpTimers();
  hideAllAuthCards();
  const card = document.getElementById(cfg.cardId);
  if (card) card.style.display = 'block';
  resetRegisterStep(role);
  hideAuthError('otp-error');
}

function resetRegisterOtpStep(role) {
  resetRegisterStep(role);
}

function otpUiPrefix() {
  if (pendingOtp.purpose === 'reset_password') return 'reset';
  return 'otp';
}

function showPassengerRegister() { window.location.href = '/app.html?register=1'; }

function hideAllAuthCards() {
  ['login-card', 'register-passenger-card', 'register-operator-card', 'register-verify-card', 'otp-card', 'forgot-card', 'reset-card', 'google-phone-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['login-error', 'register-passenger-error', 'register-operator-error', 'register-verify-error', 'reg-email-error', 'reg-phone-error', 'otp-error', 'forgot-error', 'reset-error', 'google-phone-error'].forEach(hideAuthError);
}

function showLoginCard() {
  hideAllAuthCards();
  document.getElementById('login-card').style.display = 'block';
  applyPortalLabels(authRole || 'passenger');
  clearOtpTimers();
  hideLoginSuccess();
}

function authFetchErrorMessage(res) {
  if (res && res.status === 404) {
    return 'Wrong server — open http://localhost:3002/app.html (port 3000 is a different app). Run: npm run local:start';
  }
  return 'Could not reach the server. Run npm run local:start then open http://localhost:3002/app.html';
}

function showOtpCard(email, role, timing) {
  hideAllAuthCards();
  const cfg = SIGNUP_CONFIG[role] || SIGNUP_CONFIG.passenger;
  pendingOtp.email = email;
  pendingOtp.role = role;
  pendingOtp.purpose = cfg.purpose;
  const titleEl = document.getElementById('otp-card-title');
  const subEl = document.getElementById('otp-card-sub');
  if (titleEl) titleEl.textContent = cfg.otpTitle;
  if (subEl) subEl.textContent = 'Step 2 — enter the code from your email to create your account.';
  document.getElementById('otp-email-display').textContent = email;
  document.getElementById('otp-code').value = '';
  hideAuthError('otp-error');
  document.getElementById('otp-card').style.display = 'block';
  startOtpTimers('otp', timing);
  const otpInput = document.getElementById('otp-code');
  if (otpInput) otpInput.focus();
}

function showForgotCard() {
  hideAllAuthCards();
  document.getElementById('forgot-card').style.display = 'block';
  hideAuthError('forgot-error');
}

function showResetCard(email, timing) {
  hideAllAuthCards();
  pendingOtp.email = email;
  pendingOtp.purpose = 'reset_password';
  document.getElementById('reset-email-display').textContent = email;
  document.getElementById('reset-otp').value = '';
  document.getElementById('reset-password').value = '';
  hideAuthError('reset-error');
  document.getElementById('reset-card').style.display = 'block';
  startOtpTimers('reset', timing);
}

function normalizeOtpTiming(timing) {
  if (typeof timing === 'number') {
    return { resendCooldownSeconds: timing };
  }
  return {
    resendCooldownSeconds: Number(timing && timing.resendCooldownSeconds) || 30,
  };
}

function clearResendTimer() {
  if (pendingOtp.resendTimerId) {
    clearInterval(pendingOtp.resendTimerId);
    pendingOtp.resendTimerId = null;
  }
}

function clearOtpTimers() {
  clearResendTimer();
}

function formatResendCountdown(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return s + 's';
}

function startResendTimer(prefix, seconds) {
  clearResendTimer();
  const btn = document.getElementById(prefix + '-resend-btn');
  const hintEl = document.getElementById(prefix + '-resend-hint');
  if (!hintEl) return;
  let remaining = seconds;
  if (btn) {
    btn.disabled = true;
    btn.style.display = 'none';
  }
  const tick = () => {
    if (remaining <= 0) {
      clearResendTimer();
      hintEl.textContent = "Didn't receive the code?";
      if (btn) {
        btn.disabled = false;
        btn.style.display = '';
      }
      return;
    }
    hintEl.textContent = "Didn't receive the code? Resend in " + formatResendCountdown(remaining);
    remaining -= 1;
  };
  tick();
  pendingOtp.resendTimerId = setInterval(tick, 1000);
}

function startOtpTimers(prefix, timing) {
  const t = normalizeOtpTiming(timing);
  startResendTimer(prefix, t.resendCooldownSeconds);
}

function showToast(msg, type) {
  type = type || 'info';
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
}

// Shared fetch wrapper — cookie + Bearer; logout only on real 401.
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, AUTH.fetchOpts({
    ...opts,
    headers: { ...AUTH.headers(), ...(opts.headers || {}) }
  }));
  if (res.status === 401 && !/\/api\/auth\/(passenger|operator|admin)\/login/.test(path) && !path.startsWith('/api/auth/signup')) {
    AUTH.clear();
    showView('login-view');
    showLoginCard();
  }
  return res;
}

function toggleAuth() { goToSignupPortal(); }

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}
function hideAuthError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}
function showLoginSuccess(msg) {
  const el = document.getElementById('login-success');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function hideLoginSuccess() {
  const el = document.getElementById('login-success');
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}
function completePasswordReset(email) {
  clearOtpTimers();
  pendingOtp.email = '';
  pendingOtp.purpose = '';
  AUTH.clear();
  fetch('/api/auth/logout', AUTH.fetchOpts({ method: 'POST' })).catch(function () {});
  showView('login-view');
  showLoginCard();
  hideAuthError('login-error');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  if (emailInput && email) emailInput.value = email;
  if (passInput) {
    passInput.value = '';
    passInput.focus();
  }
  showLoginSuccess('Your password has been saved. Sign in with your new password.');
}
function setBusy(btnId, busy, busyLabel, idleLabel) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? busyLabel : idleLabel;
}

// ── Google OAuth ────────────────────────────────────────────────────────
function doGoogleSignIn() {
  window.location.href = '/api/auth/google';
}

// Pending Google signup state (no phone from Google → collect it + OTP).
const googlePending = { state: '', phone: '', email: '', resendTimerId: null };

function clearGoogleTimers() {
  if (googlePending.resendTimerId) {
    clearInterval(googlePending.resendTimerId);
    googlePending.resendTimerId = null;
  }
}

function startGoogleResendTimer(timing) {
  clearGoogleTimers();
  const cooldown = (timing && timing.resendCooldownSeconds) || 30;
  const btn = document.getElementById('google-phone-resend-btn');
  const hintEl = document.getElementById('google-phone-resend-hint');
  if (!hintEl) return;
  let remaining = cooldown;
  if (btn) { btn.disabled = true; btn.style.display = 'none'; }
  const tick = () => {
    if (remaining <= 0) {
      clearGoogleTimers();
      hintEl.textContent = "Didn't receive the code?";
      if (btn) { btn.disabled = false; btn.style.display = ''; }
      return;
    }
    hintEl.textContent = "Didn't receive the code? Resend in " + formatResendCountdown(remaining);
    remaining -= 1;
  };
  tick();
  googlePending.resendTimerId = setInterval(tick, 1000);
}

function showGooglePhoneCard(state) {
  googlePending.state = state;
  hideAllAuthCards();
  const card = document.getElementById('google-phone-card');
  if (card) card.style.display = 'block';
  document.getElementById('google-phone-input').value = '';
  document.getElementById('google-phone-otp-section').style.display = 'none';
  document.getElementById('google-phone-input-section').style.display = '';
  hideAuthError('google-phone-error');
  clearGoogleTimers();
}

async function googlePhoneSendOtp() {
  const rawPhone = document.getElementById('google-phone-input').value.trim();
  hideAuthError('google-phone-error');
  if (!rawPhone || rawPhone.length < 10) {
    return showAuthError('google-phone-error', 'Enter a valid 10-digit mobile number.');
  }
  googlePending.phone = rawPhone;

  const btn = document.getElementById('google-phone-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res = await fetch('/api/auth/google/send-phone-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: googlePending.state, phone: rawPhone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      return showAuthError('google-phone-error', msg);
    }
    googlePending.email = data.email || '';
    document.getElementById('google-phone-email-display').textContent = data.email || '';
    document.getElementById('google-phone-input-section').style.display = 'none';
    document.getElementById('google-phone-otp-section').style.display = '';
    document.getElementById('google-phone-otp').value = '';
    document.getElementById('google-phone-otp').focus();
    startGoogleResendTimer(data);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
    showAuthError('google-phone-error', 'Could not reach the server.');
  }
}

async function googlePhoneResendOtp() {
  hideAuthError('google-phone-error');
  if (!googlePending.phone || !googlePending.state) return;
  const btn = document.getElementById('google-phone-resend-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/auth/google/send-phone-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: googlePending.state, phone: googlePending.phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthError('google-phone-error', data.error || 'Could not resend code.');
      if (btn) btn.disabled = false;
      return;
    }
    startGoogleResendTimer(data);
  } catch (e) {
    showAuthError('google-phone-error', 'Could not reach the server.');
    if (btn) btn.disabled = false;
  }
}

async function googlePhoneVerify() {
  const otp = document.getElementById('google-phone-otp').value.trim();
  hideAuthError('google-phone-error');
  if (!otp || otp.length < 6) {
    return showAuthError('google-phone-error', 'Enter the 6-digit code from your email.');
  }
  const btn = document.getElementById('google-phone-verify-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  try {
    const res = await fetch('/api/auth/google/verify-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: googlePending.state, phone: googlePending.phone, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account'; }
      return showAuthError('google-phone-error', data.error || 'Invalid or expired code.');
    }
    clearGoogleTimers();
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account'; }
    showAuthError('google-phone-error', 'Could not reach the server.');
  }
}

function handleGoogleAuthOnLoad() {
  const params = new URLSearchParams(window.location.search);

  // Google error
  if (params.has('google_error')) {
    const err = params.get('google_error');
    const msgs = {
      access_denied: 'Google sign-in was cancelled.',
      token_failed: 'Could not complete Google sign-in. Try again.',
      no_email: 'Google did not provide an email address.',
      banned: 'This account has been suspended.',
      server_error: 'Something went wrong. Please try again.',
    };
    showAuthError('login-error', msgs[err] || 'Google sign-in failed.');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  // Google success — pick up the auth data from the cookie.
  if (params.has('google_success')) {
    try {
      const raw = decodeURIComponent(
        document.cookie.split('; ').find(c => c.startsWith('irago_google_auth='))?.split('=').slice(1).join('=') || ''
      );
      if (raw) {
        const auth = JSON.parse(raw);
        // Clear the temp cookie.
        document.cookie = 'irago_google_auth=; Max-Age=0; Path=/';
        window.history.replaceState({}, '', window.location.pathname);
        onAuthSuccess(auth.user, auth.token);
        return;
      }
    } catch (e) {
      console.error('Google auth cookie parse failed:', e);
    }
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  // Google pending — need phone number.
  if (params.has('google_pending')) {
    const state = params.get('state');
    if (state) {
      window.history.replaceState({}, '', window.location.pathname);
      showGooglePhoneCard(state);
      return;
    }
  }
}

async function doLogin() {
  const cfg = SIGNUP_CONFIG[authRole] || SIGNUP_CONFIG.passenger;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  hideAuthError('login-error');
  hideLoginSuccess();
  if (!email || !password) {
    return showAuthError('login-error', 'Enter your email and password.');
  }
  setBusy('login-submit', true, 'Signing in…', 'Sign In');
  try {
    const res = await fetch(cfg.loginPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && data.code === 'WRONG_PORTAL' && data.portal) {
        switchLoginRole(data.portal);
        return showAuthError('login-error', 'Switched to ' + data.portal + ' login — try again.');
      }
      return showAuthError('login-error', data.error || 'Invalid email or password.');
    }
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    showAuthError('login-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('login-submit', false, 'Signing in…', 'Sign In');
  }
}

async function doRoleSignup(role) {
  const cfg = SIGNUP_CONFIG[role];
  if (!cfg || cfg.loginOnly || cfg.signupDisabled) return;
  const name = document.getElementById('register-' + role + '-name').value.trim();
  const email = document.getElementById('register-' + role + '-email').value.trim();
  const password = document.getElementById('register-' + role + '-password').value;
  hideAuthError(cfg.errorId);
  if (!name || !email || !password) {
    return showAuthError(cfg.errorId, 'Name, email, and password are required.');
  }
  if (password.length < 6) {
    return showAuthError(cfg.errorId, 'Password must be at least 6 characters.');
  }
  const body = { name, email, password };
  // Capture phone number if present (passenger registration).
  const phoneInput = document.getElementById('register-' + role + '-phone');
  if (phoneInput && phoneInput.value.trim()) {
    const ph = phoneInput.value.trim();
    if (ph.length < 10) return showAuthError(cfg.errorId, 'Enter a valid 10-digit mobile number.');
    body.phone = ph;
  }
  setBusy(cfg.submitId, true, 'Sending…', 'Send OTP');
  try {
    const res = await fetch(cfg.requestPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        return showAuthError(cfg.errorId, authFetchErrorMessage(res));
      }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not start registration.');
      return showAuthError(cfg.errorId, msg);
    }
    showOtpCard(data.email || email, role, data);
  } catch (e) {
    showAuthError(cfg.errorId, authFetchErrorMessage());
  } finally {
    setBusy(cfg.submitId, false, 'Sending…', 'Send OTP');
  }
}

async function doVerifySignup() {
  const otp = document.getElementById('otp-code').value.trim();
  hideAuthError('otp-error');
  const cfg = SIGNUP_CONFIG[pendingOtp.role] || SIGNUP_CONFIG.passenger;
  if (!pendingOtp.email || !otp) {
    return showAuthError('otp-error', 'Enter the 6-digit code from your email.');
  }
  setBusy('otp-submit', true, 'Verifying…', 'Verify & Create Account');
  try {
    const res = await fetch(cfg.verifyPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingOtp.email, otp })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('otp-error', data.error || 'Invalid or expired code.');
    }
    // If the user entered a phone during registration, verify it before
    // proceeding. The token is already set (cookie + response), so the
    // phone verification API calls will be authenticated.
    if (data.phoneVerifyNeeded && data.pendingPhone) {
      AUTH.save(data.user, data.token);
      showSignupPhoneVerify(data.pendingPhone, data.user, data.token);
      return;
    }
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    showAuthError('otp-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('otp-submit', false, 'Verifying…', 'Verify & Create Account');
  }
}

// ── Two-page registration flow ────────────────────────────────────────
// Page 1: personal details (name, gender, age, password)
// Page 2: email + phone inline OTP verification → create account
const regState = {
  role: 'passenger',
  name: '', gender: '', age: '', password: '',
  email: '', phone: '',
  emailOtpSent: false, phoneOtpSent: false,
  emailResendTimerId: null, phoneResendTimerId: null,
};

function clearRegTimers() {
  if (regState.emailResendTimerId) { clearInterval(regState.emailResendTimerId); regState.emailResendTimerId = null; }
  if (regState.phoneResendTimerId) { clearInterval(regState.phoneResendTimerId); regState.phoneResendTimerId = null; }
}

function regStartResendTimer(channel, timing) {
  const cooldown = (timing && timing.resendCooldownSeconds) || 30;
  const btn = document.getElementById('reg-' + channel + '-resend-btn');
  const hintEl = document.getElementById('reg-' + channel + '-resend-hint');
  if (!hintEl) return;
  if (channel === 'email' && regState.emailResendTimerId) clearInterval(regState.emailResendTimerId);
  if (channel === 'phone' && regState.phoneResendTimerId) clearInterval(regState.phoneResendTimerId);
  let remaining = cooldown;
  if (btn) { btn.disabled = true; btn.style.display = 'none'; }
  const tick = () => {
    if (remaining <= 0) {
      if (channel === 'email') { clearInterval(regState.emailResendTimerId); regState.emailResendTimerId = null; }
      else { clearInterval(regState.phoneResendTimerId); regState.phoneResendTimerId = null; }
      hintEl.textContent = "Didn’t receive the code?";
      if (btn) { btn.disabled = false; btn.style.display = ''; }
      return;
    }
    hintEl.textContent = "Didn’t receive the code? Resend in " + formatResendCountdown(remaining);
    remaining -= 1;
  };
  tick();
  const timerId = setInterval(tick, 1000);
  if (channel === 'email') regState.emailResendTimerId = timerId;
  else regState.phoneResendTimerId = timerId;
}

function regUpdateCreateBtn() {
  const btn = document.getElementById('reg-create-btn');
  if (btn) btn.disabled = !(regState.emailOtpSent && regState.phoneOtpSent);
}

function goToRegisterVerify(role) {
  const name = document.getElementById('register-' + role + '-name').value.trim();
  const gender = document.getElementById('register-' + role + '-gender').value;
  const age = document.getElementById('register-' + role + '-age').value.trim();
  const password = document.getElementById('register-' + role + '-password').value;
  const errId = 'register-' + role + '-error';
  hideAuthError(errId);
  if (!name) return showAuthError(errId, 'Enter your full name.');
  if (!password || password.length < 6) return showAuthError(errId, 'Password must be at least 6 characters.');

  regState.role = role;
  regState.name = name;
  regState.gender = gender;
  regState.age = age;
  regState.password = password;
  regState.email = '';
  regState.phone = '';
  regState.emailOtpSent = false;
  regState.phoneOtpSent = false;
  clearRegTimers();

  hideAllAuthCards();
  document.getElementById('register-verify-card').style.display = 'block';
  document.getElementById('reg-email-otp-row').style.display = 'none';
  document.getElementById('reg-phone-otp-row').style.display = 'none';
  document.getElementById('reg-email-verified').style.display = 'none';
  document.getElementById('reg-phone-verified').style.display = 'none';
  hideAuthError('reg-email-error');
  hideAuthError('reg-phone-error');
  hideAuthError('register-verify-error');
  document.getElementById('reg-create-btn').disabled = true;
  document.getElementById('register-verify-email').disabled = false;
  document.getElementById('register-verify-phone').disabled = false;
  var emailSendBtn = document.getElementById('reg-email-send-btn');
  if (emailSendBtn) { emailSendBtn.disabled = false; emailSendBtn.style.display = ''; emailSendBtn.textContent = 'Send OTP'; }
  var phoneSendBtn = document.getElementById('reg-phone-send-btn');
  if (phoneSendBtn) { phoneSendBtn.disabled = false; phoneSendBtn.style.display = ''; phoneSendBtn.textContent = 'Send OTP'; }
}

function backToRegisterPage1() {
  clearRegTimers();
  hideAllAuthCards();
  const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
  const card = document.getElementById(cfg.cardId);
  if (card) card.style.display = 'block';
  hideAuthError(cfg.errorId);
}

async function regSendEmailOtp() {
  const email = document.getElementById('register-verify-email').value.trim();
  hideAuthError('reg-email-error');
  if (!email) return showAuthError('reg-email-error', 'Enter your email address.');

  const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
  const body = {
    name: regState.name, email: email, password: regState.password,
    gender: regState.gender || undefined,
    age: regState.age || undefined,
  };

  const btn = document.getElementById('reg-email-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res = await fetch(cfg.requestPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      return showAuthError('reg-email-error', msg);
    }

    regState.email = email;
    regState.emailOtpSent = true;
    document.getElementById('register-verify-email').disabled = true;
    if (btn) btn.style.display = 'none';
    document.getElementById('reg-email-otp-row').style.display = '';
    document.getElementById('reg-email-otp').value = '';
    document.getElementById('reg-email-otp').focus();
    regStartResendTimer('email', data);
    regUpdateCreateBtn();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
    showAuthError('reg-email-error', 'Could not reach the server.');
  }
}

async function regResendEmailOtp() {
  hideAuthError('reg-email-error');
  if (!regState.email) return;
  const btn = document.getElementById('reg-email-resend-btn');
  if (btn) btn.disabled = true;
  try {
    const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
    const res = await fetch('/api/auth/resend-otp', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regState.email, purpose: cfg.purpose })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthError('reg-email-error', data.error || 'Could not resend code.');
      if (btn) btn.disabled = false;
      return;
    }
    regStartResendTimer('email', data);
  } catch (e) {
    showAuthError('reg-email-error', 'Could not reach the server.');
    if (btn) btn.disabled = false;
  }
}

async function regSendPhoneOtp() {
  const phone = document.getElementById('register-verify-phone').value.trim();
  hideAuthError('reg-phone-error');
  if (!phone || phone.length < 10) return showAuthError('reg-phone-error', 'Enter a valid 10-digit mobile number.');
  if (!regState.email && !regState.emailOtpSent) return showAuthError('reg-phone-error', 'Send the email OTP first.');

  const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
  const btn = document.getElementById('reg-phone-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res = await fetch(cfg.phoneOtpPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, email: regState.email })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      return showAuthError('reg-phone-error', msg);
    }

    regState.phone = phone;
    regState.phoneOtpSent = true;
    document.getElementById('register-verify-phone').disabled = true;
    if (btn) btn.style.display = 'none';
    document.getElementById('reg-phone-otp-row').style.display = '';
    document.getElementById('reg-phone-otp').value = '';
    document.getElementById('reg-phone-otp').focus();
    regStartResendTimer('phone', data);
    regUpdateCreateBtn();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
    showAuthError('reg-phone-error', 'Could not reach the server.');
  }
}

async function regResendPhoneOtp() {
  hideAuthError('reg-phone-error');
  if (!regState.phone || !regState.email) return;
  const btn = document.getElementById('reg-phone-resend-btn');
  if (btn) btn.disabled = true;
  try {
    const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
    const res = await fetch(cfg.phoneOtpPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: regState.phone, email: regState.email })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthError('reg-phone-error', data.error || 'Could not resend code.');
      if (btn) btn.disabled = false;
      return;
    }
    regStartResendTimer('phone', data);
  } catch (e) {
    showAuthError('reg-phone-error', 'Could not reach the server.');
    if (btn) btn.disabled = false;
  }
}

async function regCreateAccount() {
  hideAuthError('register-verify-error');
  hideAuthError('reg-email-error');
  hideAuthError('reg-phone-error');
  const emailOtp = document.getElementById('reg-email-otp').value.trim();
  const phoneOtp = document.getElementById('reg-phone-otp').value.trim();
  if (!emailOtp || emailOtp.length < 6) return showAuthError('register-verify-error', 'Enter the 6-digit email verification code.');
  if (!phoneOtp || phoneOtp.length < 6) return showAuthError('register-verify-error', 'Enter the 6-digit phone verification code.');

  const cfg = SIGNUP_CONFIG[regState.role] || SIGNUP_CONFIG.passenger;
  const btn = document.getElementById('reg-create-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  try {
    const res = await fetch(cfg.verifyPath, AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regState.email,
        emailOtp: emailOtp,
        phone: regState.phone,
        phoneOtp: phoneOtp,
      })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
      if (data.field === 'phone') return showAuthError('reg-phone-error', data.error || 'Phone verification failed.');
      if (data.field === 'email') return showAuthError('reg-email-error', data.error || 'Email verification failed.');
      return showAuthError('register-verify-error', data.error || 'Could not create account.');
    }
    clearRegTimers();
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    showAuthError('register-verify-error', 'Could not reach the server. Please try again.');
  }
}

async function doForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  hideAuthError('forgot-error');
  if (!email) {
    return showAuthError('forgot-error', 'Enter your email address.');
  }
  setBusy('forgot-submit', true, 'Sending…', 'Send OTP');
  try {
    const res = await fetch('/api/auth/forgot-password', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        return showAuthError('forgot-error', authFetchErrorMessage(res));
      }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send reset code.');
      return showAuthError('forgot-error', msg);
    }
    showResetCard(email.toLowerCase(), data);
    hideAuthError('forgot-error');
    document.getElementById('forgot-email').value = '';
  } catch (e) {
    showAuthError('forgot-error', authFetchErrorMessage());
  } finally {
    setBusy('forgot-submit', false, 'Sending…', 'Send OTP');
  }
}

async function doResetPassword() {
  const otp = document.getElementById('reset-otp').value.trim();
  const newPassword = document.getElementById('reset-password').value;
  hideAuthError('reset-error');
  if (!pendingOtp.email || !otp || !newPassword) {
    return showAuthError('reset-error', 'Enter the code and a new password.');
  }
  if (newPassword.length < 6) {
    return showAuthError('reset-error', 'Password must be at least 6 characters.');
  }
  setBusy('reset-submit', true, 'Resetting…', 'Reset password');
  try {
    const res = await fetch('/api/auth/reset-password', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingOtp.email, otp, newPassword })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('reset-error', data.error || 'Could not reset password.');
    }
    completePasswordReset(pendingOtp.email || data.email || '');
  } catch (e) {
    showAuthError('reset-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('reset-submit', false, 'Resetting…', 'Reset password');
  }
}

async function resendOtp(forcedPurpose) {
  const purpose = forcedPurpose || pendingOtp.purpose;
  const prefix = otpUiPrefix();
  hideAuthError(prefix === 'reset' ? 'reset-error' : 'otp-error');
  if (!pendingOtp.email || !purpose) return;
  const errId = prefix === 'reset' ? 'reset-error' : 'otp-error';
  const btn = document.getElementById(prefix + '-resend-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/auth/resend-otp', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingOtp.email, purpose })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthError(errId, data.error || 'Could not resend code.');
      if (data.retryAfterSeconds) {
        startOtpTimers(prefix, { resendCooldownSeconds: data.retryAfterSeconds });
      } else if (btn) btn.disabled = false;
      return;
    }
    startOtpTimers(prefix, data);
  } catch (e) {
    showAuthError(errId, 'Could not reach the server.');
    if (btn) btn.disabled = false;
  }
}

// Persist the session profile + JWT backup, then route to the role dashboard.
function onAuthSuccess(user, token) {
  AUTH.save(user, token);
  syncProfileUI(user);
  // Admin-provisioned accounts must choose their own password on first login
  // before they can use the app.
  if (user && user.mustResetPassword) {
    showForcedResetOverlay(user);
    return;
  }
  routeForRole(user);
}

function showForcedResetOverlay(user) {
  const emailEl = document.getElementById('must-reset-email');
  if (emailEl) emailEl.textContent = user ? (user.email || '') : '';
  const err = document.getElementById('must-reset-error');
  if (err) { err.classList.remove('show'); err.textContent = ''; }
  document.getElementById('must-reset-current').value = '';
  document.getElementById('must-reset-new').value = '';
  document.getElementById('must-reset-overlay').classList.add('active');
}

async function doForcedReset() {
  const user = AUTH.user;
  if (!user) return;
  const currentPassword = document.getElementById('must-reset-current').value;
  const newPassword = document.getElementById('must-reset-new').value;
  const err = document.getElementById('must-reset-error');
  if (err) { err.classList.remove('show'); err.textContent = ''; }
  if (!currentPassword || !newPassword) {
    return showAuthError('must-reset-error', 'Enter your temporary password and a new password.');
  }
  if (newPassword.length < 6) {
    return showAuthError('must-reset-error', 'New password must be at least 6 characters.');
  }
  setBusy('must-reset-submit', true, 'Updating…', 'Update & continue');
  try {
    const res = await fetch('/api/auth/change-password', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('must-reset-error', data.error || 'Could not update password.');
    }
    if (data.user) {
      AUTH.save(data.user, AUTH.token);
      syncProfileUI(data.user);
    }
    document.getElementById('must-reset-overlay').classList.remove('active');
    routeForRole(data.user || user);
  } catch (e) {
    showAuthError('must-reset-error', 'Network error — please try again.');
  } finally {
    setBusy('must-reset-submit', false, 'Updating…', 'Update & continue');
  }
}

function logoutForcedReset() {
  AUTH.clear();
  document.getElementById('must-reset-overlay').classList.remove('active');
  showView('login-view');
  showLoginCard();
}

// ── Profile Phone Verification ──────────────────────────────────────────
// Add or change phone number on the profile, verified via OTP.
const profilePhone = { raw: '', resendTimerId: null };

function clearProfilePhoneTimers() {
  if (profilePhone.resendTimerId) {
    clearInterval(profilePhone.resendTimerId);
    profilePhone.resendTimerId = null;
  }
}

function initProfilePhoneBlock(user) {
  const status = document.getElementById('profile-phone-status');
  const inputSection = document.getElementById('profile-phone-input-section');
  const otpSection = document.getElementById('profile-phone-otp-section');
  const errEl = document.getElementById('profile-phone-error');
  const succEl = document.getElementById('profile-phone-success');
  const changeBtn = document.getElementById('profile-phone-change-btn');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  if (succEl) succEl.style.display = 'none';
  if (otpSection) otpSection.style.display = 'none';
  clearProfilePhoneTimers();

  profilePhone.verified = !!(user && user.phone);
  if (profilePhone.verified) {
    const masked = user.phone.length > 6
      ? user.phone.slice(0, 4) + '****' + user.phone.slice(-2)
      : user.phone;
    if (status) status.textContent = 'Verified: +' + masked;
    const inp = document.getElementById('profile-phone-input');
    if (inp) inp.value = '';
    // Already verified — collapse the form; offer "Change number" instead.
    if (inputSection) inputSection.style.display = 'none';
    if (changeBtn) changeBtn.style.display = '';
  } else {
    if (status) status.textContent = 'No phone number linked. Add one below.';
    if (inputSection) inputSection.style.display = '';
    if (changeBtn) changeBtn.style.display = 'none';
  }
}

function showProfilePhoneChange() {
  const changeBtn = document.getElementById('profile-phone-change-btn');
  const inputSection = document.getElementById('profile-phone-input-section');
  if (changeBtn) changeBtn.style.display = 'none';
  if (inputSection) inputSection.style.display = '';
  const inp = document.getElementById('profile-phone-input');
  if (inp) inp.focus();
}

function startProfilePhoneResendTimer(timing) {
  clearProfilePhoneTimers();
  const cooldown = (timing && timing.resendCooldownSeconds) || 30;
  const btn = document.getElementById('profile-phone-resend-btn');
  const hintEl = document.getElementById('profile-phone-resend-hint');
  if (!hintEl) return;
  let remaining = cooldown;
  if (btn) { btn.disabled = true; btn.style.display = 'none'; }
  const tick = () => {
    if (remaining <= 0) {
      clearProfilePhoneTimers();
      hintEl.textContent = "Didn't receive the code?";
      if (btn) { btn.disabled = false; btn.style.display = ''; }
      return;
    }
    hintEl.textContent = "Didn't receive the code? Resend in " + formatResendCountdown(remaining);
    remaining -= 1;
  };
  tick();
  profilePhone.resendTimerId = setInterval(tick, 1000);
}

function cancelProfilePhoneOtp() {
  clearProfilePhoneTimers();
  const otpSection = document.getElementById('profile-phone-otp-section');
  const inputSection = document.getElementById('profile-phone-input-section');
  const changeBtn = document.getElementById('profile-phone-change-btn');
  if (otpSection) otpSection.style.display = 'none';
  // Back out to the collapsed "verified" state when a number is already
  // linked; only show the input form again for users with no phone yet.
  if (inputSection) inputSection.style.display = profilePhone.verified ? 'none' : '';
  if (changeBtn) changeBtn.style.display = profilePhone.verified ? '' : 'none';
  hideAuthError('profile-phone-error');
}

async function doProfilePhoneSendOtp() {
  const rawPhone = document.getElementById('profile-phone-input').value.trim();
  hideAuthError('profile-phone-error');
  const succEl = document.getElementById('profile-phone-success');
  if (succEl) succEl.style.display = 'none';

  if (!rawPhone || rawPhone.length < 10) {
    return showAuthError('profile-phone-error', 'Enter a valid 10-digit mobile number.');
  }

  profilePhone.raw = rawPhone;

  try {
    const res = await apiFetch('/api/auth/mobile/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: rawPhone })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      return showAuthError('profile-phone-error', msg);
    }

    document.getElementById('profile-phone-input-section').style.display = 'none';
    document.getElementById('profile-phone-otp-section').style.display = '';
    document.getElementById('profile-phone-otp-code').value = '';
    document.getElementById('profile-phone-otp-code').focus();
    startProfilePhoneResendTimer(data);
  } catch (e) {
    showAuthError('profile-phone-error', 'Could not reach the server.');
  }
}

async function doProfilePhoneVerifyOtp() {
  const otp = document.getElementById('profile-phone-otp-code').value.trim();
  hideAuthError('profile-phone-error');

  if (!otp || otp.length < 6) {
    return showAuthError('profile-phone-error', 'Enter the 6-digit code.');
  }

  try {
    const res = await apiFetch('/api/auth/mobile/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: profilePhone.raw, otp: otp })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showAuthError('profile-phone-error', data.error || 'Invalid or expired code.');
    }

    clearProfilePhoneTimers();
    profilePhone.verified = true;
    document.getElementById('profile-phone-otp-section').style.display = 'none';
    document.getElementById('profile-phone-input-section').style.display = 'none';
    const changeBtn = document.getElementById('profile-phone-change-btn');
    if (changeBtn) changeBtn.style.display = '';
    const succEl = document.getElementById('profile-phone-success');
    if (succEl) { succEl.textContent = 'Phone number verified and saved.'; succEl.style.display = ''; }
    const status = document.getElementById('profile-phone-status');
    if (status) status.textContent = 'Verified: +' + (data.phone || profilePhone.raw);
    // Refresh user state.
    const meRes = await apiFetch('/api/me');
    if (meRes.ok) { const me = await meRes.json(); if (me.user) syncProfileUI(me.user); }
  } catch (e) {
    showAuthError('profile-phone-error', 'Could not reach the server.');
  }
}

async function doProfilePhoneResendOtp() {
  hideAuthError('profile-phone-error');
  if (!profilePhone.raw) return;
  const btn = document.getElementById('profile-phone-resend-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await apiFetch('/api/auth/mobile/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: profilePhone.raw })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAuthError('profile-phone-error', data.error || 'Could not resend code.');
      if (btn) btn.disabled = false;
      return;
    }
    startProfilePhoneResendTimer(data);
  } catch (e) {
    showAuthError('profile-phone-error', 'Could not reach the server.');
    if (btn) btn.disabled = false;
  }
}

// Customers land on the booking view; operators on the pilot console (US-008);
// admins on the Admin Dashboard (US-004).
function routeForRole(user) {
  syncProfileUI(user);
  bindProfileActions();

  switch (user && user.role) {
    case 'admin': {
      const adminWelcome = document.getElementById('admin-welcome');
      if (adminWelcome) adminWelcome.textContent = 'Dashboard';
      const adminSub = document.getElementById('admin-welcome-sub');
      if (adminSub) adminSub.textContent = (user && user.name) || 'Admin';
      showView('admin-view');
      showAdminSection('dashboard');
      break;
    }
    case 'operator': {
      const welcome = document.getElementById('op-welcome');
      if (welcome) welcome.textContent = 'Pilot Console';
      const opSub = document.getElementById('op-welcome-sub');
      if (opSub) opSub.textContent = (user && user.name) || 'Pilot';
      flightZoneFetchCache.clear();
      showView('operator-view');
      closeTripDetails();
      loadOperatorTrips();
      initOpSelfMap();
      setTimeout(function () { if (opSelfMap) opSelfMap.invalidateSize(); }, 400);
      startOperatorGpsHeartbeat();
      connectOperatorDispatchStream();
      connectOperatorWebSocket();
      loadOperatorDuty();
      subscribeOperatorPush();
      if (typeof loadOperatorEarnings === 'function') loadOperatorEarnings();
      if (typeof loadComplianceHistory === 'function') loadComplianceHistory();
      break;
    }
    case 'customer':
    default: {
      showView('booking-view');
      initMap();
      startNearbyTaxisPoll();
      // Restore any in-progress trip (paid + dispatched) so the tracking panel
      // reappears after a page refresh. Only active rides are restored — completed,
      // cancelled, and unpaid bookings are ignored.
      setTimeout(restoreActiveBooking, 600);
      // Auto-request GPS for pickup after map renders (non-blocking, silent on denial)
      setTimeout(function () {
        if (!pickupCoord && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async function (pos) {
              if (pickupCoord) return;
              const lat = pos.coords.latitude, lng = pos.coords.longitude;
              let name = 'My Location';
              try {
                const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng, { headers: { 'Accept-Language': 'en' } });
                const d = await r.json();
                if (d && d.display_name) {
                  const a = d.address || {};
                  name = a.suburb || a.neighbourhood || a.village || a.town || a.city || d.display_name.split(',')[0];
                  name = (name + ', ' + (a.city || a.town || a.county || '')).trim().replace(/,\s*$/, '');
                }
              } catch (e) {}
              if (!pickupCoord) { setPickup([lat, lng], name); map.setView([lat, lng], 14); }
            },
            function () { /* silently ignore if user denies */ },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
          );
        }
      }, 800);
      break;
    }
  }
}



// ===== 03-admin-profile.js =====

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

// First arg kept for call-site compatibility; stat cards are text-only.
function pdStat(_icon, value, label, variant) {
  const cls = 'pd-stat' + (variant ? ' pd-stat--' + variant : '');
  return (
    '<div class="' + cls + '">' +
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
        return '<div class="admin-form-card" style="min-width:200px;flex:1;max-width:300px;margin-bottom:0;">' +
          '<div style="font-weight:700;font-size:15px;color:var(--gray-900);">' + escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">' + escapeHtml(c.headquarters || '') + '</div>' +
          '<div style="font-size:12px;color:var(--gray-600);margin-top:8px;">' + (c.officeCount || 0) + ' regional offices</div>' +
          '<div style="margin-top:8px;"><span class="op-status-badge ' + (c.active ? 'op-badge--green">Active' : 'op-badge--gray">Inactive') + '</span></div>' +
        '</div>';
      }).join('');
    }
    var offRes = await apiFetch('/api/admin/offices');
    var offData = await offRes.json();
    if (officesEl && offRes.ok && offData.offices) {
      officesEl.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>City</th><th>Company</th><th>Lat</th><th>Lng</th><th>Status</th>' +
        '</tr></thead><tbody>' +
        offData.offices.map(function (o) {
          return '<tr>' +
            '<td class="cell-strong">' + escapeHtml(o.city) + '</td>' +
            '<td>' + escapeHtml(o.companyName || '') + '</td>' +
            '<td class="cell-num">' + (o.lat || '') + '</td>' +
            '<td class="cell-num">' + (o.lng || '') + '</td>' +
            '<td><span class="op-status-badge ' + (o.active ? 'op-badge--green">Active' : 'op-badge--gray">Inactive') + '</span></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';
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



// ===== 04-operator.js =====

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



// ===== 05-map.js =====

// IraGo app — 05-map.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Map Init ──
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false }).setView([28.6139, 77.2090], 12);
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  // Click to set locations
  map.on('click', function(e) {
    if (mapPickTarget) {
      var target = mapPickTarget;
      mapPickTarget = null;
      if (target === 'pickup') setPickup(e.latlng, 'Map Pin (Pickup)');
      else setDest(e.latlng, 'Map Pin (Destination)');
      return;
    }
    if (!pickupCoord) {
      setPickup(e.latlng, 'Map Pin (Pickup)');
    } else if (!destCoord) {
      setDest(e.latlng, 'Map Pin (Destination)');
    }
  });

  // Pause ride auto-follow when the user manually pans/zooms the map, and
  // resume it RIDE_FOLLOW_RESUME_MS later. Without this, the map kept yanking
  // back to the plane every GPS tick while the user was exploring.
  function noteManualMapMove() {
    userMovedMapAt = Date.now();
    updateFollowPill();
  }
  map.on('dragstart', noteManualMapMove);
  map.on('zoomstart', function (e) {
    // Ignore programmatic zooms (panTo/fitBounds) — only user gestures count.
    if (!programmaticMapMove) noteManualMapMove();
  });

  // Add suggestion dropdown behavior
  setupAutocomplete('pickup-input', 'pickup-suggest', function (name, coord) { setPickup(coord, name); }, 'pickup');
  setupAutocomplete('dest-input', 'dest-suggest', function (name, coord) { setDest(coord, name); }, 'dest');

  // Render initial popular routes
  renderPopularRoutes('taxi');
  bindMapZoneLoader(map, bookingZoneLayers, { showAltitude: false });
  setTimeout(function () {
    refreshMapZones(map, bookingZoneLayers, { showAltitude: false });
  }, 600);

  // Tick the follow-pill countdown once a second while a ride is active.
  setInterval(updateFollowPill, 1000);

  // Leaflet caches the container size at init and never re-measures on its own.
  // #map is flex:1 inside .booking-body, so its width changes whenever the 420px
  // booking panel shows/hides, when the flex layout settles after first paint,
  // and when web fonts reflow the nav — but NONE of those fire a window 'resize'
  // event. With a stale cached width, Leaflet only loads tiles for part of the
  // container → the BLANK UNLOADED STRIP on the right, and (after payment)
  // fitRouteBounds framing the route against the wrong width so the plane sits in
  // the dead zone and looks frozen.
  //
  // ResizeObserver fires on EVERY real container size change — not just window
  // resizes — so it is the robust fix. The setTimeouts + window listener stay as
  // a fallback for the very first paint and for browsers without ResizeObserver.
  function fixMapSize() { if (map) map.invalidateSize(false); }
  setTimeout(fixMapSize, 60);
  setTimeout(fixMapSize, 300);
  setTimeout(fixMapSize, 800);
  window.addEventListener('resize', fixMapSize);
  if (typeof ResizeObserver !== 'undefined') {
    var mapEl = document.getElementById('map');
    if (mapEl) {
      var mapResizeObserver = new ResizeObserver(function () { fixMapSize(); });
      mapResizeObserver.observe(mapEl);
    }
  }
}

// Small on-map pill showing whether the map is auto-following the plane or
// paused after a manual pan (with a live countdown to resume). Also makes the
// 30s-pause behaviour visible so it's obvious it's working.
function updateFollowPill() {
  var pill = document.getElementById('map-follow-pill');
  // Only relevant during an active ride (tracking panel visible + following on).
  var tracking = document.getElementById('tracking-panel');
  var active = rideFollowOn && tracking && tracking.classList.contains('active');
  if (!active) {
    if (pill) pill.style.display = 'none';
    return;
  }
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'map-follow-pill';
    pill.style.cssText =
      'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;' +
      'background:rgba(30,58,95,0.92);color:#fff;font:600 12px/1 Inter,sans-serif;' +
      'padding:7px 14px;border-radius:99px;box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:none;';
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.appendChild(pill);
  }
  var remaining = RIDE_FOLLOW_RESUME_MS - (Date.now() - userMovedMapAt);
  if (remaining > 0) {
    pill.textContent = 'Map paused · auto-follow in ' + Math.ceil(remaining / 1000) + 's';
    pill.style.background = 'rgba(180,83,9,0.92)';
  } else {
    pill.textContent = 'Following your plane';
    pill.style.background = 'rgba(30,58,95,0.92)';
  }
  pill.style.display = 'block';
}

function paddedBoundsFromMap(targetMap, padRatio) {
  if (padRatio == null) padRatio = 0.12;
  const b = targetMap.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const latPad = (ne.lat - sw.lat) * padRatio;
  const lngPad = (ne.lng - sw.lng) * padRatio;
  return {
    swLat: sw.lat - latPad,
    swLng: sw.lng - lngPad,
    neLat: ne.lat + latPad,
    neLng: ne.lng + lngPad,
  };
}

function boundsQueryString(bounds) {
  return (
    'swLat=' + encodeURIComponent(bounds.swLat) +
    '&swLng=' + encodeURIComponent(bounds.swLng) +
    '&neLat=' + encodeURIComponent(bounds.neLat) +
    '&neLng=' + encodeURIComponent(bounds.neLng)
  );
}

async function fetchFlightZonesForBounds(bounds) {
  const u = AUTH.user;
  const role = (u && u.role) || 'customer';
  const key =
    role + '|' +
    bounds.swLat.toFixed(3) + ',' + bounds.swLng.toFixed(3) + ',' +
    bounds.neLat.toFixed(3) + ',' + bounds.neLng.toFixed(3);
  if (flightZoneFetchCache.has(key)) return flightZoneFetchCache.get(key);
  try {
    const res = await apiFetch('/api/zones?' + boundsQueryString(bounds));
    const data = await res.json().catch(function () { return {}; });
    const zones = res.ok && Array.isArray(data.zones) ? data.zones : [];
    if (res.ok) flightZoneFetchCache.set(key, zones);
    if (flightZoneFetchCache.size > 32) {
      const oldest = flightZoneFetchCache.keys().next().value;
      flightZoneFetchCache.delete(oldest);
    }
    return zones;
  } catch (e) {
    return [];
  }
}

function styleForZone(z, targetMap) {
  const base = ZONE_STYLES[z.zoneType] || ZONE_STYLES.restricted;
  const zoom = targetMap.getZoom();
  if (z.zoneType === 'flight_corridor') {
    return {
      color: base.color,
      fillColor: base.fillColor,
      fillOpacity: zoom < 7 ? 0.5 : zoom < 10 ? 0.4 : 0.32,
      weight: zoom < 7 ? 5 : zoom < 10 ? 4 : 3,
      dashArray: base.dashArray || '12 8',
      opacity: 1,
    };
  }
  if (z.zoneType === 'restricted') {
    return Object.assign({}, base, {
      fillOpacity: zoom < 8 ? 0.62 : 0.52,
      weight: zoom < 8 ? 5 : 4,
      opacity: 1,
    });
  }
  return Object.assign({}, base, { opacity: 1 });
}

function countZonesByType(zones) {
  const counts = { flight_corridor: 0, restricted: 0, no_fly: 0 };
  zones.forEach(function (z) {
    if (counts[z.zoneType] != null) counts[z.zoneType] += 1;
  });
  return counts;
}

function updateOperatorZoneBadge(zones) {
  const label = document.getElementById('op-zone-badge-label');
  const legendCount = document.getElementById('op-map-legend-count');
  const c = countZonesByType(zones);
  const parts = [];
  if (c.flight_corridor) parts.push(c.flight_corridor + ' corridor' + (c.flight_corridor === 1 ? '' : 's'));
  if (c.restricted) parts.push(c.restricted + ' restricted');
  if (c.no_fly) parts.push(c.no_fly + ' no-fly');
  const summary = parts.length ? parts.join(' · ') : 'no airspace in view — zoom or pan';
  if (label) label.textContent = 'Live GPS · ' + summary;
  if (legendCount) legendCount.textContent = zones.length ? zones.length + ' zone(s) loaded' : '';
}

async function refreshMapZones(targetMap, layerStore, options) {
  if (!targetMap) return;
  options = options || {};
  const bounds = paddedBoundsFromMap(targetMap);
  const zones = await fetchFlightZonesForBounds(bounds);
  drawZonesOnMap(targetMap, zones, layerStore, options.showAltitude !== false);
  if (options.altitudeHostId) {
    renderZoneAltitudeStack(zones, options.altitudeHostId);
  }
  if (targetMap === opSelfMap) {
    updateOperatorZoneBadge(zones);
  } else if (targetMap === map) {
    const countEl = document.getElementById('booking-map-legend-count');
    if (countEl) {
      const c = countZonesByType(zones);
      const parts = [];
      if (c.flight_corridor) parts.push(c.flight_corridor + ' corridor' + (c.flight_corridor === 1 ? '' : 's'));
      if (c.restricted) parts.push(c.restricted + ' restricted');
      if (c.no_fly) parts.push(c.no_fly + ' no-fly');
      countEl.textContent = parts.length ? parts.join(' · ') : '';
    }
  }
}

function bindMapZoneLoader(targetMap, layerStore, options) {
  if (!targetMap || targetMap._zonesLoaderBound) return;
  targetMap._zonesLoaderBound = true;
  function onMapViewChange() {
    let timer = mapZoneRefreshTimers.get(targetMap);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      refreshMapZones(targetMap, layerStore, options);
    }, 200);
    mapZoneRefreshTimers.set(targetMap, timer);
  }
  targetMap.on('moveend zoomend', onMapViewChange);
  window.addEventListener('resize', function () {
    if (!targetMap || !targetMap.getContainer || !targetMap.getContainer()) return;
    scheduleMapZoneRefresh(targetMap, layerStore, options, 150);
  });
}

function geoJsonToLeafletLatLngs(geometry) {
  if (!geometry || geometry.type !== 'Polygon' || !geometry.coordinates || !geometry.coordinates[0]) {
    return null;
  }
  return geometry.coordinates[0].map(function (c) { return [c[1], c[0]]; });
}

function zonePopupHtml(z, showAltitude) {
  let html =
    '<strong>' + escapeHtml(z.name) + '</strong><br>' +
    'Type: ' + escapeHtml((z.zoneType || '').replace(/_/g, ' '));
  if (showAltitude && z.minAltitudeM != null && z.maxAltitudeM != null) {
    html += '<br>Altitude: ' + z.minAltitudeM + '–' + z.maxAltitudeM + ' m AGL';
  }
  return html;
}

// Hard cap on polygons drawn per viewport. The backend already caps the rows
// returned; this guards the Leaflet render path when a low-zoom pan still
// intersects many zones (e.g. half of India). Safety-critical types
// (no_fly > restricted > corridor) are kept first when trimming.
const MAX_ZONES_DRAWN = 120;
// Skip zones whose bbox projects to less than this many CSS pixels — they are
// sub-pixel and invisible anyway, so drawing them is pure compute waste.
const MIN_ZONE_PX = 2;

function zonePixelSize(targetMap, z) {
  if (z.minLat == null || z.maxLat == null || z.minLng == null || z.maxLng == null) {
    return null;
  }
  const sw = targetMap.latLngToContainerPoint(L.latLng(z.minLat, z.minLng));
  const ne = targetMap.latLngToContainerPoint(L.latLng(z.maxLat, z.maxLng));
  return { w: Math.abs(ne.x - sw.x), h: Math.abs(ne.y - sw.y) };
}

function drawZonesOnMap(targetMap, zones, layerStore, showAltitude) {
  if (!targetMap) return;
  const withAlt = showAltitude !== false;
  layerStore.forEach(function (layer) { targetMap.removeLayer(layer); });
  layerStore.length = 0;

  // Cull sub-pixel zones first (saves the most Leaflet work at low zoom),
  // then cap the remainder keeping the most safety-relevant types on top.
  const visible = zones.filter(function (z) {
    const px = zonePixelSize(targetMap, z);
    if (!px) return true; // no bbox → keep, let geometry path decide
    return px.w >= MIN_ZONE_PX || px.h >= MIN_ZONE_PX;
  });

  const sorted = visible.slice().sort(function (a, b) {
    return (ZONE_DRAW_ORDER[a.zoneType] || 0) - (ZONE_DRAW_ORDER[b.zoneType] || 0);
  });

  // If still over the cap, drop from the bottom of the draw order (corridors
  // first) since no_fly/restricted are smaller and safety-critical.
  const toDraw = sorted.length > MAX_ZONES_DRAWN ? sorted.slice(0, MAX_ZONES_DRAWN) : sorted;

  toDraw.forEach(function (z) {
    const latlngs = geoJsonToLeafletLatLngs(z.geometry);
    if (!latlngs) return;
    const style = styleForZone(z, targetMap);
    const poly = L.polygon(latlngs, style).addTo(targetMap);
    poly.bindPopup(zonePopupHtml(z, withAlt));
    layerStore.push(poly);
  });
  layerStore.forEach(function (layer) {
    if (layer.bringToFront) layer.bringToFront();
  });
}

function renderZoneAltitudeStack(zones, hostId) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!zones.length) {
    host.innerHTML = '<h4>Altitude (3D)</h4><div class="op-empty-sub">No zones configured.</div>';
    return;
  }
  const maxAlt = Math.max.apply(null, zones.map(function (z) { return z.maxAltitudeM; }).concat([500]));
  host.innerHTML =
    '<h4>Altitude (3D)</h4>' +
    zones.map(function (z) {
      const pctBase = (z.minAltitudeM / maxAlt) * 100;
      const pctH = Math.max(((z.maxAltitudeM - z.minAltitudeM) / maxAlt) * 100, 4);
      const style = ZONE_STYLES[z.zoneType] || ZONE_STYLES.restricted;
      return '<div class="zone-alt-row">' +
        '<div class="zone-alt-label">' + escapeHtml(z.name) + '</div>' +
        '<div class="zone-alt-bar-track">' +
          '<div class="zone-alt-bar" style="bottom:' + pctBase + '%;height:' + pctH + '%;background:' + style.fillColor + ';border-color:' + style.color + '"></div>' +
        '</div>' +
        '<div class="zone-alt-range">' + z.minAltitudeM + '–' + z.maxAltitudeM + ' m</div>' +
      '</div>';
    }).join('');
}

async function initAdminLiveFlights() {
  const el = document.getElementById('admin-live-map');
  if (el && !adminLiveMap) {
    adminLiveMap = L.map('admin-live-map', { zoomControl: true }).setView([22.5, 79.0], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(adminLiveMap);
    attachAdminMapZoomProfiles();
  }
  await refreshAdminLiveFlights();
  if (adminLivePollInterval) clearInterval(adminLivePollInterval);
  adminLivePollInterval = setInterval(refreshAdminLiveFlights, 5000);
  setTimeout(function () {
    if (adminLiveMap) adminLiveMap.invalidateSize();
  }, 200);
}

function toggleAdminMapFullscreen() {
  const wrap = document.getElementById('admin-live-map-wrap');
  if (!wrap) return;
  const isFs = wrap.classList.toggle('fs');
  document.body.classList.toggle('admin-map-fs', isFs);
  const btn = document.getElementById('admin-live-map-fs');
  if (btn) btn.title = isFs ? 'Exit fullscreen' : 'Fullscreen';
  // Leaflet needs a re-layout after the container resizes.
  setTimeout(function () { if (adminLiveMap) adminLiveMap.invalidateSize(); }, 60);
  setTimeout(function () { if (adminLiveMap) adminLiveMap.invalidateSize(); }, 320);
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const wrap = document.getElementById('admin-live-map-wrap');
    if (wrap && wrap.classList.contains('fs')) toggleAdminMapFullscreen();
  }
});

async function refreshAdminLiveFlights() {
  const listEl = document.getElementById('admin-live-list');
  const fleetEl = document.getElementById('admin-fleet-list');
  const metaEl = document.getElementById('admin-live-meta');
  if (!listEl) return;
  try {
    const res = await apiFetch('/api/admin/live-flights');
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('load failed');
    const flights = Array.isArray(data.flights) ? data.flights : [];
    const fleet = Array.isArray(data.fleet) ? data.fleet : [];
    const dispatching = Array.isArray(data.dispatching) ? data.dispatching : [];
    if (metaEl) {
      metaEl.textContent =
        flights.length + ' active flight(s) · ' +
        fleet.length + ' pilot(s) reporting GPS · ' +
        dispatching.length + ' dispatching · updates every 5s';
    }
    if (!flights.length) {
      listEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">No flights in transit right now.</div></div>';
    } else {
      listEl.innerHTML = flights.map(function (f) {
        const op = f.operator;
        const gps = op && op.lat != null
          ? op.lat.toFixed(4) + ', ' + op.lng.toFixed(4)
          : 'GPS pending';
        return (
          '<div class="admin-flight-card">' +
            '<div class="admin-flight-top">' +
              '<div class="admin-flight-route">' + escapeHtml(f.pickup.name) + ' → ' + escapeHtml(f.dest.name) + '</div>' +
              statusBadgeHtml(f.status) +
            '</div>' +
            '<div class="admin-flight-meta">' +
              'IRG-' + String(f.id).padStart(5, '0') + ' · ' + escapeHtml(f.customer.name) +
              '<br>Pilot: ' + escapeHtml(op ? op.name : 'Unassigned') + ' · ' + gps +
              '<br>' + escapeHtml(f.service) + ' · ' + (f.distanceKm != null ? f.distanceKm + ' km' : '—') +
              (f.carbonSavedKg != null ? ' · CO₂ saved ' + f.carbonSavedKg + ' kg' : '') +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
    if (fleetEl) {
      if (!fleet.length) {
        fleetEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">No pilots reporting GPS yet.</div></div>';
      } else {
        fleetEl.innerHTML = fleet.map(function (p) {
          const gps = p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : '—';
          const status = p.inTransit
            ? statusBadgeHtml(p.tripStatus || 'flying')
            : '<span class="op-status-badge op-badge--green">Available</span>';
          return (
            '<div class="admin-fleet-row">' +
              '<div><b>' + escapeHtml(p.name) + '</b><br>' + gps + '</div>' +
              '<div>' + status + '</div>' +
            '</div>'
          );
        }).join('');
      }
    }
    if (adminLiveMap) {
      const activePilotKeys = new Set();
      const points = [];
      fleet.forEach(function (p) {
        if (p.lat == null) return;
        const key = 'admin-pilot-' + p.operatorId;
        activePilotKeys.add(key);
        const icon = p.inTransit
          ? '<div class="nearby-taxi-marker">✈️</div>'
          : '<div class="nearby-taxi-marker">🛬</div>';
        const label =
          escapeHtml(p.name) +
          (p.inTransit ? ' · in transit' : ' · available') +
          '<br>~' + (p.lat.toFixed(4) + ', ' + p.lng.toFixed(4));
        setAnimatedMapMarker(key, adminLiveMap, p.lat, p.lng, icon, label);
        // Zoom-gated profile: clicking a pilot marker opens their profile
        // drawer once the admin has zoomed in close enough (zoom >= 10).
        const entry = animatedMarkers.get(key);
        if (entry && !entry._profileClick) {
          entry._profileClick = true;
          entry.layer.on('click', function (ev) {
            L.DomEvent.stopPropagation(ev);
            if (adminLiveMap && adminLiveMap._iragoZoomProfileEnabled) {
              openAdminUserDrawer(p.operatorId);
            } else {
              adminLiveMap && adminLiveMap.fitBounds(L.latLngBounds([p.lat, p.lng], [p.lat, p.lng]).pad(0.4));
            }
          });
        }
        points.push([p.lat, p.lng]);
      });
      animatedMarkers.forEach(function (_entry, key) {
        if (key.indexOf('admin-pilot-') === 0 && !activePilotKeys.has(key)) {
          removeAnimatedMapMarker(key);
        }
      });
      flights.forEach(function (f) {
        if (f.pickup && f.pickup.lat != null) points.push([f.pickup.lat, f.pickup.lng]);
        if (f.dest && f.dest.lat != null) points.push([f.dest.lat, f.dest.lng]);
      });
      if (points.length) {
        adminLiveMap.fitBounds(L.latLngBounds(points).pad(0.12));
      }
    }
  } catch (e) {
    listEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Could not load live flights.</div></div>';
    if (fleetEl) fleetEl.innerHTML = '<div class="op-empty"><div class="op-empty-sub">Could not load fleet.</div></div>';
  }
}

// When set ('pickup' | 'dest'), the next map click sets that location.
var mapPickTarget = null;

function startMapPick(target) {
  mapPickTarget = target;
  var input = document.getElementById(target === 'pickup' ? 'pickup-input' : 'dest-input');
  var dropdown = document.getElementById(target === 'pickup' ? 'pickup-suggest' : 'dest-suggest');
  if (dropdown) dropdown.style.display = 'none';
  if (input) input.blur();
  showToast(target === 'pickup' ? 'Tap the map to set your pickup point' : 'Tap the map to set your destination', 'info');
}

var MAP_PICK_OPTION = '__map_pick__';

function setupAutocomplete(inputId, suggestId, callback, target) {
  var input = document.getElementById(inputId);
  var dropdown = document.getElementById(suggestId);
  if (!input || !dropdown) return;
  var activeIdx = -1;
  var currentMatches = [];

  function highlightMatch(name, query) {
    if (!query) return escapeHtml(name);
    var lower = name.toLowerCase();
    var idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(name);
    var before = escapeHtml(name.substring(0, idx));
    var match = escapeHtml(name.substring(idx, idx + query.length));
    var after = escapeHtml(name.substring(idx + query.length));
    return before + '<span class="loc-suggest-match">' + match + '</span>' + after;
  }

  function scoreName(name, keywords) {
    var lower = name.toLowerCase();
    var score = 0;
    for (var i = 0; i < keywords.length; i++) {
      var k = keywords[i];
      if (!k) continue;
      if (lower.indexOf(k) === 0) score += 3;
      else if (lower.indexOf(k) >= 0) score += 1;
      else {
        var parts = lower.split(/[\s,]+/);
        var found = false;
        for (var j = 0; j < parts.length; j++) {
          if (parts[j].indexOf(k) === 0) { score += 2; found = true; break; }
        }
        if (!found) return 0;
      }
    }
    return score;
  }

  function render(query) {
    activeIdx = -1;
    var q = (query || '').trim();
    var names = Object.keys(demoLocations);
    var scored = [];
    if (q.length < 1) {
      // Empty field: offer a few popular places under the map option
      scored = names.slice(0, 6).map(function (n) { return { name: n, score: 0 }; });
    } else {
      var keywords = q.toLowerCase().split(/\s+/);
      for (var i = 0; i < names.length; i++) {
        var s = scoreName(names[i], keywords);
        if (s > 0) scored.push({ name: names[i], score: s });
      }
      scored.sort(function (a, b) { return b.score - a.score; });
      scored = scored.slice(0, 7);
    }
    currentMatches = [{ name: MAP_PICK_OPTION }].concat(scored);
    var pinSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/></svg>';
    var mapSvg = '<svg class="loc-suggest-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14m6-12v14"/></svg>';
    dropdown.innerHTML = currentMatches.map(function (m, idx) {
      if (m.name === MAP_PICK_OPTION) {
        return '<div class="loc-suggest-item loc-suggest-map" data-idx="' + idx + '">' +
          mapSvg + '<span class="loc-suggest-name">Choose on map</span></div>' +
          (q.length < 1 ? '<div class="loc-suggest-label">Popular vertiports</div>' : '') +
          (q.length >= 1 && scored.length === 0 ? '<div class="loc-suggest-empty">No matching places</div>' : '');
      }
      return '<div class="loc-suggest-item" data-idx="' + idx + '">' +
        pinSvg + '<span class="loc-suggest-name">' + highlightMatch(m.name, q) + '</span></div>';
    }).join('');
    dropdown.style.display = 'block';

    var items = dropdown.querySelectorAll('.loc-suggest-item');
    for (var j = 0; j < items.length; j++) {
      (function (el, idx) {
        el.onmousedown = function (e) {
          e.preventDefault();
          pickItem(idx);
        };
      })(items[j], j);
    }
  }

  function pickItem(idx) {
    if (idx < 0 || idx >= currentMatches.length) return;
    var name = currentMatches[idx].name;
    dropdown.style.display = 'none';
    currentMatches = [];
    if (name === MAP_PICK_OPTION) { startMapPick(target); return; }
    var coord = demoLocations[name];
    input.value = name;
    input.classList.add('has-value');
    callback(name, coord);
  }

  function setActive(idx) {
    var items = dropdown.querySelectorAll('.loc-suggest-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    activeIdx = idx;
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('input', function () { render(this.value); });
  input.addEventListener('focus', function () {
    render(this.value);
  });
  input.addEventListener('blur', function () {
    setTimeout(function () { dropdown.style.display = 'none'; }, 150);
  });
  input.addEventListener('keydown', function (e) {
    if (dropdown.style.display === 'none' || !currentMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIdx < currentMatches.length - 1 ? activeIdx + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIdx > 0 ? activeIdx - 1 : currentMatches.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) pickItem(activeIdx);
      else if (currentMatches.length === 1) pickItem(0);
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });
}

function createMarker(latlng, type) {
  const div = document.createElement('div');
  div.className = 'custom-marker';
  div.innerHTML = `<div class="marker-${type}"></div>`;
  return L.marker(latlng, {
    icon: L.divIcon({ html: div.outerHTML, className: '', iconSize: [14, 14], iconAnchor: [7, 7] })
  });
}

function setPickup(latlng, name) {
  pickupCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('pickup-input').value = name;
  document.getElementById('pickup-input').classList.add('has-value');
  if (pickupMarker) map.removeLayer(pickupMarker);
  pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(pickupCoord, 13);
  captureBookingDraft();
  refreshNearbyTaxis();
}

function setDest(latlng, name) {
  destCoord = Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng];
  document.getElementById('dest-input').value = name;
  document.getElementById('dest-input').classList.add('has-value');
  if (destMarker) map.removeLayer(destMarker);
  destMarker = createMarker(destCoord, 'dest').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  else map.setView(destCoord, 13);
  captureBookingDraft();
  if (pickupCoord && destCoord) refreshNearbyTaxis();
}

function drawRoute() {
  if (routeLine) map.removeLayer(routeLine);
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];

  // Use actual avoidance route when available
  if (currentRoute && currentRoute.segments && currentRoute.segments.length) {
    drawRouteFromPlan();
    onRouteReady();
    return;
  }

  // Fallback: curved flight path
  const midLat = (pickupCoord[0] + destCoord[0]) / 2;
  const midLng = (pickupCoord[1] + destCoord[1]) / 2;
  const dist = Math.sqrt(Math.pow(pickupCoord[0] - destCoord[0], 2) + Math.pow(pickupCoord[1] - destCoord[1], 2));
  const arcHeight = dist * 0.3;
  const perpLat = -(destCoord[1] - pickupCoord[1]);
  const perpLng = destCoord[0] - pickupCoord[0];
  const perpLen = Math.sqrt(perpLat * perpLat + perpLng * perpLng) || 1;
  const ctrlLat = midLat + (perpLat / perpLen) * arcHeight;
  const ctrlLng = midLng + (perpLng / perpLen) * arcHeight;

  const points = [];
  for (let t = 0; t <= 1; t += 0.03) {
    const lat = (1-t)*(1-t)*pickupCoord[0] + 2*(1-t)*t*ctrlLat + t*t*destCoord[0];
    const lng = (1-t)*(1-t)*pickupCoord[1] + 2*(1-t)*t*ctrlLng + t*t*destCoord[1];
    points.push([lat, lng]);
  }

  routeLine = L.polyline(points, {
    color: currentService === 'golden' ? '#EF4444' : currentService === 'shuttle' ? '#10B981' : '#3B82F6',
    weight: 3,
    opacity: 0.7,
    dashArray: '10 6',
    className: 'flight-path'
  }).addTo(map);

  const bounds = L.latLngBounds([pickupCoord, destCoord]).pad(0.3);
  map.fitBounds(bounds);
  onRouteReady();
}

function drawRouteFromPlan() {
  if (!currentRoute || !currentRoute.segments || !currentRoute.segments.length) return;
  if (routeLine) map.removeLayer(routeLine);
  aircraftMarkers.forEach(function (m) { map.removeLayer(m); });
  aircraftMarkers = [];

  var serviceColor = currentService === 'golden' ? '#EF4444' : currentService === 'shuttle' ? '#10B981' : '#3B82F6';
  var layers = [];

  currentRoute.segments.forEach(function (seg) {
    var color = (seg.crossedRestricted && seg.crossedRestricted.length) ? '#F59E0B' : serviceColor;
    var line = L.polyline(
      [[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]],
      { color: color, weight: 3.5, opacity: 0.85, dashArray: (seg.crossedRestricted && seg.crossedRestricted.length) ? '8 5' : null }
    );
    layers.push(line);
  });

  routeLine = L.layerGroup(layers).addTo(map);

  if (currentRoute.waypoints) {
    currentRoute.waypoints.forEach(function (wp, i) {
      if (i === 0 || i === currentRoute.waypoints.length - 1) return;
      L.circleMarker([wp.lat, wp.lng], {
        radius: 4, color: '#fff', fillColor: '#F59E0B', fillOpacity: 1, weight: 2
      }).addTo(map);
    });
  }

  if (pickupCoord && destCoord) {
    map.fitBounds(L.latLngBounds([pickupCoord, destCoord]).pad(0.3));
  }
}

function routeReasonLabel(reason) {
  var labels = {
    rerouted_around_no_fly: 'Route adjusted to avoid no-fly zone',
    rerouted_no_fly_and_overfly_restricted: 'Rerouted around no-fly + climbing over restricted zone',
    overfly_restricted_least_fuel: 'Climbing over restricted zone (least fuel option)',
    rerouted_around_restricted: 'Routing around restricted zone (least fuel option)',
  };
  return labels[reason] || '';
}

// When pickup + drop are both set: show nearby taxis (10 km) and fare options with CO₂.
function onRouteReady() {
  captureBookingDraft();
  renderDemoTaxisOnMap();
  startDemoTaxiDrift();
  refreshNearbyTaxis();
  if (bookingDraftReady()) searchRides();
}

function swapLocations() {
  const tmpCoord = pickupCoord;
  const tmpName = document.getElementById('pickup-input').value;
  pickupCoord = destCoord;
  destCoord = tmpCoord;
  document.getElementById('pickup-input').value = document.getElementById('dest-input').value;
  document.getElementById('dest-input').value = tmpName;
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (destMarker) map.removeLayer(destMarker);
  if (pickupCoord) pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
  if (destCoord) destMarker = createMarker(destCoord, 'dest').addTo(map);
  if (pickupCoord && destCoord) drawRoute();
  captureBookingDraft();
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  const btn = document.querySelector('.loc-gps-btn');
  if (btn) { btn.classList.add('gps-loading'); btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(
    async function (pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Reverse geocode with Nominatim to get a readable place name
      let name = 'My Location (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
      try {
        const r = await fetch(
          'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng,
          { headers: { 'Accept-Language': 'en' } }
        );
        const d = await r.json();
        if (d && d.display_name) {
          // Use suburb/city/town for a short, friendly name
          const a = d.address || {};
          name = a.suburb || a.neighbourhood || a.village || a.town || a.city || d.display_name.split(',')[0];
          name = name + ', ' + (a.city || a.town || a.county || '');
        }
      } catch (e) { /* keep coordinates as name */ }
      setPickup([lat, lng], name.trim().replace(/,\s*$/, ''));
      map.setView([lat, lng], 14);
      if (btn) { btn.classList.remove('gps-loading'); btn.disabled = false; }
    },
    function (err) {
      if (btn) { btn.classList.remove('gps-loading'); btn.disabled = false; }
      const msgs = {
        1: 'Location access denied. Please allow location in your browser settings.',
        2: 'Location unavailable. Try again or enter manually.',
        3: 'Location request timed out.',
      };
      showAuthError('booking-error', msgs[err.code] || 'Could not get your location.');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}



// ===== 06-booking.js =====

// IraGo app — 06-booking.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Service Switching ──
function switchService(service) {
  currentService = service;
  currentRoute = null;
  document.querySelectorAll('.service-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-service="${service}"]`).classList.add('active');

  const bookingPanel = document.getElementById('booking-panel');
  const dronePanel = document.getElementById('drone-panel');
  const mapEl = document.getElementById('map');

  if (service === 'drones') {
    if (bookingPanel) bookingPanel.style.display = 'none';
    if (mapEl) mapEl.style.display = 'none';
    if (dronePanel) dronePanel.style.display = 'flex';
    loadDroneServices();
    loadDroneMyBookings();
    return;
  }

  if (bookingPanel) bookingPanel.style.display = 'flex';
  if (mapEl) mapEl.style.display = '';
  if (dronePanel) dronePanel.style.display = 'none';

  const btn = document.getElementById('search-btn');
  const btnText = document.getElementById('search-btn-text');
  const banner = document.getElementById('service-banner-area');
  const extra = document.getElementById('extra-fields-area');

  // Reset rides
  document.getElementById('rides-area').style.display = 'none';
  document.getElementById('book-btn').style.display = 'none';
  selectedRide = null;

  btn.className = 'search-btn';
  extra.innerHTML = '';
  banner.innerHTML = '';

  if (service === 'taxi') {
    btn.classList.add('search-btn-blue');
    btnText.textContent = 'Find Available Rides';
    banner.innerHTML = `
      <div class="shuttle-info-banner">
        <strong>Urgency &middot; HNWI &middot; VIP &middot; Diplomat.</strong> Rooftop to rooftop — IGI to your hotel in 18 min. Zero ground transport.
      </div>`;
  } else if (service === 'golden') {
    btn.classList.add('search-btn-red');
    btnText.textContent = 'Dispatch Air Ambulance';
    banner.innerHTML = `
      <div class="emergency-banner" style="margin-bottom:4px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div><strong>For emergencies, call 112 first.</strong> This dispatches DGCA-certified air ambulances &mdash; accident to trauma care within the Golden Hour (T+35 min protocol).</div>
      </div>`;
    extra.innerHTML = `
      <div class="extra-field">
        <label>Nature of Emergency</label>
        <select><option>Accident / Trauma</option><option>Cardiac Emergency</option><option>Stroke</option><option>Burns</option><option>Organ Transport</option><option>Neonatal</option><option>Other Medical</option></select>
      </div>
      <div class="extra-field">
        <label>Contact Phone</label>
        <input type="tel" placeholder="+91 98765 43210">
      </div>`;
  } else {
    btn.classList.add('search-btn-green');
    btnText.textContent = 'Find Shuttle Routes';
    banner.innerHTML = `
      <div class="shuttle-info-banner">
        <strong>Joy Rides &middot; Tourism &amp; Religious Circuits.</strong> HP scenic corridors, Vaishno Devi &amp; Char Dham — all DGCA-certified.
      </div>`;
  }

  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];

  captureBookingDraft();
  renderPopularRoutes(service);
}

// ── Popular Routes per Service ──
const popularRoutes = {
  taxi: [
    { from: 'Aerocity Vertiport, Delhi', to: 'Hotel Leela Rooftop, Delhi', meta: '18&ndash;25 min &middot; 2 pax &middot; &#8377;3,600&ndash;5,600', tag: 'Executive Shuttle' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Taj Mahal Vertiport, Agra', meta: '55 min/way &middot; 4 pax &middot; &#8377;13,000&ndash;19,000', tag: 'Agra Express' },
    { from: 'Embassy Vertiport, Chanakyapuri', to: 'Hotel Leela Rooftop, Delhi', meta: 'Custom &middot; 2&ndash;4 pax &middot; &#8377;9,000&ndash;16,000', tag: 'Diplomatic' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Chandigarh Vertiport', meta: '45 min/sector &middot; 6 pax &middot; &#8377;24,000&ndash;40,000', tag: 'Corporate Charter' },
    { from: 'Aerocity Vertiport, Delhi', to: 'Dehradun Vertiport', meta: '45 min/sector &middot; 6 pax &middot; &#8377;24,000&ndash;40,000', tag: 'Corporate Charter' },
    { from: 'Noida Sec 62 Vertiport', to: 'Gurugram Cyber Hub', meta: '22 min &middot; 40 km', tag: 'Inter-city' },
    { from: 'Dwarka Sector 21 Vertiport', to: 'Faridabad Vertiport', meta: '16 min &middot; 30 km', tag: 'Inter-city' },
    { from: 'Navi Mumbai Vertiport', to: 'Powai Vertiport, Mumbai', meta: '12 min &middot; 22 km', tag: 'Business' },
    { from: 'Whitefield Vertiport', to: 'Electronic City Vertiport', meta: '16 min &middot; 28 km', tag: 'Tech Hub' },
    { from: 'Hi-Tech City Vertiport', to: 'Shamshabad Vertiport', meta: '14 min &middot; 25 km', tag: 'Airport Link' },
  ],
  golden: [
    { from: 'Barmana Helipad, Bilaspur', to: 'AIIMS Bilaspur', meta: '12 min &middot; Golden Hour corridor', tag: 'HP EMS' },
    { from: 'Bharmour Helipad, Chamba', to: 'Pt. JLN Medical College, Chamba', meta: '22 min &middot; 66% fatality district', tag: 'Critical' },
    { from: 'Gagal Vertiport, Kangra', to: 'Dr. RPGMC Tanda, Kangra', meta: '15 min &middot; max volume corridor', tag: 'HP EMS' },
    { from: 'Annadale Helipad, Shimla', to: 'IGMC Hospital, Shimla', meta: '18 min &middot; high urban corridor', tag: 'HP EMS' },
    { from: 'Nalagarh Helipad, Baddi', to: 'MM Medical College, Solan', meta: '14 min &middot; industrial corridor', tag: 'HP EMS' },
    { from: 'Dwarka Sector 21 Vertiport', to: 'Gurugram Medanta Hospital', meta: '12 min &middot; 22 km', tag: 'Emergency' },
    { from: 'Thane Vertiport', to: 'Kokilaben Hospital, Mumbai', meta: '14 min &middot; 26 km', tag: 'Emergency' },
    { from: 'OMR Vertiport, Chennai', to: 'Apollo Hospital, Chennai', meta: '10 min &middot; 18 km', tag: 'Emergency' },
    { from: 'Sarjapur Vertiport', to: 'Narayana Health, Bengaluru', meta: '10 min &middot; 18 km', tag: 'Emergency' },
    { from: 'Hi-Tech City Vertiport', to: 'Yashoda Hospital, Hyderabad', meta: '6 min &middot; 8 km', tag: 'Emergency' },
    { from: 'Dehradun Vertiport', to: 'AIIMS Rishikesh', meta: '12 min &middot; 22 km', tag: 'Remote' },
    { from: 'Leh Vertiport, Ladakh', to: 'SNM Hospital, Leh', meta: '3 min &middot; 4 km', tag: 'Remote' },
  ],
  shuttle: [
    { from: 'Bhuntar Vertiport, Kullu', to: 'Manali Vertiport', meta: '20 min &middot; &#8377;500&ndash;700 &middot; Pk &#8377;840', tag: 'Joy Ride' },
    { from: 'Gagal Vertiport, Kangra', to: 'Dharamshala Vertiport', meta: '12 min &middot; &#8377;400&ndash;560 &middot; Pk &#8377;700', tag: 'Joy Ride' },
    { from: 'Shimla Vertiport', to: 'Kufri Helipad', meta: '8 min &middot; &#8377;400&ndash;500 &middot; Pk &#8377;700', tag: 'Joy Ride' },
    { from: 'Manali Vertiport', to: 'Rohtang Pass Helipad', meta: '15 min &middot; &#8377;700&ndash;1,000 &middot; Pk &#8377;1,300', tag: 'Scenic' },
    { from: 'Katra Vertiport (Vaishno Devi)', to: 'Sanjichhat Helipad (Bhawan)', meta: '8 min &middot; &#8377;350&ndash;550 per seat', tag: 'Vaishno Devi' },
    { from: 'Phata Helipad (Char Dham)', to: 'Kedarnath Helipad', meta: '10 min &middot; &#8377;2,500&ndash;4,500/sector', tag: 'Char Dham' },
    { from: 'Noida Sec 62 Vertiport', to: 'Gurugram Cyber Hub', meta: '22 min &middot; 40 km &middot; Daily 8 slots', tag: 'Business' },
    { from: 'Thane Vertiport', to: 'Navi Mumbai Vertiport', meta: '14 min &middot; 28 km &middot; Daily 14 slots', tag: 'Commuter' },
    { from: 'Whitefield Vertiport', to: 'Electronic City Vertiport', meta: '14 min &middot; 28 km &middot; Daily 10 slots', tag: 'Tech Corridor' },
    { from: 'Hi-Tech City Vertiport', to: 'Shamshabad Vertiport', meta: '14 min &middot; 25 km &middot; Daily 12 slots', tag: 'Commuter' },
  ],
};

function renderPopularRoutes(service) {
  const area = document.getElementById('popular-routes-area');
  const routes = popularRoutes[service] || [];
  const colorMap = { taxi: 'blue', golden: 'red', shuttle: 'green' };
  const color = colorMap[service];
  const hoverCls = service === 'golden' ? 'red-hover' : service === 'shuttle' ? 'green-hover' : '';
  const iconCls = `route-chip-icon-${color}`;

  const titleIcon = service === 'taxi'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2"/></svg>'
    : service === 'golden'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>';

  const titleText = service === 'taxi' ? 'Popular Routes' : service === 'golden' ? 'Emergency Routes' : 'Shuttle Routes';

  area.innerHTML = `
    <div class="popular-routes-title" style="color:var(--${color})">
      ${titleIcon} ${titleText}
    </div>
    ${routes.map(r => `
      <button class="route-chip ${hoverCls}" onclick="selectRoute('${r.from}','${r.to}')">
        <div class="route-chip-icon ${iconCls}">${titleIcon}</div>
        <div class="route-chip-info">
          <div class="route-chip-name">${r.from} &rarr; ${r.to}</div>
          <div class="route-chip-meta">
            <span>${r.meta}</span>
            <span style="background:var(--${color}-light);color:var(--${color}-dark);padding:1px 6px;border-radius:99px;font-size:10px;font-weight:600;">${r.tag}</span>
          </div>
        </div>
        <div class="route-chip-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </button>
    `).join('')}
  `;
}

function selectRoute(from, to) {
  const fromCoord = demoLocations[from];
  const toCoord = demoLocations[to];
  if (fromCoord) setPickup(fromCoord, from);
  if (toCoord) setTimeout(() => setDest(toCoord, to), 200);
  // Hide popular routes after selection
  document.getElementById('popular-routes-area').innerHTML = '';
}

// ── Ride Data ──
const GST_RATE_CLIENT = 0.18;
const rideOptions = {
  taxi: [
    { name: 'IraGo Lite', desc: '2-seater eVTOL, solo or duo', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 500, perKm: 200, baseTime: 18, co2: 2.1 },
    { name: 'IraGo Comfort', desc: '4-seater, spacious cabin', icon: 'gold', badge: '', badgeCls: '', base: 500, perKm: 280, baseTime: 22, co2: 3.4 },
    { name: 'IraGo Premium', desc: '6-seater luxury, lounge seats', icon: 'purple', badge: 'Premium', badgeCls: 'badge-premium', base: 500, perKm: 450, baseTime: 20, co2: 4.8 },
    { name: 'IraGo Eco', desc: 'Shared ride, lowest cost', icon: 'green', badge: 'Cheapest', badgeCls: 'badge-cheapest', base: 500, perKm: 150, baseTime: 32, co2: 1.2 },
  ],
  golden: [
    { name: 'Air Ambulance Basic', desc: 'Stretcher + paramedic', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 5000, perKm: 600, baseTime: 12, co2: 5.2 },
    { name: 'Air Ambulance ICU', desc: 'Full ICU + doctor on board', icon: 'purple', badge: 'Premium', badgeCls: 'badge-premium', base: 5000, perKm: 1100, baseTime: 15, co2: 7.8 },
    { name: 'Neonatal Transport', desc: 'Incubator + neonatal team', icon: 'gold', badge: '', badgeCls: '', base: 5000, perKm: 1200, baseTime: 14, co2: 6.1 },
  ],
  shuttle: [
    { name: 'Shuttle Standard', desc: 'Shared seat, scheduled route', icon: 'green', badge: 'Cheapest', badgeCls: 'badge-cheapest', base: 500, perKm: 80, baseTime: 15, co2: 0.8 },
    { name: 'Shuttle Business', desc: 'Priority boarding, lounge access', icon: 'purple', badge: '', badgeCls: '', base: 500, perKm: 130, baseTime: 12, co2: 1.1 },
    { name: 'Shuttle Express', desc: 'Non-stop, fastest route', icon: 'blue', badge: 'Fastest', badgeCls: 'badge-fastest', base: 500, perKm: 180, baseTime: 8, co2: 1.5 },
  ]
};

function calcDistance() {
  if (!pickupCoord || !destCoord) return 25;
  const R = 6371;
  const dLat = (destCoord[0] - pickupCoord[0]) * Math.PI / 180;
  const dLng = (destCoord[1] - pickupCoord[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(pickupCoord[0]*Math.PI/180)*Math.cos(destCoord[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function searchRides() {
  if (!pickupCoord || !destCoord) {
    if (!pickupCoord) setPickup([28.6315, 77.2167], 'Connaught Place, Delhi');
    if (!destCoord) {
      setTimeout(() => setDest([28.5830, 77.0780], 'Dwarka Helipad, Delhi'), 300);
      setTimeout(searchRides, 700);
      return;
    }
  }

  var searchBtnText = document.getElementById('search-btn-text');
  var searchBtnLabel = searchBtnText.textContent;
  searchBtnText.textContent = 'Searching…';
  document.getElementById('search-btn').disabled = true;

  const draft = captureBookingDraft();
  const dist = draft.distanceKm != null ? draft.distanceKm : calcDistance();
  const rides = rideOptions[currentService];
  const list = document.getElementById('rides-list');
  const area = document.getElementById('rides-area');
  const title = document.getElementById('rides-title');

  title.textContent = currentService === 'taxi' ? 'Available Rides' : currentService === 'golden' ? 'Air Ambulances Nearby' : 'Shuttle Routes';

  // Route feasibility pre-check at booking time: alert the customer if the
  // route crosses / lands in a restricted (no-fly) zone and surface the 3
  // nearest safe spots as clickable suggestions. The server blocks a blocked
  // route at creation too; this gives a friendly heads-up before payment.
  try {
    const fres = await apiFetch('/api/bookings/feasibility', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: draft.pickup.lat,
        pickupLng: draft.pickup.lng,
        destLat: draft.dest.lat,
        destLng: draft.dest.lng,
        service: draft.service,
        bookingType: draft.service === 'golden' ? 'medical_emergency' : null,
      }),
    });
    const fdata = await fres.json().catch(() => ({}));
    currentRoute = (fdata && fdata.route) ? fdata.route : null;
    currentDiscount = (fdata && fdata.discount) ? fdata.discount : null;
    currentCarbonComparison = (fdata && fdata.carbonComparison) ? fdata.carbonComparison : null;
    if (currentRoute && currentRoute.segments && currentRoute.segments.length) {
      drawRouteFromPlan();
    }
    if (fres.ok && fdata && fdata.feasible === false) {
      list.innerHTML = renderFeasibilityWarning(fdata);
      document.getElementById('book-btn').style.display = 'none';
      area.style.display = 'block';
      area.scrollIntoView({ behavior: 'smooth' });
      searchBtnText.textContent = searchBtnLabel;
      document.getElementById('search-btn').disabled = false;
      return;
    }
    if (fres.ok && fdata && fdata.emergencyBypass && fdata.warnings && fdata.warnings.length) {
      const bypassBanner = '<div class="feasibility-warning" style="border-color:var(--amber,#f59e0b);background:rgba(245,158,11,0.08);">' +
        '<div style="font-weight:700;color:var(--amber-dark,#92400e);font-size:13px;">Emergency Clearance Active</div>' +
        '<div style="font-size:12px;color:var(--gray-600);margin-top:4px;">' + escapeHtml(fdata.warnings[0]) + '</div>' +
        '</div>';
      list.insertAdjacentHTML('beforeend', bypassBanner);
    }
  } catch (e) { /* degrade: if feasibility call fails, fall through to rides */ }

  var hasDiscount = currentDiscount && currentDiscount.eligible;
  var discountRate = hasDiscount ? 0.50 : 0;
  var discountRemaining = hasDiscount ? currentDiscount.remaining : 0;

  list.innerHTML = rides.map((r, i) => {
    const subtotal = r.base + r.perKm * dist;
    const fullPrice = Math.round(subtotal * (1 + GST_RATE_CLIENT) / 100) * 100;
    const price = hasDiscount ? Math.round(fullPrice * (1 - discountRate) / 100) * 100 : fullPrice;
    const timeFactor = Math.max(0.7, Math.max(0.5, dist / 25) * 0.8);
    const time = Math.round(r.baseTime * timeFactor);
    const co2 = (r.co2 * Math.max(0.5, dist / 25)).toFixed(1);
    const roadTime = Math.round(time * 3.5);
    const discountBadge = hasDiscount
      ? '<span class="ride-badge badge-discount">50% OFF</span>'
      : '';
    const priceHtml = hasDiscount
      ? '<div class="ride-price-val">&#8377;' + price.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-original">&#8377;' + fullPrice.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-est">' + discountRemaining + ' discounted flight' + (discountRemaining === 1 ? '' : 's') + ' left</div>'
      : '<div class="ride-price-val">&#8377;' + price.toLocaleString('en-IN') + '</div>' +
        '<div class="ride-price-est">incl. 18% GST</div>';
    return `
      <div class="ride-card" data-idx="${i}" onclick="selectRideCard(this, ${i}, ${price}, ${time}, '${co2}')">
        <div class="ride-card-top">
          <div class="ride-icon ride-icon-${r.icon}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.7.5-1.1z"/></svg>
          </div>
          <div class="ride-info">
            <div class="ride-name">
              ${r.name}
              ${discountBadge}
              ${r.badge ? `<span class="ride-badge ${r.badgeCls}">${r.badge}</span>` : ''}
            </div>
            <div class="ride-desc">${r.desc}</div>
          </div>
          <div class="ride-price">
            ${priceHtml}
          </div>
        </div>
        <div class="ride-stats">
          <div class="ride-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ${time} min fly
          </div>
          <div class="ride-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M2 12h20"/></svg>
            ${Math.round(dist)} km
          </div>
          <div class="ride-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ~${roadTime} min road
          </div>
          <div class="ride-stat carbon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><circle cx="12" cy="10" r="3"/></svg>
            -${co2} kg CO&#8322;
          </div>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.new-flyer-banner').forEach(function(el) { el.remove(); });
  if (hasDiscount) {
    list.insertAdjacentHTML('beforebegin',
      '<div class="new-flyer-banner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
        '<div><strong>New Flyer Offer!</strong> 50% off your first 3 flights — ' + discountRemaining + ' remaining</div>' +
      '</div>'
    );
  }

  if (currentCarbonComparison) {
    list.innerHTML += renderCarbonComparison(currentCarbonComparison);
  }

  if (currentRoute && currentRoute.feasible !== false) {
    var altProfile = currentRoute.altitudeProfile || {};
    var routeInfoHtml =
      '<div class="route-info-card">' +
        '<div class="route-info-title">Flight Route</div>' +
        '<div class="route-info-grid">' +
          '<div class="route-info-item"><span class="route-info-label">Distance</span><span class="route-info-val">' + (currentRoute.totalDistanceKm || '—') + ' km</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Fuel est.</span><span class="route-info-val">' + (currentRoute.totalFuelKg || '—') + ' kg</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Detour</span><span class="route-info-val">' + (currentRoute.detourRatio > 1 ? (currentRoute.detourRatio + 'x') : 'Direct') + '</span></div>' +
          '<div class="route-info-item"><span class="route-info-label">Altitude</span><span class="route-info-val">' + (altProfile.min || '—') + '–' + (altProfile.max || '—') + ' m</span></div>' +
        '</div>' +
        (currentRoute.reason && currentRoute.reason !== 'direct_clear' ?
          '<div class="route-info-note">' + routeReasonLabel(currentRoute.reason) + '</div>' : '') +
      '</div>';
    list.innerHTML += routeInfoHtml;
  }

  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth' });
  searchBtnText.textContent = searchBtnLabel;
  document.getElementById('search-btn').disabled = false;
}

// Render the "restricted area" alert with the 3 nearest safe spots, returned
// by the feasibility pre-check (or by a blocked booking-creation response).
function renderFeasibilityWarning(data) {
  const violations = (data && data.violations && data.violations.length)
    ? data.violations.map(escapeHtml).join('; ')
    : 'This route crosses or ends inside a restricted (no-fly) area.';
  const endpoints = (data && data.blockedEndpoints) || [];
  let endpointsHtml = '';
  endpoints.forEach(function (ep) {
    const label = ep.which === 'pickup' ? 'Pickup' : 'Destination';
    const chips = (ep.suggestions || []).slice(0, 3).map(function (s) {
      const nm = escapeHtml(s.name || (s.lat.toFixed(4) + ', ' + s.lng.toFixed(4)));
      const w = ep.which.replace(/'/g, "\\'");
      const n = (s.name || '').replace(/'/g, "\\'");
      return '<button type="button" class="feas-chip" onclick="chooseFeasibilitySuggestion(\'' +
        w + '\',' + Number(s.lat) + ',' + Number(s.lng) + ',\'' + n + '\')">' +
        '<span class="feas-chip-pin">\uD83D\uDCCD</span><span>' + nm + '</span></button>';
    }).join('');
    endpointsHtml +=
      '<div class="feas-endpoint">' +
        '<div class="feas-endpoint-title">' + escapeHtml(label) + ' is in a restricted area</div>' +
        '<div class="feas-endpoint-msg">' + escapeHtml(ep.message || 'Pick a nearby safe spot instead:') + '</div>' +
        '<div class="feas-suggestions">' + (chips || '<span class="feas-none">No safe alternatives found nearby.</span>') + '</div>' +
      '</div>';
  });
  return (
    '<div class="feasibility-warning">' +
      '<div class="feas-head">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<div>' +
          '<div class="feas-title">Restricted airspace on this route</div>' +
          '<div class="feas-sub">' + violations + '</div>' +
        '</div>' +
      '</div>' +
      (endpointsHtml || '') +
      '<div class="feas-foot">Choose a suggested spot to update your route and search again.</div>' +
    '</div>'
  );
}

// Customer picks one of the 3 nearest safe spots; update the endpoint and
// re-run the search so the warning clears if the new route is feasible.
function chooseFeasibilitySuggestion(which, lat, lng, name) {
  const label = name || (Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4));
  currentRoute = null;
  if (which === 'pickup') setPickup([lat, lng], label);
  else setDest([lat, lng], label);
  showToast('Updated ' + which + ' to ' + label, 'success');
  searchRides();
}

function selectRideCard(el, idx, price, time, co2) {
  document.querySelectorAll('.ride-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRide = { idx, price, time, co2, name: rideOptions[currentService][idx].name };
  document.getElementById('book-btn').style.display = 'flex';
  document.getElementById('book-btn').className = `search-btn search-btn-${currentService === 'golden' ? 'red' : currentService === 'shuttle' ? 'green' : 'blue'}`;
}

// startDemo() removed — demo mode now auto-triggers on book → pay.
// No separate button needed.

async function bookRide() {
  if (!selectedRide) return;
  hideAuthError('booking-error');

  // Re-capture and gate: a booking cannot be created unless pickup,
  // destination, and service are all set (the server enforces this too).
  const draft = captureBookingDraft();
  if (!bookingDraftReady()) {
    showAuthError('booking-error', 'Please set a pickup, destination, and service before booking.');
    return;
  }

  setBusy('book-btn', true, 'Booking\u2026', 'Confirm Booking');
  try {
    var bookingType = draft.service === 'golden' ? 'medical_emergency' : null;
    const res = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        pickupName: draft.pickup.name,
        pickupLat: draft.pickup.lat,
        pickupLng: draft.pickup.lng,
        destName: draft.dest.name,
        destLat: draft.dest.lat,
        destLng: draft.dest.lng,
        service: draft.service,
        bookingType: bookingType,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 && data && data.code === 'ROUTE_BLOCKED') {
        const list = document.getElementById('rides-list');
        const area = document.getElementById('rides-area');
        if (list) list.innerHTML = renderFeasibilityWarning(data);
        if (area) { area.style.display = 'block'; area.scrollIntoView({ behavior: 'smooth' }); }
        document.getElementById('book-btn').style.display = 'none';
        showAuthError('booking-error', 'This route is restricted. Pick a suggested spot and try again.');
      } else {
        showAuthError('booking-error', data.error || 'Could not create your booking. Please try again.');
      }
      return;
    }

    currentBooking = data.booking;
    currentFareBreakdown = data.fare || null;
    currentCarbonCredits = data.carbonCredits || null;
    if (data.company) currentBooking._company = data.company;
    if (data.weather) currentBooking._weather = data.weather;
    showPaymentOverlay(currentBooking);
  } catch (err) {
    showAuthError('booking-error', 'Network error \u2014 please check your connection and try again.');
  } finally {
    setBusy('book-btn', false, 'Booking\u2026', 'Confirm Booking');
  }
}

// Populate the confirmation overlay from a persisted booking record.
function fillConfirmation(booking) {
  document.getElementById('confirm-id').textContent = 'IRG-' + String(booking.id).padStart(5, '0');
  document.getElementById('confirm-pickup').textContent = booking.pickupName;
  document.getElementById('confirm-dest').textContent = booking.destName;
  document.getElementById('confirm-vehicle').textContent =
    (selectedRide ? selectedRide.name + ' \u00B7 ' : '') + (SERVICE_LABELS[booking.service] || booking.service);
  document.getElementById('confirm-time').textContent = selectedRide ? selectedRide.time + ' min' : '\u2014';
  document.getElementById('confirm-cost').textContent = '\u20B9' + Math.round(booking.fareEstimate).toLocaleString('en-IN');
  const carbon = booking.carbonSavedKg != null ? booking.carbonSavedKg : (selectedRide ? selectedRide.co2 : null);
  document.getElementById('confirm-carbon').textContent = carbon != null ? '-' + carbon + ' kg' : '\u2014';
}

function renderWeatherBar(w) {
  var bar = document.getElementById('payment-weather-bar');
  if (!bar || !w) { if (bar) bar.style.display = 'none'; return; }
  var riskColors = { low: '#15803d', medium: '#b45309', high: '#dc2626' };
  var riskLabels = { low: 'Good', medium: 'Caution', high: 'Adverse' };
  var color = riskColors[w.riskLevel] || riskColors.low;
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span class="weather-condition">' + escapeHtml(w.condition) + ' &middot; ' + w.tempCelsius + '&deg;C</span>' +
    '<span class="weather-wind">Wind ' + w.windSpeedKmh + ' km/h</span>' +
    '<span class="weather-risk" style="color:' + color + '">' + (riskLabels[w.riskLevel] || 'Good') + ' for flight</span>';
}

function showPaymentOverlay(booking) {
  hideAuthError('payment-error');
  resetCoupon();
  document.getElementById('payment-booking-id').textContent = 'IRG-' + String(booking.id).padStart(5, '0');
  updatePaymentTotals(booking.fareEstimate);
  const carbon = booking.carbonSavedKg != null ? booking.carbonSavedKg : (selectedRide ? selectedRide.co2 : null);
  document.getElementById('payment-carbon').textContent = carbon != null ? '-' + carbon + ' kg' : '\u2014';
  renderWeatherBar(booking._weather || null);
  renderFareBreakdown('payment-fare-breakdown', currentFareBreakdown);

  // Carbon credits section \u2014 always visible
  var credSec = document.getElementById('payment-credits-section');
  var credEarn = document.getElementById('payment-credits-earn');
  var cb = document.getElementById('payment-use-credits');
  if (cb) cb.checked = false;
  var balance = currentCarbonCredits ? currentCarbonCredits.balance : 0;
  var willEarn = currentCarbonCredits ? currentCarbonCredits.willEarn : 0;
  credSec.style.display = 'block';
  if (balance > 0) {
    if (cb) cb.disabled = false;
    document.getElementById('payment-credits-balance').textContent =
      balance.toLocaleString('en-IN') + ' credits (= \u20B9' + balance.toLocaleString('en-IN') + ')';
    document.getElementById('payment-credits-detail').textContent = '';
  } else {
    if (cb) cb.disabled = true;
    document.getElementById('payment-credits-balance').textContent = '0 credits';
    document.getElementById('payment-credits-detail').textContent = 'No credits to apply yet';
  }
  if (willEarn > 0) {
    credEarn.style.display = 'block';
    credEarn.innerHTML = '<span class="credits-icon">&#9733;</span> You\'ll earn <strong>' +
      willEarn + ' carbon credits</strong> from this flight';
  } else {
    credEarn.style.display = 'none';
  }

  // Fetch available coupons
  loadAvailableCoupons(booking.id);

  paymentGoToStep(1);
  document.getElementById('payment-overlay').classList.add('active');
}

// ── Payment page steps: 1 = Review & Offers, 2 = Payment method ──
function paymentGoToStep(step) {
  var onStep2 = step === 2;
  var s1 = document.getElementById('payment-step-1');
  var s2 = document.getElementById('payment-step-2');
  var title = document.getElementById('payment-step-title');
  var contBtn = document.getElementById('payment-continue-btn');
  var payBtn = document.getElementById('payment-pay-btn');
  var d1 = document.getElementById('payment-dot-1');
  var d2 = document.getElementById('payment-dot-2');
  if (s1) s1.style.display = onStep2 ? 'none' : 'block';
  if (s2) s2.style.display = onStep2 ? 'block' : 'none';
  if (title) title.textContent = onStep2 ? 'Payment' : 'Review & Offers';
  if (contBtn) contBtn.style.display = onStep2 ? 'none' : 'block';
  if (payBtn) payBtn.style.display = onStep2 ? 'block' : 'none';
  if (d1) d1.classList.toggle('on', !onStep2);
  if (d2) d2.classList.toggle('on', onStep2);
  if (onStep2) updatePaymentRecap();
  var body = onStep2 ? s2 : s1;
  if (body) body.scrollTop = 0;
}

function paymentBack() {
  var s2 = document.getElementById('payment-step-2');
  if (s2 && s2.style.display !== 'none') paymentGoToStep(1);
  else closePayment();
}

// Keep the amount in sync in all three places: step-1 header, step-2 summary,
// and the sticky footer total.
function updatePaymentTotals(total) {
  var t = '₹' + Math.round(Number(total) || 0).toLocaleString('en-IN');
  var a1 = document.getElementById('payment-amount');
  var a2 = document.getElementById('payment-amount-2');
  var f = document.getElementById('payment-footer-total');
  if (a1) a1.textContent = t;
  if (a2) a2.textContent = t;
  if (f) f.textContent = t;
}

function updatePaymentRecap() {
  var recap = document.getElementById('payment-offers-recap');
  if (!recap) return;
  var fb = currentFareBreakdown;
  var parts = [];
  if (fb && fb.discount && fb.discount.amount) {
    parts.push('New flyer &minus;₹' + Number(fb.discount.amount).toLocaleString('en-IN'));
  }
  if (fb && fb.couponApplied && fb.couponApplied.amount) {
    parts.push(escapeHtml(fb.couponApplied.label) + ' &minus;₹' + Number(fb.couponApplied.amount).toLocaleString('en-IN'));
  }
  if (fb && fb.creditsApplied && fb.creditsApplied.amount) {
    parts.push('Carbon credits &minus;₹' + Number(fb.creditsApplied.amount).toLocaleString('en-IN'));
  }
  recap.innerHTML = parts.length ? parts.join(' &middot; ') : 'No offers applied';
}

async function loadAvailableCoupons(bookingId) {
  var chips = document.getElementById('coupon-chips');
  if (!chips) return;
  chips.innerHTML = '<div style="font-size:12px;color:var(--gray-400);">Loading coupons...</div>';
  try {
    var res = await apiFetch('/api/bookings/' + bookingId + '/coupons');
    var data = await res.json().catch(function () { return {}; });
    var coupons = Array.isArray(data.coupons) ? data.coupons : [];
    if (!coupons.length) {
      chips.innerHTML = '<div style="font-size:12px;color:var(--gray-400);">No coupons available right now</div>';
      return;
    }
    chips.innerHTML = coupons.map(function (c) {
      var saveText = c.discountType === 'percent'
        ? c.discountValue + '% off' + (c.maxDiscount ? ' (max \u20B9' + c.maxDiscount.toLocaleString('en-IN') + ')' : '')
        : '\u20B9' + c.discountValue.toLocaleString('en-IN') + ' off';
      return '<button type="button" class="coupon-chip" onclick="selectCouponChip(\'' + escapeHtml(c.code) + '\')">' +
        '<div class="coupon-chip-code">' + escapeHtml(c.code) + '</div>' +
        '<div class="coupon-chip-desc">' + escapeHtml(c.description) + '</div>' +
        '<div class="coupon-chip-save">Save \u20B9' + c.discount.toLocaleString('en-IN') + ' &middot; ' + saveText + '</div>' +
      '</button>';
    }).join('');
  } catch (e) {
    chips.innerHTML = '';
  }
}

function selectCouponChip(code) {
  var input = document.getElementById('coupon-input');
  if (input) { input.value = code; }
  applyCoupon();
}

var appliedCoupon = null;

// Fetch the authoritative payment quote (coupon + credits recomputed on the
// server) and re-render the fare breakdown + amount due from it. The client
// never does its own discount math — /quote is the same computation /pay runs.
async function refreshPaymentQuote(candidateCode) {
  if (!currentBooking) return null;
  var cb = document.getElementById('payment-use-credits');
  var body = {
    couponCode: candidateCode || (appliedCoupon && appliedCoupon.code) || null,
    useCredits: !!(cb && cb.checked && !cb.disabled),
  };
  try {
    var res = await apiFetch('/api/bookings/' + currentBooking.id + '/quote', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data.fare) {
      currentFareBreakdown = data.fare;
      renderFareBreakdown('payment-fare-breakdown', data.fare);
      updatePaymentTotals(data.fare.total);
      updatePaymentRecap();
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function applyCoupon() {
  var input = document.getElementById('coupon-input');
  var msg = document.getElementById('coupon-msg');
  var btn = document.getElementById('coupon-apply-btn');
  if (!input || !currentBooking) return;
  var code = input.value.trim().toUpperCase();
  if (!code) { if (msg) msg.textContent = 'Enter a coupon code'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  var data = await refreshPaymentQuote(code);
  if (!data) {
    if (msg) msg.textContent = 'Network error — try again';
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    return;
  }
  if (data.coupon) {
    appliedCoupon = { code: data.coupon.code, discount: data.couponDiscount };
    input.value = data.coupon.code;
    input.disabled = true;
    if (btn) { btn.textContent = 'Applied'; btn.classList.add('applied'); }
    if (msg) {
      msg.innerHTML = '<span class="coupon-success">' + escapeHtml(data.coupon.code) +
        ' applied — ₹' + Number(data.couponDiscount).toLocaleString('en-IN') + ' off!</span>' +
        '<button type="button" class="coupon-remove" onclick="removeCoupon()">Remove</button>';
    }
  } else {
    appliedCoupon = null;
    if (msg) msg.innerHTML = '<span class="coupon-error">' + escapeHtml(data.couponError || 'Invalid coupon') + '</span>';
    if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
  }
}

async function removeCoupon() {
  appliedCoupon = null;
  resetCouponUI();
  await refreshPaymentQuote();
}

function resetCouponUI() {
  var input = document.getElementById('coupon-input');
  var msg = document.getElementById('coupon-msg');
  var btn = document.getElementById('coupon-apply-btn');
  if (input) { input.value = ''; input.disabled = false; }
  if (msg) msg.textContent = '';
  if (btn) { btn.disabled = false; btn.textContent = 'Apply'; btn.classList.remove('applied'); }
}

function resetCoupon() {
  appliedCoupon = null;
  resetCouponUI();
}

async function toggleCredits() {
  var cb = document.getElementById('payment-use-credits');
  var detail = document.getElementById('payment-credits-detail');
  if (!cb) return;
  var data = await refreshPaymentQuote();
  if (!detail) return;
  if (cb.checked && data && data.creditsUsed > 0) {
    detail.innerHTML = 'Applying <strong>' + Number(data.creditsUsed).toLocaleString('en-IN') +
      ' credits (\u20B9' + Number(data.creditsUsed).toLocaleString('en-IN') + ' off)</strong> &middot; max 50% of fare';
  } else if (cb.checked) {
    detail.textContent = 'No credits available to apply';
  } else {
    detail.textContent = '';
  }
}

function closePayment() {
  document.getElementById('payment-overlay').classList.remove('active');
}

// Realistic pickup ETA (minutes) for the "aircraft dispatched" message, based
// on the assigned pilot's distance to the pickup. Matches the live-GPS ETA
// formula so the number is consistent as the plane flies in.
function estimatePickupMinutes(operator) {
  var distKm = 4.5;
  if (operator && operator.gpsLat != null && pickupCoord) {
    distKm = haversineKmClient(operator.gpsLat, operator.gpsLng, pickupCoord[0], pickupCoord[1]);
  }
  return Math.max(6, Math.min(14, Math.round(distKm * 2)));
}

async function payForBooking() {
  if (!currentBooking) return;
  hideAuthError('payment-error');
  setBusy('payment-pay-btn', true, 'Processing\u2026', 'Pay now');
  try {
    var useCredits = document.getElementById('payment-use-credits');
    var payData = {};
    if (useCredits && useCredits.checked) payData.useCredits = true;
    if (appliedCoupon && appliedCoupon.code) payData.couponCode = appliedCoupon.code;
    var payBody = Object.keys(payData).length ? JSON.stringify(payData) : undefined;
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/pay', { method: 'POST', body: payBody });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      showAuthError('payment-error', data.error || 'Payment failed. Please try again.');
      return;
    }
    currentBooking = data.booking;
    currentFareBreakdown = data.fare || currentFareBreakdown;
    closePayment();
    startTracking();
    // The server auto-assigned ONE demo pilot (demo mode). Draw that single
    // plane at its spawn point; the live ride stream animates it in.
    if (data.operator) {
      showPilotCard(data.operator, null, null);
      if (data.operator.gpsLat != null) {
        showAssignedPlane(data.operator.gpsLat, data.operator.gpsLng, data.operator.name);
      }
    }
    // Show a clear "aircraft dispatched — arriving in ~X min" state immediately,
    // instead of the vague "searching for a pilot" placeholder.
    var pickupEtaMin = estimatePickupMinutes(data.operator);
    var statusEl = document.getElementById('tracking-status');
    var subEl = document.getElementById('tracking-sub');
    var etaEl = document.getElementById('tracking-eta');
    if (statusEl) statusEl.textContent = 'Aircraft dispatched!';
    if (subEl) subEl.textContent = 'Your pilot is on the way — arriving in about ' + pickupEtaMin + ' min';
    if (etaEl) etaEl.textContent = pickupEtaMin;
    showToast('Aircraft dispatched! Arriving in ~' + pickupEtaMin + ' min', 'success');
  } catch (e) {
    showAuthError('payment-error', 'Network error — please try again.');
  } finally {
    setBusy('payment-pay-btn', false, 'Processing\u2026', 'Pay now');
  }
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('active');
  resetBooking();
}

function renderCarbonComparison(cc) {
  if (!cc || !cc.comparisons) return '';
  var evKg = cc.electric.emissionsKg;
  var maxKg = Math.max.apply(null, cc.comparisons.map(function(c) { return c.emissionsKg; }));
  var barMax = maxKg || 1;

  var rows = cc.comparisons.map(function(c) {
    var pct = Math.round((c.emissionsKg / barMax) * 100);
    var colorMap = { conventionalJet: '#ef4444', turboprop: '#f59e0b', groundTaxi: '#6b7280' };
    var color = colorMap[c.key] || '#6b7280';
    return '<div class="cc-row">' +
      '<div class="cc-label">' + escapeHtml(c.label) + '</div>' +
      '<div class="cc-bar-track"><div class="cc-bar" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="cc-val">' + c.emissionsKg + ' kg</div>' +
      '<div class="cc-saved">-' + c.savedPercent + '%</div>' +
    '</div>';
  });

  var evPct = Math.max(3, Math.round((evKg / barMax) * 100));
  var evRow = '<div class="cc-row cc-row-ev">' +
    '<div class="cc-label">' + escapeHtml(cc.electric.label) + '</div>' +
    '<div class="cc-bar-track"><div class="cc-bar cc-bar-ev" style="width:' + evPct + '%"></div></div>' +
    '<div class="cc-val cc-val-ev">' + evKg + ' kg</div>' +
    '<div class="cc-saved cc-saved-ev">Your choice</div>' +
  '</div>';

  var bestSaving = cc.comparisons.reduce(function(best, c) {
    return c.savedPercent > best.savedPercent ? c : best;
  }, cc.comparisons[0]);

  return '<div class="carbon-comparison-card">' +
    '<div class="cc-header">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><circle cx="12" cy="10" r="3"/></svg>' +
      '<div>' +
        '<div class="cc-title">Carbon Savings Comparison</div>' +
        '<div class="cc-subtitle">CO&#8322; emissions for ' + cc.distanceKm + ' km flight</div>' +
      '</div>' +
    '</div>' +
    '<div class="cc-body">' +
      rows.join('') +
      '<div class="cc-divider"></div>' +
      evRow +
    '</div>' +
    '<div class="cc-footer">' +
      '<span class="cc-highlight">Up to ' + bestSaving.savedPercent + '% less CO&#8322;</span> vs ' + escapeHtml(bestSaving.label) +
    '</div>' +
  '</div>';
}

function resetBooking() {
  document.getElementById('rides-area').style.display = 'none';
  document.getElementById('book-btn').style.display = 'none';
  document.getElementById('booking-panel').style.display = 'flex';
  hideAuthError('booking-error');
  selectedRide = null;
  currentBooking = null;
  currentRoute = null;
  currentDiscount = null;
  currentCarbonComparison = null;
  currentCarbonCredits = null;
  pickupCoord = null;
  destCoord = null;
  bookingDraft = { pickup: null, dest: null, service: currentService, distanceKm: null };
  document.getElementById('pickup-input').value = '';
  document.getElementById('dest-input').value = '';
  document.getElementById('pickup-input').classList.remove('has-value');
  document.getElementById('dest-input').classList.remove('has-value');
  if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
  if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  aircraftMarkers.forEach(m => map.removeLayer(m));
  aircraftMarkers = [];
  stopDemoTaxiDrift();
  clearAnimatedMarkersByPrefix('real-', map);
  clearAnimatedMarkersByPrefix('track-operator', map);
  map.setView([28.6139, 77.2090], 12);
}



// ===== 07-tracking.js =====

// IraGo app — 07-tracking.js
// (extracted from app.html; part of the concatenated app.bundle.js)

// ── Live Tracking ──
// The status STEPS reflect the REAL persisted booking status, polled from
// GET /api/bookings/:id (the operator advances it via US-010/US-011). The
// aircraft POSITION + ETA on the map are a MOCK/placeholder animation \u2014
// TO BE REPLACED with real GPS telemetry from the aircraft.
let trackingPollInterval = null;   // polls the persisted booking status
let trackingAnimInterval = null;   // mock aircraft animation (placeholder)
let trackPathPoints = [];
let trackCurrentFrac = 0;          // mock marker position along the route (0..1)
let trackTargetFrac = 0;           // position implied by the current status
let trackAircraft = null;
let trackOperatorGps = { lat: null, lng: null };

// ── Smooth map markers (lerp — no jumps) ──
function offsetKm(lat, lng, km, bearingDeg) {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const d = km / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

function startMarkerAnimationLoop() {
  if (markerAnimFrameId != null) return;
  function tick() {
    animatedMarkers.forEach(function (entry) {
      entry.cur[0] += (entry.tgt[0] - entry.cur[0]) * 0.14;
      entry.cur[1] += (entry.tgt[1] - entry.cur[1]) * 0.14;
      entry.layer.setLatLng(entry.cur);
    });
    markerAnimFrameId = requestAnimationFrame(tick);
  }
  markerAnimFrameId = requestAnimationFrame(tick);
}

function setAnimatedMapMarker(key, targetMap, lat, lng, iconHtml, popupHtml) {
  if (!targetMap) return;
  let entry = animatedMarkers.get(key);
  if (!entry) {
    const icon = L.divIcon({
      html: iconHtml,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const layer = L.marker([lat, lng], { icon: icon, zIndexOffset: 500 });
    layer.addTo(targetMap);
    if (popupHtml) layer.bindPopup(popupHtml);
    entry = { layer: layer, cur: [lat, lng], tgt: [lat, lng], map: targetMap };
    animatedMarkers.set(key, entry);
    startMarkerAnimationLoop();
  } else {
    entry.tgt = [lat, lng];
  }
}

function removeAnimatedMapMarker(key) {
  const entry = animatedMarkers.get(key);
  if (!entry) return;
  entry.map.removeLayer(entry.layer);
  animatedMarkers.delete(key);
}

function clearAnimatedMarkersByPrefix(prefix, targetMap) {
  const keys = [];
  animatedMarkers.forEach(function (_v, k) {
    if (k.indexOf(prefix) === 0) keys.push(k);
  });
  keys.forEach(function (k) {
    const entry = animatedMarkers.get(k);
    if (!targetMap || entry.map === targetMap) removeAnimatedMapMarker(k);
  });
}

// Static "parked" demo planes sit AT real vertiports near the pickup. Using
// the known vertiport coordinates (all verified clear of no-fly zones) means a
// plane is NEVER drawn inside a red restricted zone — unlike the old version,
// which placed planes on blind 5/10 km rings that sometimes landed in IGI's
// no-fly circle. They don't drift; they're stable scenery.
function buildDemoTaxisAroundPickup(lat, lng) {
  const MAX_KM = 60; // only show vertiports within ~60 km of the pickup
  const MAX_PLANES = 6;
  const ports = Object.keys(demoLocations).map(function (name) {
    const c = demoLocations[name];
    return { name: name, lat: c[0], lng: c[1], distanceKm: haversineKmClient(lat, lng, c[0], c[1]) };
  });
  return ports
    .filter(function (p) { return p.distanceKm > 0.5 && p.distanceKm <= MAX_KM; })
    .sort(function (a, b) { return a.distanceKm - b.distanceKm; })
    .slice(0, MAX_PLANES)
    .map(function (p, i) { return { id: i, lat: p.lat, lng: p.lng, name: p.name, distanceKm: Math.round(p.distanceKm) }; });
}

function renderDemoTaxisOnMap() {
  if (!map || !pickupCoord) return;
  clearAnimatedMarkersByPrefix('demo-', map);
  demoTaxiMeta = buildDemoTaxisAroundPickup(pickupCoord[0], pickupCoord[1]);
  demoTaxiMeta.forEach(function (tx) {
    setAnimatedMapMarker(
      'demo-' + tx.id,
      map,
      tx.lat,
      tx.lng,
      '<div class="nearby-taxi-marker" title="Parked air taxi">✈️</div>',
      '<b>' + escapeHtml(tx.name) + '</b><br>Available · ~' + tx.distanceKm + ' km away<br><span style="color:#64748B;font-size:11px">Parked at vertiport</span>'
    );
  });
}

// Parked planes are static scenery — no drift. Kept as a no-op so the existing
// start/stop call sites still work without change.
function startDemoTaxiDrift() { /* parked planes do not move */ }

function stopDemoTaxiDrift() {
  if (demoTaxiAnimInterval) {
    clearInterval(demoTaxiAnimInterval);
    demoTaxiAnimInterval = null;
  }
  clearAnimatedMarkersByPrefix('demo-', map);
  demoTaxiMeta = [];
}

// Persisted booking status -> tracking step index (0=confirmed .. 4=arrived)
// plus the customer-facing copy. The DB statuses requested/assigned/accepted
// all map to the "Confirmed" step (a pilot isn't yet en route).
const STATUS_DISPLAY = {
  requested: { step: 0, status: 'Assigning an air taxi...', sub: 'Complete payment to find your pilot' },
  dispatching: { step: 0, status: 'Assigning an air taxi...', sub: 'Searching for the nearest available pilot' },
  assigned:  { step: 0, status: 'Pilot found!', sub: 'Your pilot is preparing for departure' },
  accepted:  { step: 1, status: 'Pilot confirmed', sub: 'Your pilot is getting ready' },
  enroute:   { step: 1, status: 'Pilot en route', sub: 'Your aircraft is on its way to pick you up' },
  at_pickup: { step: 2, status: 'Pilot at pickup', sub: 'Share your OTP with the pilot to start ride' },
  picked_up: { step: 2, status: 'Ride started', sub: 'OTP verified — ride in progress' },
  flying:    { step: 3, status: 'In flight', sub: 'Enjoy the view! Flying to destination' },
  arrived:   { step: 4, status: 'Arriving now', sub: 'Prepare for landing' },
  completed: { step: 4, status: 'Ride complete!', sub: 'Thank you for flying with IraGo' },
  no_pilot:  { step: 0, status: 'Sorry — no pilot found', sub: 'Sorry, we couldn\u2019t find a pilot nearby. Please try again shortly.' },
  rejected:  { step: 0, status: 'Reassigning...', sub: 'Finding you another pilot' },
  cancelled: { step: 0, status: 'Booking cancelled', sub: 'This trip has been cancelled' },
};
// Statuses at which the customer view stops polling.
const TRACKING_TERMINAL = ['arrived', 'completed', 'cancelled', 'rejected', 'no_pilot'];

// Show/hide the empty state vs. the live tracking content.
function showTrackingEmpty(show) {
  document.getElementById('tracking-empty').style.display = show ? 'block' : 'none';
  document.getElementById('tracking-content').style.display = show ? 'none' : 'block';
}

// Fit the map to the whole pickup→dest trip (prefer the drawn route line if
// present). Marked as a programmatic move so it doesn't trigger the manual-pan
// auto-follow pause.
function fitRouteBounds() {
  if (!map) return;
  let bounds = null;
  if (routeLine && routeLine.getBounds) bounds = routeLine.getBounds();
  else if (pickupCoord && destCoord) bounds = L.latLngBounds([pickupCoord, destCoord]);
  if (!bounds || !bounds.isValid()) return;
  programmaticMapMove = true;
  map.fitBounds(bounds.pad(0.3));
  programmaticMapMove = false;
}

async function restoreActiveBooking() {
  try {
    var res = await apiFetch('/api/bookings/active');
    if (!res.ok) return;
    var data = await res.json();
    if (!data.booking) return;
    currentBooking = data.booking;
    pickupCoord = [data.booking.pickupLat, data.booking.pickupLng];
    destCoord = [data.booking.destLat, data.booking.destLng];
    if (data.company) currentBooking._company = data.company;
    if (map) {
      // Clear any markers already on the map so a refresh never double-draws.
      if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
      if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (pickupCoord) {
        pickupMarker = createMarker(pickupCoord, 'pickup').addTo(map);
      }
      if (destCoord) {
        destMarker = createMarker(destCoord, 'dest').addTo(map);
      }
      if (pickupCoord && destCoord) {
        routeLine = L.polyline([pickupCoord, destCoord], { color: '#1E3A5F', weight: 3, dashArray: '8 4' }).addTo(map);
      }
    }
    startTracking();
    if (data.operator) {
      showPilotCard(data.operator, data.company, data.company ? data.company.officeCity : null);
      if (data.operator.gpsLat != null) {
        showAssignedPlane(data.operator.gpsLat, data.operator.gpsLng, data.operator.name);
      }
    }
    // Belt-and-suspenders for reload: the demo's GPS pushes only reach NEW
    // subscribers via SSE, so a freshly-restored page could sit frozen until the
    // next push. Poll the pilot GPS immediately and then every 2s until the
    // first live GPS arrives, so the plane never appears stuck after a reload.
    pollOperatorGpsForRide();
    var warmup = setInterval(function () {
      if (!currentBooking || TRACKING_TERMINAL.includes(currentBooking.status) ||
          trackOperatorGps.lat != null) { clearInterval(warmup); return; }
      pollOperatorGpsForRide();
    }, 2000);
    setTimeout(function () { clearInterval(warmup); }, 30000);
  } catch (e) {
    // Not just "no active booking" — a throw inside (e.g. in startTracking) used
    // to be silently swallowed here, hiding the real cause of a frozen ride.
    console.error('[restoreActiveBooking] threw:', e);
  }
}

function startTracking() {
  // Tear down any previous ride's timers/stream/GPS state first. Without this,
  // entering tracking a second time (refresh-restore, retry, next booking)
  // leaked the old setInterval handles and left trackOperatorGps stale — which
  // froze the mock plane + ETA for the new ride until its first GPS arrived.
  stopTrackingPolling();
  trackOperatorGps = { lat: null, lng: null };

  document.getElementById('confirm-overlay').classList.remove('active');
  document.getElementById('booking-panel').style.display = 'none';
  document.getElementById('tracking-panel').classList.add('active');

  // The booking->tracking layout change resizes the map container. Recompute
  // Leaflet's size so the route/plane aren't placed against a stale width
  // (which made the map look frozen/blank after payment).
  if (map) {
    map.invalidateSize(false);
    setTimeout(function () { if (map) map.invalidateSize(false); }, 120);
    setTimeout(function () { if (map) map.invalidateSize(false); }, 450);
  }

  // Empty state when there's no active booking to track.
  if (!currentBooking) {
    showTrackingEmpty(true);
    return;
  }
  showTrackingEmpty(false);

  // Fill static trip info from the SAVED booking.
  document.getElementById('tracking-pickup').textContent = currentBooking.pickupName;
  document.getElementById('tracking-dest').textContent = currentBooking.destName;
  document.getElementById('tracking-vehicle-name').textContent =
    selectedRide ? selectedRide.name : (SERVICE_LABELS[currentBooking.service] || currentBooking.service);
  document.getElementById('tracking-cost').textContent =
    '\u20B9' + Math.round(currentBooking.fareEstimate).toLocaleString('en-IN');
  const distKm = currentBooking.distanceKm != null ? currentBooking.distanceKm : calcDistance();
  document.getElementById('tracking-dist').textContent = Math.round(distKm) + ' km';
  document.getElementById('tracking-carbon').textContent =
    currentBooking.carbonSavedKg != null
      ? '-' + currentBooking.carbonSavedKg + ' kg CO\u2082'
      : (selectedRide ? '-' + selectedRide.co2 + ' kg CO\u2082' : '\u2014');

  if (currentBooking._company) {
    var subEl = document.getElementById('tracking-sub');
    if (subEl) subEl.textContent = 'Request sent to ' + currentBooking._company.name + (currentBooking._company.officeCity ? ' — ' + currentBooking._company.officeCity + ' Regional Office' : '');
  }

  // Map/route/marker setup. Wrapped so a throw here cannot abort the ride
  // stream subscription — previously a throw was silently swallowed by
  // restoreActiveBooking's try/catch, leaving WS: idle and the ride frozen
  // with no error banner. The stream + polling below ALWAYS run.
  try {
    fitRouteBounds();
    // Re-frame once the post-payment layout has settled. The booking→tracking
    // switch hides the 420px panel so #map grows; if Leaflet still held a stale
    // size when fitRouteBounds ran above, the route/plane landed in the blank
    // zone and the ride looked frozen. Re-fitting after the delayed
    // invalidateSize calls settle frames the route against the real width.
    setTimeout(fitRouteBounds, 160);
    setTimeout(fitRouteBounds, 480);

    // Clean up any leftover markers from a previous ride.
    if (map) aircraftMarkers.forEach(m => map.removeLayer(m));
    aircraftMarkers = [];
    trackAircraft = null;
    clearAnimatedMarkersByPrefix('track-operator', map);

    // Render the status we already have.
    applyTrackingStatus(currentBooking.status);
    // Uber-style: stop showing the nearby fleet — the passenger now tracks only
    // their plane.
    stopNearbyTaxisPoll();
    stopDemoTaxiDrift();
    clearAnimatedMarkersByPrefix('demo-', map);
    clearAnimatedMarkersByPrefix('real-', map);
  } catch (setupErr) {
    console.error('[startTracking] setup threw:', setupErr);
  }

  // Subscribe to the live ride stream (status + pilot GPS) — ALWAYS, even if the
  // map setup above threw, so the plane still moves and the ride isn't frozen.
  rideFollowOn = true;
  connectRideStream(currentBooking.id);
  // Keep a slow fallback poll in case the WebSocket drops silently.
  if (!TRACKING_TERMINAL.includes(currentBooking.status)) {
    trackingPollInterval = setInterval(function () {
      pollBookingStatus();
      pollOperatorGpsForRide();
    }, 8000);
  }
  pollOperatorGpsForRide();

  // The real GPS-driven track-operator marker (via showAssignedPlane) is the
  // only plane shown. No mock animation interval needed.
}

// Reflect a persisted booking status onto the step UI + progress bar.
function applyTrackingStatus(status) {
  const info = STATUS_DISPLAY[status] || STATUS_DISPLAY.requested;
  document.getElementById('tracking-status').textContent = info.status;
  document.getElementById('tracking-sub').textContent = info.sub;

  const allSteps = document.querySelectorAll('.tracking-step');
  const done = status === 'arrived' || status === 'completed';
  allSteps.forEach((s, idx) => {
    s.classList.remove('done', 'active');
    if (idx < info.step) s.classList.add('done');
    else if (idx === info.step) s.classList.add(done ? 'done' : 'active');
  });

  const span = Math.max(1, allSteps.length - 1);
  document.getElementById('tracking-progress-bar').style.width = ((info.step / span) * 100) + '%';
  document.getElementById('tracking-dot').style.background =
    done ? '#22C55E' : (status === 'cancelled' || status === 'rejected' ? '#EF4444' : '');

  // Drive the MOCK aircraft toward the status-implied position along the
  // pickup→dest path. Skip entirely once REAL pilot GPS is driving the marker
  // — otherwise this yanks the assigned plane toward the destination and
  // fights the live ride_gps updates (the plane appeared at the wrong end).
  trackTargetFrac = info.step / span;
  if (trackOperatorGps.lat == null && trackPathPoints.length >= 2 && trackAircraft) {
    var ptIdx = Math.min(Math.round(trackTargetFrac * (trackPathPoints.length - 1)), trackPathPoints.length - 1);
    var pt = trackPathPoints[ptIdx];
    if (pt) trackAircraft.setLatLng(pt);
  }
  // Only set a mock ETA when there's no live GPS — handleRideGps owns the ETA
  // once the real pilot is reporting distance.
  if (trackOperatorGps.lat == null) {
    var nominalTotal = selectedRide ? selectedRide.time : 20;
    var remaining = Math.max(0, 1 - trackTargetFrac);
    document.getElementById('tracking-eta').textContent = done ? '0' : Math.max(1, Math.round(nominalTotal * remaining));
  } else if (done) {
    document.getElementById('tracking-eta').textContent = '0';
  }

  // Show the "search again" button only when dispatch gave up with no pilot.
  const retryBtn = document.getElementById('tracking-retry-btn');
  if (retryBtn) retryBtn.style.display = (status === 'no_pilot') ? 'block' : 'none';

  var otpCard = document.getElementById('tracking-otp-card');
  if (otpCard) {
    if (['enroute', 'at_pickup'].includes(status)) {
      fetchAndShowRideOtp();
    } else if (['flying', 'arrived', 'completed'].includes(status)) {
      otpCard.style.display = 'none';
    }
  }

  const cancelBtn = document.getElementById('tracking-cancel-btn');
  const endBtn = document.getElementById('tracking-end-btn');
  const terminal = ['completed', 'cancelled', 'no_pilot', 'rejected', 'arrived'].includes(status);
  // Cancellable until the passenger boards. at_pickup (pilot arrived, not yet
  // boarded) is still cancellable; once picked_up/flying it is not.
  const cancellable = !terminal && !['flying', 'picked_up'].includes(status);
  if (cancelBtn) {
    cancelBtn.style.display = cancellable ? 'inline-block' : 'none';
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel ride';
  }
  if (endBtn) {
    endBtn.style.display = terminal ? 'inline-block' : 'none';
  }

  // Rating prompt appears once the ride completes. The customer rates the
  // operator (1–5 + optional comment); the operator rates the customer on
  // their own console.
  const rateBox = document.getElementById('tracking-rate');
  if (rateBox) {
    if (status === 'completed') {
      rateBox.style.display = 'block';
      selectedRatingStars = 0;
      document.querySelectorAll('#tracking-rate-stars button').forEach(b => b.classList.remove('on'));
      const comment = document.getElementById('tracking-rate-comment');
      if (comment) comment.value = '';
      setTimeout(function () { rateBox.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 300);
    } else {
      rateBox.style.display = 'none';
    }
  }
}

// Poll the persisted booking status and re-render. Keeps the last known status
// on a transient error rather than blanking the view.
async function pollBookingStatus() {
  if (!currentBooking) return;
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (!data.booking) return;
    currentBooking = data.booking;
    applyTrackingStatus(currentBooking.status);
    pollOperatorGpsForRide();
    if (TRACKING_TERMINAL.includes(currentBooking.status)) stopTrackingPolling();
  } catch (err) {
    /* transient network error \u2014 keep showing the last known status */
  }
}

// MOCK aircraft animation \u2014 placeholder for real GPS. Eases the marker toward
// the position implied by the booking status and shows a nominal ETA.
function animateTrackingAircraft() {
  if (trackOperatorGps.lat != null) return;
  if (!trackAircraft || trackPathPoints.length < 2) return;
  trackCurrentFrac += (trackTargetFrac - trackCurrentFrac) * 0.08;
  const idx = Math.min(Math.round(trackCurrentFrac * (trackPathPoints.length - 1)), trackPathPoints.length - 1);
  trackAircraft.setLatLng(trackPathPoints[idx]);

  const nominalTotal = selectedRide ? selectedRide.time : 20; // minutes (mock)
  const remaining = Math.max(0, 1 - trackCurrentFrac);
  document.getElementById('tracking-eta').textContent = Math.round(nominalTotal * remaining);
}

// ── Uber-style customer ride stream (SSE) ────────────────────────────────
// After the passenger confirms + pays, we stop showing the nearby fleet and
// subscribe to this booking's ride stream. The server pushes ride_state (the
// current snapshot), ride_update (status changes), and ride_gps (the assigned
// pilot's live position). The passenger sees ONLY their plane — like Uber's
// "track your driver".
let rideStream = null;          // WebSocket to /ws/ride (null when closed)
let rideFollowOn = false;
let rideStreamBookingId = null;
let rideStreamReconnectTimer = null;
let rideStreamClosedByUs = false;

// ── DEBUG: live ride-stream badge (temporary — pinpoints the freeze) ──
function disconnectRideStream() {
  rideStreamClosedByUs = true;
  if (rideStreamReconnectTimer) {
    clearTimeout(rideStreamReconnectTimer);
    rideStreamReconnectTimer = null;
  }
  if (rideStream) {
    try { rideStream.close(); } catch (e) { /* ignore */ }
    rideStream = null;
  }
}

function connectRideStream(bookingId) {
  if (!bookingId) return;
  disconnectRideStream();
  rideStreamClosedByUs = false;
  rideStreamBookingId = bookingId;
  openRideStream();
}

// Open the /ws/ride WebSocket. Auth is via the JWT in the
// `irago.customer.<token>` subprotocol (falls back to the session cookie the
// browser sends on the WS handshake). After auth_ok the client sends the
// bookingId it wants to track; the server validates ownership and pushes the
// initial ride_state, then ride_update / ride_gps / ride_path events.
function openRideStream() {
  if (!rideStreamBookingId) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = proto + '//' + location.host + '/ws/ride';
  const token = AUTH.token;
  const protocols = token ? ['irago.customer.' + token] : undefined;
  let ws;
  try {
    ws = new WebSocket(url, protocols);
  } catch (e) {
    scheduleRideStreamReconnect();
    return;
  }
  rideStream = ws;

  ws.onopen = function () {
    try { ws.send(JSON.stringify({ bookingId: rideStreamBookingId })); } catch (e) { /* ignore */ }
  };

  ws.onmessage = function (ev) {
    let d;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || !d.type) return;
    switch (d.type) {
      case 'ride_state':
        handleRideState(d);
        break;
      case 'ride_update':
        handleRideUpdate(d);
        break;
      case 'ride_gps':
        if (d.lat != null && d.lng != null) handleRideGps(d);
        break;
      case 'ride_path':
        handleRidePath(d);
        break;
      case 'dispatch_progress':
        handleDispatchProgress(d);
        break;
    }
  };

  ws.onclose = function () {
    // WebSocket doesn't auto-reconnect, so reconnect ourselves unless we closed
    // it on purpose. The 8s fallback poll also keeps status fresh if it stays down.
    if (!rideStreamClosedByUs) scheduleRideStreamReconnect();
  };

  ws.onerror = function () { /* onclose handles reconnect */ };
}

function scheduleRideStreamReconnect() {
  if (rideStreamClosedByUs) return;
  if (rideStreamReconnectTimer) return;
  rideStreamReconnectTimer = setTimeout(function () {
    rideStreamReconnectTimer = null;
    if (!rideStreamClosedByUs && rideStreamBookingId) openRideStream();
  }, 2000);
}

// ride_update handler — extracted so the WebSocket message path reuses it.
function handleRideUpdate(d) {
  if (d.status) {
    if (currentBooking) { currentBooking.status = d.status; }
    applyTrackingStatus(d.status);
    if (TRACKING_TERMINAL.includes(d.status)) {
      stopTrackingPolling();
      // Ride over — zoom back out to the whole trip so the map isn't left
      // parked wherever the plane stopped.
      fitRouteBounds();
    }
  }
  if (d.pilot) {
    showPilotCard(d.pilot, d.company, d.officeCity);
    // Draw the plane at the pilot's spawn point (~4.5 km out) the moment it
    // is assigned, so the passenger sees it BEFORE it starts flying in.
    if (d.pilot.lat != null && d.pilot.lng != null && trackOperatorGps.lat == null) {
      showAssignedPlane(d.pilot.lat, d.pilot.lng, d.pilot.name);
    }
  }
  if (d.estimatedPickupMin) {
    document.getElementById('tracking-eta').textContent = d.estimatedPickupMin;
  }
  if (d.status === 'assigned' || d.status === 'accepted' || d.status === 'enroute') {
    fetchAndShowRideOtp();
    pollOperatorGpsForRide();
  }
  if (d.status === 'picked_up') {
    document.getElementById('tracking-otp-card').style.display = 'none';
  }
}

// ride_path handler — redraw the route line as the curved no-fly-avoiding path.
function handleRidePath(d) {
  if (Array.isArray(d.waypoints) && d.waypoints.length >= 2 && map) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    routeLine = L.polyline(d.waypoints, { color: '#1E3A5F', weight: 3, dashArray: '8 4' }).addTo(map);
  }
}

// Initial snapshot from the server: set status + draw the assigned plane if any.
function handleRideState(d) {
  if (d.status) {
    if (currentBooking) { currentBooking.status = d.status; }
    applyTrackingStatus(d.status);
  }
  if (d.operator && d.operator.lat != null) {
    showAssignedPlane(d.operator.lat, d.operator.lng, d.operator.name);
  }
}

// Live GPS from the assigned pilot — move the plane marker + update ETA.
function handleRideGps(d) {
  trackOperatorGps = { lat: d.lat, lng: d.lng };
  showAssignedPlane(d.lat, d.lng);
  if (d.distanceKm != null) {
    // Same factor as estimatePickupMinutes (150 km/h = 2.5 km/min) so the ETA
    // stays consistent with the "arriving in ~X min" dispatch message.
    document.getElementById('tracking-eta').textContent = Math.max(1, Math.round(d.distanceKm / 2.5));
  }
  // Auto-follow the plane — but not while the user is manually exploring the
  // map. Resume 30s after their last pan/zoom.
  if (rideFollowOn && map && (Date.now() - userMovedMapAt > RIDE_FOLLOW_RESUME_MS)) {
    programmaticMapMove = true;
    map.panTo([d.lat, d.lng]);
    programmaticMapMove = false;
  }
}

function showPilotCard(pilot, company, officeCity) {
  var card = document.getElementById('tracking-pilot-card');
  if (!card || !pilot) return;
  card.style.display = 'flex';
  var avatar = document.getElementById('tracking-pilot-avatar');
  if (avatar) avatar.textContent = (pilot.name || 'P').charAt(0).toUpperCase();
  var nameEl = document.getElementById('tracking-pilot-name');
  if (nameEl) nameEl.textContent = pilot.name || 'Your Pilot';
  var metaEl = document.getElementById('tracking-pilot-meta');
  var parts = [];
  if (pilot.aircraftType) parts.push(pilot.aircraftType);
  if (pilot.aircraftReg) parts.push(pilot.aircraftReg);
  if (pilot.license) parts.push(pilot.license);
  if (metaEl) metaEl.textContent = parts.length ? parts.join(' · ') : '';
  var compEl = document.getElementById('tracking-pilot-company');
  var compParts = [];
  if (pilot.companyName) compParts.push(pilot.companyName);
  else if (company && company.name) compParts.push(company.name);
  if (officeCity) compParts.push(officeCity + ' Regional Office');
  if (pilot.flightHours) compParts.push(pilot.flightHours + ' flight hrs');
  if (pilot.rating) compParts.push('★ ' + pilot.rating);
  if (compEl) compEl.textContent = compParts.length ? compParts.join(' · ') : '';
  var vn = document.getElementById('tracking-vehicle-name');
  var vnParts = [];
  if (pilot.aircraftType) vnParts.push(pilot.aircraftType);
  if (pilot.aircraftReg) vnParts.push(pilot.aircraftReg);
  if (vn) vn.textContent = vnParts.length ? vnParts.join(' · ') : (pilot.aircraftType || 'eVTOL Air Taxi');
}

async function fetchAndShowRideOtp() {
  if (!currentBooking || !currentBooking.id) return;
  try {
    var res = await apiFetch('/api/bookings/' + currentBooking.id + '/ride-otp');
    if (!res.ok) return;
    var data = await res.json();
    if (data.rideOtp) {
      document.getElementById('tracking-otp-card').style.display = '';
      document.getElementById('tracking-otp-code').textContent = data.rideOtp;
    }
  } catch (e) { /* OTP not yet available */ }
}

// Dispatch progress: shows the passenger which operator we're currently
// waiting on ("Waiting for operator 1 of 10…") or the final "sorry" message
// when no pilot could be found. Updates the tracking sub-text live without
// changing the persisted status step.
function handleDispatchProgress(d) {
  if (!d || !d.message) return;
  const subEl = document.getElementById('tracking-sub');
  if (subEl) subEl.textContent = d.message;
  if (d.final) {
    const statusEl = document.getElementById('tracking-status');
    if (statusEl) statusEl.textContent = 'Sorry — no pilot found';
  }
}

// Customer-initiated retry when dispatch gave up (status === 'no_pilot').
// Re-enters the nearest-pilot search via POST /api/bookings/:id/retry-dispatch.
async function retryDispatch() {
  if (!currentBooking || !currentBooking.id) return;
  const btn = document.getElementById('tracking-retry-btn');
  if (btn) { btn.disabled = true; }
  const subEl = document.getElementById('tracking-sub');
  if (subEl) subEl.textContent = 'Searching for a nearby pilot again…';
  try {
    const res = await apiFetch('/api/bookings/' + currentBooking.id + '/retry-dispatch', {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.booking) {
      currentBooking = data.booking;
      applyTrackingStatus(currentBooking.status);
      if (!rideStream) connectRideStream(currentBooking.id);
      // Restart the fallback poll: stopTrackingPolling() ran when we hit
      // no_pilot, so without this a silent SSE drop after retry would leave the
      // ride frozen with no recovery.
      if (!trackingPollInterval && !TRACKING_TERMINAL.includes(currentBooking.status)) {
        trackingPollInterval = setInterval(function () {
          pollBookingStatus();
          pollOperatorGpsForRide();
        }, 8000);
      }
    } else {
      if (subEl) subEl.textContent = (data && data.error) ? data.error : 'Could not retry right now. Please try again shortly.';
    }
  } catch (e) {
    if (subEl) subEl.textContent = 'Network error — please try again shortly.';
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// Render the ONE plane the passenger is allowed to see (Uber-style). Removes
// the fleet/nearby markers and the mock aircraft, replacing them with the
// assigned plane's live position.
function showAssignedPlane(lat, lng, name) {
  if (!map) return;
  // Drop any fleet markers — the passenger now tracks only their plane.
  stopNearbyTaxisPoll();
  stopDemoTaxiDrift();
  clearAnimatedMarkersByPrefix('demo-', map);
  clearAnimatedMarkersByPrefix('real-', map);
  // Remove ALL static aircraft markers (route-preview planes, mock, etc.).
  aircraftMarkers.forEach(m => { try { map.removeLayer(m); } catch (_) {} });
  aircraftMarkers = [];
  trackAircraft = null;
  const label = name != null ? escapeHtml(name) : 'Your pilot';
  setAnimatedMapMarker(
    'track-operator',
    map,
    lat,
    lng,
    '<div class="marker-aircraft" style="font-size:30px;">&#9992;&#65039;</div>',
    '<b>' + label + '</b><br>Live GPS &middot; your air taxi'
  );
  if (name) {
    const vn = document.getElementById('tracking-vehicle-name');
    if (vn && vn.textContent === '\u2014') vn.textContent = 'eVTOL Air Taxi';
  }
}

function stopTrackingPolling() {
  if (trackingPollInterval) { clearInterval(trackingPollInterval); trackingPollInterval = null; }
  if (trackingAnimInterval) { clearInterval(trackingAnimInterval); trackingAnimInterval = null; }
  rideFollowOn = false;
  disconnectRideStream();
}

function endTracking() {
  stopTrackingPolling();
  trackAircraft = null;
  trackOperatorGps = { lat: null, lng: null };
  clearAnimatedMarkersByPrefix('track-operator', map);
  document.getElementById('tracking-panel').classList.remove('active');
  document.getElementById('booking-panel').style.display = 'flex';
  showTrackingEmpty(false);

  // Reset step states for the next ride.
  document.querySelectorAll('.tracking-step').forEach(s => s.classList.remove('done', 'active'));
  document.getElementById('step-confirmed').classList.add('done');
  document.getElementById('step-enroute').classList.add('active');
  document.getElementById('tracking-progress-bar').style.width = '0%';
  document.getElementById('tracking-dot').style.background = '';
  document.getElementById('tracking-eta').textContent = '--';
  document.getElementById('tracking-pilot-card').style.display = 'none';
  document.getElementById('tracking-otp-card').style.display = 'none';

  resetBooking();
}



// ===== 08-actions.js =====

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
  var couponRow = '';
  if (fare.couponApplied && fare.couponApplied.amount) {
    couponRow = '<div class="fb-row fb-coupon"><span>' + escapeHtml(fare.couponApplied.label) + '</span><span>-' + money(fare.couponApplied.amount) + '</span></div>';
  }
  var creditsRow = '';
  if (fare.creditsApplied && fare.creditsApplied.amount) {
    creditsRow = '<div class="fb-row fb-credits"><span>' + escapeHtml(fare.creditsApplied.label) + '</span><span>-' + money(fare.creditsApplied.amount) + '</span></div>';
  }
  var urgencyRow = '';
  if (fare.urgencySurcharge && fare.urgencySurcharge.amount) {
    urgencyRow = '<div class="fb-row fb-surcharge"><span>' + escapeHtml(fare.urgencySurcharge.label) + '</span><span>+' + money(fare.urgencySurcharge.amount) + '</span></div>';
  }
  var weatherRow = '';
  if (fare.weatherSurcharge && fare.weatherSurcharge.amount) {
    weatherRow = '<div class="fb-row fb-surcharge"><span>' + escapeHtml(fare.weatherSurcharge.label) + '</span><span>+' + money(fare.weatherSurcharge.amount) + '</span></div>';
  }
  host.innerHTML =
    '<div class="fb-row"><span>Base fare</span><span>' + money(fare.base) + '</span></div>' +
    '<div class="fb-row"><span>Per-km (' + money(fare.perKm) + '/km &times; ' + fare.distanceKm + ' km)</span><span>' + money(fare.kmCharge) + '</span></div>' +
    (fare.surge ? '<div class="fb-row"><span>Surge</span><span>' + money(fare.surge) + '</span></div>' : '') +
    urgencyRow +
    weatherRow +
    '<div class="fb-row" style="color:#888"><span>Subtotal</span><span>' + money(fare.subtotal) + '</span></div>' +
    discountRow +
    creditsRow +
    couponRow +
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
      if (box) box.innerHTML = '<div class="tracking-rate-title" style="font-size:20px;padding:12px 0;">Thanks for flying with IraGo!</div>';
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


// ===== 09-drones.js =====

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
