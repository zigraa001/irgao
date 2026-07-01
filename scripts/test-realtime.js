// Real-time channel test: proves the dispatch offers + ride updates actually
// travel over the live push channels (operator WebSocket /ws/operator and the
// customer SSE stream /api/tracking/my-ride/:id/stream) — the layer the browser
// UI depends on, which the API-only suite bypassed by reading the DB.
//
//   node scripts/test-realtime.js   (server must be running)
require("dotenv").config();
const WebSocket = require("ws");
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const WSBASE = `ws://localhost:${PORT}/ws/operator`;

const PICKUP = { name: "Pari Chowk, Greater Noida", lat: 28.47, lng: 77.5 };
const DEST = { name: "Sector 62, Noida", lat: 28.56, lng: 77.44 };
const OP_GPS = { lat: 28.472, lng: 77.498 };
const CUSTOMER = { email: "siddhantgujar745@gmail.com", name: "Siddhant Ramling Gujar", password: "test@321" };
const OPERATOR = { email: "ram756.sg@gmail.com", name: "Capt. Ram (Operator)", password: "test@321" };

const results = [];
function ok(name, cond, detail) {
  const pass = !!cond;
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${name}${!pass && detail !== undefined ? "  → " + JSON.stringify(detail) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function login(portal, email, password) {
  const r = await api(null, "POST", `/api/auth/${portal}/login`, { email, password });
  return r.data?.token || null;
}
async function ensureUser(u, role, extra = {}) {
  const hash = await hashPassword(u.password);
  const existing = await queryOne("SELECT id FROM users WHERE email=?", [u.email.toLowerCase()]);
  const cols = { name: u.name, passwordHash: hash, role, bannedAt: null, deletedAt: null, ...extra };
  if (existing) {
    const sets = Object.keys(cols).map((k) => `${k}=?`).join(",");
    await query(`UPDATE users SET ${sets} WHERE id=?`, [...Object.values(cols), existing.id]);
    return existing.id;
  }
  const keys = ["email", ...Object.keys(cols)];
  const r = await query(`INSERT INTO users (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, [u.email.toLowerCase(), ...Object.values(cols)]);
  return r.insertId;
}

// ── SSE client: collects parsed events from a fetch streaming body ──
function openSse(token, path) {
  const events = [];
  const controller = new AbortController();
  const ready = fetch(BASE + path, { headers: { Authorization: "Bearer " + token }, signal: controller.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error("SSE connect failed: " + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const ev = {};
              for (const line of frame.split("\n")) {
                if (line.startsWith("event:")) ev.event = line.slice(6).trim();
                else if (line.startsWith("data:")) ev.data = line.slice(5).trim();
              }
              if (ev.event) {
                try { ev.json = JSON.parse(ev.data); } catch {}
                events.push(ev);
              }
            }
          }
        } catch { /* aborted */ }
      })();
      return true;
    });
  return { events, ready, close: () => controller.abort() };
}
async function waitForEvent(events, predicate, ms = 6000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = events.find(predicate);
    if (hit) return hit;
    await sleep(100);
  }
  return null;
}

// ── Operator WebSocket client ──
function openOperatorWs(token) {
  const msgs = [];
  const ws = new WebSocket(WSBASE, "irago.operator." + token);
  const opened = new Promise((resolve, reject) => {
    ws.on("message", (raw) => { try { msgs.push(JSON.parse(raw.toString())); } catch {} });
    ws.on("open", () => resolve(true));
    ws.on("error", reject);
  });
  return { ws, msgs, opened, close: () => ws.close() };
}
async function waitForMsg(msgs, predicate, ms = 6000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = msgs.find(predicate);
    if (hit) return hit;
    await sleep(100);
  }
  return null;
}

async function main() {
  console.log("=== IraGo real-time channel test (WebSocket + SSE) ===\nServer:", BASE);

  const office = await queryOne(
    `SELECT ro.id officeId, ro.companyId FROM regional_offices ro JOIN operator_companies oc ON oc.id=ro.companyId WHERE ro.city='Delhi NCR' ORDER BY ro.id LIMIT 1`
  );
  await query("UPDATE users SET onDuty=0 WHERE role='operator'");
  await ensureUser(CUSTOMER, "customer");
  const opId = await ensureUser(OPERATOR, "operator", {
    companyId: office.companyId, officeId: office.officeId, aircraftType: "Joby S4 eVTOL",
    aircraftReg: "VT-IRA", pilotLicense: "CPL-001", onDuty: 1, gpsLat: OP_GPS.lat, gpsLng: OP_GPS.lng,
  });
  const cust = await login("passenger", CUSTOMER.email, CUSTOMER.password);
  const op = await login("operator", OPERATOR.email, OPERATOR.password);

  console.log("\n── 1. Operator WebSocket (/ws/operator) ──");
  const opWs = openOperatorWs(op);
  await opWs.opened;
  const authOk = await waitForMsg(opWs.msgs, (m) => m.type === "auth_ok");
  ok("operator WS connects + auth_ok", !!authOk && authOk.operatorId === opId, authOk);

  console.log("\n── 2. Create booking + subscribe customer SSE stream ──");
  const create = await api(cust, "POST", "/api/bookings", {
    pickupName: PICKUP.name, pickupLat: PICKUP.lat, pickupLng: PICKUP.lng,
    destName: DEST.name, destLat: DEST.lat, destLng: DEST.lng, service: "taxi",
  });
  const bookingId = create.data?.booking?.id;
  ok("booking created", create.status === 201 && !!bookingId, create.status);
  const sse = openSse(cust, `/api/tracking/my-ride/${bookingId}/stream`);
  await sse.ready;
  const rideState = await waitForEvent(sse.events, (e) => e.event === "ride_state");
  ok("customer SSE opens + receives initial ride_state", !!rideState, rideState?.json);

  console.log("\n── 3. Pay → dispatch_offer pushed over operator WS ──");
  const pay = await api(cust, "POST", `/api/bookings/${bookingId}/pay`, {});
  ok("pay → 200", pay.status === 200, pay.status);
  const offerMsg = await waitForMsg(opWs.msgs, (m) => m.type === "dispatch_offer" && Number(m.requestId) === bookingId);
  ok("operator WS receives live dispatch_offer (with sound flag)", !!offerMsg && offerMsg.playSound === true, offerMsg ? { offerId: offerMsg.offerId, eta: offerMsg.estimatedPickupMin, company: offerMsg.company?.name } : null);
  const progress = await waitForEvent(sse.events, (e) => e.event === "dispatch_progress");
  ok("customer SSE receives dispatch_progress (\"finding pilot…\")", !!progress, progress?.json?.message);

  console.log("\n── 4. Operator accepts → customer SSE gets ride_update(assigned) ──");
  const accept = await api(op, "POST", `/api/operator/dispatch/offers/${offerMsg?.offerId}/accept`, {});
  ok("operator accepts offer → assigned", accept.status === 200 && accept.data?.booking?.status === "assigned", accept.data?.booking?.status);
  const assignedEv = await waitForEvent(sse.events, (e) => e.event === "ride_update" && e.json?.status === "assigned");
  ok("customer SSE receives ride_update(assigned) with pilot info", !!assignedEv && !!assignedEv.json?.pilot, assignedEv?.json?.pilot);

  console.log("\n── 5. Advance status → customer SSE gets live ride_update + ride_gps ──");
  await api(op, "POST", `/api/operator/trips/${bookingId}/accept`, {});
  await api(op, "POST", `/api/operator/trips/${bookingId}/enroute`, {});
  const enrouteEv = await waitForEvent(sse.events, (e) => e.event === "ride_update" && e.json?.status === "enroute");
  ok("customer SSE receives ride_update(enroute)", !!enrouteEv, enrouteEv?.json?.status);
  await api(op, "POST", "/api/operator/location", { lat: PICKUP.lat + 0.01, lng: PICKUP.lng + 0.01 });
  const gpsEv = await waitForEvent(sse.events, (e) => e.event === "ride_gps");
  ok("customer SSE receives live ride_gps (pilot moving)", !!gpsEv && typeof gpsEv.json?.lat === "number", gpsEv?.json);

  console.log("\n── 6. Operator reject re-dispatch cancellation event over WS ──");
  // Cancel the trip → operator WS should receive ride_cancelled.
  const cancel = await api(cust, "POST", `/api/bookings/${bookingId}/cancel`, {});
  ok("customer cancels trip → 200", cancel.status === 200, cancel.status);
  const cancelMsg = await waitForMsg(opWs.msgs, (m) => m.type === "ride_cancelled" && Number(m.bookingId) === bookingId);
  ok("operator WS receives ride_cancelled push", !!cancelMsg, cancelMsg);

  sse.close();
  opWs.close();
  await sleep(200);

  const pass = results.filter((r) => r.pass).length;
  const fails = results.filter((r) => !r.pass);
  console.log(`\n${"═".repeat(50)}\nRESULT: ${pass}/${results.length} real-time checks passed`);
  if (fails.length) { fails.forEach((f) => console.log(`   ❌ ${f.name} → ${JSON.stringify(f.detail)}`)); process.exitCode = 1; }
  else console.log("✅ ALL REAL-TIME CHANNEL CHECKS PASSED");
}

main()
  .catch((e) => { console.error("\nFATAL:", e.stack || e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); });
