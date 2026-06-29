// Web Push for pilots.
//
// SSE/WebSocket only deliver while the pilot's tab is open. Web Push reaches a
// backgrounded/locked device via the browser push service. We use the
// `web-push` library with VAPID keys from env (VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT). If VAPID isn't configured, sendPushTo*
// degrade to no-ops (and SSE still works) — so the app boots fine without keys.
//
// Subscriptions are stored per user in push_subscriptions (one row per device).
const { query } = require("./db");

let webpush = null;
try {
  webpush = require("web-push");
} catch {
  webpush = null; // dependency missing → degrade gracefully
}

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ops@irago.com";
let configured = false;

function configure() {
  if (!webpush) return false;
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  configured = true;
  return true;
}

function isConfigured() {
  return configure();
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Store a browser push subscription for the logged-in user. Called by the
// client after `registration.pushManager.subscribe(...)`.
async function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: "endpoint, keys.p256dh, keys.auth are required" };
  }
  await query(
    `INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
  return { ok: true };
}

async function removeSubscription(userId, endpoint) {
  if (!endpoint) return { ok: false, error: "endpoint is required" };
  await query(
    "DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?",
    [userId, endpoint]
  );
  return { ok: true };
}

// Send a push notification to every device subscribed for a user. Payload is
// JSON-stringified. Invalid/expired subscriptions are pruned. Best-effort:
// failures never throw to the caller (dispatch keeps working even if push is
// down).
async function sendToUser(userId, payload) {
  if (!isConfigured()) return { sent: 0, skipped: "not_configured" };
  let subs;
  try {
    subs = await query(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ?",
      [userId]
    );
  } catch (err) {
    // DB unavailable (or a test fake without a handler) — never let push break
    // dispatch. SSE is still the primary channel.
    return { sent: 0, skipped: "db_error", error: err.message };
  }
  if (!subs.length) return { sent: 0, skipped: "no_subscriptions" };
  const body = JSON.stringify(payload || {});
  let sent = 0;
  const dead = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        body
      );
      sent += 1;
    } catch (err) {
      // 404/410 = subscription expired/unsubscribed → drop it. Other errors
      // (429, 5xx) are transient; leave the subscription in place.
      const status = err.statusCode;
      if (status === 404 || status === 410) dead.push(s.id);
    }
  }
  if (dead.length) {
    await query(
      `DELETE FROM push_subscriptions WHERE id IN (${dead.map(() => "?").join(",")})`,
      dead
    );
  }
  return { sent };
}

module.exports = {
  isConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToUser,
};
