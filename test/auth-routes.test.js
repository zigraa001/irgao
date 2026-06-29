// Integration-style tests for auth routes (signup OTP flow, login cookie response).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.AUTH_SECRET = "test-secret-for-auth-routes-tests";

const fakeDb = (() => {
  const users = [];
  const otps = [];
  let nextUserId = 1;
  let nextOtpId = 1;

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("INSERT INTO users")) {
      const cols = s.includes("emailVerified")
        ? params
        : params;
      const [name, email, passwordHash, role, emailVerified] =
        params.length >= 5
          ? params
          : [params[0], params[1], params[2], params[3], 1];
      const row = {
        id: nextUserId++,
        name,
        email,
        passwordHash,
        role,
        emailVerified: emailVerified ?? 1,
      };
      users.push(row);
      return { insertId: row.id, affectedRows: 1 };
    }
    if (s.startsWith("UPDATE otp_requests SET consumedAt")) {
      otps.forEach((o) => {
        if (o.email === params[0] && o.purpose === params[1] && !o.consumedAt) {
          o.consumedAt = new Date();
        }
      });
      return { affectedRows: 1 };
    }
    if (s.startsWith("INSERT INTO otp_requests")) {
      const [email, purpose, codeHash, payload, expiresSec] = params;
      otps.push({
        id: nextOtpId++,
        email,
        purpose,
        codeHash,
        payload,
        attempts: 0,
        expiresAt: new Date(Date.now() + expiresSec * 1000),
        consumedAt: null,
        createdAt: new Date(),
      });
      return { insertId: nextOtpId - 1, affectedRows: 1 };
    }
    if (s.includes("COUNT(*) AS cnt FROM otp_requests")) {
      const email = params[0];
      const count = otps.filter(
        (o) => o.email === email && Date.now() - o.createdAt.getTime() < 86400000
      ).length;
      return [{ cnt: count }];
    }
    if (s.includes("createdAt FROM otp_requests") && s.includes("ORDER BY")) {
      const [email, purpose] = params;
      const matches = otps
        .filter((o) => o.email === email && o.purpose === purpose)
        .sort((a, b) => b.createdAt - a.createdAt);
      return matches.length ? [{ createdAt: matches[0].createdAt }] : [];
    }
    if (s.includes("payload FROM otp_requests")) {
      const [email] = params;
      const row = otps
        .filter((o) => o.email === email && o.purpose === "signup" && !o.consumedAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return row ? [{ payload: row.payload }] : [];
    }
    if (s.includes("FROM otp_requests") && s.includes("consumedAt IS NULL")) {
      const [email, purpose] = params;
      const row = otps
        .filter(
          (o) =>
            o.email === email &&
            o.purpose === purpose &&
            !o.consumedAt &&
            o.expiresAt > new Date()
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return row ? [{ ...row }] : [];
    }
    if (s.startsWith("UPDATE otp_requests SET attempts")) {
      const id = params[0];
      const row = otps.find((o) => o.id === id);
      if (row) row.attempts += 1;
      return { affectedRows: 1 };
    }
    if (s.startsWith("UPDATE otp_requests SET consumedAt = NOW() WHERE id")) {
      const id = params[0];
      const row = otps.find((o) => o.id === id);
      if (row) row.consumedAt = new Date();
      return { affectedRows: 1 };
    }
    if (s.startsWith("SELECT id FROM users WHERE email")) {
      return users.filter((u) => u.email === params[0] && !u.deletedAt).map((u) => ({ id: u.id }));
    }
    if (s.includes("FROM users WHERE email")) {
      return users
        .filter((u) => u.email === params[0] && (!s.includes("deletedAt IS NULL") || !u.deletedAt))
        .map((u) => ({ ...u }));
    }
    if (s.includes("FROM users WHERE id")) {
      return users
        .filter(
          (u) =>
            u.id === params[0] && (!s.includes("deletedAt IS NULL") || !u.deletedAt)
        )
        .map((u) => ({ ...u }));
    }
    if (s.includes("UPDATE users SET deletedAt")) {
      const [email, name, passwordHash, id] = params;
      const row = users.find((u) => u.id === id);
      if (row) {
        row.deletedAt = new Date();
        row.email = email;
        row.name = name;
        row.passwordHash = passwordHash;
      }
      return { affectedRows: 1 };
    }
    if (s.includes("UPDATE users SET passwordHash") && s.includes("mustResetPassword = 0")) {
      const [passwordHash, id] = params;
      const row = users.find((u) => u.id === id);
      if (row) { row.passwordHash = passwordHash; row.mustResetPassword = 0; }
      return { affectedRows: 1 };
    }
    if (s.includes("UPDATE users SET passwordHash")) {
      const [passwordHash, id] = params;
      const row = users.find((u) => u.id === id);
      if (row) row.passwordHash = passwordHash;
      return { affectedRows: 1 };
    }
    if (s.includes("FROM bookings")) {
      return [];
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

// Mock email so tests don't need SMTP.
require.cache[require.resolve("../src/email")] = {
  id: require.resolve("../src/email"),
  filename: require.resolve("../src/email"),
  loaded: true,
  exports: {
    sendOtpEmail: async () => ({ dev: true }),
    isConfigured: () => false,
  },
};

const authRoutes = require("../src/auth-routes");

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

test("deprecated POST /signup returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Cara",
      email: "cara@irago.com",
      password: "secret1",
    }),
  });
  assert.equal(res.status, 400);
});

