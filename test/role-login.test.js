// Role-scoped login endpoint tests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const bcrypt = require("bcrypt");

process.env.AUTH_SECRET = "test-role-login";

const fakeDb = (() => {
  const users = [
    {
      id: 1,
      name: "Passenger",
      email: "p@irago.com",
      passwordHash: "",
      role: "customer",
      emailVerified: 1,
    },
    {
      id: 2,
      name: "Pilot",
      email: "o@irago.com",
      passwordHash: "",
      role: "operator",
      emailVerified: 1,
    },
  ];

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0]).map((u) => ({ ...u }));
    }
    return [];
  }

  async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }

  return { query, queryOne, _users: users };
})();

require.cache[require.resolve("../src/db")] = {
  id: require.resolve("../src/db"),
  filename: require.resolve("../src/db"),
  loaded: true,
  exports: fakeDb,
};

const authRoutes = require("../src/auth-routes");
const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
const server = http.createServer(app);
let baseUrl;

test.before(async () => {
  const hash = await bcrypt.hash("secret1", 10);
  fakeDb._users.forEach((u) => {
    u.passwordHash = hash;
  });
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function login(path, email) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret1" }),
  });
  return { status: res.status, body: await res.json() };
}

test("passenger login accepts customer role", async () => {
  const { status, body } = await login("/api/auth/passenger/login", "p@irago.com");
  assert.equal(status, 200);
  assert.equal(body.user.role, "customer");
});

test("operator login rejects customer with WRONG_PORTAL", async () => {
  const { status, body } = await login("/api/auth/operator/login", "p@irago.com");
  assert.equal(status, 403);
  assert.equal(body.code, "WRONG_PORTAL");
  assert.equal(body.portal, "passenger");
});

test("operator login accepts operator role", async () => {
  const { status, body } = await login("/api/auth/operator/login", "o@irago.com");
  assert.equal(status, 200);
  assert.equal(body.user.role, "operator");
});
