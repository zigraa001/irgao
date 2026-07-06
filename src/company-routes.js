// Company portal API routes.
// Mounted at /api/company (NOT under /admin — no Tailscale gate).
// Every route uses requireAuth + requireRole('company') and resolves
// companyId via re-query of the users table (US-124 decision).

const express = require("express");
const { requireAuth, requireRole, USER_NOT_DELETED, hashPassword, invalidateUserStatus } = require("./auth");
const { query, queryOne } = require("./db");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole("company"));

// Resolve companyId for every request from the authenticated user.
// A company user whose companyId is NULL or whose company is inactive gets 403.
async function resolveCompany(req, res, next) {
  const row = await queryOne(
    "SELECT u.companyId, oc.name AS companyName, oc.code AS companyCode, oc.active FROM users u LEFT JOIN operator_companies oc ON oc.id = u.companyId WHERE u.id = ?",
    [req.user.id]
  );
  if (!row || !row.companyId) {
    return res.status(403).json({ error: "No company linked to this account." });
  }
  if (!row.active) {
    return res.status(403).json({ error: "Your company account is inactive. Contact IraGo support." });
  }
  req.company = {
    id: row.companyId,
    name: row.companyName,
    code: row.companyCode,
  };
  next();
}

router.use(resolveCompany);

// GET /api/company/dashboard
// Company-scoped KPIs via the pilot-employer linkage:
// bookings JOIN users ON operatorId WHERE users.companyId = ?
router.get("/dashboard", async (req, res) => {
  const cid = req.company.id;
  try {
    const [completedAgg, monthAgg, pilotAgg, dutyAgg, cancelledAgg] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) AS completed,
                COALESCE(SUM(b.fareEstimate), 0) AS gross,
                COALESCE(SUM(COALESCE(b.operatorPayout, b.fareEstimate * 0.85)), 0) AS net
           FROM bookings b
           JOIN users u ON u.id = b.operatorId
           WHERE u.companyId = ? AND b.status = 'completed'`,
        [cid]
      ),
      queryOne(
        `SELECT COUNT(*) AS n
           FROM bookings b
           JOIN users u ON u.id = b.operatorId
           WHERE u.companyId = ? AND b.status = 'completed'
             AND b.createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
        [cid]
      ),
      queryOne(
        `SELECT COUNT(*) AS n FROM users WHERE companyId = ? AND role = 'operator' AND ${USER_NOT_DELETED}`,
        [cid]
      ),
      queryOne(
        `SELECT COUNT(*) AS n FROM users WHERE companyId = ? AND role = 'operator' AND onDuty = 1 AND ${USER_NOT_DELETED}`,
        [cid]
      ),
      queryOne(
        `SELECT COUNT(*) AS n
           FROM bookings b
           JOIN users u ON u.id = b.operatorId
           WHERE u.companyId = ? AND (b.status = 'cancelled' OR b.status = 'rejected')`,
        [cid]
      ),
    ]);

    const num = (v) => Number(v) || 0;
    res.json({
      company: { id: req.company.id, name: req.company.name, code: req.company.code },
      kpis: {
        completedFlights: num(completedAgg ? completedAgg.completed : 0),
        completedThisMonth: num(monthAgg ? monthAgg.n : 0),
        grossRevenue: Math.round(num(completedAgg ? completedAgg.gross : 0)),
        netPayout: Math.round(num(completedAgg ? completedAgg.net : 0)),
        totalPilots: num(pilotAgg ? pilotAgg.n : 0),
        onDutyPilots: num(dutyAgg ? dutyAgg.n : 0),
        cancelled: num(cancelledAgg ? cancelledAgg.n : 0),
      },
    });
  } catch (err) {
    console.error("[company] dashboard failed:", err.message);
    res.status(500).json({ error: "Could not load dashboard." });
  }
});

const FLIGHTS_LIMIT = 20;
const FLIGHTS_MAX_OFFSET = 10000;

