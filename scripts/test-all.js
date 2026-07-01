// Comprehensive LIVE integration test for IraGo.
// Drives every feature area against the running server (http://localhost:PORT)
// using the real HTTP API + the real MySQL DB, and prints a PASS/FAIL matrix.
//
//   node scripts/test-all.js          (server must be running)
//
// Accounts (created/repaired here):
//   customer  siddhantgujar745@gmail.com / test@321   (existing acct)
//   operator  ram756.sg@gmail.com        / test@321
//   operator2 demo.pilot2@irago.test     / test@321   (for re-dispatch test)
//   admin     from .env (ADMIN_USER / ADMIN_PASSWORD)
require("dotenv").config();
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD };

// Clear southeast corridor (no no-fly zones); blocked point sits inside Delhi IGI.
const PICKUP = { name: "Pari Chowk, Greater Noida", lat: 28.47, lng: 77.5 };
const DEST = { name: "Sector 62, Noida", lat: 28.56, lng: 77.44 };
const OP1_GPS = { lat: 28.472, lng: 77.498 };
const OP2_GPS = { lat: 28.49, lng: 77.52 };
const BLOCKED = { lat: 28.556, lng: 77.1 }; // inside Delhi IGI no-fly

const CUSTOMER = { email: "siddhantgujar745@gmail.com", name: "Siddhant Ramling Gujar", password: "test@321" };
const OPERATOR = { email: "ram756.sg@gmail.com", name: "Capt. Ram (Operator)", password: "test@321" };
const OPERATOR2 = { email: "demo.pilot2@irago.test", name: "Capt. Two", password: "test@321" };

