// TWO-WINDOW live demo — passenger window + operator window, both visible.
// Flow you asked for:
//   1. Passenger books & pays.
//   2. Operator window gets the dispatch popup → Accept (on the operator screen).
//   3. Passenger sees the PILOT INFO card (name/aircraft/company) while waiting.
//   4. Pilot marker MOVES toward pickup on the passenger map.
//   5. At pickup → OTP shows on the PASSENGER screen.
//   6. Passenger reads OTP to pilot → operator TYPES it on the OPERATOR screen → ride starts.
//   7. "Continue" → take off → plane flies to destination → trip completes.
//
//   node scripts/browser-demo2.js     (server must be running on PORT)
// Leaves both windows OPEN. Ctrl-C to end.
require("dotenv").config();
const puppeteer = require("puppeteer-core");
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const CHROME = "/usr/bin/google-chrome";

const PICKUP = { name: "Pari Chowk, Greater Noida", lat: 28.47, lng: 77.5 };
const DEST = { name: "Sector 62, Noida", lat: 28.56, lng: 77.44 };
const OP_START = { lat: 28.5, lng: 77.53 }; // ~4.5 km NE of pickup (within 20 km dispatch radius)
const CUSTOMER = { email: "siddhantgujar745@gmail.com", name: "Siddhant Ramling Gujar", password: "test@321" };
const OPERATOR = { email: "ram756.sg@gmail.com", name: "Capt. Ram (Operator)", password: "test@321" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const step = (m) => console.log(`\n[${String(++n).padStart(2, "0")}] ${m}`);

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
  const cols = { name: u.name, passwordHash: hash, role, bannedAt: null, deletedAt: null, emailVerified: 1, mustResetPassword: 0, ...extra };
  if (existing) {
    const sets = Object.keys(cols).map((k) => `${k}=?`).join(",");
    await query(`UPDATE users SET ${sets} WHERE id=?`, [...Object.values(cols), existing.id]);
    return existing.id;
  }
  const keys = ["email", ...Object.keys(cols)];
  const r = await query(`INSERT INTO users (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, [u.email.toLowerCase(), ...Object.values(cols)]);
  return r.insertId;
}
async function clickEl(page, selector) {
  for (let i = 0; i < 25; i++) {
    const c = await page.evaluate((sel) => { const el = document.querySelector(sel); if (el && el.offsetParent !== null) { el.click(); return true; } return false; }, selector);
    if (c) return true; await sleep(200);
  }
  return false;
}
async function newWindow(browser, geo) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(BASE, ["geolocation", "notifications"]);
  const page = await ctx.newPage();
  await page.setViewport({ width: 0, height: 0 }); // use window size
  await page.setGeolocation(geo);
  return page;
}
async function movePilot(opPage, from, to, steps, secs) {
  for (let i = 1; i <= steps; i++) {
    const lat = from.lat + (to.lat - from.lat) * (i / steps);
    const lng = from.lng + (to.lng - from.lng) * (i / steps);
    await opPage.setGeolocation({ latitude: lat, longitude: lng });
    await opPage.evaluate((la, ln) => { if (window.reportOperatorLocation) window.reportOperatorLocation(la, ln); }, lat, lng);
    await sleep((secs * 1000) / steps);
  }
}

async function main() {
  console.log("=== IraGo TWO-WINDOW live demo (passenger + operator) ===");

  // ── DB prep ──
  const office = await queryOne(`SELECT ro.id officeId, ro.companyId FROM regional_offices ro JOIN operator_companies oc ON oc.id=ro.companyId WHERE ro.city='Delhi NCR' ORDER BY ro.id LIMIT 1`);
  await query("UPDATE users SET onDuty=0 WHERE role='operator'");
  const customerId = await ensureUser(CUSTOMER, "customer");
  const opId = await ensureUser(OPERATOR, "operator", { companyId: office.companyId, officeId: office.officeId, aircraftType: "Joby S4 eVTOL", aircraftReg: "VT-IRA", pilotLicense: "CPL-001", onDuty: 1, gpsLat: OP_START.lat, gpsLng: OP_START.lng });

  step("Launching Chrome with two windows…");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ["--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-features=Translate", "--window-size=1100,840"] });

  // ── OPERATOR window (login first; receives offers over WS) ──
  step("OPERATOR window: logging in as the pilot…");
  const opGeo = { latitude: OP_START.lat, longitude: OP_START.lng };
  const opPage = await newWindow(browser, opGeo);
  await opPage.goto(`${BASE}/login/operator`, { waitUntil: "networkidle2" });
  await opPage.waitForSelector("#login-email", { visible: true, timeout: 15000 });
  await opPage.type("#login-email", OPERATOR.email, { delay: 30 });
  await opPage.type("#login-password", OPERATOR.password, { delay: 30 });
  await sleep(400);
  await clickEl(opPage, "#login-submit");
  await opPage.waitForSelector("#operator-view.active", { visible: true, timeout: 15000 });
  await sleep(2000);
  const opToken = await login("operator", OPERATOR.email, OPERATOR.password);
  const opPos = await opPage.evaluate(() => new Promise((r) => navigator.geolocation.getCurrentPosition((p) => r({ lat: p.coords.latitude, lng: p.coords.longitude }), (e) => r({ err: e.message }), { timeout: 5000 }))).catch(() => ({ err: "n/a" }));
  console.log("   operator browser geolocation:", JSON.stringify(opPos));
  step("Operator is on-duty and listening for dispatch offers.");

  // ── PASSENGER window ──
  step("PASSENGER window: logging in…");
  const custPage = await newWindow(browser, { latitude: PICKUP.lat, longitude: PICKUP.lng });
  await custPage.goto(`${BASE}/app.html`, { waitUntil: "networkidle2" });
  await custPage.waitForSelector("#login-email", { visible: true, timeout: 15000 });
  await custPage.type("#login-email", CUSTOMER.email, { delay: 30 });
  await custPage.type("#login-password", CUSTOMER.password, { delay: 30 });
  await sleep(400);
  await clickEl(custPage, "#login-submit");
  await custPage.waitForSelector("#booking-view.active", { visible: true, timeout: 15000 });
  await sleep(1000);

  step("Passenger sets route + searches…");
  await custPage.evaluate((p) => { switchService("taxi"); setPickup([p.lat, p.lng], p.name); }, PICKUP);
  await sleep(1000);
  await custPage.evaluate((d) => setDest([d.lat, d.lng], d.name), DEST);
  await sleep(1200);
  await clickEl(custPage, "#search-btn");
  await custPage.waitForSelector("#rides-list .ride-card", { visible: true, timeout: 15000 });
  await sleep(1800);
  await clickEl(custPage, "#rides-list .ride-card");
  await sleep(1000);
  await custPage.waitForSelector("#book-btn", { visible: true });
  await clickEl(custPage, "#book-btn");
  step("Passenger pays (mock) and opens the tracking screen…");
  await custPage.waitForSelector("#payment-pay-btn", { visible: true, timeout: 15000 });
  await sleep(1200);
  // Re-assert dispatch eligibility immediately before pay so a stale browser-GPS
  // heartbeat can't push the pilot out of the 20 km dispatch radius. Dispatch
  // runs server-side synchronously inside /pay, so this value is what it sees.
  await query("UPDATE users SET onDuty=1, gpsLat=?, gpsLng=? WHERE id=?", [OP_START.lat, OP_START.lng, opId]);
  await clickEl(custPage, "#payment-pay-btn");
  await sleep(2500);
  await custPage.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && x.textContent.includes("Track My Ride")); if (b) b.click(); });
  await sleep(2500); // passenger SSE now connected — subscribe BEFORE operator accepts

  const booking = await queryOne("SELECT id FROM bookings WHERE customerId=? ORDER BY id DESC LIMIT 1", [customerId]);
  const bid = booking.id;
  step(`Booking #${bid} dispatched → OPERATOR window should show the offer popup…`);

  // Confirm dispatch actually created an offer for our pilot.
  const offer = await (async () => {
    for (let i = 0; i < 20; i++) { const o = await queryOne("SELECT id FROM dispatch_offers WHERE bookingId=? AND operatorId=? AND status='pending' ORDER BY id DESC LIMIT 1", [bid, opId]); if (o) return o; await sleep(300); }
    return null;
  })();
  const bst = await queryOne("SELECT status FROM bookings WHERE id=?", [bid]);
  console.log(`   dispatch: booking status=${bst.status}, offer=${offer ? "#" + offer.id : "none"}`);

  // ── OPERATOR accepts the offer on screen (fallback to API if popup is slow) ──
  const gotOffer = await opPage.waitForSelector("#dispatch-accept-btn", { visible: true, timeout: 12000 }).then(() => true).catch(() => false);
  await sleep(2000); // let you SEE the popup
  if (gotOffer) {
    step("OPERATOR clicks Accept ✅ (on screen)");
    await clickEl(opPage, "#dispatch-accept-btn");
  } else if (offer) {
    step("OPERATOR accepts (popup slow — accepting via API; UI will refresh)");
    await api(opToken, "POST", `/api/operator/dispatch/offers/${offer.id}/accept`, {});
  } else {
    console.log("   ⚠ no offer to accept — aborting flow"); await new Promise(() => {}); return;
  }
  await sleep(3000); // passenger sees PILOT INFO card + ETA while waiting

  step("Passenger now sees pilot info (name/aircraft/company). Operator accepts mission → en route.");
  await opPage.evaluate((id) => { if (window.acceptTrip) acceptTrip(id); }, bid);
  await sleep(2500);
  await opPage.evaluate((id) => { if (window.advanceTrip) advanceTrip(id, "enroute"); }, bid);
  await sleep(2500);

  step("PILOT MOVING toward pickup (watch the plane on the passenger map)…");
  await movePilot(opPage, OP_START, PICKUP, 6, 12);
  await sleep(1500);

  step("Pilot reached pickup → operator marks 'arrived'. OTP appears on the PASSENGER screen.");
  await opPage.evaluate((id) => { if (window.advanceTrip) advanceTrip(id, "pickup"); }, bid);
  await sleep(4000);
  const otpRow = await queryOne("SELECT rideOtp FROM bookings WHERE id=?", [bid]);
  step(`Passenger's OTP = ${otpRow.rideOtp}. OPERATOR TYPES it on the operator screen…`);
  // ensure the trip details + OTP input are on screen
  await opPage.evaluate((id) => { if (window.openTripDetails) openTripDetails(id); }, bid);
  await opPage.waitForSelector("#op-otp-input", { visible: true, timeout: 8000 }).catch(() => {});
  await opPage.evaluate(() => { const i = document.getElementById("op-otp-input"); if (i) i.value = ""; });
  await opPage.type("#op-otp-input", otpRow.rideOtp, { delay: 250 });
  await sleep(800);
  await opPage.evaluate((id) => { if (window.verifyRideOtp) verifyRideOtp(id); }, bid);
  await sleep(3000);
  step("OTP verified → ride started (picked_up). Passenger OTP card hides.");

  step("'Continue' → take off, fly to destination…");
  await opPage.evaluate((id) => { if (window.advanceTrip) advanceTrip(id, "takeoff"); }, bid);
  await sleep(2500);
  await movePilot(opPage, PICKUP, DEST, 6, 12); // plane flies to destination on passenger map
  await sleep(1000);
  step("Landed → operator completes the trip.");
  await opPage.evaluate((id) => { if (window.openTripDetails) openTripDetails(id); }, bid);
  await sleep(800);
  await opPage.evaluate((id) => { if (window.advanceTrip) advanceTrip(id, "complete"); }, bid);
  await sleep(2500);

  const fin = await queryOne("SELECT status, paymentStatus, rideOtpVerified FROM bookings WHERE id=?", [bid]);
  console.log(`\n✅ FLOW COMPLETE — booking #${bid}: ${JSON.stringify(fin)}`);
  console.log("Both windows left OPEN. Ctrl-C this process when done.");
  await new Promise(() => {});
}

main().catch((e) => { console.error("\nFATAL:", e.stack || e.message); process.exitCode = 1; });