test("signup-request + verify-signup creates customer with cookie", async () => {
  const req = await fetch(`${baseUrl}/api/auth/signup-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Cara",
      email: "cara@irago.com",
      password: "secret1",
    }),
  });
  assert.equal(req.status, 200);

  const otpRow = fakeDb._otps.find((o) => o.email === "cara@irago.com");
  assert.ok(otpRow);

  const bcrypt = require("bcrypt");
  const code = "123456";
  otpRow.codeHash = await bcrypt.hash(code, 10);

  const verify = await fetch(`${baseUrl}/api/auth/verify-signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "cara@irago.com", otp: code }),
  });
  assert.equal(verify.status, 201);
  const body = await verify.json();
  assert.equal(body.user.role, "customer");
  assert.ok(typeof body.token === "string" && body.token.length > 10);
  const setCookie = verify.headers.get("set-cookie");
  assert.ok(setCookie && setCookie.includes("irago_session"));
});

test("signup rejects role injection via passenger verify-signup", async () => {
  fakeDb._otps.push({
    id: 99,
    email: "mallory@irago.com",
    purpose: "signup_passenger",
    codeHash: await require("bcrypt").hash("654321", 10),
    payload: JSON.stringify({
      name: "Mallory",
      passwordHash: await require("bcrypt").hash("secret1", 10),
      role: "admin",
    }),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60000),
    consumedAt: null,
    createdAt: new Date(Date.now() - 600000),
  });

  const verify = await fetch(`${baseUrl}/api/auth/verify-signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "mallory@irago.com", otp: "654321" }),
  });
  assert.equal(verify.status, 400);
});

const { hashPassword, signToken, COOKIE_NAME } = require("../src/auth");

test("delete-account soft-deletes customer after password confirmation", async () => {
  const passwordHash = await hashPassword("secret1");
  fakeDb._users.push({
    id: 50,
    name: "Delete Me",
    email: "delete@irago.com",
    passwordHash,
    role: "customer",
    emailVerified: 1,
    deletedAt: null,
  });
  const token = signToken({ id: 50, name: "Delete Me", role: "customer" });

  const res = await fetch(`${baseUrl}/api/auth/delete-account`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ password: "secret1" }),
  });
  assert.equal(res.status, 200);
  const row = fakeDb._users.find((u) => u.id === 50);
  assert.ok(row.deletedAt);
  assert.match(row.email, /^deleted\.50\./);
  assert.equal(row.name, "Deleted user");
});

test("delete-account rejects wrong password", async () => {
  const passwordHash = await hashPassword("secret1");
  fakeDb._users.push({
    id: 51,
    name: "Keep Me",
    email: "keep@irago.com",
    passwordHash,
    role: "customer",
    emailVerified: 1,
    deletedAt: null,
  });
  const token = signToken({ id: 51, name: "Keep Me", role: "customer" });

  const res = await fetch(`${baseUrl}/api/auth/delete-account`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(res.status, 401);
});

// ── Forced password reset (admin-provisioned accounts) ───────────────────────
test("login surfaces mustResetPassword for an admin-provisioned operator", async () => {
  const passwordHash = await hashPassword("temppass1");
  fakeDb._users.push({
    id: 70,
    name: "Provisioned Op",
    email: "prop@irago.com",
    passwordHash,
    role: "operator",
    emailVerified: 1,
    deletedAt: null,
    bannedAt: null,
    mustResetPassword: 1,
  });

  const res = await fetch(`${baseUrl}/api/auth/operator/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "prop@irago.com", password: "temppass1" }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.role, "operator");
  assert.equal(data.user.mustResetPassword, true);
});

test("change-password clears mustResetPassword for a provisioned operator", async () => {
  const passwordHash = await hashPassword("temppass1");
  fakeDb._users.push({
    id: 73,
    name: "Provisioned Op 2",
    email: "prop2@irago.com",
    passwordHash,
    role: "operator",
    emailVerified: 1,
    deletedAt: null,
    bannedAt: null,
    mustResetPassword: 1,
  });
  const login = await fetch(`${baseUrl}/api/auth/operator/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "prop2@irago.com", password: "temppass1" }),
  });
  const { token } = await login.json();

  const res = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE_NAME}=${token}` },
    body: JSON.stringify({ currentPassword: "temppass1", newPassword: "newpass2" }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.mustResetPassword, false);
  const row = fakeDb._users.find((u) => u.id === 73);
  assert.equal(row.mustResetPassword, 0);
});

test("change-password is blocked for an env-bootstrap admin (mustResetPassword = 0)", async () => {
  const passwordHash = await hashPassword("envpass1");
  fakeDb._users.push({
    id: 71,
    name: "Env Admin",
    email: "envadmin@irago.com",
    passwordHash,
    role: "admin",
    emailVerified: 1,
    deletedAt: null,
    bannedAt: null,
    mustResetPassword: 0,
  });
  const token = signToken({ id: 71, name: "Env Admin", role: "admin" });
  const res = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE_NAME}=${token}` },
    body: JSON.stringify({ currentPassword: "envpass1", newPassword: "newpass2" }),
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "ADMIN_ENV_ONLY");
});

test("change-password is allowed for a console-created admin (mustResetPassword = 1)", async () => {
  const passwordHash = await hashPassword("temppass1");
  fakeDb._users.push({
    id: 72,
    name: "Console Admin",
    email: "cadmin@irago.com",
    passwordHash,
    role: "admin",
    emailVerified: 1,
    deletedAt: null,
    bannedAt: null,
    mustResetPassword: 1,
  });
  const token = signToken({ id: 72, name: "Console Admin", role: "admin" });
  const res = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE_NAME}=${token}` },
    body: JSON.stringify({ currentPassword: "temppass1", newPassword: "newpass2" }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.mustResetPassword, false);
});
