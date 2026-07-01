// One-shot end-to-end demo: seeds a demo customer + on-duty operator, then
// drives a single booking through the FULL live lifecycle against the running
// server (http://localhost:PORT) using the real HTTP API.
//
//   book → pay → dispatch offer → operator accepts → accept mission →
//   enroute → at pickup → customer shares ride-OTP → operator verifies →
//   picked_up → takeoff → flying → complete
//
// Run with the server already up:  node scripts/demo-flight.js
require("dotenv").config();
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

// Clear southeast corridor (Greater Noida → Noida) — confirmed free of no-fly zones.
const PICKUP = { name: "Pari Chowk, Greater Noida", lat: 28.47, lng: 77.5 };
const DEST = { name: "Sector 62, Noida", lat: 28.56, lng: 77.44 };
const OP_GPS = { lat: 28.472, lng: 77.498 }; // ~0.3 km from pickup

const CUSTOMER = { email: "siddhantgujar745@gmail.com", name: "Siddhant Ramling Gujar", password: "test@321" };
const OPERATOR = { email: "ram756.sg@gmail.com", name: "Capt. Ram (Operator)", password: "test@321" };

let step = 0;
const log = (msg, data) => {
  step += 1;
  console.log(`\n[${String(step).padStart(2, "0")}] ${msg}`);
  if (data !== undefined) console.log("     " + JSON.stringify(data));
};
const fail = (msg, extra) => {
  console.error(`\n✗ FAILED: ${msg}`);
  if (extra !== undefined) console.error("   " + JSON.stringify(extra));
  process.exitCode = 1;
  throw new Error(msg);
};

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

async function login(portal, email, password) {
  const r = await api(null, "POST", `/api/auth/${portal}/login`, { email, password });
  if (r.status !== 200 || !r.data?.token) fail(`login ${portal} (${email})`, r);
  return r.data.token;
}