// GET /api/company/flights
// Paged flights via pilot-employer linkage with optional filters.
// Returns summary (count, gross, net) computed server-side for the current filter.
router.get("/flights", async (req, res) => {
  const cid = req.company.id;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || FLIGHTS_LIMIT, 1), FLIGHTS_LIMIT);
    const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), FLIGHTS_MAX_OFFSET);

    const clauses = ["u.companyId = ?"];
    const params = [cid];

    if (req.query.status) {
      clauses.push("b.status = ?");
      params.push(req.query.status);
    }
    if (req.query.pilotId) {
      const pid = parseInt(req.query.pilotId, 10);
      if (!pid) return res.json({ flights: [], total: 0, summary: { count: 0, gross: 0, net: 0 }, limit, offset, hasMore: false });
      // Cross-company isolation: only allow filtering by pilots belonging to this company
      const pilotRow = await queryOne(
        "SELECT id FROM users WHERE id = ? AND companyId = ? AND role = 'operator'",
        [pid, cid]
      );
      if (!pilotRow) return res.json({ flights: [], total: 0, summary: { count: 0, gross: 0, net: 0 }, limit, offset, hasMore: false });
      clauses.push("b.operatorId = ?");
      params.push(pid);
    }
    if (req.query.from) {
      clauses.push("b.createdAt >= ?");
      params.push(req.query.from);
    }
    if (req.query.to) {
      clauses.push("b.createdAt <= ?");
      params.push(req.query.to);
    }

    const where = clauses.join(" AND ");
    const baseFrom = "FROM bookings b JOIN users u ON u.id = b.operatorId LEFT JOIN users c ON c.id = b.customerId";

    const [countRow, summaryRow, rows] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS total ${baseFrom} WHERE ${where}`, params),
      queryOne(
        `SELECT COUNT(*) AS cnt,
                COALESCE(SUM(b.fareEstimate), 0) AS gross,
                COALESCE(SUM(COALESCE(b.operatorPayout, b.fareEstimate * 0.85)), 0) AS net
         ${baseFrom} WHERE ${where} AND b.status = 'completed'`,
        params
      ),
      query(
        `SELECT b.id, b.createdAt, b.assignedAt, b.pickupName, b.destName, b.service,
                b.status, b.distanceKm, b.fareEstimate, b.operatorPayout,
                u.id AS pilotId, u.name AS pilotName, u.aircraftType,
                c.name AS customerName
         ${baseFrom} WHERE ${where}
         ORDER BY b.createdAt DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
    ]);

    const total = Number(countRow?.total) || 0;
    const flights = (rows || []).map((r) => {
      const customerFirst = r.customerName ? r.customerName.split(" ")[0] : null;
      return {
        id: r.id,
        createdAt: r.createdAt,
        assignedAt: r.assignedAt,
        pickupName: r.pickupName,
        destName: r.destName,
        service: r.service,
        status: r.status,
        distanceKm: r.distanceKm,
        fareEstimate: r.fareEstimate,
        payout: r.operatorPayout,
        payoutEstimated: r.operatorPayout == null,
        pilot: { id: r.pilotId, name: r.pilotName, aircraftType: r.aircraftType },
        customer: customerFirst,
      };
    });

    res.json({
      flights,
      total,
      summary: {
        count: Number(summaryRow?.cnt) || 0,
        gross: Math.round(Number(summaryRow?.gross) || 0),
        net: Math.round(Number(summaryRow?.net) || 0),
      },
      limit,
      offset,
      hasMore: offset + flights.length < total,
    });
  } catch (err) {
    console.error("[company] flights failed:", err.message);
    res.status(500).json({ error: "Could not load flights." });
  }
});

