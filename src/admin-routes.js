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

// Roles that may be used to filter the list endpoint. Customers are valid here
// (an admin may want to see who has self-registered), unlike CREATABLE_ROLES.
const FILTERABLE_ROLES = ["operator", "admin", "customer"];

// Shape the user object returned to clients: never include the password hash.
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Like publicUser but also exposes createdAt for the user-management list view.
function listUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
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

// GET /api/admin/users — list existing users for the admin dashboard.
// Newest first (by createdAt, id as tiebreaker). Optional ?role= filter; an
// invalid/absent role value is ignored and all users are returned.
router.get(
  "/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const roleFilter = req.query ? req.query.role : undefined;

    let rows;
    if (FILTERABLE_ROLES.includes(roleFilter)) {
      rows = await query(
        "SELECT id, name, email, role, createdAt FROM users WHERE role = ? ORDER BY createdAt DESC, id DESC",
        [roleFilter]
      );
    } else {
      rows = await query(
        "SELECT id, name, email, role, createdAt FROM users ORDER BY createdAt DESC, id DESC"
      );
    }

    res.json({ users: rows.map(listUser) });
  }
);

module.exports = router;
