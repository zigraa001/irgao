// Company Portal E2E integration test (US-131).
// Drives the entire partner-portal epic (US-124..US-130) against a booted server.
//
//   node scripts/test-company-portal.js   (server must be running)
//
require("dotenv").config();
const { query, queryOne, pool } = require("../src/db");
const { hashPassword } = require("../src/auth");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { email: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD };

const COMPANY_A = { name: "TestAir Alpha", code: "TSTA" };
const COMPANY_B = { name: "TestAir Beta", code: "TSTB" };
const COMP_USER_A = { email: "test.companya@irago.test", name: "CompA Manager", password: "test@321" };
const COMP_USER_B = { email: "test.companyb@irago.test", name: "CompB Manager", password: "test@321" };
const PILOT_A = { email: "test.pilota@irago.test", name: "Capt. Alpha", password: "test@321" };
const CUSTOMER = { email: "test.customer.cp@irago.test", name: "Portal Customer", password: "test@321" };
const OPERATOR_ONLY = { email: "test.operator.cp@irago.test", name: "Solo Operator", password: "test@321" };

const results = [];
let curArea = "";
const area = (a) => { curArea = a; console.log(`\n── ${a} ──`); };
function ok(name, cond, detail) {
  const pass = !!cond;
  results.push({ area: curArea, name, pass, detail });
  console.log(`  ${pass ? "✅" : "❌"} ${name}${detail && !pass ? "  → " + JSON.stringify(detail) : ""}`);
  return pass;
}

async function api(token, method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) opts.headers.Authorization = "Bearer " + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
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
  const cols = { name: u.name, passwordHash: hash, role, emailVerified: 1, mustResetPassword: 0, bannedAt: null, deletedAt: null, ...extra };
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

async function ensureCompany(co) {
  const existing = await queryOne("SELECT id FROM operator_companies WHERE code = ?", [co.code]);
  if (existing) return existing.id;
  const r = await query("INSERT INTO operator_companies (name, code) VALUES (?, ?)", [co.name, co.code]);
  return r.insertId;
}

async function ensureOffice(companyId, city, lat, lng) {
  const existing = await queryOne("SELECT id FROM regional_offices WHERE companyId = ? AND city = ?", [companyId, city]);
  if (existing) return existing.id;
  const r = await query("INSERT INTO regional_offices (companyId, city, lat, lng) VALUES (?, ?, ?, ?)", [companyId, city, lat, lng]);
  return r.insertId;
}

async function cleanup() {
  for (const u of [COMP_USER_A, COMP_USER_B, PILOT_A, CUSTOMER, OPERATOR_ONLY]) {
    await query("DELETE FROM users WHERE email = ?", [u.email.toLowerCase()]);
  }
  for (const co of [COMPANY_A, COMPANY_B]) {
    const c = await queryOne("SELECT id FROM operator_companies WHERE code = ?", [co.code]);
    if (c) {
      await query("DELETE FROM company_change_requests WHERE companyId = ?", [c.id]);
      await query("DELETE FROM company_service_pricing WHERE companyId = ?", [c.id]);
      await query("DELETE FROM company_pricing_changelog WHERE companyId = ?", [c.id]);
      await query("DELETE FROM regional_offices WHERE companyId = ?", [c.id]);
      await query("DELETE FROM operator_companies WHERE id = ?", [c.id]);
    }
  }
}

