// Google OAuth2 authentication.
//
// Flow:
//   1. GET /api/auth/google           → redirect to Google consent screen
//   2. GET /api/auth/google/callback   → exchange code, fetch profile + phone
//   3a. Existing user by email         → log in immediately
//   3b. New user with phone from Google → create account, log in
//   3c. New user without phone         → redirect to /app.html?google_pending=1
//       Frontend shows phone collection card; phone OTP sent to Google email.
//
// Scopes requested:
//   openid, email, profile, https://www.googleapis.com/auth/user.phonenumbers.read
const https = require("https");
const crypto = require("crypto");
const { query, queryOne } = require("./db");
const { hashPassword, signToken, setAuthCookie } = require("./auth");
const { createAndSendOtp, verifyOtp } = require("./otp");
const { normalizePhone } = require("./otp-channel");

const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = () =>
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3002/api/auth/google/callback";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/user.phonenumbers.read",
].join(" ");

function googleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID() && GOOGLE_CLIENT_SECRET());
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = typeof body === "string" ? body : JSON.stringify(body);
    const isForm = typeof body === "string";
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": isForm
          ? "application/x-www-form-urlencoded"
          : "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID(),
    client_secret: GOOGLE_CLIENT_SECRET(),
    redirect_uri: GOOGLE_REDIRECT_URI(),
    grant_type: "authorization_code",
  });
  return httpsPost("https://oauth2.googleapis.com/token", params.toString());
}

async function fetchGoogleProfile(accessToken) {
  return httpsGet("https://www.googleapis.com/oauth2/v2/userinfo", {
    Authorization: `Bearer ${accessToken}`,
  });
}

async function fetchGooglePhone(accessToken) {
  const data = await httpsGet(
    "https://people.googleapis.com/v1/people/me?personFields=phoneNumbers",
    { Authorization: `Bearer ${accessToken}` }
  );
  if (data && data.phoneNumbers && data.phoneNumbers.length > 0) {
    const raw = data.phoneNumbers[0].value || "";
    const normalized = normalizePhone(raw);
    return normalized || null;
  }
  return null;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || null,
    emailVerified: Boolean(user.emailVerified),
    mustResetPassword: false,
  };
}

function authResponse(res, user) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return { user: publicUser(user), token };
}

// Temporary store for pending Google signups (no phone from Google).
// Maps state → { name, email, googleId, expiresAt }
const pendingGoogleSignups = new Map();

function cleanupPending() {
  const now = Date.now();
  for (const [key, val] of pendingGoogleSignups) {
    if (val.expiresAt < now) pendingGoogleSignups.delete(key);
  }
}

function setPending(data) {
  cleanupPending();
  const state = crypto.randomBytes(16).toString("hex");
  pendingGoogleSignups.set(state, { ...data, expiresAt: Date.now() + 15 * 60 * 1000 });
  return state;
}

function getPending(state) {
  cleanupPending();
  return pendingGoogleSignups.get(state) || null;
}

function deletePending(state) {
  pendingGoogleSignups.delete(state);
}

module.exports = {
  googleConfigured,
  SCOPES,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  exchangeCode,
  fetchGoogleProfile,
  fetchGooglePhone,
  publicUser,
  authResponse,
  setPending,
  getPending,
  deletePending,
  normalizePhone,
};
