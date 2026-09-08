// Tracking keys + "track your drone" email for operator-sent drops.
const crypto = require("crypto");
const { getTransporter, fromAddress, isConfigured, maskEmail } = require("./email");

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTrackingKey() {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return "IRG-" + out.slice(0, 4) + "-" + out.slice(4);
}

function normalizeTrackingKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function publicAppOrigin(req) {
  const env = String(process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || "").trim();
  if (env) return env.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "irago.in")
    .split(",")[0]
    .trim();
  return proto + "://" + host;
}

function trackUrl(req, trackingKey) {
  return publicAppOrigin(req) + "/app.html?track=" + encodeURIComponent(trackingKey);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function sendDroneTrackEmail(to, payload) {
  const trackingKey = payload.trackingKey;
  const url = payload.trackUrl;
  const pickup = payload.pickupName || "Pickup";
  const drop = payload.dropName || "Drop";
  const parcel = payload.parcelType || "parcel";

  const text = [
    "Track your drone",
    "",
    "IraGo has a drone on the way to you.",
    "Route: " + pickup + " → " + drop,
    parcel ? "Parcel: " + parcel : null,
    "",
    "Tracking key: " + trackingKey,
    "Open this link to watch it live:",
    url,
    "",
    "Keep this key — you can paste it on the Drone Delivery tab anytime.",
    "",
    "— IraGo",
  ].filter((line) => line !== null).join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="margin-bottom:8px;">Track your drone</h2>
      <p>IraGo has a drone on the way to you.</p>
      <p style="color:#444;">${escapeHtml(pickup)} → ${escapeHtml(drop)}</p>
      <p style="font-size:13px;color:#666;">Tracking key</p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:2px;margin:8px 0 20px;">${escapeHtml(trackingKey)}</p>
      <p>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
          Track your drone
        </a>
      </p>
      <p style="color:#888;font-size:13px;">Keep this key — you can paste it on the Drone Delivery tab anytime.</p>
      <p style="color:#aaa;font-size:12px;margin-top:28px;">— IraGo</p>
    </div>`;

  const transporter = getTransporter();
  if (!transporter || !isConfigured()) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to,
      subject: "Track your drone — IraGo",
      text,
      html,
    });
    console.log(
      `[email] drone track sent to ${maskEmail(to)}` +
        (info.messageId ? ` id=${info.messageId}` : "")
    );
    return { sent: true };
  } catch (err) {
    console.error(`[email] drone track send failed for ${maskEmail(to)}: ${err.message}`);
    return { sent: false, reason: "SMTP_SEND_FAILED" };
  }
}

module.exports = {
  generateTrackingKey,
  normalizeTrackingKey,
  publicAppOrigin,
  trackUrl,
  sendDroneTrackEmail,
};
