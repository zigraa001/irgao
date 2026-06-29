// Integration-style tests for the admin user-management routes
// (src/admin-routes.js), exercised over real HTTP against an Express app.
//
// The database is replaced with a tiny in-memory fake injected into the require
// cache BEFORE admin-routes loads, so these tests stay DB-free and run anywhere
// with `npm test`. Auth is NOT faked — real signed tokens are used so the
// requireAuth/requireRole guards are genuinely tested.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

// Deterministic secret so signToken/verifyToken work in the test process.
process.env.AUTH_SECRET = "test-secret-for-admin-tests";

// --- In-memory fake of src/db -------------------------------------------------
// Implements just the queries admin-routes issues. Matching is by the leading
// shape of the (whitespace-collapsed) SQL, which we fully control here.
const fakeDb = (() => {
  const users = [];
  let nextId = 1;

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();

    function activeUsers() {
      return users.filter((u) => !u.deletedAt);
    }

    if (s.startsWith("INSERT INTO users")) {
      const [name, email, passwordHash, role] = params;
      const row = {
        id: nextId++,
        name,
        email,
        passwordHash,
        role,
        createdAt: `2026-01-01 00:00:0${nextId}`,
        deletedAt: null,
        bannedAt: null,
        emailVerified: 1,
        mustResetPassword: 1,
      };
      users.push(row);
      return { insertId: row.id, affectedRows: 1 };
    }
    if (s.startsWith("SELECT id FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0]).map((u) => ({ id: u.id }));
    }
    if (s.includes("SELECT COUNT(*) AS total FROM users")) {
      let rows = activeUsers();
      if (s.includes("role = ?")) {
        rows = rows.filter((u) => u.role === params[0]);
      }
      return [{ total: rows.length }];
    }
    if (s.includes("FROM users") && s.includes("LIMIT ? OFFSET ?")) {
      let rows = activeUsers();
      let p = 0;
      if (s.includes("role = ?")) {
        rows = rows.filter((u) => u.role === params[p++]);
      }
      rows.sort((a, b) =>
        b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : b.id - a.id
      );
      const limit = Number(params[params.length - 2]);
      const offset = Number(params[params.length - 1]);
      return rows.slice(offset, offset + limit).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        bannedAt: u.bannedAt || null,
        mustResetPassword: u.mustResetPassword || 0,
      }));
    }
    if (/FROM users WHERE id = \?/.test(s)) {
      let rows = users.filter((u) => u.id === params[0]);
      if (s.includes("deletedAt IS NULL")) {
        rows = rows.filter((u) => !u.deletedAt);
      }
      return rows.map((u) => ({ ...u }));
    }
    if (s.includes("UPDATE users SET bannedAt = NOW()")) {
      const row = users.find((u) => u.id === params[0]);
      if (row) row.bannedAt = new Date();
      return { affectedRows: 1 };
    }
    if (s.includes("UPDATE users SET bannedAt = NULL")) {
      const row = users.find((u) => u.id === params[0]);
      if (row) row.bannedAt = null;
      return { affectedRows: 1 };
    }
    if (s.includes("UPDATE users SET deletedAt = NOW()")) {
      const [email, name, passwordHash, id] = params;
      const row = users.find((u) => u.id === id);
      if (row) {
        row.deletedAt = new Date();
        row.email = email;
        row.name = name;
        row.passwordHash = passwordHash;
        row.bannedAt = null;
      }
      return { affectedRows: 1 };
    }
    if (s.includes("UPDATE users SET passwordHash")) {
      const [passwordHash, id] = params;
      const row = users.find((u) => u.id === id);
      if (row) row.passwordHash = passwordHash;
      return { affectedRows: 1 };
    }
    return [];
  }

  async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }

  return { query, queryOne, _users: users };
})();

// Inject the fake under the exact module id admin-routes resolves ("./db").
const dbPath = require.resolve("../src/db");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb,
};

const adminRoutes = require("../src/admin-routes");
const { signToken } = require("../src/auth");

// --- Test server --------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);

const server = http.createServer(app);
let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  fakeDb._users.push({
    id: 1000,
    name: "Env Admin",
    email: "admin@irago.com",
    passwordHash: "hash",
    role: "admin",
    createdAt: "2029-12-31 23:59:59",
  });
});
test.after(() => server.close());

const adminToken = () => signToken({ id: 1, name: "Admin", role: "admin" });
const customerToken = () => signToken({ id: 2, name: "Cara", role: "customer" });

