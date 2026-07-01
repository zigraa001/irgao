// LIVE browser demo — drives a REAL visible Chrome window so you can watch the
// whole booking flow happen on screen. The customer side runs in the browser
// (login → pick route → search → pay → track); the operator side is advanced
// over the API so the customer's tracking screen updates in real time via SSE.
//
//   node scripts/browser-demo.js        (server must be running on PORT)
//
// Leaves the browser OPEN at the end so you can poke around. Ctrl-C / close the
// window when done.
require("dotenv").config();
const puppeteer = require("puppeteer-core");
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const CHROME = "/usr/bin/google-chrome";

const PICKUP = { name: "Pari Chowk, Greater Noida", lat: 28.47, lng: 77.5 };
const DEST = { name: "Sector 62, Noida", lat: 28.56, lng: 77.44 };
const OP_GPS = { lat: 28.472, lng: 77.498 };
const CUSTOMER = { email: "siddhantgujar745@gmail.com", name: "Siddhant Ramling Gujar", password: "test@321" };
const OPERATOR = { email: "ram756.sg@gmail.com", name: "Capt. Ram (Operator)", password: "test@321" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const step = (m) => console.log(`\n[${String(++n).padStart(2, "0")}] ${m}`);

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
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
// Atomic click: re-query + click inside the page in one shot, so a re-render
// between locate and click can't detach the node. Retries briefly.
async function clickEl(page, selector) {
  for (let i = 0; i < 25; i++) {
    const clicked = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) { el.click(); return true; }
      return false;
    }, selector);
    if (clicked) return true;
    await sleep(200);
  }
  return false;
}
async function clickByText(page, selector, text) {
  const handle = await page.evaluateHandle((sel, t) => {
    const els = [...document.querySelectorAll(sel)];
    return els.find((e) => e.offsetParent !== null && e.textContent.trim().includes(t)) || null;
  }, selector, text);
  const el = handle.asElement();
  if (el) { await el.click(); return true; }
  return false;
}