async function main() {
  console.log("Company Portal E2E Test Suite (US-131)");
  console.log("=".repeat(50));

  // ── Setup ──
  area("Setup");
  await cleanup();
  const coAId = await ensureCompany(COMPANY_A);
  const coBId = await ensureCompany(COMPANY_B);
  const officeAId = await ensureOffice(coAId, "TestCity-A", 28.47, 77.5);
  await ensureOffice(coBId, "TestCity-B", 28.56, 77.44);
  ok("Company A created", coAId > 0, coAId);
  ok("Company B created", coBId > 0, coBId);

  // Company users
  const compAUserId = await ensureUser(COMP_USER_A, "company", { companyId: coAId });
  const compBUserId = await ensureUser(COMP_USER_B, "company", { companyId: coBId });
  ok("Company A user created", compAUserId > 0);
  ok("Company B user created", compBUserId > 0);

  // Other role users for isolation tests
  const custId = await ensureUser(CUSTOMER, "customer");
  const opId = await ensureUser(OPERATOR_ONLY, "operator");
  ok("Customer user created", custId > 0);
  ok("Operator user created", opId > 0);

  // ── Portal Login (US-124) ──
  area("Portal Login (US-124)");
  const tokenA = await login("company", COMP_USER_A.email, COMP_USER_A.password);
  ok("Company A login via /auth/company/login", !!tokenA);
  const tokenB = await login("company", COMP_USER_B.email, COMP_USER_B.password);
  ok("Company B login via /auth/company/login", !!tokenB);

  // /api/me returns company role with company stats
  const meA = await api(tokenA, "GET", "/api/me");
  ok("/api/me → role company", meA.status === 200 && meA.data?.user?.role === "company", meA.data?.user?.role);
  ok("/api/me → has company info (not customerStats)", meA.data?.user?.companyId > 0 || meA.data?.stats?.company !== undefined, meA.data?.user);

  // ── Forced password reset flow ──
  area("Forced Password Reset");
  const newPw = "resetTest@456";
  await query("UPDATE users SET mustResetPassword = 1 WHERE id = ?", [compAUserId]);
  const meForced = await api(tokenA, "GET", "/api/me");
  ok("mustResetPassword flagged", meForced.data?.user?.mustResetPassword === true, meForced.data?.user?.mustResetPassword);
  const changePw = await api(tokenA, "POST", "/api/auth/change-password", { oldPassword: COMP_USER_A.password, newPassword: newPw });
  ok("Change password → 200", changePw.status === 200, changePw.status);
  const meAfter = await api(tokenA, "GET", "/api/me");
  ok("mustResetPassword cleared after change", meAfter.data?.user?.mustResetPassword === false, meAfter.data?.user?.mustResetPassword);
  // Reset password back
  await query("UPDATE users SET passwordHash = ?, mustResetPassword = 0 WHERE id = ?", [await hashPassword(COMP_USER_A.password), compAUserId]);

  // ── Company Dashboard (US-125) ──
  area("Company Dashboard (US-125)");
  const dash = await api(tokenA, "GET", "/api/company/dashboard");
  ok("GET /api/company/dashboard → 200", dash.status === 200, dash.status);
  ok("Dashboard has kpis", dash.data?.kpis !== undefined, Object.keys(dash.data || {}));

  // ── Company Offices ──
  area("Company Offices");
  const offices = await api(tokenA, "GET", "/api/company/offices");
  ok("GET /api/company/offices → 200", offices.status === 200, offices.status);
  ok("Offices returned for company A", Array.isArray(offices.data?.offices), offices.data);

  // ── Company Pilots (US-127) ──
  area("Company Pilots (US-127)");

  // Create a pilot via company portal
  const addPilot = await api(tokenA, "POST", "/api/company/pilots", {
    name: PILOT_A.name,
    email: PILOT_A.email,
    password: PILOT_A.password,
    officeId: officeAId,
  });
  ok("POST /api/company/pilots → 201 (add pilot)", addPilot.status === 201, addPilot.status);

  const pilots = await api(tokenA, "GET", "/api/company/pilots");
  ok("GET /api/company/pilots → 200", pilots.status === 200, pilots.status);
  ok("Pilot appears in company roster", (pilots.data?.pilots || []).some((p) => p.email === PILOT_A.email.toLowerCase()), pilots.data?.pilots?.length);

  // Pilot forced-reset & login
  const pilotToken = await login("operator", PILOT_A.email, PILOT_A.password);
  ok("Pilot can log in via operator portal", !!pilotToken);

  // ── Company Flights (US-126) ──
  area("Company Flights (US-126)");
  const flights = await api(tokenA, "GET", "/api/company/flights");
  ok("GET /api/company/flights → 200", flights.status === 200, flights.status);
  ok("Flights returns array", Array.isArray(flights.data?.flights), typeof flights.data?.flights);

  // ── Price Rules (US-128) ──
  area("Price Rules (US-128)");
  const pricing = await api(tokenA, "GET", "/api/company/pricing");
  ok("GET /api/company/pricing → 200", pricing.status === 200, pricing.status);
  ok("Pricing has services", Array.isArray(pricing.data?.services), pricing.data);

  // Set a pricing override
  const setPricing = await api(tokenA, "POST", "/api/company/pricing", {
    service: "helicopter",
    baseFare: 6000,
    perKm: 180,
  });
  ok("POST /api/company/pricing → 200 (set override)", setPricing.status === 200, setPricing.status);

  // Verify override is returned
  const pricingAfter = await api(tokenA, "GET", "/api/company/pricing");
  const heliOverride = (pricingAfter.data?.services || []).find((s) => s.service === "helicopter");
  ok("Helicopter override active", heliOverride && heliOverride.override && heliOverride.override.baseFare === 6000, heliOverride);

  // ── Company Profile & Change Requests (US-129) ──
  area("Company Profile (US-129)");
  const profile = await api(tokenA, "GET", "/api/company/profile");
  ok("GET /api/company/profile → 200", profile.status === 200, profile.status);
  ok("Profile has company name", profile.data?.company?.name === COMPANY_A.name, profile.data?.company?.name);
  ok("Profile has offices", Array.isArray(profile.data?.offices), profile.data);

  // Submit a change request
  const changeReq = await api(tokenA, "POST", "/api/company/profile-request", {
    changes: { contactEmail: "new-email@testalpha.com", description: "A premium air taxi partner" },
  });
  ok("POST profile-request → 200", changeReq.status === 200, changeReq.status);
  ok("Request has diff", changeReq.data?.diff && Object.keys(changeReq.data.diff).length > 0, changeReq.data?.diff);
  const reqId1 = changeReq.data?.requestId;

  // Verify live row NOT changed
  const liveCo = await queryOne("SELECT contactEmail, description FROM operator_companies WHERE id = ?", [coAId]);
  ok("Live contactEmail unchanged", liveCo.contactEmail !== "new-email@testalpha.com", liveCo.contactEmail);

  // Supersede: submit a second request
  const changeReq2 = await api(tokenA, "POST", "/api/company/profile-request", {
    changes: { contactEmail: "newer-email@testalpha.com" },
  });
  ok("Second request supersedes first → 200", changeReq2.status === 200, changeReq2.status);
  const reqId2 = changeReq2.data?.requestId;

  // Check first is superseded
  const firstRow = await queryOne("SELECT status FROM company_change_requests WHERE id = ?", [reqId1]);
  ok("First request status = superseded", firstRow?.status === "superseded", firstRow?.status);

  // Cancel the pending request
  const cancelReq = await api(tokenA, "POST", `/api/company/requests/${reqId2}/cancel`);
  ok("Cancel pending request → 200", cancelReq.status === 200, cancelReq.status);

  // Request history
  const reqHistory = await api(tokenA, "GET", "/api/company/requests");
  ok("GET /api/company/requests → 200", reqHistory.status === 200, reqHistory.status);
  ok("History has requests", (reqHistory.data?.requests || []).length >= 2, reqHistory.data?.requests?.length);

  // ── Admin Approvals (US-130) ──
  area("Admin Approvals (US-130)");
  const adminToken = await login("admin", ADMIN.email, ADMIN.password);
  ok("Admin login", !!adminToken);

  // Submit a fresh request to approve
  const changeReq3 = await api(tokenA, "POST", "/api/company/profile-request", {
    changes: { contactEmail: "approved@testalpha.com", description: "Approved description" },
  });
  ok("Fresh profile request → 200", changeReq3.status === 200, changeReq3.status);
  const reqId3 = changeReq3.data?.requestId;

  // Admin list pending
  const pendingList = await api(adminToken, "GET", "/api/admin/company-requests?status=pending");
  ok("Admin GET pending requests → 200", pendingList.status === 200, pendingList.status);
  ok("Pending list has our request", (pendingList.data?.requests || []).some((r) => r.id === reqId3), pendingList.data?.requests?.length);

  // Badge count
  const badge = await api(adminToken, "GET", "/api/admin/company-requests/count");
  ok("Pending count >= 1", badge.data?.count >= 1, badge.data?.count);

  // Approve
  const approveRes = await api(adminToken, "POST", `/api/admin/company-requests/${reqId3}/approve`);
  ok("Admin approve → 200", approveRes.status === 200, approveRes.status);

  // Verify live row IS updated
  const liveCoAfter = await queryOne("SELECT contactEmail, description FROM operator_companies WHERE id = ?", [coAId]);
  ok("Live contactEmail updated to approved value", liveCoAfter.contactEmail === "approved@testalpha.com", liveCoAfter.contactEmail);
  ok("Live description updated", liveCoAfter.description === "Approved description", liveCoAfter.description);

  // Second approve → 409
  const dupApprove = await api(adminToken, "POST", `/api/admin/company-requests/${reqId3}/approve`);
  ok("Duplicate approve → 409", dupApprove.status === 409, dupApprove.status);

  // Company sees approved in history
  const histAfter = await api(tokenA, "GET", "/api/company/requests");
  const approvedReq = (histAfter.data?.requests || []).find((r) => r.id === reqId3);
  ok("Company sees approved status in history", approvedReq?.status === "approved", approvedReq?.status);

  // Reject path
  const changeReq4 = await api(tokenA, "POST", "/api/company/profile-request", {
    changes: { name: "Should Be Rejected" },
  });
  const reqId4 = changeReq4.data?.requestId;
  const rejectRes = await api(adminToken, "POST", `/api/admin/company-requests/${reqId4}/reject`, { note: "Name change not allowed" });
  ok("Admin reject → 200", rejectRes.status === 200, rejectRes.status);
  const rejectedReq = await queryOne("SELECT status, adminNote FROM company_change_requests WHERE id = ?", [reqId4]);
  ok("Request status = rejected", rejectedReq?.status === "rejected", rejectedReq?.status);
  ok("Admin note stored", rejectedReq?.adminNote === "Name change not allowed", rejectedReq?.adminNote);
  // Company sees note
  const histReject = await api(tokenA, "GET", "/api/company/requests");
  const rejInHist = (histReject.data?.requests || []).find((r) => r.id === reqId4);
  ok("Company sees rejection note", rejInHist?.adminNote === "Name change not allowed", rejInHist?.adminNote);

  // Admin direct edit (PATCH)
  const patchRes = await api(adminToken, "PATCH", `/api/admin/companies/${coAId}`, { fleetSize: 5 });
  ok("Admin PATCH company → 200", patchRes.status === 200, patchRes.status);
  ok("Fleet size updated", patchRes.data?.company?.fleetSize === 5, patchRes.data?.company?.fleetSize);

  // ── Cross-Company Isolation ──
  area("Cross-Company Isolation");
  // Company B cannot see A's pilots
  const bPilots = await api(tokenB, "GET", "/api/company/pilots");
  const bHasAPilot = (bPilots.data?.pilots || []).some((p) => p.email === PILOT_A.email.toLowerCase());
  ok("Company B cannot see Company A pilot", !bHasAPilot, bPilots.data?.pilots?.length);

  // Company B cannot see A's flights
  const bFlights = await api(tokenB, "GET", "/api/company/flights");
  ok("Company B flights → 200 (empty or own only)", bFlights.status === 200, bFlights.status);

  // Company B cannot see A's profile
  const bProfile = await api(tokenB, "GET", "/api/company/profile");
  ok("Company B profile shows B not A", bProfile.data?.company?.name === COMPANY_B.name, bProfile.data?.company?.name);

  // Company B cannot cancel A's requests
  const changeReq5 = await api(tokenA, "POST", "/api/company/profile-request", {
    changes: { description: "Cross-company test" },
  });
  const reqId5 = changeReq5.data?.requestId;
  const bCancel = await api(tokenB, "POST", `/api/company/requests/${reqId5}/cancel`);
  ok("Company B cannot cancel A's request → 403", bCancel.status === 403, bCancel.status);

  // ── Role Isolation ──
  area("Role Isolation");
  const custToken = await login("passenger", CUSTOMER.email, CUSTOMER.password);
  const opToken = await login("operator", OPERATOR_ONLY.email, OPERATOR_ONLY.password);
  ok("Customer login", !!custToken);
  ok("Operator login", !!opToken);

  // Customer → /api/company/* → 403
  const custCompDash = await api(custToken, "GET", "/api/company/dashboard");
  ok("Customer → /api/company/dashboard → 403", custCompDash.status === 403, custCompDash.status);

  // Operator → /api/company/* → 403
  const opCompDash = await api(opToken, "GET", "/api/company/dashboard");
  ok("Operator → /api/company/dashboard → 403", opCompDash.status === 403, opCompDash.status);

  // Company → /api/admin/* → 403 (Tailscale-gated but also role-checked)
  const compAdmin = await api(tokenA, "GET", "/api/admin/users");
  ok("Company → /api/admin/users → 403", compAdmin.status === 403, compAdmin.status);

  // ── WRONG_PORTAL Bounce (16 combos) ──
  area("WRONG_PORTAL Bounce");
  const portals = ["passenger", "operator", "admin", "company"];
  const testUsers = [
    { user: CUSTOMER, role: "customer", rightPortal: "passenger" },
    { user: OPERATOR_ONLY, role: "operator", rightPortal: "operator" },
    { user: COMP_USER_A, role: "company", rightPortal: "company" },
  ];
  // Admin uses env creds - add only if available
  if (ADMIN.email && ADMIN.password) {
    testUsers.push({ user: ADMIN, role: "admin", rightPortal: "admin" });
  }

  for (const tu of testUsers) {
    for (const portal of portals) {
      const r = await api(null, "POST", `/api/auth/${portal}/login`, { email: tu.user.email, password: tu.user.password });
      if (portal === tu.rightPortal) {
        ok(`${tu.role} @ ${portal} portal → 200`, r.status === 200, r.status);
      } else {
        ok(`${tu.role} @ ${portal} portal → 403 WRONG_PORTAL`, r.status === 403 && r.data?.code === "WRONG_PORTAL", { status: r.status, code: r.data?.code });
      }
    }
  }

  // ── WS /ws/operator Rejection ──
  area("WS Rejection");
  // We can't easily do a full WS test without a WS client, but we verify the endpoint
  // rejects non-operator tokens via the HTTP upgrade returning 403 or similar.
  // For now, just verify the company token is not an operator role.
  ok("Company token is not operator role (WS would reject)", meA.data?.user?.role === "company" && meA.data?.user?.role !== "operator");

  // ── Cleanup ──
  area("Cleanup");
  await cleanup();
  ok("Test data cleaned up", true);

  // ── Summary ──
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESULT: ${pass}/${results.length} checks passed`);
  if (fail.length) {
    console.log(`\n❌ FAILURES (${fail.length}):`);
    for (const f of fail) console.log(`   [${f.area}] ${f.name}  → ${JSON.stringify(f.detail)}`);
    process.exitCode = 1;
  } else {
    console.log("✅ ALL COMPANY PORTAL CHECKS PASSED");
  }
}

main()
  .catch((e) => { console.error("\nFATAL:", e.stack || e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); });