const results = [];
let curArea = "";
const area = (a) => { curArea = a; console.log(`\n── ${a} ──`); };
function ok(name, cond, detail) {
  const pass = !!cond;
  results.push({ area: curArea, name, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${name}${detail && !pass ? "  → " + JSON.stringify(detail) : ""}`);
  return pass;
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
  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [u.email.toLowerCase()]);
  const cols = { name: u.name, passwordHash: hash, role, bannedAt: null, deletedAt: null, ...extra };
  if (existing) {
    const sets = Object.keys(cols).map((k) => `${k} = ?`).join(", ");
    await query(`UPDATE users SET ${sets} WHERE id = ?`, [...Object.values(cols), existing.id]);
    return existing.id;
  }
  const keys = ["email", ...Object.keys(cols)];
  const vals = [u.email.toLowerCase(), ...Object.values(cols)];
  const r = await query(`INSERT INTO users (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, vals);
  return r.insertId;
}
async function pendingOffer(bookingId, operatorId) {
  for (let i = 0; i < 15; i++) {
    const o = await queryOne(
      "SELECT id, operatorId FROM dispatch_offers WHERE bookingId=? " +
        (operatorId ? "AND operatorId=? " : "") + "AND status='pending' ORDER BY id DESC LIMIT 1",
      operatorId ? [bookingId, operatorId] : [bookingId]
    );
    if (o) return o;
    await sleep(200);
  }
  return null;
}
async function bookAndPay(token, service = "taxi", pickup = PICKUP, dest = DEST) {
  const c = await api(token, "POST", "/api/bookings", {
    pickupName: pickup.name || "P", pickupLat: pickup.lat, pickupLng: pickup.lng,
    destName: dest.name || "D", destLat: dest.lat, destLng: dest.lng, service,
  });
  if (c.status !== 201) return { create: c };
  const id = c.data.booking.id;
  const p = await api(token, "POST", `/api/bookings/${id}/pay`, {});
  return { id, create: c, pay: p };
}

async function main() {
  console.log("=== IraGo FULL feature live test ===\nServer:", BASE);

  // ── Seed / repair accounts ──
  const office = await queryOne(
    `SELECT ro.id officeId, ro.companyId FROM regional_offices ro JOIN operator_companies oc ON oc.id=ro.companyId
     WHERE ro.city='Delhi NCR' ORDER BY ro.id LIMIT 1`
  );
  await query("UPDATE users SET onDuty=0 WHERE role='operator'");
  const customerId = await ensureUser(CUSTOMER, "customer");
  const op1Id = await ensureUser(OPERATOR, "operator", {
    companyId: office.companyId, officeId: office.officeId, aircraftType: "Joby S4 eVTOL",
    aircraftReg: "VT-IRA", pilotLicense: "CPL-001", onDuty: 1, gpsLat: OP1_GPS.lat, gpsLng: OP1_GPS.lng,
  });
  const op2Id = await ensureUser(OPERATOR2, "operator", {
    companyId: office.companyId, officeId: office.officeId, onDuty: 0, gpsLat: OP2_GPS.lat, gpsLng: OP2_GPS.lng,
  });

  const cust = await login("passenger", CUSTOMER.email, CUSTOMER.password);
  const op1 = await login("operator", OPERATOR.email, OPERATOR.password);
  const op2 = await login("operator", OPERATOR2.email, OPERATOR2.password);
  const admin = await login("admin", ADMIN.email, ADMIN.password);

  // ════════ A. Auth & guards ════════
  area("A. Auth & guards");
  const health = await api(null, "GET", "/api/health");
  ok("GET /api/health → ok + db connected", health.status === 200 && health.data?.db === "connected", health.data);
  ok("customer login returns token", !!cust);
  ok("operator login returns token", !!op1);
  ok("admin login returns token", !!admin, { admin: ADMIN.email });
  const wrongPw = await api(null, "POST", "/api/auth/passenger/login", { email: CUSTOMER.email, password: "nope" });
  ok("wrong password → 401", wrongPw.status === 401, wrongPw.status);
  const wrongPortal = await api(null, "POST", "/api/auth/operator/login", { email: CUSTOMER.email, password: CUSTOMER.password });
  ok("customer on operator portal → 403 WRONG_PORTAL", wrongPortal.status === 403 && wrongPortal.data?.code === "WRONG_PORTAL", wrongPortal.data);
  const me = await api(cust, "GET", "/api/me");
  ok("GET /api/me → 200 customer", me.status === 200 && me.data?.user?.role === "customer", me.data);
  const noTok = await api(null, "GET", "/api/me");
  ok("GET /api/me no token → 401", noTok.status === 401, noTok.status);
  const custAdmin = await api(cust, "GET", "/api/admin/users");
  ok("customer hitting /api/admin → 403", custAdmin.status === 403, custAdmin.status);
  const anonAdmin = await api(null, "GET", "/api/admin/users");
  ok("anon hitting /api/admin → 401", anonAdmin.status === 401, anonAdmin.status);

  // ════════ B. Zones & route planning ════════
  area("B. Zones & route planning");
  const zones = await api(cust, "GET", "/api/zones?swLat=28.3&swLng=76.9&neLat=28.9&neLng=77.7");
  ok("GET /api/zones (viewport) → 200 with zones", zones.status === 200 && Array.isArray(zones.data?.zones) && zones.data.zones.length > 0, { n: zones.data?.zones?.length });
  const zonesNoBounds = await api(cust, "GET", "/api/zones");
  ok("GET /api/zones no bounds → 400", zonesNoBounds.status === 400, zonesNoBounds.status);
  const legends = await api(null, "GET", "/api/zones/legends");
  ok("GET /api/zones/legends (public) → 200", legends.status === 200 && !!legends.data?.zoneTypes, Object.keys(legends.data || {}));
  const fuel = await api(cust, "POST", "/api/route/fuel-plan", { pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, destLat: DEST.lat, destLng: DEST.lng, service: "taxi" });
  ok("POST /api/route/fuel-plan (clear) → 200 plan", fuel.status === 200 && !!fuel.data?.plan, fuel.status);

  // ════════ C. Booking feasibility ════════
  area("C. Booking feasibility");
  const feasClear = await api(cust, "POST", "/api/bookings/feasibility", { pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, destLat: DEST.lat, destLng: DEST.lng, service: "taxi" });
  ok("feasibility clear corridor → feasible:true", feasClear.status === 200 && feasClear.data?.feasible === true, feasClear.data?.feasible);
  const feasBlocked = await api(cust, "POST", "/api/bookings/feasibility", { pickupLat: BLOCKED.lat, pickupLng: BLOCKED.lng, destLat: DEST.lat, destLng: DEST.lng, service: "taxi" });
  ok("feasibility into IGI no-fly → feasible:false", feasBlocked.status === 200 && feasBlocked.data?.feasible === false, feasBlocked.data?.feasible);

  // ════════ D. Booking validation (negative) ════════
  area("D. Booking validation");
  const missing = await api(cust, "POST", "/api/bookings", { pickupName: "x", service: "taxi" });
  ok("create booking missing coords → 400", missing.status === 400, missing.status);
  const badService = await api(cust, "POST", "/api/bookings", { pickupName: "P", pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, destName: "D", destLat: DEST.lat, destLng: DEST.lng, service: "rocket" });
  ok("create booking invalid service → 400", badService.status === 400, badService.status);
  const blockedCreate = await api(cust, "POST", "/api/bookings", { pickupName: "P", pickupLat: BLOCKED.lat, pickupLng: BLOCKED.lng, destName: "D", destLat: DEST.lat, destLng: DEST.lng, service: "taxi" });
  ok("create booking into no-fly → 409 ROUTE_BLOCKED", blockedCreate.status === 409 && blockedCreate.data?.code === "ROUTE_BLOCKED", blockedCreate.data?.code);
  const payMissing = await api(cust, "POST", "/api/bookings/99999/pay", {});
  ok("pay nonexistent booking → 404", payMissing.status === 404, payMissing.status);

  // ════════ E. Tracking (pre-booking supply) ════════
  area("E. Tracking");
  const nearby = await api(cust, "GET", `/api/tracking/nearby?lat=${PICKUP.lat}&lng=${PICKUP.lng}`);
  const hasOp1 = (nearby.data?.taxis || []).some((t) => t.operatorId === op1Id);
  ok("GET /api/tracking/nearby → on-duty pilot visible", nearby.status === 200 && hasOp1, { taxis: nearby.data?.taxis?.length });

  // ════════ F. FULL ride lifecycle ════════
  area("F. Full ride lifecycle (book→pay→dispatch→fly→complete→rate)");
  const trip = await bookAndPay(cust);
  const bookingId = trip.id;
  ok("create booking → 201 requested", trip.create.status === 201 && trip.create.data.booking.status === "requested", trip.create.status);
  ok("pay → 200 dispatching", trip.pay?.status === 200, trip.pay?.data?.message);
  const offer = await pendingOffer(bookingId, op1Id);
  ok("dispatch offered to nearest pilot", !!offer, offer);
  let r = await api(op1, "POST", `/api/operator/dispatch/offers/${offer?.id}/accept`, {});
  ok("operator accepts offer → assigned + aircraft", r.status === 200 && r.data?.booking?.status === "assigned" && !!r.data.booking.aircraftId, { st: r.data?.booking?.status, ac: r.data?.booking?.aircraftId });
  r = await api(op1, "POST", `/api/operator/trips/${bookingId}/accept`, {});
  ok("accept mission → accepted", r.data?.booking?.status === "accepted", r.data?.booking?.status);
  r = await api(op1, "POST", `/api/operator/trips/${bookingId}/enroute`, {});
  ok("enroute", r.data?.booking?.status === "enroute", r.data?.booking?.status);
  const loc = await api(op1, "POST", "/api/operator/location", { lat: PICKUP.lat, lng: PICKUP.lng });
  ok("operator GPS heartbeat → 200", loc.status === 200, loc.status);
  r = await api(op1, "POST", `/api/operator/trips/${bookingId}/pickup`, {});
  ok("at_pickup", r.data?.booking?.status === "at_pickup", r.data?.booking?.status);
  const otpRes = await api(cust, "GET", `/api/bookings/${bookingId}/ride-otp`);
  const rideOtp = otpRes.data?.rideOtp;
  ok("customer fetches ride-OTP", otpRes.status === 200 && /^\d{4}$/.test(rideOtp || ""), rideOtp);
  const badOtp = await api(op1, "POST", `/api/operator/bookings/${bookingId}/verify-otp`, { otp: "0000" });
  ok("wrong OTP rejected", badOtp.status === 400, badOtp.data?.error);
  r = await api(op1, "POST", `/api/operator/bookings/${bookingId}/verify-otp`, { otp: rideOtp });
  ok("correct OTP → picked_up", r.status === 200 && r.data?.booking?.status === "picked_up", r.data?.booking?.status);
  r = await api(op1, "POST", `/api/operator/trips/${bookingId}/takeoff`, {});
  ok("takeoff → flying", r.data?.booking?.status === "flying", r.data?.booking?.status);
  // status order enforcement: can't jump backward
  const backward = await api(op1, "POST", `/api/operator/trips/${bookingId}/enroute`, {});
  ok("cannot move flying→enroute (order enforced) → 409", backward.status === 409, backward.status);
  r = await api(op1, "POST", `/api/operator/trips/${bookingId}/complete`, {});
  ok("complete → completed", r.data?.booking?.status === "completed", r.data?.booking?.status);
  const acFreed = await queryOne("SELECT aircraftId FROM bookings WHERE id=?", [bookingId]);
  ok("aircraft released on completion", acFreed.aircraftId === null, acFreed.aircraftId);
  const rate = await api(cust, "POST", `/api/bookings/${bookingId}/rate`, { stars: 5, comment: "great" });
  ok("customer rates 5★ → 200", rate.status === 200, rate.status);
  const ratings = await api(cust, "GET", `/api/bookings/${bookingId}/ratings`);
  ok("GET ratings → 200", ratings.status === 200, ratings.status);

  // ════════ G. Booking history & stats ════════
  area("G. History & stats");
  const hist = await api(cust, "GET", "/api/bookings/history");
  ok("GET /api/bookings/history includes completed trip", hist.status === 200 && (hist.data?.rides || []).some((x) => x.id === bookingId), { n: hist.data?.rides?.length });
  const stats = await api(cust, "GET", "/api/me/stats");
  ok("GET /api/me/stats → 200", stats.status === 200, stats.status);

  // ════════ H. Cancellation ════════
  area("H. Cancellation");
  // Unpaid booking (no operator) → free cancel.
  const cBook = await api(cust, "POST", "/api/bookings", { pickupName: "P", pickupLat: PICKUP.lat, pickupLng: PICKUP.lng, destName: "D", destLat: DEST.lat, destLng: DEST.lng, service: "taxi" });
  const cId = cBook.data?.booking?.id;
  const cancel = await api(cust, "POST", `/api/bookings/${cId}/cancel`, {});
  ok("cancel pre-assignment → free", cancel.status === 200 && cancel.data?.cancellation?.policy === "free", cancel.data?.cancellation);
  const cancelAgain = await api(cust, "POST", `/api/bookings/${cId}/cancel`, {});
  ok("cancel already-cancelled → 409", cancelAgain.status === 409, cancelAgain.status);

  // ════════ I. Dispatch: reject → re-dispatch to next pilot ════════
  area("I. Dispatch reject → re-offer");
  await query("UPDATE users SET onDuty=1, gpsLat=?, gpsLng=? WHERE id=?", [OP1_GPS.lat, OP1_GPS.lng, op1Id]);
  await query("UPDATE users SET onDuty=1, gpsLat=?, gpsLng=? WHERE id=?", [OP2_GPS.lat, OP2_GPS.lng, op2Id]);
  const trip2 = await bookAndPay(cust);
  const off1 = await pendingOffer(trip2.id, op1Id);
  ok("offer goes to nearest pilot (op1)", !!off1, off1);
  const rej = await api(op1, "POST", `/api/operator/dispatch/offers/${off1?.id}/reject`, {});
  ok("op1 rejects offer → 200", rej.status === 200, rej.status);
  const off2 = await pendingOffer(trip2.id, op2Id);
  ok("re-offered to next pilot (op2)", !!off2, off2);
  // clean up: op2 accepts then customer cancels (free at assigned)
  if (off2) await api(op2, "POST", `/api/operator/dispatch/offers/${off2.id}/accept`, {});
  await api(cust, "POST", `/api/bookings/${trip2.id}/cancel`, {});

  // ════════ J. Dispatch: no pilot available ════════
  area("J. Dispatch no-pilot");
  await query("UPDATE users SET onDuty=0 WHERE role='operator'");
  const trip3 = await bookAndPay(cust);
  let np = null;
  for (let i = 0; i < 15; i++) { np = await queryOne("SELECT status FROM bookings WHERE id=?", [trip3.id]); if (np?.status === "no_pilot") break; await sleep(200); }
  ok("no on-duty pilots → booking status no_pilot", np?.status === "no_pilot", np?.status);
  const retry = await api(cust, "POST", `/api/bookings/${trip3.id}/retry-dispatch`, {});
  ok("retry-dispatch on no_pilot → 200", retry.status === 200, retry.status);
  await api(cust, "POST", `/api/bookings/${trip3.id}/cancel`, {});

  // ════════ K. Operator endpoints ════════
  area("K. Operator endpoints");
  const duty = await api(op1, "GET", "/api/operator/duty");
  ok("GET /api/operator/duty → 200", duty.status === 200, duty.data);
  const setDuty = await api(op1, "POST", "/api/operator/duty", { onDuty: true });
  ok("POST /api/operator/duty on → 200", setDuty.status === 200 && setDuty.data?.onDuty === true, setDuty.data);
  const trips = await api(op1, "GET", "/api/operator/trips");
  ok("GET /api/operator/trips → 200 list", trips.status === 200 && Array.isArray(trips.data?.trips), { n: trips.data?.trips?.length });

  // ════════ L. Admin user management ════════
  area("L. Admin user management");
  const throwaway = { email: `throwaway.${customerId}@irago.test`, name: "Throwaway Op", password: "temp123" };
  await query("DELETE FROM users WHERE email=?", [throwaway.email.toLowerCase()]); // clean slate
  const created = await api(admin, "POST", "/api/admin/users", { name: throwaway.name, email: throwaway.email, password: throwaway.password, role: "operator" });
  ok("admin creates operator → 201", created.status === 201 && created.data?.user?.role === "operator", created.status);
  const newId = created.data?.user?.id;
  const listU = await api(admin, "GET", "/api/admin/users");
  ok("admin lists users → 200 total>0", listU.status === 200 && listU.data?.total > 0, { total: listU.data?.total });
  const uStats = await api(admin, "GET", `/api/admin/users/${newId}/stats`);
  ok("admin user stats → 200", uStats.status === 200, uStats.status);
  const setPw = await api(admin, "PATCH", `/api/admin/users/${newId}/password`, { newPassword: "newpass123" });
  ok("admin resets operator password → 200", setPw.status === 200, setPw.status);
  const ban = await api(admin, "PATCH", `/api/admin/users/${newId}/ban`, { banned: true });
  ok("admin bans operator → 200", ban.status === 200, ban.status);
  const bannedLogin = await api(null, "POST", "/api/auth/operator/login", { email: throwaway.email, password: "newpass123" });
  ok("banned operator login → 403 ACCOUNT_BANNED", bannedLogin.status === 403 && bannedLogin.data?.code === "ACCOUNT_BANNED", bannedLogin.data?.code);
  const unban = await api(admin, "PATCH", `/api/admin/users/${newId}/ban`, { banned: false });
  ok("admin unbans operator → 200", unban.status === 200, unban.status);
  const del = await api(admin, "DELETE", `/api/admin/users/${newId}`, {});
  ok("admin soft-deletes operator → 200", del.status === 200, del.status);
  const deletedLogin = await api(null, "POST", "/api/auth/operator/login", { email: throwaway.email, password: "newpass123" });
  ok("deleted operator can no longer log in → 401", deletedLogin.status === 401, deletedLogin.status);

  // ════════ M. Admin ops / fleet / settings / companies ════════
  area("M. Admin ops, settings, companies");
  const live = await api(admin, "GET", "/api/admin/live-flights");
  ok("GET /api/admin/live-flights → 200", live.status === 200, live.status);
  const logs = await api(admin, "GET", "/api/admin/logs");
  ok("GET /api/admin/logs → 200", logs.status === 200, logs.status);
  const getSettings = await api(admin, "GET", "/api/admin/settings");
  ok("GET /api/admin/settings → 200", getSettings.status === 200 && "emergencyNoFlyBypass" in (getSettings.data?.settings || {}), getSettings.data);
  const patchSettings = await api(admin, "PATCH", "/api/admin/settings", { key: "emergencyNoFlyBypass", value: false });
  ok("PATCH settings emergencyNoFlyBypass=false → 200", patchSettings.status === 200 && patchSettings.data?.settings?.emergencyNoFlyBypass === false, patchSettings.data?.settings);
  await api(admin, "PATCH", "/api/admin/settings", { key: "emergencyNoFlyBypass", value: true }); // restore
  const badSetting = await api(admin, "PATCH", "/api/admin/settings", { key: "nope", value: 1 });
  ok("PATCH unknown setting → 400", badSetting.status === 400, badSetting.status);
  const companies = await api(admin, "GET", "/api/admin/companies");
  ok("GET /api/admin/companies → 200 (>=4)", companies.status === 200 && (companies.data?.companies?.length || 0) >= 4, { n: companies.data?.companies?.length });
  const code = `TEST${String(customerId)}`;
  await query("DELETE FROM operator_companies WHERE code=?", [code]);
  const newCo = await api(admin, "POST", "/api/admin/companies", { name: "Test Air Co", code });
  ok("POST create company → 201", newCo.status === 201 && !!newCo.data?.company?.id, newCo.status);
  const coId = newCo.data?.company?.id;
  const newOffice = await api(admin, "POST", `/api/admin/companies/${coId}/offices`, { city: "TestCity", lat: 28.4, lng: 77.5, address: "1 Test Rd" });
  ok("POST add office → 201", newOffice.status === 201 && !!newOffice.data?.office?.id, newOffice.status);
  const coOffices = await api(admin, "GET", `/api/admin/companies/${coId}/offices`);
  ok("GET company offices → 200 with the new office", coOffices.status === 200 && (coOffices.data?.offices || []).some((o) => o.city === "TestCity"), { n: coOffices.data?.offices?.length });
  const dupCo = await api(admin, "POST", "/api/admin/companies", { name: "Dup", code });
  ok("duplicate company code → 409", dupCo.status === 409, dupCo.status);
  // cleanup the test company + office
  await query("DELETE FROM regional_offices WHERE companyId=?", [coId]);
  await query("DELETE FROM operator_companies WHERE id=?", [coId]);

  // ── Summary ──
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULT: ${pass}/${results.length} checks passed`);
  if (fail.length) {
    console.log(`\n❌ FAILURES (${fail.length}):`);
    for (const f of fail) console.log(`   [${f.area}] ${f.name}  → ${JSON.stringify(f.detail)}`);
    process.exitCode = 1;
  } else {
    console.log("✅ ALL FEATURE CHECKS PASSED");
  }
}

main()
  .catch((e) => { console.error("\nFATAL:", e.stack || e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); });
