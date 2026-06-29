// IraGo admin routes. Mounted at /api/admin.
//
// Every endpoint here is admin-only: requireAuth proves a valid session, then
// requireRole("admin") proves the caller is an administrator.
const express = require("express");
const crypto = require("crypto");
const { query, queryOne } = require("./db");
const {
  hashPassword,
  requireAuth,
  requireRole,
  USER_NOT_DELETED,
  USER_NOT_BANNED,
} = require("./auth");
const { buildProfileStats } = require("./profile-stats");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only admins can create operator/admin accounts (public self-signup for these
// roles is closed). The first admin is still bootstrapped from .env.
const CREATABLE_ROLES = ["operator", "admin"];
const FILTERABLE_ROLES = ["operator", "admin", "customer"];
const LIST_FETCH_LIMIT = 6;
const LIST_MAX_OFFSET = 10000;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustResetPassword: Boolean(user.mustResetPassword),
  };
}

function listUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    banned: Boolean(user.bannedAt),
    mustResetPassword: Boolean(user.mustResetPassword),
  };
}

function parseListQuery(q) {
  const limit = Math.min(
    Math.max(parseInt(q?.limit, 10) || LIST_FETCH_LIMIT, 1),
    LIST_FETCH_LIMIT
  );
  const offset = Math.min(
    Math.max(parseInt(q?.offset, 10) || 0, 0),
    LIST_MAX_OFFSET
  );
  const roleFilter = FILTERABLE_ROLES.includes(q?.role) ? q.role : null;
  return { limit, offset, roleFilter };
}

function userListWhere(roleFilter) {
  const clauses = [USER_NOT_DELETED];
  const params = [];
  if (roleFilter) {
    clauses.push("role = ?");
    params.push(roleFilter);
  }
  return { sql: clauses.join(" AND "), params };
}

async function softDeleteUser(user) {
  const tombstoneEmail =
    "deleted." + user.id + "." + Date.now() + "@irago.invalid";
  const unusableHash = await hashPassword(
    crypto.randomBytes(32).toString("hex")
  );
  await query(
    `UPDATE users
     SET deletedAt = NOW(), bannedAt = NULL, email = ?, name = ?, passwordHash = ?
     WHERE id = ?`,
    [tombstoneEmail, "Deleted user", unusableHash, user.id]
  );
}

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
      return res.status(400).json({
        error:
          "role must be operator or admin (the first admin is created via .env bootstrap)",
      });
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

    // Temp password set by the admin — the new user MUST change it on first
    // login (mustResetPassword = 1). The change-password endpoint clears it.
    const passwordHash = await hashPassword(String(password));
    const result = await query(
      "INSERT INTO users (name, email, passwordHash, role, emailVerified, mustResetPassword) VALUES (?, ?, ?, ?, 1, 1)",
      [String(name), normalizedEmail, passwordHash, role]
    );

    const user = await queryOne("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);

    res.status(201).json({ user: publicUser(user) });
  }
);

// GET /api/admin/users — paginated list (6 per request). ?role= &limit= &offset=
router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { limit, offset, roleFilter } = parseListQuery(req.query);
  const { sql: whereSql, params: whereParams } = userListWhere(roleFilter);

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM users WHERE ${whereSql}`,
    whereParams
  );
  const total = Number(countRow?.total) || 0;

  const rows = await query(
    `SELECT id, name, email, role, createdAt, bannedAt, mustResetPassword
     FROM users WHERE ${whereSql}
     ORDER BY createdAt DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...whereParams, limit, offset]
  );

  res.json({
    users: rows.map(listUser),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  });
});

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

    const target = await queryOne(
      `SELECT id, email, role, mustResetPassword FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [userId]
    );
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    // Env-bootstrap admins (mustResetPassword = 0) stay .env-managed.
    // Console-created admins (mustResetPassword = 1) can be reset here.
    if (target.role === "admin" && !target.mustResetPassword) {
      return res.status(403).json({
        error:
          "Admin password is managed via .env only. Update ADMIN_PASSWORD and run npm run admin:bootstrap.",
        code: "ADMIN_ENV_ONLY",
      });
    }

    const passwordHash = await hashPassword(String(newPassword));
    // Admin-set password is treated as a fresh temp password: the user must
    // change it on next login.
    await query(
      "UPDATE users SET passwordHash = ?, mustResetPassword = 1 WHERE id = ?",
      [passwordHash, userId]
    );

    res.json({
      message: `Password updated for ${target.email}. The user must change it on next login.`,
      user: { id: target.id, email: target.email, role: target.role },
    });
  }
);

// PATCH /api/admin/users/:id/ban — { banned: true|false }
router.patch(
  "/users/:id/ban",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    const { banned } = req.body || {};

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (typeof banned !== "boolean") {
      return res.status(400).json({ error: "banned (boolean) is required" });
    }
    if (banned && userId === req.user.id) {
      return res.status(400).json({ error: "You cannot ban your own account." });
    }

    const target = await queryOne(
      `SELECT id, email, role, bannedAt FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [userId]
    );
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    if (target.role === "admin") {
      return res.status(403).json({
        error: "Admin accounts cannot be banned.",
        code: "ADMIN_ENV_ONLY",
      });
    }

    if (banned) {
      await query("UPDATE users SET bannedAt = NOW() WHERE id = ?", [userId]);
    } else {
      await query("UPDATE users SET bannedAt = NULL WHERE id = ?", [userId]);
    }

    res.json({
      message: banned
        ? `${target.email} has been banned.`
        : `${target.email} has been unbanned.`,
      user: { id: target.id, email: target.email, role: target.role, banned },
    });
  }
);

// DELETE /api/admin/users/:id — soft-delete a non-admin account.
router.delete(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account here." });
    }

    const target = await queryOne(
      `SELECT id, email, role FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [userId]
    );
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    if (target.role === "admin") {
      return res.status(403).json({
        error: "Admin accounts cannot be deleted online.",
        code: "ADMIN_ENV_ONLY",
      });
    }

    await softDeleteUser(target);
    res.json({ message: `Account for ${target.email} has been deleted.` });
  }
);

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
      `SELECT id, email, role FROM users WHERE id = ? AND ${USER_NOT_DELETED} AND ${USER_NOT_BANNED}`,
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

// Full profile for the admin user-detail drawer. Includes operator GPS so the
// drawer can pin the pilot on the live map.
function detailUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    banned: Boolean(user.bannedAt),
    bannedAt: user.bannedAt || null,
    mustResetPassword: Boolean(user.mustResetPassword),
    emailVerified: Boolean(user.emailVerified),
    gps: user.gpsLat != null && user.gpsLng != null
      ? { lat: Number(user.gpsLat), lng: Number(user.gpsLng), updatedAt: user.gpsUpdatedAt || null }
      : null,
  };
}

// GET /api/admin/users/:id — full profile for the user-detail drawer.
router.get(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const user = await queryOne(
      `SELECT id, name, email, role, createdAt, bannedAt, mustResetPassword,
              emailVerified, gpsLat, gpsLng, gpsUpdatedAt
         FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [userId]
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: detailUser(user) });
  }
);

// GET /api/admin/users/:id/stats — per-user trips/fare aggregates for the drawer.
// Reuses the same role-scoped stats logic as /api/me/stats but for any user.
router.get(
  "/users/:id/stats",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const user = await queryOne(
      `SELECT id, role FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [userId]
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    try {
      const stats = await buildProfileStats(user.id, user.role);
      res.json({ stats });
    } catch (err) {
      res.status(500).json({ error: "Failed to load user stats" });
    }
  }
);

module.exports = router;
