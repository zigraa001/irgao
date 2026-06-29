// IraGo authentication utilities.
//
// Passwords are stored ONLY as bcrypt hashes (one-way) — plaintext is never
// persisted or returned. Sessions use standard JWTs (HS256) signed with
// AUTH_SECRET; no server-side session store is required.
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { queryOne } = require("./db");

const BCRYPT_ROUNDS = 10;
// Session token lifetime (seconds). Override with AUTH_COOKIE_TTL_SECONDS.
const TOKEN_TTL_SECONDS =
  Number(process.env.AUTH_COOKIE_TTL_SECONDS) || 7 * 24 * 60 * 60;
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "irago_session";
const JWT_ISSUER = process.env.AUTH_JWT_ISSUER || "irago";
const JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE || "irago-app";
const JWT_ALGORITHM = "HS256";

// Allowed user roles. role validation lives in app code because the DB stores
// role as a plain VARCHAR rather than a DB-level enum.
const ROLES = ["customer", "operator", "admin"];

// SQL fragment: only rows that have not been soft-deleted.
const USER_NOT_DELETED = "deletedAt IS NULL";
const USER_NOT_BANNED = "bannedAt IS NULL";

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

function jwtVerifyOptions(nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    clockTimestamp: nowSeconds,
  };
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

// Create a signed JWT for a user. `nowSeconds` is injectable for tests.
function signToken(user, nowSeconds = Math.floor(Date.now() / 1000)) {
  return jwt.sign(
    {
      sub: String(user.id),
      name: user.name,
      role: user.role,
      iat: nowSeconds,
      exp: nowSeconds + TOKEN_TTL_SECONDS,
    },
    getSecret(),
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      noTimestamp: true,
    }
  );
}

// Verify and decode a session token. Returns the payload on success, or null
// if the token is malformed, tampered with, or expired.
function verifyToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || !token.trim()) return null;
  try {
    return jwt.verify(token, getSecret(), jwtVerifyOptions(nowSeconds));
  } catch {
    return null;
  }
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
//
// The JWT alone proves identity + expiry, but it can't reflect a ban or
// soft-delete that happens AFTER the token was issued — so a banned operator
// could otherwise keep accepting offers until token expiry (up to 7 days). We
// re-check the user row in the DB with a short cache (STATUS_CACHE_TTL_MS).
// If the DB is unreachable, we degrade gracefully and admit the token alone
// (the whole app is degraded when the DB is down anyway).
const STATUS_CACHE_TTL_MS = 30_000;
const userStatusCache = new Map(); // id → { row, expiresAt }

async function getUserStatus(id) {
  const now = Date.now();
  const cached = userStatusCache.get(id);
  if (cached && cached.expiresAt > now) return cached.row;
  let row = null;
  try {
    row = await queryOne(
      "SELECT deletedAt, bannedAt, role FROM users WHERE id = ?",
      [id]
    );
  } catch {
    // DB unavailable (or a test fake that doesn't handle this SQL) — degrade.
    row = null;
  }
  userStatusCache.set(id, { row, expiresAt: now + STATUS_CACHE_TTL_MS });
  return row;
}

// Drop the cached status for a user so a ban / unban / delete takes effect on
// the very next request instead of after the cache TTL.
function invalidateUserStatus(id) {
  userStatusCache.delete(Number(id));
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const status = await getUserStatus(id);
  if (status) {
    if (status.deletedAt) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (status.bannedAt) {
      return res
        .status(403)
        .json({ error: "This account has been suspended.", code: "ACCOUNT_BANNED" });
    }
  }

  req.user = {
    id,
    name: payload.name,
    role: (status && status.role) || payload.role,
  };
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
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  USER_NOT_DELETED,
  USER_NOT_BANNED,
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
  invalidateUserStatus,
};