async function ensureUser(u, role, extra = {}) {
  const hash = await hashPassword(u.password);
  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [u.email.toLowerCase()]);
  const cols = { name: u.name, passwordHash: hash, role, ...extra };
  if (existing) {
    const sets = Object.keys(cols).map((k) => `${k} = ?`).join(", ");
    await query(`UPDATE users SET ${sets} WHERE id = ?`, [...Object.values(cols), existing.id]);
    return existing.id;
  }
  const keys = ["email", ...Object.keys(cols)];
  const vals = [u.email.toLowerCase(), ...Object.values(cols)];
  const res = await query(
    `INSERT INTO users (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    vals
  );
  return res.insertId;
}

async function bookingStatus(token, id) {
  const r = await api(token, "GET", `/api/bookings/${id}`);
  return r.data?.booking?.status || r.data?.status;
}

async function main() {
  console.log("=== IraGo end-to-end demo flight ===");
  console.log(`Server: ${BASE}`);

  // ── Seed demo users (bypasses OTP signup, which needs a real inbox) ──
  // Pick the SkyTaxi company + its Delhi NCR office for the pilot's profile.
  const office = await queryOne(
    `SELECT ro.id AS officeId, ro.companyId, oc.name AS companyName, ro.city
     FROM regional_offices ro JOIN operator_companies oc ON oc.id = ro.companyId
     WHERE ro.city = 'Delhi NCR' ORDER BY ro.id LIMIT 1`
  );
  if (!office) fail("no seeded regional office found — is the server up so initSchema seeded companies?");

  // Make sure our demo pilot is the only nearby on-duty candidate.
  await query("UPDATE users SET onDuty = 0 WHERE role = 'operator'");

  const customerId = await ensureUser(CUSTOMER, "customer");
  const operatorId = await ensureUser(OPERATOR, "operator", {
    companyId: office.companyId,
    officeId: office.officeId,
    aircraftType: "Joby S4 eVTOL",
    aircraftReg: "VT-IRA",
    pilotLicense: "CPL-DEMO-001",
    onDuty: 1,
    gpsLat: OP_GPS.lat,
    gpsLng: OP_GPS.lng,
  });
  log(`Seeded demo customer #${customerId} and on-duty pilot #${operatorId}`, {
    company: office.companyName,
    office: office.city,
    pilotGps: OP_GPS,
  });

  // ── Logins ──
  const custToken = await login("passenger", CUSTOMER.email, CUSTOMER.password);
  const opToken = await login("operator", OPERATOR.email, OPERATOR.password);
  log("Both logged in (customer + operator portals)");

  // ── 1. Customer creates a booking ──
  const create = await api(custToken, "POST", "/api/bookings", {
    pickupName: PICKUP.name,
    pickupLat: PICKUP.lat,
    pickupLng: PICKUP.lng,
    destName: DEST.name,
    destLat: DEST.lat,
    destLng: DEST.lng,
    service: "taxi",
  });
  if (create.status !== 201) fail("create booking", create);
  const bookingId = create.data.booking.id;
  log(`Booking #${bookingId} created`, {
    status: create.data.booking.status,
    distanceKm: create.data.booking.distanceKm,
    fare: create.data.fare?.total ?? create.data.booking.fareEstimate,
    assignedCompany: create.data.company,
  });

  // ── 2. Customer pays → triggers auto-dispatch ──
  const pay = await api(custToken, "POST", `/api/bookings/${bookingId}/pay`, {});
  if (pay.status !== 200) fail("pay booking", pay);
  log("Payment successful → dispatch started", { message: pay.data.message, status: pay.data.booking.status });

  // ── 3. Read the dispatch offer the engine just created for our pilot ──
  // (normally delivered to the pilot over SSE / web-push; we read it from the
  // dispatch_offers table to drive the accept via the real API).
  let offer = null;
  for (let i = 0; i < 10 && !offer; i++) {
    offer = await queryOne(
      "SELECT id FROM dispatch_offers WHERE bookingId = ? AND operatorId = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [bookingId, operatorId]
    );
    if (!offer) await new Promise((r) => setTimeout(r, 200));
  }
  if (!offer) fail("no dispatch offer reached the demo pilot (check radius / on-duty / GPS)");
  log(`Dispatch offered booking to pilot — offer #${offer.id}`);

  // ── 4. Operator accepts the dispatch offer ──
  const acc = await api(opToken, "POST", `/api/operator/dispatch/offers/${offer.id}/accept`, {});
  if (acc.status !== 200) fail("operator accept offer", acc);
  log("Pilot accepted the offer", { status: acc.data.booking.status, aircraftId: acc.data.booking.aircraftId });

  // ── 5. Operator accepts the mission (assigned → accepted) ──
  const accept = await api(opToken, "POST", `/api/operator/trips/${bookingId}/accept`, {});
  if (accept.status !== 200) fail("accept mission", accept);
  log("Mission accepted", { status: accept.data.booking.status });

  // ── 6. enroute → at_pickup ──
  let r = await api(opToken, "POST", `/api/operator/trips/${bookingId}/enroute`, {});
  if (r.status !== 200) fail("enroute", r);
  log("Pilot en route to pickup", { status: r.data.booking.status });

  // Pilot sends a GPS heartbeat (pushes live position to the passenger channel).
  await api(opToken, "POST", "/api/operator/location", { lat: PICKUP.lat, lng: PICKUP.lng });

  r = await api(opToken, "POST", `/api/operator/trips/${bookingId}/pickup`, {});
  if (r.status !== 200) fail("pickup", r);
  log("Pilot arrived at pickup (awaiting OTP)", { status: r.data.booking.status });

  // ── 7. Customer fetches the ride OTP and shares it ──
  const otpRes = await api(custToken, "GET", `/api/bookings/${bookingId}/ride-otp`);
  if (otpRes.status !== 200 || !otpRes.data?.rideOtp) fail("fetch ride OTP", otpRes);
  const rideOtp = otpRes.data.rideOtp;
  log(`Customer's ride OTP: ${rideOtp} (shared with pilot)`);

  // ── 8. Operator verifies the OTP → picked_up ──
  const verify = await api(opToken, "POST", `/api/operator/bookings/${bookingId}/verify-otp`, { otp: rideOtp });
  if (verify.status !== 200) fail("verify ride OTP", verify);
  log("OTP verified — ride started", { status: verify.data.booking.status, msg: verify.data.message });

  // ── 9. takeoff → flying ──
  r = await api(opToken, "POST", `/api/operator/trips/${bookingId}/takeoff`, {});
  if (r.status !== 200) fail("takeoff", r);
  log("Airborne", { status: r.data.booking.status });

  // ── 10. complete → completed (releases aircraft) ──
  r = await api(opToken, "POST", `/api/operator/trips/${bookingId}/complete`, {});
  if (r.status !== 200) fail("complete", r);
  log("Landed — trip completed", { status: r.data.booking.status });

  // ── 11. Customer rates the completed trip ──
  const rate = await api(custToken, "POST", `/api/bookings/${bookingId}/rate`, { stars: 5, comment: "Smooth demo flight!" });
  if (rate.status !== 200) fail("submit rating", rate);
  log("Customer rated the pilot 5★", { status: rate.status });

  // ── Final verification ──
  const finalBooking = await queryOne("SELECT status, operatorId, aircraftId, rideOtpVerified, paymentStatus FROM bookings WHERE id = ?", [bookingId]);
  const aircraftAfter = finalBooking.aircraftId
    ? await queryOne("SELECT status FROM aircraft WHERE id = ?", [finalBooking.aircraftId])
    : null;
  const opAfter = await queryOne("SELECT onDuty FROM users WHERE id = ?", [operatorId]);

  console.log("\n=== FINAL STATE ===");
  console.log(JSON.stringify({
    bookingId,
    status: finalBooking.status,
    paymentStatus: finalBooking.paymentStatus,
    rideOtpVerified: !!finalBooking.rideOtpVerified,
    operatorOnDutyAfterDropoff: !!opAfter.onDuty,
    aircraftReleased: finalBooking.aircraftId === null,
  }, null, 2));

  const ok = finalBooking.status === "completed" && finalBooking.rideOtpVerified;
  console.log(ok ? "\n✅ END-TO-END LIFECYCLE PASSED" : "\n✗ lifecycle did not reach completed/verified");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
