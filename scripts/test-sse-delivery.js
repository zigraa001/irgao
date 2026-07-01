// Definitive client-side-mirror test: log in as the demo customer, create +
// pay a booking (which triggers the demo lifecycle), then subscribe to the
// ride SSE stream with the SESSION COOKIE (exactly like the browser does —
// EventSource can't send a Bearer header, only cookies). Prints every event
// received so we can see whether ride_gps actually reaches the client.
require("dotenv").config();
const http = require("http");

const PORT = process.env.PORT || 3002;
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

const CUSTOMER = {
  email: "siddhantgujar745@gmail.com",
  password: "test@321",
  name: "Siddhant Test",
};

let cookie = "";

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        // Capture set-cookie for session
        const sc = res.headers["set-cookie"];
        if (sc && sc.length) {
          cookie = sc.map((c) => c.split(";")[0]).join("; ");
        }
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let json = null;
          try { json = buf ? JSON.parse(buf) : null; } catch { json = buf; }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`SSE delivery test against ${BASE}`);

  // 1. Login (sets irago_session cookie)
  const login = await api("POST", "/api/auth/passenger/login", {
    email: CUSTOMER.email,
    password: CUSTOMER.password,
  });
  console.log("login:", login.status, login.data?.user?.email || login.data?.error);
  if (login.status !== 200 || !cookie) {
    console.error("FAILED: no session cookie obtained. cookie=", JSON.stringify(cookie));
    process.exit(1);
  }
  console.log("session cookie present:", cookie.slice(0, 40) + "...");

  // 2. Create a booking
  const create = await api("POST", "/api/bookings", {
    pickupName: "Pari Chowk, Greater Noida",
    pickupLat: 28.47, pickupLng: 77.5,
    destName: "Sector 62, Noida",
    destLat: 28.56, destLng: 77.44,
    service: "taxi",
  });
  console.log("create:", create.status, "bookingId=", create.data?.booking?.id);
  if (create.status !== 201) { console.error(create.data); process.exit(1); }
  const bookingId = create.data.booking.id;

  // 3. Pay (triggers demo auto-run)
  const pay = await api("POST", `/api/bookings/${bookingId}/pay`, {});
  console.log("pay:", pay.status, "status=", pay.data?.booking?.status, "operator=", pay.data?.operator?.id);

  // 4. Subscribe to the ride SSE stream with the cookie (like EventSource)
  console.log(`\nSubscribing to SSE /api/tracking/my-ride/${bookingId}/stream ...`);
  const req = http.request(
    `${BASE}/api/tracking/my-ride/${bookingId}/stream`,
    { method: "GET", headers: { Cookie: cookie, Accept: "text/event-stream" } },
    (res) => {
      console.log("SSE response:", res.statusCode, res.headers["content-type"]);
      if (res.statusCode !== 200) {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          console.error("SSE did not return 200. body:", buf.slice(0, 300));
          process.exit(1);
        });
        return;
      }
      let buf = "";
      const events = { ride_state: 0, ride_update: 0, ride_gps: 0, ride_path: 0, dispatch_progress: 0, other: 0 };
      let firstGpsAt = 0;
      res.on("data", (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const m = raw.match(/^event:\s*(\S+)/m);
          const ev = m ? m[1] : "message";
          const dm = raw.match(/^data:\s*(.*)$/m);
          const data = dm ? dm[1] : "";
          if (events[ev] != null) events[ev] += 1; else events.other += 1;
          if (ev === "ride_gps") {
            if (!firstGpsAt) firstGpsAt = Date.now();
            process.stdout.write(`  [ride_gps] ${data}\n`);
          } else {
            process.stdout.write(`  [${ev}] ${data.slice(0, 120)}\n`);
          }
        }
      });
      // Stop after 25s and print summary
      setTimeout(() => {
        console.log("\n=== EVENT SUMMARY (25s) ===");
        console.log(events);
        console.log("first ride_gps at:", firstGpsAt ? `${Date.now() - firstGpsAt}ms ago (relative to now)` : "NONE");
        console.log(events.ride_gps > 0 ? "✅ SSE DELIVERS ride_gps — client-side rendering is the issue" : "❌ NO ride_gps received — SSE delivery is broken");
        process.exit(0);
      }, 25000);
    }
  );
  req.on("error", (e) => { console.error("SSE request error:", e.message); process.exit(1); });
  req.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
