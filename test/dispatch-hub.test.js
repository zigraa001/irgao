// Unit tests for the dispatch-hub in-memory channels (operator + customer).
// Uses a fake writable response to assert that pushOperator/pushCustomer fan
// out to the right subscribers, and that secure WS auth rejects bad tokens.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const http = require("node:http");

process.env.AUTH_SECRET = "test-secret-for-dispatch-hub";

// Load the real auth + dispatch-hub (no db stub needed; auth uses the secret).
const { signToken } = require("../src/auth");
const hubPath = require.resolve("../src/dispatch-hub");
// Ensure a fresh, real dispatch-hub instance (other test files stub it).
delete require.cache[hubPath];
const { subscribeOperator, pushOperator, subscribeCustomer, pushCustomer, attachWebSocketServer } =
  require("../src/dispatch-hub");

function fakeRes() {
  const stream = new PassThrough();
  stream.writeHead = () => stream;
  stream.flushHeaders = () => stream;
  return stream;
}

test("pushOperator fans an event out to all SSE subscribers for that operator", () => {
  const resA = fakeRes();
  const resB = fakeRes();
  subscribeOperator(7, resA);
  subscribeOperator(7, resB);
  // A different operator must not receive it.
  const resOther = fakeRes();
  subscribeOperator(8, resOther);

  pushOperator(7, "dispatch_offer", { offerId: 1 });

  assert.match(resA.read().toString(), /event: dispatch_offer/);
  assert.match(resB.read().toString(), /event: dispatch_offer/);
  assert.equal(resOther.read(), null);
});

test("pushCustomer fans an event out to the booking's customer subscribers only", () => {
  const res = fakeRes();
  const resOther = fakeRes();
  subscribeCustomer(123, res);
  subscribeCustomer(999, resOther);

  pushCustomer(123, "ride_update", { status: "enroute" });

  const data = res.read().toString();
  assert.match(data, /event: ride_update/);
  assert.match(data, /"status":"enroute"/);
  assert.equal(resOther.read(), null);
});

test("closing a customer SSE response removes it from the channel", () => {
  const res = fakeRes();
  subscribeCustomer(555, res);
  res.emit("close");
  pushCustomer(555, "ride_update", { status: "flying" });
  // Nothing was written because the subscriber was removed.
  assert.equal(res.read(), null);
});

test("WebSocket auth rejects connections without a valid operator JWT", async () => {
  const server = http.createServer((req, res) => res.end("ok"));
  attachWebSocketServer(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const sockets = [];

  const { WebSocket } = require("ws");
  async function connectAndReceive(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/operator?token=${encodeURIComponent(token || "")}`);
    sockets.push(ws);
    return new Promise((resolve) => {
      let done = false;
      function finish(val) {
        if (done) return;
        done = true;
        try { ws.terminate(); } catch (e) { /* ignore */ }
        resolve(val);
      }
      ws.on("message", (raw) => finish(JSON.parse(raw.toString())));
      ws.on("close", (code) => finish({ closed: code }));
      ws.on("error", () => finish({ error: true }));
    });
  }

  try {
    // No token → denied.
    const denied = await connectAndReceive("");
    assert.equal(denied.type, "auth_denied");

    // Customer token (wrong role) → denied.
    const customerJwt = signToken({ id: 5, name: "C", role: "customer" });
    const deniedCustomer = await connectAndReceive(customerJwt);
    assert.equal(deniedCustomer.type, "auth_denied");

    // Operator token → accepted with the operator's id (decoded from `sub`).
    const operatorJwt = signToken({ id: 50, name: "P", role: "operator" });
    const ok = await connectAndReceive(operatorJwt);
    assert.equal(ok.type, "auth_ok");
    assert.equal(ok.operatorId, 50);
  } finally {
    sockets.forEach((ws) => { try { ws.terminate(); } catch (e) {} });
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
