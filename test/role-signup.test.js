// Tests for role-specific signup endpoints.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.AUTH_SECRET = "test-role-signup";

const fakeDb = (() => {
  const users = [];
  const otps = [];
  let nextUserId = 1;
  let nextOtpId = 1;

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("INSERT INTO users")) {
      const [name, email, passwordHash, role] = params;
      const row = { id: nextUserId++, name, email, passwordHash, role, emailVerified: 1 };
      users.push(row);
      return { insertId: row.id, affectedRows: 1 };
    }
    if (s.includes("COUNT(*) AS n FROM users WHERE role")) {
      return [{ n: users.filter((u) => u.role === "admin").length }];
    }
    if (s.startsWith("UPDATE otp_requests SET consumedAt")) {
      return { affectedRows: 1 };
    }
    if (s.startsWith("INSERT INTO otp_requests")) {
      otps.push({
        id: nextOtpId++,
        email: params[0],
        purpose: params[1],
        codeHash: params[2],
        payload: params[3],
        attempts: 0,
        expiresAt: new Date(Date.now() + params[4] * 1000),
        consumedAt: null,
        createdAt: new Date(Date.now() - 600000),
      });
      return { insertId: nextOtpId - 1 };
    }
    if (s.includes("COUNT(*) AS cnt FROM otp_requests")) return [{ cnt: 0 }];
    if (s.includes("createdAt FROM otp_requests") && s.includes("ORDER BY")) {
      const matches = otps.filter((o) => o.email === params[0] && o.purpose === params[1]);
      return matches.length ? [{ createdAt: matches[matches.length - 1].createdAt }] : [];
    }
    if (s.includes("FROM otp_requests") && s.includes("consumedAt IS NULL")) {
      const row = otps
        .filter((o) => o.email === params[0] && o.purpose === params[1] && !o.consumedAt && o.expiresAt > new Date())
        .sort((a, b) => b.id - a.id)[0];
      return row ? [{ ...row, payload: row.payload }] : [];
    }
    if (s.startsWith("UPDATE otp_requests SET attempts")) return { affectedRows: 1 };
    if (s.startsWith("UPDATE otp_requests SET consumedAt = NOW() WHERE id")) {
      const row = otps.find((o) => o.id === params[0]);
      if (row) row.consumedAt = new Date();
      return { affectedRows: 1 };
    }
    if (s.startsWith("SELECT id FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0]).map((u) => ({ id: u.id }));
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

  return { query, queryOne, _users: users, _otps: otps };
})();

require.cache[require.resolve("../src/db")] = {
  id: require.resolve("../src/db"),
  filename: require.resolve("../src/db"),
  loaded: true,
  exports: fakeDb,
};
require.cache[require.resolve("../src/email")] = {
  id: require.resolve("../src/email"),
  filename: require.resolve("../src/email"),
  loaded: true,
  exports: { sendOtpEmail: async () => ({}), isConfigured: () => false },
};

const authRoutes = require("../src/auth-routes");
const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
const server = http.createServer(app);
let baseUrl;

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function roleSignupRequest(role, email) {
  return fetch(`${baseUrl}/api/auth/${role}/signup-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Test", email, password: "secret1" }),
  });
}

async function roleSignup(role, email) {
  const req = await roleSignupRequest(role, email);
  assert.equal(req.status, 200);
  const otpRow = fakeDb._otps.find((o) => o.email === email.toLowerCase());
  const bcrypt = require("bcrypt");
  const code = "654321";
  otpRow.codeHash = await bcrypt.hash(code, 10);
  const verify = await fetch(`${baseUrl}/api/auth/${role}/verify-signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, otp: code }),
  });
  return verify.json();
}

test("operator self-signup is closed (admin-provisioned only)", async () => {
  const res = await roleSignupRequest("operator", "op@irago.com");
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "ADMIN_PROVISIONED_ONLY");
});

test("admin self-signup is closed (admin-provisioned only)", async () => {
  const res = await roleSignupRequest("admin", "adm@irago.com");
  assert.equal(res.status, 403);
});

test("passenger signup still creates a customer", async () => {
  const data = await roleSignup("passenger", "pax@irago.com");
  assert.equal(data.user.role, "customer");
});