async function main() {
  console.log("=== IraGo LIVE browser demo (watch your screen!) ===");

  // ── DB prep: ensure accounts; only our pilot is on-duty near pickup ──
  const office = await queryOne(
    `SELECT ro.id officeId, ro.companyId FROM regional_offices ro JOIN operator_companies oc ON oc.id=ro.companyId WHERE ro.city='Delhi NCR' ORDER BY ro.id LIMIT 1`
  );
  await query("UPDATE users SET onDuty=0 WHERE role='operator'");
  const customerId = await ensureUser(CUSTOMER, "customer");
  await ensureUser(OPERATOR, "operator", {
    companyId: office.companyId, officeId: office.officeId, aircraftType: "Joby S4 eVTOL",
    aircraftReg: "VT-IRA", pilotLicense: "CPL-001", onDuty: 1, gpsLat: OP_GPS.lat, gpsLng: OP_GPS.lng,
  });
  const opToken = await login("operator", OPERATOR.email, OPERATOR.password);

  step("Launching a real Chrome window…");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized", "--no-first-run", "--no-default-browser-check", "--disable-features=Translate"],
  });
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(BASE, ["geolocation", "notifications"]);
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setGeolocation({ latitude: PICKUP.lat, longitude: PICKUP.lng });

  step("Opening the app + logging in as the customer…");
  await page.goto(`${BASE}/app.html`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#login-email", { visible: true });
  await sleep(800);
  await page.type("#login-email", CUSTOMER.email, { delay: 40 });
  await page.type("#login-password", CUSTOMER.password, { delay: 40 });
  await sleep(500);
  await page.click("#login-submit");
  await page.waitForSelector("#booking-view.active", { visible: true, timeout: 15000 });
  step("Logged in → booking view. Setting pickup & destination…");
  await sleep(1200);

  // Set route via the app's own functions (robust vs simulating map clicks).
  await page.evaluate((p, d) => { switchService("taxi"); setPickup([p.lat, p.lng], p.name); }, PICKUP, DEST);
  await sleep(1200);
  await page.evaluate((d) => setDest([d.lat, d.lng], d.name), DEST);
  await sleep(1500);

  step("Searching for rides…");
  await clickEl(page, "#search-btn");
  await page.waitForSelector("#rides-list .ride-card", { visible: true, timeout: 15000 });
  await sleep(2000); // let the feasibility re-render settle before clicking
  step("Selecting the first ride option…");
  await clickEl(page, "#rides-list .ride-card");
  await sleep(1200);
  await page.waitForSelector("#book-btn", { visible: true });
  await clickEl(page, "#book-btn");

  step("Confirming + paying (mock checkout)…");
  await page.waitForSelector("#payment-pay-btn", { visible: true, timeout: 15000 });
  await sleep(1500);
  await clickEl(page, "#payment-pay-btn");
  await sleep(2500);
  // Move to tracking ("Track My Ride" on the confirmation overlay).
  await clickByText(page, "button", "Track My Ride").catch(() => {});
  await sleep(1500);

  // Identify the booking just created/paid.
  const booking = await queryOne(
    "SELECT id FROM bookings WHERE customerId=? ORDER BY id DESC LIMIT 1", [customerId]
  );
  const bid = booking.id;
  step(`Booking #${bid} is live. Now driving the PILOT side (watch the tracking screen update)…`);

  // ── Operator side over the API, paced so the UI animates each change ──
  const offer = await (async () => {
    for (let i = 0; i < 20; i++) {
      const o = await queryOne("SELECT id FROM dispatch_offers WHERE bookingId=? AND status='pending' ORDER BY id DESC LIMIT 1", [bid]);
      if (o) return o; await sleep(300);
    }
    return null;
  })();
  if (!offer) { console.log("   ⚠ no dispatch offer found — is the pilot on-duty/near pickup?"); }

  step("Pilot accepts the request (→ assigned, aircraft attached)"); await api(opToken, "POST", `/api/operator/dispatch/offers/${offer.id}/accept`, {}); await sleep(3500);
  step("Pilot accepts mission (→ accepted)"); await api(opToken, "POST", `/api/operator/trips/${bid}/accept`, {}); await sleep(3500);
  step("Pilot en route (→ enroute) + GPS pings"); await api(opToken, "POST", `/api/operator/trips/${bid}/enroute`, {});
  for (const [dlat, dlng] of [[0.03, 0.02], [0.02, 0.012], [0.008, 0.005]]) {
    await api(opToken, "POST", "/api/operator/location", { lat: PICKUP.lat + dlat, lng: PICKUP.lng + dlng }); await sleep(1500);
  }
  step("Pilot at pickup (→ at_pickup). Customer's OTP appears on screen…"); await api(opToken, "POST", `/api/operator/trips/${bid}/pickup`, {}); await sleep(4000);
  const otpRow = await queryOne("SELECT rideOtp FROM bookings WHERE id=?", [bid]);
  step(`Pilot verifies OTP ${otpRow.rideOtp} (→ picked_up, ride starts)`); await api(opToken, "POST", `/api/operator/bookings/${bid}/verify-otp`, { otp: otpRow.rideOtp }); await sleep(3500);
  step("Takeoff (→ flying)"); await api(opToken, "POST", `/api/operator/trips/${bid}/takeoff`, {}); await sleep(4000);
  step("Landed (→ completed)"); await api(opToken, "POST", `/api/operator/trips/${bid}/complete`, {}); await sleep(2500);

  const fin = await queryOne("SELECT status, paymentStatus, rideOtpVerified FROM bookings WHERE id=?", [bid]);
  console.log(`\n✅ LIVE FLIGHT COMPLETE — booking #${bid}: ${JSON.stringify(fin)}`);
  console.log("\nBrowser is left OPEN so you can explore. Close the window (or Ctrl-C this process) when done.");

  // Keep the process (and browser) alive.
  await new Promise(() => {});
}

main().catch((e) => { console.error("\nFATAL:", e.stack || e.message); process.exitCode = 1; });
