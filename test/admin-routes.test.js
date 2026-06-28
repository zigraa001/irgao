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

    if (s.startsWith("INSERT INTO users")) {
      const [name, email, passwordHash, role] = params;
      const row = {
        id: nextId++,
        name,
        email,
        passwordHash,
        role,
        createdAt: `2026-01-01 00:00:0${nextId}`,
      };
      users.push(row);
      return { insertId: row.id, affectedRows: 1 };
    }
    if (s.startsWith("SELECT id FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0]).map((u) => ({ id: u.id }));
    }
    if (s.includes("FROM users WHERE id")) {
      return users.filter((u) => u.id === params[0]).map((u) => ({ ...u }));
    }
    // List endpoint: optional role filter, ordered newest-first.
    if (s.startsWith("SELECT id, name, email, role, createdAt FROM users")) {
      let rows = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      }));
      if (s.includes("WHERE role")) {
        rows = rows.filter((u) => u.role === params[0]);
      }
      rows.sort((a, b) =>
        b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : b.id - a.id
      );
      return rows;
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
  // The stored row keeps a bcrypt hash, never the plaintext.
  const stored = fakeDb._users.find((u) => u.email === "olivia@irago.com");
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(stored.passwordHash, "secret1");
});

test("admin cannot create another admin via API", async () => {
  const { status } = await post(
    { name: "Andy", email: "andy@irago.com", password: "secret1", role: "admin" },
    adminToken()
  );
  assert.equal(status, 400);
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
  const { status, json } = await get("", adminToken());
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.users));
  assert.ok(json.users.length > 0);
  for (const u of json.users) {
    assert.equal("passwordHash" in u, false);
    assert.ok("createdAt" in u);
    assert.ok(u.id && u.name && u.email && u.role);
  }
  // Newest-first: ids are strictly descending given our monotonic createdAt.
  const ids = json.users.map((u) => u.id);
  const sorted = [...ids].sort((a, b) => b - a);
  assert.deepEqual(ids, sorted);
});

test("GET /api/admin/users?role=admin filters by role", async () => {
  const { status, json } = await get("?role=admin", adminToken());
  assert.equal(status, 200);
  assert.ok(json.users.length > 0);
  assert.ok(json.users.every((u) => u.role === "admin"));
});

test("GET /api/admin/users with an invalid role returns all users", async () => {
  const all = await get("", adminToken());
  const bogus = await get("?role=superadmin", adminToken());
  assert.equal(bogus.status, 200);
  assert.equal(bogus.json.users.length, all.json.users.length);
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

test("POST /api/admin/users rejects admin role", async () => {
  const res = await post(
    { name: "Bad", email: "badadmin@x.com", password: "secret1", role: "admin" },
    adminToken()
  );
  assert.equal(res.status, 400);
});

test("PATCH password without admin token returns 401", async () => {
  const { status } = await patchPassword(1, { newPassword: "newpass2" });
  assert.equal(status, 401);
});
