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
  ['login-card', 'register-passenger-card', 'register-operator-card', 'register-verify-card', 'otp-card', 'forgot-card', 'reset-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['login-error', 'register-passenger-error', 'register-operator-error', 'register-verify-error', 'reg-email-error', 'reg-phone-error', 'otp-error', 'forgot-error', 'reset-error'].forEach(hideAuthError);
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

