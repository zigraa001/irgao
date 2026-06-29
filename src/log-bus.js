// In-memory structured-log ring buffer for the admin observability panel.
//
// The app logs via console.log/console.error with `[tag]` prefixes. We wrap
// both so every line is also captured into a bounded ring buffer (last
// MAX_LOGS entries) that the admin panel can page through newest-first, loading
// 50 at a time on scroll-up. This is deliberately in-memory and per-process —
// only logs since the server started are visible, which is enough for an MVP
// "what's happening right now" view without a full log aggregator.
const MAX_LOGS = 500;

const buffer = []; // newest first (unshift on capture)
let installed = false;
const subscribers = new Set();

function nowIso() {
  return new Date().toISOString();
}

function capture(level, args) {
  const msg = args
    .map((a) => (typeof a === "string" ? a : safeStringify(a)))
    .join(" ");
  const entry = { ts: nowIso(), level, msg };
  buffer.unshift(entry);
  if (buffer.length > MAX_LOGS) buffer.length = MAX_LOGS;
  for (const cb of subscribers) {
    try {
      cb(entry);
    } catch {
      /* subscriber must not throw the logger */
    }
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Wrap console.log/error once. Idempotent. Originals are still invoked so the
// server's stdout/stderr output is unchanged.
function install() {
  if (installed) return;
  installed = true;
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  console.log = (...args) => {
    capture("info", args);
    origLog(...args);
  };
  console.error = (...args) => {
    capture("error", args);
    origErr(...args);
  };
}

// Return up to `limit` logs older than `beforeTs` (exclusive), newest-first.
// beforeTs omitted → the most recent logs. Used for scroll-up pagination: the
// client passes the oldest ts it currently shows to fetch the next older page.
function getLogs({ limit = 50, beforeTs = null } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  if (!beforeTs) return { logs: buffer.slice(0, n), hasMore: buffer.length > n };
  const idx = buffer.findIndex((e) => e.ts < beforeTs);
  if (idx === -1) return { logs: [], hasMore: false };
  const page = buffer.slice(idx, idx + n);
  const hasMore = idx + n < buffer.length;
  return { logs: page, hasMore };
}

function subscribe(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function _reset() {
  buffer.length = 0;
}

module.exports = { install, getLogs, subscribe, _reset };
