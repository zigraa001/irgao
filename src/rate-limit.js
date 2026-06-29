// Simple in-memory per-user token-bucket rate limiter.
//
// No external store — fine for a single-process MVP and degrades to "allow" if
// the bucket isn't initialised. Limits are configurable per route via env and
// default generously enough that legitimate use (and the test suite) never
// trips, while throttling obvious abuse (a customer spamming /pay, a pilot
// spamming GPS).
const buckets = new Map(); // key → { tokens, lastMs }

function envLimit(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// (routeName, max, windowMs) — `max` requests per `windowMs` per user.
const ROUTE_LIMITS = {
  "bookings.create": { max: envLimit("RATE_LIMIT_BOOKING", 20), windowMs: 60_000 },
  "bookings.pay": { max: envLimit("RATE_LIMIT_PAY", 20), windowMs: 60_000 },
  "bookings.retry": { max: envLimit("RATE_LIMIT_RETRY", 10), windowMs: 60_000 },
  "operator.location": { max: envLimit("RATE_LIMIT_GPS", 120), windowMs: 60_000 },
};

function key(routeName, userId, ip) {
  // Bucket per user when authenticated, else per IP (authed routes always have
  // req.user, so the IP branch is just a safety net).
  return `${routeName}:${userId ?? "anon"}:${ip ?? ""}`;
}

// Express middleware factory: rateLimit("bookings.create").
function rateLimit(routeName) {
  const cfg = ROUTE_LIMITS[routeName];
  if (!cfg) throw new Error(`Unknown rate limit route: ${routeName}`);
  return function (req, res, next) {
    // Allow a kill-switch for tests / local dev.
    if (String(process.env.RATE_LIMIT_DISABLED || "").toLowerCase() === "true") {
      return next();
    }
    const userId = req.user ? req.user.id : "anon";
    const ip =
      (req.ip ||
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        "?").toString();
    const k = key(routeName, userId, ip);
    const now = Date.now();
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = { tokens: cfg.max, lastMs: now };
      buckets.set(k, bucket);
    }
    const elapsed = now - bucket.lastMs;
    // Refill proportional to time passed.
    const refill = (elapsed / cfg.windowMs) * cfg.max;
    bucket.tokens = Math.min(cfg.max, bucket.tokens + refill);
    bucket.lastMs = now;
    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil(
        (cfg.windowMs * (1 - bucket.tokens)) / cfg.max / 1000
      );
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      return res.status(429).json({
        error: "Too many requests. Please slow down.",
        code: "RATE_LIMITED",
        retryAfterSeconds: Math.max(1, retryAfter),
      });
    }
    bucket.tokens -= 1;
    next();
  };
}

// Test hook: clear all buckets.
function _reset() {
  buckets.clear();
}

module.exports = { rateLimit, _reset };
