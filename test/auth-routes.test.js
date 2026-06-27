// Integration-style tests for the public auth routes (src/auth-routes.js),
// exercised over real HTTP against an Express app.
//
// Focus: signup hardening (defense in depth) — public signup must be incapable
// of creating elevated accounts even if the client sends a role field.
//
// The database is replaced with a tiny in-memory fake injected into the require
// cache BEFORE auth-routes loads, so these tests stay DB-free and run anywhere
// with `npm test`. See test/admin-routes.test.js for the same pattern.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

// Deterministic secret so signToken/verifyToken work in the test process.
process.env.AUTH_SECRET = "test-secret-for-auth-routes-tests";

// --- In-memory fake of src/db -------------------------------------------------
// Implements just the queries auth-routes (signup/login) issues. Matching is by
// the leading shape of the (whitespace-collapsed) SQL, which we fully control.
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
    if (s.includes("FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0]).map((u) => ({ ...u }));
    }
    if (s.includes("FROM users WHERE id")) {
      return users.filter((u) => u.id === params[0]).map((u) => ({ ...u }));
    }
    return [];
  }

  async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }

  return { query, queryOne, _users: users };
})();

// Inject the fake under the exact module id auth-routes resolves ("./db").
const dbPath = require.resolve("../src/db");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeDb,
};

const authRoutes = require("../src/auth-routes");

// --- Test server --------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

const server = http.createServer(app);
let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function signup(body) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// --- Signup hardening ---------------------------------------------------------

test("signup creates a customer account", async () => {
  const { status, json } = await signup({
    name: "Cara",
    email: "Cara@Irago.com",
    password: "secret1",
  });
  assert.equal(status, 201);
  assert.equal(json.user.role, "customer");
  // Email is lowercased before insert/lookup.
  assert.equal(json.user.email, "cara@irago.com");
  assert.ok(json.token);
  assert.equal("passwordHash" in json.user, false);
});

test("signup ignores a role field and still creates a customer", async () => {
  const { status, json } = await signup({
    name: "Mallory",
    email: "mallory@irago.com",
    password: "secret1",
    role: "admin",
  });
  assert.equal(status, 201);
  assert.equal(json.user.role, "customer");
  // The stored row must also be a customer — not admin.
  const stored = fakeDb._users.find((u) => u.email === "mallory@irago.com");
  assert.equal(stored.role, "customer");
});

test("signup rejects 'operator' role injection the same way — stays a customer", async () => {
  const { status, json } = await signup({
    name: "Eve",
    email: "eve@irago.com",
    password: "secret1",
    role: "operator",
  });
  assert.equal(status, 201);
  assert.equal(json.user.role, "customer");
});
