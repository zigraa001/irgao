// IraGo admin routes. Mounted at /api/admin.
//
// Every endpoint here is admin-only: requireAuth proves a valid session, then
// requireRole("admin") proves the caller is an administrator. These routes let
// an admin provision elevated accounts (operators/admins) — something public
// signup must never be able to do (see auth-routes.js, which always forces
// role = "customer").
const express = require("express");
const { query, queryOne } = require("./db");
const { hashPassword, requireAuth, requireRole } = require("./auth");

const router = express.Router();

// Same minimal email sanity check public signup uses — kept in sync on purpose.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Roles an admin is allowed to create here. "customer" is intentionally
// excluded: customers self-register via public signup, and this endpoint exists
// only to mint elevated accounts.
const CREATABLE_ROLES = ["operator", "admin"];

// Shape the user object returned to clients: never include the password hash.
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/admin/users — create an operator or admin account.
// Body: { name, email, password, role }. Admin-only; the role is validated
// against CREATABLE_ROLES so this endpoint can never create a customer.
router.post(
  "/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "name, email, and password are required" });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }
    if (!CREATABLE_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ error: "role must be one of operator, admin" });
    }

    const normalizedEmail = String(email).toLowerCase();

    const existing = await queryOne("SELECT id FROM users WHERE email = ?", [
      normalizedEmail,
    ]);
    if (existing) {
      return res
        .status(409)
        .json({ error: "An account with that email already exists" });
    }

    const passwordHash = await hashPassword(String(password));
    const result = await query(
      "INSERT INTO users (name, email, passwordHash, role) VALUES (?, ?, ?, ?)",
      [String(name), normalizedEmail, passwordHash, role]
    );

    // Re-read the freshly inserted row so the response reflects exactly what the
    // database stored (id, defaults, timestamps).
    const user = await queryOne("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);

    res.status(201).json({ user: publicUser(user) });
  }
);

module.exports = router;
