// IraGo authentication utilities.
//
// Passwords are stored ONLY as bcrypt hashes (one-way) — plaintext is never
// persisted or returned. Sessions use a stateless HMAC-signed token so we need
// no extra dependency and no server-side session store: the token carries the
// user id, role, and name, signed with AUTH_SECRET so it cannot be forged.
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;
// Session token lifetime (seconds). Override with AUTH_COOKIE_TTL_SECONDS.
const TOKEN_TTL_SECONDS =
  Number(process.env.AUTH_COOKIE_TTL_SECONDS) || 7 * 24 * 60 * 60;
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "irago_session";

// Allowed user roles. role validation lives in app code because the DB stores
// role as a plain VARCHAR rather than a DB-level enum.
const ROLES = ["customer", "operator", "admin"];

// The signing secret. In production AUTH_SECRET MUST be set; locally we fall
// back to a fixed dev secret (and warn) so the app still boots.
function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length > 0) return secret;
  if (!getSecret._warned) {
    console.warn(
      "WARNING: AUTH_SECRET is not set — using an insecure development " +
        "secret. Set AUTH_SECRET in production."
    );
    getSecret._warned = true;
  }
  return "irago-insecure-dev-secret";
}

let _otpPayloadKey = null;

// AES-256-GCM key for encrypting signup payloads at rest in otp_requests.
function deriveOtpPayloadKey() {
  if (!_otpPayloadKey) {
    _otpPayloadKey = crypto.scryptSync(
      getSecret(),
      "irago-otp-payload-v1",
      32
    );
  }
  return _otpPayloadKey;
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  );
}

function hmac(data) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest();
}

// Hash a plaintext password with bcrypt. Returns the hash string.
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// Verify a plaintext password against a stored bcrypt hash.
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Create a signed session token for a user. `nowSeconds` is injectable for
// tests; it defaults to the current time.
function signToken(user, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = {
    sub: user.id,
    name: user.name,
    role: user.role,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(hmac(body));
  return `${body}.${sig}`;
}

// Verify and decode a session token. Returns the payload on success, or null
// if the token is malformed, tampered with, or expired.
function verifyToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = hmac(body);
  let provided;
  try {
    provided = base64urlDecode(sig);
  } catch {
    return null;
  }
  // Constant-time comparison; lengths must match first or timingSafeEqual throws.
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp < nowSeconds) {
    return null;
  }
  return payload;
}

// Parse the Cookie header into a plain object.
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

// Read the session token from the HttpOnly cookie, or fall back to Bearer.
function extractToken(req) {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

// Set the signed JWT in an HttpOnly cookie (not accessible to JavaScript).
function setAuthCookie(res, token) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.AUTH_COOKIE_SECURE === "true";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${TOKEN_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

// Clear the session cookie on logout (Max-Age + Expires for browser compatibility).
function clearAuthCookie(res) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.AUTH_COOKIE_SECURE === "true";
  const base = {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
  };
  if (typeof res.clearCookie === "function") {
    res.clearCookie(COOKIE_NAME, base);
  }
  const parts = [
    `${COOKIE_NAME}=`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

// Express middleware: require a valid session token (cookie or Bearer).
// On success sets req.user = { id, name, role }; otherwise responds 401.
function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: "Authentication required" });
  }
  req.user = { id: payload.sub, name: payload.name, role: payload.role };
  next();
}

// Express middleware factory: require the authenticated user to have `role`.
// Must be used after requireAuth. Responds 403 on mismatch.
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = {
  ROLES,
  TOKEN_TTL_SECONDS,
  COOKIE_NAME,
  deriveOtpPayloadKey,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  extractToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole,
};
