// Unit tests for Tailscale admin gate.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_REQUIRE_TAILSCALE = "true";
process.env.ADMIN_TAILSCALE_ALLOW_LOCAL = "true";

const {
  isTailscaleIp,
  hasTailscaleIdentity,
  isTailscaleRequest,
  requireTailscale,
} = require("../src/tailscale");

test("isTailscaleIp accepts CGNAT range", () => {
  assert.equal(isTailscaleIp("100.64.0.1"), true);
  assert.equal(isTailscaleIp("100.127.255.254"), true);
  assert.equal(isTailscaleIp("8.8.8.8"), false);
  assert.equal(isTailscaleIp("127.0.0.1"), false);
});

test("hasTailscaleIdentity detects Tailscale Serve header", () => {
  assert.equal(
    hasTailscaleIdentity({ headers: { "tailscale-user-login": "you@ts.net" } }),
    true
  );
  assert.equal(hasTailscaleIdentity({ headers: {} }), false);
});

test("isTailscaleRequest allows loopback when ADMIN_TAILSCALE_ALLOW_LOCAL", () => {
  assert.equal(
    isTailscaleRequest({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }),
    true
  );
});

test("requireTailscale blocks public IP with 403 TAILSCALE_REQUIRED", () => {
  process.env.ADMIN_TAILSCALE_ALLOW_LOCAL = "false";
  const req = { headers: {}, socket: { remoteAddress: "203.0.113.1" } };
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
  };
  let nextCalled = false;
  requireTailscale(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "TAILSCALE_REQUIRED");
  process.env.ADMIN_TAILSCALE_ALLOW_LOCAL = "true";
});
