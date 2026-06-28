// Admin panel Tailscale gate.
//
// When ADMIN_REQUIRE_TAILSCALE=true, /api/admin/* is only reachable from:
//   • Tailscale CGNAT (100.64.0.0/10), or
//   • Requests with Tailscale Serve identity headers (Tailscale-User-Login), or
//   • Loopback when ADMIN_TAILSCALE_ALLOW_LOCAL=true (local dev)
const net = require("net");

function isEnabled() {
  return String(process.env.ADMIN_REQUIRE_TAILSCALE || "").toLowerCase() === "true";
}

function allowLocal() {
  return String(process.env.ADMIN_TAILSCALE_ALLOW_LOCAL || "").toLowerCase() === "true";
}

function normalizeIp(raw) {
  if (!raw) return "";
  let ip = String(raw).trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function isLoopback(ip) {
  return ip === "127.0.0.1" || ip === "localhost";
}

// Tailscale IPv4 CGNAT range: 100.64.0.0/10
function isTailscaleIpv4(ip) {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

// Tailscale ULA: fd7a:115c:a1e0::/48
function isTailscaleIpv6(ip) {
  const lower = ip.toLowerCase();
  return lower.startsWith("fd7a:115c:a1e0:");
}

function isTailscaleIp(ip) {
  const n = normalizeIp(ip);
  if (!n) return false;
  if (net.isIP(n) === 4) return isTailscaleIpv4(n);
  if (net.isIP(n) === 6) return isTailscaleIpv6(n);
  return false;
}

function hasTailscaleIdentity(req) {
  const login = req.headers["tailscale-user-login"];
  return typeof login === "string" && login.length > 0;
}

function getClientIp(req) {
  const trust = String(process.env.TRUST_PROXY || "").toLowerCase() === "true";
  if (trust) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length) {
      return normalizeIp(fwd.split(",")[0]);
    }
  }
  return normalizeIp(req.socket?.remoteAddress);
}

function isTailscaleRequest(req) {
  if (hasTailscaleIdentity(req)) return true;
  const ip = getClientIp(req);
  if (allowLocal() && isLoopback(ip)) return true;
  return isTailscaleIp(ip);
}

function requireTailscale(req, res, next) {
  if (!isEnabled()) return next();
  if (isTailscaleRequest(req)) return next();
  return res.status(403).json({
    error:
      "Admin panel requires Tailscale. Connect to your tailnet and open this app via your machine's Tailscale HTTPS URL.",
    code: "TAILSCALE_REQUIRED",
  });
}

module.exports = {
  isEnabled,
  allowLocal,
  normalizeIp,
  isTailscaleIp,
  hasTailscaleIdentity,
  getClientIp,
  isTailscaleRequest,
  requireTailscale,
};