async function post(body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function get(qs, token) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users${qs || ""}`, { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// --- Auth guards --------------------------------------------------------------

test("POST /api/admin/users without a token returns 401", async () => {
  const { status } = await post({
    name: "Op",
    email: "op@x.com",
    password: "secret1",
    role: "operator",
  });
  assert.equal(status, 401);
});

test("POST /api/admin/users with a non-admin token returns 403", async () => {
  const { status } = await post(
    { name: "Op", email: "op2@x.com", password: "secret1", role: "operator" },
    customerToken()
  );
  assert.equal(status, 403);
});

// --- Validation ---------------------------------------------------------------

test("missing fields return 400", async () => {
  const { status } = await post({ email: "x@y.com" }, adminToken());
  assert.equal(status, 400);
});

test("invalid email returns 400", async () => {
  const { status } = await post(
    { name: "Op", email: "not-an-email", password: "secret1", role: "operator" },
    adminToken()
  );
  assert.equal(status, 400);
});

test("short password returns 400", async () => {
  const { status } = await post(
    { name: "Op", email: "short@x.com", password: "123", role: "operator" },
    adminToken()
  );
  assert.equal(status, 400);
});

test("role 'customer' is rejected with 400", async () => {
  const { status } = await post(
    { name: "Cust", email: "cust@x.com", password: "secret1", role: "customer" },
    adminToken()
  );
  assert.equal(status, 400);
});

test("unknown role is rejected with 400", async () => {
  const { status } = await post(
    { name: "Su", email: "su@x.com", password: "secret1", role: "superadmin" },
    adminToken()
  );
  assert.equal(status, 400);
});

// --- Happy path + conflicts ---------------------------------------------------

test("admin can create an operator; response omits passwordHash", async () => {
  const { status, json } = await post(
    { name: "Olivia", email: "Olivia@Irago.com", password: "secret1", role: "operator" },
    adminToken()
  );
  assert.equal(status, 201);
  assert.equal(json.user.role, "operator");
  assert.equal(json.user.name, "Olivia");
  // Email is lowercased like signup.
  assert.equal(json.user.email, "olivia@irago.com");
  assert.ok(json.user.id);
  assert.equal(json.user.passwordHash, undefined);
  assert.equal("passwordHash" in json.user, false);
  // Admin-provisioned accounts must reset their temp password on first login.
  assert.equal(json.user.mustResetPassword, true);
  // The stored row keeps a bcrypt hash, never the plaintext.
  const stored = fakeDb._users.find((u) => u.email === "olivia@irago.com");
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(stored.passwordHash, "secret1");
});

test("admin can create another admin; it must reset its temp password on first login", async () => {
  const { status, json } = await post(
    { name: "Andy", email: "andy@irago.com", password: "secret1", role: "admin" },
    adminToken()
  );
  assert.equal(status, 201);
  assert.equal(json.user.role, "admin");
  assert.equal(json.user.mustResetPassword, true);
});

test("duplicate email (case-insensitive) returns 409", async () => {
  const first = await post(
    { name: "Dee", email: "dupe@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  assert.equal(first.status, 201);
  const second = await post(
    { name: "Dee2", email: "DUPE@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  assert.equal(second.status, 409);
});

// --- List endpoint (GET /api/admin/users) -------------------------------------

test("GET /api/admin/users without a token returns 401", async () => {
  const { status } = await get();
  assert.equal(status, 401);
});

test("GET /api/admin/users with a non-admin token returns 403", async () => {
  const { status } = await get("", customerToken());
  assert.equal(status, 403);
});

test("GET /api/admin/users returns users newest-first, no passwordHash", async () => {
  const { status, json } = await get("?limit=6&offset=0", adminToken());
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.users));
  assert.ok(json.users.length > 0);
  assert.equal(json.limit, 6);
  assert.equal(json.offset, 0);
  assert.ok(typeof json.total === "number");
  assert.ok("hasMore" in json);
  for (const u of json.users) {
    assert.equal("passwordHash" in u, false);
    assert.ok("createdAt" in u);
    assert.ok("banned" in u);
    assert.ok(u.id && u.name && u.email && u.role);
  }
  const ids = json.users.map((u) => u.id);
  const sorted = [...ids].sort((a, b) => b - a);
  assert.deepEqual(ids, sorted);
});

test("GET /api/admin/users respects limit 6 and returns pagination meta", async () => {
  const { status, json } = await get("?limit=6&offset=0", adminToken());
  assert.equal(status, 200);
  assert.ok(json.users.length <= 6);
  assert.equal(json.limit, 6);
  assert.equal(json.offset, 0);
  assert.ok(typeof json.total === "number");
  assert.ok("hasMore" in json);
});

test("GET /api/admin/users?role=admin filters by role", async () => {
  const { status, json } = await get("?role=admin", adminToken());
  assert.equal(status, 200);
  assert.ok(json.users.length > 0);
  assert.ok(json.users.every((u) => u.role === "admin"));
});

test("GET /api/admin/users with an invalid role returns all users", async () => {
  const all = await get("?limit=6&offset=0", adminToken());
  const bogus = await get("?role=superadmin&limit=6&offset=0", adminToken());
  assert.equal(bogus.status, 200);
  assert.equal(bogus.json.total, all.json.total);
});

// --- Admin password reset -----------------------------------------------------

async function patchPassword(userId, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users/${userId}/password`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

test("admin can reset operator password", async () => {
  const created = await post(
    { name: "ResetMe", email: "reset@x.com", password: "oldpass1", role: "operator" },
    adminToken()
  );
  assert.equal(created.status, 201);
  const userId = created.json.user.id;

  const { status, json } = await patchPassword(
    userId,
    { newPassword: "newpass2" },
    adminToken()
  );
  assert.equal(status, 200);
  assert.match(json.message, /reset@x.com/);
});

test("admin password cannot be reset via API", async () => {
  const { status, json } = await patchPassword(
    1000,
    { newPassword: "newpass2" },
    adminToken()
  );
  assert.equal(status, 403);
  assert.equal(json.code, "ADMIN_ENV_ONLY");
});

test("POST /api/admin/users accepts admin role (admin-provisioned)", async () => {
  const res = await post(
    { name: "Bad", email: "badadmin@x.com", password: "secret1", role: "admin" },
    adminToken()
  );
  assert.equal(res.status, 201);
  assert.equal(res.json.user.role, "admin");
});

test("PATCH password without admin token returns 401", async () => {
  const { status } = await patchPassword(1, { newPassword: "newpass2" });
  assert.equal(status, 401);
});

async function patchBan(userId, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users/${userId}/ban`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

test("admin can ban and unban an operator", async () => {
  const created = await post(
    { name: "BanMe", email: "ban@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  const userId = created.json.user.id;
  const banned = await patchBan(userId, { banned: true }, adminToken());
  assert.equal(banned.status, 200);
  assert.equal(banned.json.user.banned, true);
  const unbanned = await patchBan(userId, { banned: false }, adminToken());
  assert.equal(unbanned.status, 200);
  assert.equal(unbanned.json.user.banned, false);
});

test("admin can soft-delete an operator", async () => {
  const created = await post(
    { name: "DelMe", email: "del@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  const userId = created.json.user.id;
  const headers = { authorization: `Bearer ${adminToken()}` };
  const res = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(res.status, 200);
  const row = fakeDb._users.find((u) => u.id === userId);
  assert.ok(row.deletedAt);
});

// --- Per-user detail + stats (user-detail drawer) -----------------------------

async function getDetail(userId, token) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users/${userId}`, { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function getStats(userId, token) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/admin/users/${userId}/stats`, { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

test("GET /api/admin/users/:id requires admin (403 for customer)", async () => {
  const { status } = await getDetail(1000, customerToken());
  assert.equal(status, 403);
});

test("GET /api/admin/users/:id without a token returns 401", async () => {
  const { status } = await getDetail(1000);
  assert.equal(status, 401);
});

test("GET /api/admin/users/:id returns the full profile without passwordHash", async () => {
  const created = await post(
    { name: "Detail Op", email: "detail@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  const userId = created.json.user.id;
  const { status, json } = await getDetail(userId, adminToken());
  assert.equal(status, 200);
  assert.equal(json.user.id, userId);
  assert.equal(json.user.role, "operator");
  assert.equal(json.user.email, "detail@x.com");
  assert.equal(json.user.mustResetPassword, true);
  assert.equal("passwordHash" in json.user, false);
  assert.equal(json.user.gps, null);
});

test("GET /api/admin/users/:id returns 404 for a missing user", async () => {
  const { status } = await getDetail(999999, adminToken());
  assert.equal(status, 404);
});

test("GET /api/admin/users/:id/stats returns operator-scoped stats", async () => {
  const created = await post(
    { name: "Stats Op", email: "stats@x.com", password: "secret1", role: "operator" },
    adminToken()
  );
  const userId = created.json.user.id;
  const { status, json } = await getStats(userId, adminToken());
  assert.equal(status, 200);
  assert.equal(json.stats.scope, "operator");
  assert.ok(json.stats.totals && typeof json.stats.totals === "object");
  assert.equal(json.stats.totals.assigned, 0);
});

test("GET /api/admin/users/:id/stats returns 404 for a missing user", async () => {
  const { status } = await getStats(999999, adminToken());
  assert.equal(status, 404);
});
