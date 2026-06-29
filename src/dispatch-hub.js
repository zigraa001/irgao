// In-memory real-time hub for dispatch + ride tracking.
//
// Two channels:
//   - Operator channel: SSE (`/api/operator/dispatch/stream`) + WebSocket
//     (`/ws/operator`). Used to push dispatch offers / cancellations to pilots.
//   - Customer channel: SSE (`/api/tracking/my-ride/:id/stream`). Used to push
//     ride status updates + the assigned pilot's live GPS to the passenger
//     (Uber-style "track your driver").
//
// WebSocket auth is via JWT in the `?token=` query param (verified server-side).
// We no longer trust a client-supplied operatorId — that let any socket claim
// to be any operator and receive their offers.
const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");

const operatorClients = new Map(); // SSE:  operatorId → Set<res>
const operatorWsSockets = new Map(); // WS:   operatorId → Set<ws>
const customerClients = new Map(); // SSE:  bookingId → Set<res>

let wss = null;

// The operator JWT is carried in a WebSocket subprotocol string
// (`irago.operator.<token>`) rather than the URL query string, so it never
// lands in access/proxy logs or referrer headers. Read from the
// `Sec-WebSocket-Protocol` request header on connection.
const WS_SUBPROTO_PREFIX = "irago.operator.";

function extractWsToken(req) {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return "";
  const offered = String(header).split(",").map((s) => s.trim());
  const chosen = offered.find((p) => p.startsWith(WS_SUBPROTO_PREFIX));
  return chosen ? chosen.slice(WS_SUBPROTO_PREFIX.length) : "";
}

// SSE keepalive: write a comment frame every 15s so idle connections aren't
// silently dropped by proxies/load balancers (typical 60–120s idle timeout).
// `unref()` so the interval never keeps the process alive on its own.
const SSE_PING_INTERVAL_MS = 15_000;
let pingInterval = null;

function writeSsePing(res) {
  try {
    res.write(": ping\n\n");
  } catch {
    // writer gone — caller's set will clean it up on 'close'
  }
}

function startSseKeepalive() {
  if (pingInterval) return;
  pingInterval = setInterval(() => {
    for (const set of operatorClients.values()) {
      for (const res of set) writeSsePing(res);
    }
    for (const set of customerClients.values()) {
      for (const res of set) writeSsePing(res);
    }
  }, SSE_PING_INTERVAL_MS);
  if (typeof pingInterval.unref === "function") pingInterval.unref();
}

// Call once from server.js after httpServer is created.
function attachWebSocketServer(httpServer) {
  if (wss) return;
  startSseKeepalive();
  wss = new WebSocketServer({ server: httpServer, path: "/ws/operator" });
  wss.on("connection", (ws, req) => {
    // Verify the JWT carried in the Sec-WebSocket-Protocol subprotocol so the
    // socket is tied to a real operator. The token is no longer read from the
    // URL (which leaks into logs/referrers).
    const token = extractWsToken(req);
    const payload = verifyToken(token);
    if (!payload || payload.role !== "operator") {
      ws.send(JSON.stringify({ type: "auth_denied" }));
      ws.close(4001, "unauthorized");
      return;
    }
    // JWT stores the user id under `sub` (see auth.signToken / requireAuth).
    const operatorId = Number(payload.sub);
    if (!operatorWsSockets.has(operatorId)) {
      operatorWsSockets.set(operatorId, new Set());
    }
    operatorWsSockets.get(operatorId).add(ws);
    ws.send(JSON.stringify({ type: "auth_ok", operatorId }));

    ws.on("message", () => {
      // Inbound messages are ignored — the socket is push-only after auth.
    });
    ws.on("close", () => {
      const set = operatorWsSockets.get(operatorId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) operatorWsSockets.delete(operatorId);
      }
    });
    ws.on("error", () => {}); // prevent unhandled error crash
  });
}

// ── Operator channel (SSE) ───────────────────────────────────────────────
function subscribeOperator(operatorId, res) {
  const id = Number(operatorId);
  if (!operatorClients.has(id)) operatorClients.set(id, new Set());
  operatorClients.get(id).add(res);
  res.on("close", () => {
    const set = operatorClients.get(id);
    if (set) {
      set.delete(res);
      if (set.size === 0) operatorClients.delete(id);
    }
  });
}

// Push an event to all SSE + WS connections for an operator.
function pushOperator(operatorId, event, data) {
  const id = Number(operatorId);

  const sseSet = operatorClients.get(id);
  if (sseSet) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseSet) {
      try {
        res.write(payload);
      } catch {
        sseSet.delete(res);
      }
    }
  }

  const wsSet = operatorWsSockets.get(id);
  if (wsSet) {
    const payload = JSON.stringify({ type: event, ...data });
    for (const ws of wsSet) {
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(payload);
      } catch {
        wsSet.delete(ws);
      }
    }
  }
}

// ── Customer channel (SSE) ───────────────────────────────────────────────
// One passenger per booking subscribes to ride status + their pilot's GPS.
function subscribeCustomer(bookingId, res) {
  const id = Number(bookingId);
  if (!customerClients.has(id)) customerClients.set(id, new Set());
  customerClients.get(id).add(res);
  res.on("close", () => {
    const set = customerClients.get(id);
    if (set) {
      set.delete(res);
      if (set.size === 0) customerClients.delete(id);
    }
  });
}

// Push an event to every SSE subscriber watching this booking.
function pushCustomer(bookingId, event, data) {
  const id = Number(bookingId);
  const set = customerClients.get(id);
  if (!set || !set.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

module.exports = {
  attachWebSocketServer,
  subscribeOperator,
  pushOperator,
  subscribeCustomer,
  pushCustomer,
};
