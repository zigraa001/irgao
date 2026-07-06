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

module.exports = router;
