// Company portal API routes.
// Mounted at /api/company (NOT under /admin — no Tailscale gate).
// Every route uses requireAuth + requireRole('company') and resolves
// companyId via re-query of the users table (US-124 decision).

const express = require("express");
const { requireAuth, requireRole, USER_NOT_DELETED } = require("./auth");
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

module.exports = router;
