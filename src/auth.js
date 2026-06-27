// IraGo authentication utilities.
//
// Passwords are stored ONLY as bcrypt hashes (one-way) — plaintext is never
// persisted or returned. Sessions use a stateless HMAC-signed token so we need
// no extra dependency and no server-side session store: the token carries the
// user id, role, and name, signed with AUTH_SECRET so it cannot be forged.
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;
// Token lifetime: 7 days (in seconds).
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// Allowed user roles. role validation lives in app code because the DB stores
// role as a plain String (Prisma enums are unsupported on SQLite).
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

// Express middleware: require a valid bearer token. On success it sets
// req.user = { id, name, role } and calls next(); otherwise responds 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1] : null;
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
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  requireAuth,
  requireRole,
};
