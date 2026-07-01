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
  // Mobile OTP login is only available for passengers.
  const mobileBtn = document.querySelector('.btn-mobile-login');
  if (mobileBtn) mobileBtn.style.display = role === 'passenger' ? '' : 'none';
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
  ['login-card', 'register-passenger-card', 'register-operator-card', 'otp-card', 'forgot-card', 'reset-card', 'mobile-login-card', 'mobile-otp-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['login-error', 'register-passenger-error', 'register-operator-error', 'otp-error', 'forgot-error', 'reset-error', 'mobile-login-error', 'mobile-otp-error'].forEach(hideAuthError);
}

function showLoginCard() {
  hideAllAuthCards();
  document.getElementById('login-card').style.display = 'block';
  applyPortalLabels(authRole || 'passenger');
  clearOtpTimers();
  clearMobileOtpTimers();
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

// Google sign-in is not wired to a real provider yet.
function googleStub(errId) {
  showAuthError(errId, 'Google sign-in is not available yet — please use email and password.');
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
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    showAuthError('otp-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('otp-submit', false, 'Verifying…', 'Verify & Create Account');
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

// ── Mobile OTP Login ────────────────────────────────────────────────────
// State for the mobile OTP flow (phone-based passwordless login).
const pendingMobileOtp = { phone: '', isNewUser: false, resendTimerId: null };

function showMobileLoginCard(keepPhone) {
  clearMobileOtpTimers();
  hideAllAuthCards();
  const card = document.getElementById('mobile-login-card');
  if (card) card.style.display = 'block';
  if (!keepPhone) {
    document.getElementById('mobile-phone').value = '';
    const newFields = document.getElementById('mobile-new-user-fields');
    if (newFields) newFields.style.display = 'none';
    document.getElementById('mobile-name').value = '';
    document.getElementById('mobile-email').value = '';
    pendingMobileOtp.phone = '';
    pendingMobileOtp.isNewUser = false;
  }
  hideAuthError('mobile-login-error');
  const phoneInput = document.getElementById('mobile-phone');
  if (phoneInput) phoneInput.focus();
}

function clearMobileOtpTimers() {
  if (pendingMobileOtp.resendTimerId) {
    clearInterval(pendingMobileOtp.resendTimerId);
    pendingMobileOtp.resendTimerId = null;
  }
}

function showMobileOtpCard(phone, timing) {
  hideAllAuthCards();
  pendingMobileOtp.phone = phone;
  document.getElementById('mobile-otp-phone-display').textContent = phone;
  document.getElementById('mobile-otp-code').value = '';
  hideAuthError('mobile-otp-error');
  document.getElementById('mobile-otp-card').style.display = 'block';
  startMobileOtpTimers(timing);
  const otpInput = document.getElementById('mobile-otp-code');
  if (otpInput) otpInput.focus();
}

function startMobileOtpTimers(timing) {
  clearMobileOtpTimers();
  const t = normalizeOtpTiming(timing);
  const btn = document.getElementById('mobile-otp-resend-btn');
  const hintEl = document.getElementById('mobile-otp-resend-hint');
  if (!hintEl) return;
  let remaining = t.resendCooldownSeconds;
  if (btn) { btn.disabled = true; btn.style.display = 'none'; }
  const tick = () => {
    if (remaining <= 0) {
      clearMobileOtpTimers();
      hintEl.textContent = "Didn't receive the code?";
      if (btn) { btn.disabled = false; btn.style.display = ''; }
      return;
    }
    hintEl.textContent = "Didn't receive the code? Resend in " + formatResendCountdown(remaining);
    remaining -= 1;
  };
  tick();
  pendingMobileOtp.resendTimerId = setInterval(tick, 1000);
}

// Send OTP to phone number.
// TODO [Channel switch]: When WhatsApp/MSG91 are live, update UI messages
// to say "sent to your WhatsApp" or "sent via SMS" instead of "sent to email".
async function doMobileSendOtp() {
  const rawPhone = document.getElementById('mobile-phone').value.trim();
  hideAuthError('mobile-login-error');

  if (!rawPhone || rawPhone.length < 10) {
    return showAuthError('mobile-login-error', 'Enter a valid 10-digit mobile number.');
  }

  const body = { phone: rawPhone };

  // If new-user fields are visible, include name and email.
  const newFields = document.getElementById('mobile-new-user-fields');
  if (newFields && newFields.style.display !== 'none') {
    const name = document.getElementById('mobile-name').value.trim();
    const email = document.getElementById('mobile-email').value.trim();
    if (!name) return showAuthError('mobile-login-error', 'Name is required for new accounts.');
    if (!email) return showAuthError('mobile-login-error', 'Email is required (OTP is sent to your email for now).');
    body.name = name;
    body.email = email;
  }

  setBusy('mobile-send-otp-btn', true, 'Sending…', 'Send OTP');
  try {
    const res = await fetch('/api/auth/mobile/send-otp', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Server says this is a new user — show name/email fields.
      if (data.isNewUser && data.code === 'EMAIL_REQUIRED_NEW_USER') {
        const newFields = document.getElementById('mobile-new-user-fields');
        if (newFields) newFields.style.display = '';
        return showAuthError('mobile-login-error', 'New number — enter your name and email to register.');
      }
      if (data.code === 'NAME_REQUIRED_NEW_USER') {
        const newFields = document.getElementById('mobile-new-user-fields');
        if (newFields) newFields.style.display = '';
        return showAuthError('mobile-login-error', 'Name is required for new accounts.');
      }
      const msg = data.retryAfterSeconds
        ? (data.error || 'Could not send code.') + ' Try again in ' + data.retryAfterSeconds + 's.'
        : (data.error || 'Could not send OTP.');
      return showAuthError('mobile-login-error', msg);
    }

    pendingMobileOtp.isNewUser = Boolean(data.isNewUser);
    showMobileOtpCard(data.phone || rawPhone, data);
  } catch (e) {
    showAuthError('mobile-login-error', authFetchErrorMessage());
  } finally {
    setBusy('mobile-send-otp-btn', false, 'Sending…', 'Send OTP');
  }
}

// Verify the 6-digit OTP code.
async function doMobileVerifyOtp() {
  const otp = document.getElementById('mobile-otp-code').value.trim();
  hideAuthError('mobile-otp-error');

  if (!pendingMobileOtp.phone || !otp) {
    return showAuthError('mobile-otp-error', 'Enter the 6-digit code.');
  }

  setBusy('mobile-otp-submit', true, 'Verifying…', 'Verify & Login');
  try {
    const res = await fetch('/api/auth/mobile/verify-otp', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: document.getElementById('mobile-phone').value.trim(),
        otp: otp
      })
    }));
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return showAuthError('mobile-otp-error', data.error || 'Invalid or expired code.');
    }

    clearMobileOtpTimers();
    onAuthSuccess(data.user, data.token);
  } catch (e) {
    showAuthError('mobile-otp-error', 'Could not reach the server. Please try again.');
  } finally {
    setBusy('mobile-otp-submit', false, 'Verifying…', 'Verify & Login');
  }
}

// Resend the mobile OTP.
async function doMobileResendOtp() {
  hideAuthError('mobile-otp-error');
  if (!pendingMobileOtp.phone) return;

  const btn = document.getElementById('mobile-otp-resend-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/mobile/resend-otp', AUTH.fetchOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: document.getElementById('mobile-phone').value.trim()
      })
    }));
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showAuthError('mobile-otp-error', data.error || 'Could not resend code.');
      if (data.retryAfterSeconds) {
        startMobileOtpTimers({ resendCooldownSeconds: data.retryAfterSeconds });
      } else if (btn) btn.disabled = false;
      return;
    }
    startMobileOtpTimers(data);
  } catch (e) {
    showAuthError('mobile-otp-error', 'Could not reach the server.');
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
      if (adminWelcome) adminWelcome.textContent = 'Welcome back, ' + ((user && user.name) || 'Admin');
      showView('admin-view');
      showAdminSection('dashboard');
      break;
    }
    case 'operator': {
      const welcome = document.getElementById('op-welcome');
      if (welcome) welcome.textContent = 'Welcome back, ' + ((user && user.name) || 'Pilot');
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

