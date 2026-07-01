// In-memory real-time hub for dispatch + ride tracking.
//
// Three channels:
//   - Operator channel: SSE (`/api/operator/dispatch/stream`) + WebSocket
//     (`/ws/operator`). Used to push dispatch offers / cancellations to pilots.
//   - Customer ride channel: SSE (`/api/tracking/my-ride/:id/stream`) AND
//     WebSocket (`/ws/ride`). Used to push ride status updates + the assigned
//     pilot's live GPS to the passenger (Uber-style "track your driver").
//     The browser client uses the WebSocket path — it stays open more reliably
//     than EventSource across the booking→tracking layout switch and lets us
//     authenticate with the same JWT/cookie as the REST API. The SSE route is
//     kept as a fallback.
//
// WebSocket auth is via JWT in the `Sec-WebSocket-Protocol` subprotocol
// (`irago.customer.<token>` / `irago.operator.<token>`) or the session cookie,
// verified server-side. We never trust a client-supplied id — the socket must
// prove it owns the booking/operator it subscribes to.
const { WebSocketServer } = require("ws");
const { verifyToken, extractToken } = require("./auth");
const { queryOne } = require("./db");

const operatorClients = new Map(); // SSE:  operatorId → Set<res>
const operatorWsSockets = new Map(); // WS:   operatorId → Set<ws>
const customerClients = new Map(); // SSE:  bookingId → Set<res>
const customerWsSockets = new Map(); // WS:   bookingId → Set<ws>

let wss = null;
let customerWss = null;

// The operator JWT is carried in a WebSocket subprotocol string
// (`irago.operator.<token>`) rather than the URL query string, so it never
// lands in access/proxy logs or referrer headers. Read from the
// `Sec-WebSocket-Protocol` request header on connection.
const WS_SUBPROTO_PREFIX = "irago.operator.";
const WS_CUSTOMER_SUBPROTO_PREFIX = "irago.customer.";

function extractWsToken(req) {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return "";
  const offered = String(header).split(",").map((s) => s.trim());
  const chosen = offered.find((p) => p.startsWith(WS_SUBPROTO_PREFIX));
  return chosen ? chosen.slice(WS_SUBPROTO_PREFIX.length) : "";
}

function extractWsCustomerToken(req) {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return "";
  const offered = String(header).split(",").map((s) => s.trim());
  const chosen = offered.find((p) => p.startsWith(WS_CUSTOMER_SUBPROTO_PREFIX));
  return chosen ? chosen.slice(WS_CUSTOMER_SUBPROTO_PREFIX.length) : "";
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
  // Use noServer + a single upgrade router so the two WSS instances (operator
  // + customer ride) can share one HTTP server. Attaching both with
  // { server, path } made each register its own 'upgrade' listener and one
  // aborted the other's handshake with a 400 on /ws/ride.
  wss = new WebSocketServer({ noServer: true });
  customerWss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url ? req.url.split("?")[0] : "";
    if (pathname === "/ws/operator") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else if (pathname === "/ws/ride") {
      customerWss.handleUpgrade(req, socket, head, (ws) => customerWss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });
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

  // ── Customer ride channel (WebSocket on /ws/ride) ───────────────────────
  // The passenger's browser opens this after paying and sends the bookingId
  // it wants to track. We verify the token (subprotocol or session cookie),
  // confirm the customer owns the booking, register the socket, and push the
  // current ride_state snapshot. pushCustomer() then fans ride_update /
  // ride_gps / ride_path events to this socket in real time.
  customerWss.on("connection", (ws, req) => {
    const token = extractWsCustomerToken(req) || extractToken(req);
    const payload = verifyToken(token);
    if (!payload) {
      try { ws.send(JSON.stringify({ type: "auth_denied" })); } catch {}
      ws.close(4001, "unauthorized");
      return;
    }
    const userId = Number(payload.sub);
    ws.send(JSON.stringify({ type: "auth_ok" }));

    let subscribedBookingId = null;
    ws.on("message", async (raw) => {
      if (subscribedBookingId != null) return; // subscribe once
      let msg = null;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const bookingId = Number(msg && msg.bookingId);
      if (!bookingId) return;
      let booking;
      try {
        booking = await queryOne(
          "SELECT customerId, operatorId, status FROM bookings WHERE id = ?",
          [bookingId]
        );
      } catch { booking = null; }
      if (!booking) {
        try { ws.send(JSON.stringify({ type: "error", error: "booking not found" })); } catch {}
        return;
      }
      const allowed =
        payload.role === "admin" ||
        (payload.role === "customer" && Number(booking.customerId) === userId) ||
        (payload.role === "operator" && Number(booking.operatorId) === userId);
      if (!allowed) {
        try { ws.send(JSON.stringify({ type: "error", error: "forbidden" })); } catch {}
        return;
      }
      subscribedBookingId = bookingId;
      if (!customerWsSockets.has(bookingId)) customerWsSockets.set(bookingId, new Set());
      customerWsSockets.get(bookingId).add(ws);
      // Initial snapshot so the client doesn't have to poll.
      let op = null;
      if (booking.operatorId) {
        try {
          op = await queryOne(
            "SELECT id, name, gpsLat, gpsLng FROM users WHERE id = ?",
            [booking.operatorId]
          );
        } catch { op = null; }
      }
      try {
        ws.send(JSON.stringify({
          type: "ride_state",
          bookingId,
          status: booking.status,
          operator: op ? { id: op.id, name: op.name, lat: op.gpsLat, lng: op.gpsLng } : null,
        }));
      } catch {}
    });
    ws.on("close", () => {
      if (subscribedBookingId != null) {
        const set = customerWsSockets.get(subscribedBookingId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) customerWsSockets.delete(subscribedBookingId);
        }
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

// Push an event to every SSE + WebSocket subscriber watching this booking.
function pushCustomer(bookingId, event, data) {
  const id = Number(bookingId);

  const sseSet = customerClients.get(id);
  if (sseSet && sseSet.size) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseSet) {
      try {
        res.write(payload);
      } catch {
        sseSet.delete(res);
      }
    }
  }

  const wsSet = customerWsSockets.get(id);
  if (wsSet && wsSet.size) {
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

module.exports = {
  attachWebSocketServer,
  subscribeOperator,
  pushOperator,
  subscribeCustomer,
  pushCustomer,
};
