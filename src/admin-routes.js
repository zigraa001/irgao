// IraGo admin routes. Mounted at /api/admin.
//
// Every endpoint here is admin-only: requireAuth proves a valid session, then
// requireRole("admin") proves the caller is an administrator. These routes let
// an admin provision operator accounts — admin accounts come from env bootstrap only.
const express = require("express");
const { query, queryOne } = require("./db");
const { hashPassword, requireAuth, requireRole } = require("./auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CREATABLE_ROLES = ["operator"];

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

// POST /api/admin/users — create an operator account (admins: npm run admin:bootstrap).
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
        .json({ error: "role must be operator (admins are created via .env bootstrap only)" });
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

// PATCH /api/admin/users/:id/password — reset any user's password (admin-only).
// Body: { newPassword }. Works for customers, operators, and admins — including
// the admin's own account when they know the target user id.
router.patch(
  "/users/:id/password",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    const { newPassword } = req.body || {};

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res
        .status(400)
        .json({ error: "newPassword must be at least 6 characters" });
    }

    const target = await queryOne("SELECT id, email, role FROM users WHERE id = ?", [
      userId,
    ]);
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    if (target.role === "admin") {
      return res.status(403).json({
        error:
          "Admin password is managed via .env only. Update ADMIN_PASSWORD and run npm run admin:bootstrap.",
        code: "ADMIN_ENV_ONLY",
      });
    }

    const passwordHash = await hashPassword(String(newPassword));
    await query("UPDATE users SET passwordHash = ? WHERE id = ?", [
      passwordHash,
      userId,
    ]);

    res.json({
      message: `Password updated for ${target.email}.`,
      user: { id: target.id, email: target.email, role: target.role },
    });
  }
);

// POST /api/admin/users/:id/send-reset-otp — email an OTP reset link/code to a user.
router.post(
  "/users/:id/send-reset-otp",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const target = await queryOne(
      "SELECT id, email, role FROM users WHERE id = ?",
      [userId]
    );
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    if (target.role === "admin") {
      return res.status(403).json({
        error: "Admin accounts do not use OTP password reset.",
        code: "ADMIN_ENV_ONLY",
      });
    }

    const { createAndSendOtp } = require("./otp");
    const result = await createAndSendOtp(
      target.email,
      "reset_password",
      {}
    );

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    res.json({
      message: `Reset code sent to ${target.email}.`,
      expiresInSeconds: result.expiresInSeconds,
    });
  }
);

module.exports = router;
