// Role-scoped login handlers — each portal only accepts its own role.
const { queryOne } = require("./db");
const { verifyPassword, USER_NOT_DELETED } = require("./auth");

const PORTAL_BY_DB_ROLE = {
  customer: "passenger",
  operator: "operator",
  admin: "admin",
  company: "company",
};

function createRoleLoginHandler(expectedRole, authResponse) {
  return async function roleLogin(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await queryOne(
      `SELECT * FROM users WHERE email = ? AND ${USER_NOT_DELETED}`,
      [String(email).toLowerCase()]
    );
    const ok =
      user && (await verifyPassword(String(password), user.passwordHash));
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.bannedAt) {
      return res.status(403).json({
        error: "This account has been suspended. Contact support.",
        code: "ACCOUNT_BANNED",
      });
    }

    if (user.role !== expectedRole) {
      const portal = PORTAL_BY_DB_ROLE[user.role] || "passenger";
      return res.status(403).json({
        error: "This account cannot sign in here. Use the correct portal.",
        code: "WRONG_PORTAL",
        portal,
      });
    }

    return authResponse(res, 200, user);
  };
}

module.exports = { createRoleLoginHandler, PORTAL_BY_DB_ROLE };
