// Verifies the /ws/ride WebSocket channel end-to-end: logs in as the demo
// customer, creates + pays a booking (triggers the demo lifecycle), opens the
// ride WebSocket with the JWT subprotocol, sends the bookingId, and prints
// every message so we can confirm ride_gps reaches the client over WS.
require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3002;
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const WSBASE = `ws://${HOST}:${PORT}`;

let cookie = "";
let token = "";

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      const sc = res.headers["set-cookie"];
      if (sc && sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch { json = buf; }
        if (json && json.token) token = json.token;
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`WS ride test against ${BASE}`);
  const login = await api("POST", "/api/auth/passenger/login", {
    email: "siddhantgujar745@gmail.com", password: "test@321",
  });
  console.log("login:", login.status, login.data?.user?.email || login.data?.error, "token?", !!token);
  if (login.status !== 200 || !token) { console.error("no token"); process.exit(1); }

  const create = await api("POST", "/api/bookings", {
    pickupName: "Pari Chowk, Greater Noida", pickupLat: 28.47, pickupLng: 77.5,
    destName: "Sector 62, Noida", destLat: 28.56, destLng: 77.44, service: "taxi",
  });
  console.log("create:", create.status, "id=", create.data?.booking?.id);
  if (create.status !== 201) { console.error(create.data); process.exit(1); }
  const bookingId = create.data.booking.id;

  const pay = await api("POST", `/api/bookings/${bookingId}/pay`, {});
  console.log("pay:", pay.status, "status=", pay.data?.booking?.status);

  console.log(`\nOpening WS ${WSBASE}/ws/ride (subprotocol irago.customer.<token>) ...`);
  const ws = new WebSocket(`${WSBASE}/ws/ride`, `irago.customer.${token}`);
  const counts = { auth_ok: 0, ride_state: 0, ride_update: 0, ride_gps: 0, ride_path: 0, other: 0 };
  let firstGps = 0;

  ws.on("open", () => {
    console.log("WS open — sending bookingId", bookingId);
    ws.send(JSON.stringify({ bookingId }));
  });
  ws.on("message", (raw) => {
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    const t = d && d.type;
    if (counts[t] != null) counts[t] += 1; else counts.other += 1;
    if (t === "ride_gps") {
      if (!firstGps) firstGps = Date.now();
      process.stdout.write(`  [ride_gps] ${d.lat},${d.lng} dist=${d.distanceKm}\n`);
    } else {
      process.stdout.write(`  [${t}] ${JSON.stringify(d).slice(0, 110)}\n`);
    }
  });
  ws.on("close", (code, reason) => console.log("WS closed:", code, reason.toString()));
  ws.on("error", (e) => console.log("WS error:", e.message));

  setTimeout(() => {
    console.log("\n=== WS EVENT SUMMARY (25s) ===");
    console.log(counts);
    console.log(counts.ride_gps > 0 ? "✅ /ws/ride DELIVERS ride_gps" : "❌ no ride_gps over WS");
    try { ws.close(); } catch {}
    process.exit(0);
  }, 25000);
}

main().catch((e) => { console.error(e); process.exit(1); });