// GET /api/company/offices — list offices belonging to this company.
router.get("/offices", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM regional_offices WHERE companyId = ? ORDER BY city",
      [req.company.id]
    );
    res.json({ offices: rows });
  } catch (err) {
    console.error("[company] offices failed:", err.message);
    res.status(500).json({ error: "Could not load offices." });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/company/pilots — the company's pilot roster with per-pilot stats.
router.get("/pilots", async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.onDuty, u.gpsUpdatedAt,
              u.aircraftType, u.aircraftReg, u.bannedAt, u.createdAt,
              (SELECT COUNT(*) FROM bookings b WHERE b.operatorId = u.id AND b.status = 'completed') AS completedTrips,
              COALESCE(
                (SELECT SUM(COALESCE(b2.operatorPayout, b2.fareEstimate * 0.85))
                 FROM bookings b2 WHERE b2.operatorId = u.id AND b2.status = 'completed'), 0
              ) AS netPayout
         FROM users u
         WHERE u.role = 'operator' AND u.companyId = ? AND u.deletedAt IS NULL
         ORDER BY u.bannedAt IS NOT NULL, u.name`,
      [cid]
    );
    const pilots = (rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      onDuty: Boolean(r.onDuty),
      gpsUpdatedAt: r.gpsUpdatedAt,
      aircraftType: r.aircraftType,
      aircraftReg: r.aircraftReg,
      bannedAt: r.bannedAt,
      createdAt: r.createdAt,
      completedTrips: Number(r.completedTrips) || 0,
      netPayout: Math.round(Number(r.netPayout) || 0),
    }));
    res.json({ pilots });
  } catch (err) {
    console.error("[company] pilots failed:", err.message);
    res.status(500).json({ error: "Could not load pilots." });
  }
});

// POST /api/company/pilots — create a pilot with companyId forced to caller's company.
router.post("/pilots", async (req, res) => {
  const cid = req.company.id;
  const { name, email, password, officeId } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const parsedOfficeId = officeId ? Number(officeId) : null;
  if (parsedOfficeId != null) {
    const office = await queryOne(
      "SELECT id FROM regional_offices WHERE id = ? AND companyId = ?",
      [parsedOfficeId, cid]
    );
    if (!office) {
      return res.status(400).json({ error: "Selected office does not belong to your company." });
    }
  }

  const normalizedEmail = String(email).toLowerCase();
  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  try {
    const passwordHash = await hashPassword(String(password));
    const result = await query(
      "INSERT INTO users (name, email, passwordHash, role, emailVerified, mustResetPassword, companyId, officeId) VALUES (?, ?, ?, 'operator', 1, 1, ?, ?)",
      [String(name), normalizedEmail, passwordHash, cid, parsedOfficeId]
    );
    const user = await queryOne("SELECT id, name, email, role, companyId, officeId FROM users WHERE id = ?", [result.insertId]);
    res.status(201).json({ user });
  } catch (err) {
    console.error("[company] create pilot failed:", err.message);
    res.status(500).json({ error: "Could not create pilot." });
  }
});

// PATCH /api/company/pilots/:id/status — deactivate/reactivate a pilot.
// Only pilots belonging to the caller's company (404 otherwise, no existence leak).
router.patch("/pilots/:id/status", async (req, res) => {
  const cid = req.company.id;
  const pilotId = Number(req.params.id);
  if (!Number.isInteger(pilotId) || pilotId <= 0) {
    return res.status(404).json({ error: "Pilot not found." });
  }

  const pilot = await queryOne(
    "SELECT id, bannedAt FROM users WHERE id = ? AND companyId = ? AND role = 'operator' AND deletedAt IS NULL",
    [pilotId, cid]
  );
  if (!pilot) {
    return res.status(404).json({ error: "Pilot not found." });
  }

  const { active } = req.body || {};
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active (boolean) is required." });
  }

  try {
    if (active) {
      await query("UPDATE users SET bannedAt = NULL WHERE id = ?", [pilotId]);
    } else {
      await query("UPDATE users SET bannedAt = NOW(), onDuty = 0 WHERE id = ?", [pilotId]);
    }
    invalidateUserStatus(pilotId);
    res.json({ ok: true, active });
  } catch (err) {
    console.error("[company] pilot status failed:", err.message);
    res.status(500).json({ error: "Could not update pilot status." });
  }
});

// ── Company pricing (per-service rate card overrides) ─────────────────
const { SERVICE_PRICING, SERVICES } = require("./pricing");

// GET /api/company/pricing — platform defaults + company overrides per service
router.get("/pricing", async (req, res) => {
  const cid = req.company.id;
  try {
    const overrides = await query(
      "SELECT service, baseFare, perKm, active, updatedAt FROM company_service_pricing WHERE companyId = ?",
      [cid]
    );
    const overrideMap = {};
    for (const r of overrides) overrideMap[r.service] = r;

    const services = SERVICES.map((svc) => {
      const platform = SERVICE_PRICING[svc];
      const ov = overrideMap[svc];
      return {
        service: svc,
        platform: { base: platform.base, perKm: platform.perKm },
        override: ov ? { baseFare: ov.baseFare, perKm: ov.perKm, active: Boolean(ov.active), updatedAt: ov.updatedAt } : null,
        bounds: { minBase: platform.base * 0.5, maxBase: platform.base * 3, minPerKm: platform.perKm * 0.5, maxPerKm: platform.perKm * 3 },
      };
    });

    const changelog = await query(
      "SELECT actorName, changes, createdAt FROM company_pricing_changelog WHERE companyId = ? ORDER BY createdAt DESC LIMIT 20",
      [cid]
    );

    res.json({ services, changelog, company: { id: cid, name: req.company.name, code: req.company.code } });
  } catch (err) {
    console.error("[company] pricing GET failed:", err.message);
    res.status(500).json({ error: "Could not load pricing." });
  }
});

// POST /api/company/pricing — set/update a per-service rate card override
router.post("/pricing", async (req, res) => {
  const cid = req.company.id;
  const { service, baseFare, perKm } = req.body || {};

  if (!service || !SERVICES.includes(service)) {
    return res.status(400).json({ error: "A valid service is required (taxi, golden, shuttle)." });
  }
  const base = Number(baseFare);
  const km = Number(perKm);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(km) || km <= 0) {
    return res.status(400).json({ error: "baseFare and perKm must be positive numbers." });
  }

  const platform = SERVICE_PRICING[service];
  if (base < platform.base * 0.5 || base > platform.base * 3) {
    return res.status(400).json({ error: `baseFare must be between ${platform.base * 0.5} and ${platform.base * 3} for ${service}.` });
  }
  if (km < platform.perKm * 0.5 || km > platform.perKm * 3) {
    return res.status(400).json({ error: `perKm must be between ${platform.perKm * 0.5} and ${platform.perKm * 3} for ${service}.` });
  }

  try {
    const existing = await queryOne(
      "SELECT baseFare, perKm FROM company_service_pricing WHERE companyId = ? AND service = ?",
      [cid, service]
    );

    await query(
      `INSERT INTO company_service_pricing (companyId, service, baseFare, perKm, updatedBy)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE baseFare = VALUES(baseFare), perKm = VALUES(perKm), active = 1, updatedBy = VALUES(updatedBy)`,
      [cid, service, base, km, req.user.id]
    );

    // Changelog diff
    const diffs = [];
    if (existing) {
      if (existing.baseFare !== base) diffs.push(`${service} base: ${existing.baseFare} -> ${base}`);
      if (existing.perKm !== km) diffs.push(`${service} perKm: ${existing.perKm} -> ${km}`);
    } else {
      diffs.push(`${service} base: ${platform.base} (platform) -> ${base}, perKm: ${platform.perKm} (platform) -> ${km}`);
    }
    if (diffs.length) {
      const userName = await queryOne("SELECT name FROM users WHERE id = ?", [req.user.id]);
      await query(
        "INSERT INTO company_pricing_changelog (companyId, actorName, changes) VALUES (?, ?, ?)",
        [cid, userName ? userName.name : "Company user", diffs.join("; ")]
      );
    }

    res.json({ ok: true, service, baseFare: base, perKm: km });
  } catch (err) {
    console.error("[company] pricing POST failed:", err.message);
    res.status(500).json({ error: "Could not save pricing." });
  }
});

// ── Company Profile (US-129) ───────────────────────────────────────────

const PROFILE_WHITELIST = ["name", "logoUrl", "contactEmail", "contactPhone", "description"];

router.get("/profile", async (req, res) => {
  const cid = req.company.id;
  try {
    const company = await queryOne(
      "SELECT id, name, code, logoUrl, contactEmail, contactPhone, description, rating, fleetSize, active FROM operator_companies WHERE id = ?",
      [cid]
    );
    if (!company) return res.status(404).json({ error: "Company not found." });
    const offices = await query(
      "SELECT id, city, address, lat, lng, contactPhone, radiusKm FROM regional_offices WHERE companyId = ? AND active = 1 ORDER BY city",
      [cid]
    );
    const pending = await queryOne(
      "SELECT id, payload, createdAt FROM company_change_requests WHERE companyId = ? AND status = 'pending' ORDER BY createdAt DESC LIMIT 1",
      [cid]
    );
    res.json({ company, offices, pending: pending || null });
  } catch (err) {
    console.error("[company] profile GET failed:", err.message);
    res.status(500).json({ error: "Could not load profile." });
  }
});

router.post("/profile-request", async (req, res) => {
  const cid = req.company.id;
  const { changes } = req.body;
  if (!changes || typeof changes !== "object") {
    return res.status(400).json({ error: "Missing changes object." });
  }

  const filtered = {};
  for (const key of PROFILE_WHITELIST) {
    if (key in changes) filtered[key] = changes[key];
  }
  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({ error: "No editable fields in request." });
  }

  if (filtered.name !== undefined && (typeof filtered.name !== "string" || filtered.name.trim().length < 2 || filtered.name.trim().length > 255)) {
    return res.status(400).json({ error: "Name must be 2-255 characters." });
  }
  if (filtered.contactEmail !== undefined && filtered.contactEmail !== "" && !EMAIL_RE.test(filtered.contactEmail)) {
    return res.status(400).json({ error: "Invalid email format." });
  }
  if (filtered.contactPhone !== undefined && filtered.contactPhone !== "" && !/^[\d+\-() ]{6,32}$/.test(filtered.contactPhone)) {
    return res.status(400).json({ error: "Invalid phone format." });
  }
  if (filtered.description !== undefined && typeof filtered.description === "string" && filtered.description.length > 512) {
    return res.status(400).json({ error: "Description must be at most 512 characters." });
  }
  if (filtered.logoUrl !== undefined && filtered.logoUrl !== "" && (typeof filtered.logoUrl !== "string" || filtered.logoUrl.length > 512)) {
    return res.status(400).json({ error: "Logo URL must be at most 512 characters." });
  }

  try {
    const current = await queryOne(
      "SELECT name, logoUrl, contactEmail, contactPhone, description FROM operator_companies WHERE id = ?",
      [cid]
    );
    if (!current) return res.status(404).json({ error: "Company not found." });

    const diff = {};
    for (const key of Object.keys(filtered)) {
      const proposed = (filtered[key] === undefined || filtered[key] === null) ? "" : String(filtered[key]).trim();
      const existing = (current[key] === undefined || current[key] === null) ? "" : String(current[key]);
      if (proposed !== existing) {
        diff[key] = { from: existing, to: proposed };
      }
    }
    if (Object.keys(diff).length === 0) {
      return res.status(400).json({ error: "No changes detected vs current values." });
    }

    await query(
      "UPDATE company_change_requests SET status = 'superseded' WHERE companyId = ? AND status = 'pending'",
      [cid]
    );

    const result = await query(
      "INSERT INTO company_change_requests (companyId, requestedBy, type, payload) VALUES (?, ?, 'profile', ?)",
      [cid, req.user.id, JSON.stringify(diff)]
    );

    res.json({ ok: true, requestId: result.insertId, diff });
  } catch (err) {
    console.error("[company] profile-request POST failed:", err.message);
    res.status(500).json({ error: "Could not submit change request." });
  }
});

router.get("/requests", async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = await query(
      "SELECT id, type, payload, status, adminNote, createdAt, decidedAt FROM company_change_requests WHERE companyId = ? ORDER BY createdAt DESC LIMIT 50",
      [cid]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error("[company] requests GET failed:", err.message);
    res.status(500).json({ error: "Could not load requests." });
  }
});

router.post("/requests/:id/cancel", async (req, res) => {
  const cid = req.company.id;
  const reqId = Number(req.params.id);
  if (!Number.isFinite(reqId)) {
    return res.status(400).json({ error: "Invalid request ID." });
  }
  try {
    const row = await queryOne(
      "SELECT id, companyId, status FROM company_change_requests WHERE id = ?",
      [reqId]
    );
    if (!row) return res.status(404).json({ error: "Request not found." });
    if (row.companyId !== cid) return res.status(403).json({ error: "Not your request." });
    if (row.status !== "pending") return res.status(400).json({ error: "Only pending requests can be cancelled." });

    await query(
      "UPDATE company_change_requests SET status = 'cancelled', decidedAt = NOW() WHERE id = ?",
      [reqId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[company] request cancel failed:", err.message);
    res.status(500).json({ error: "Could not cancel request." });
  }
});

module.exports = router;
