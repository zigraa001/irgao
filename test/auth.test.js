// Unit tests for the auth utilities (token signing, password hashing, and the
// requireAuth / requireRole middleware). These are DB-free so they run anywhere
// with `npm test` (node's built-in test runner).
const { test } = require("node:test");
const assert = require("node:assert/strict");

// Ensure a deterministic secret for the test run.
process.env.AUTH_SECRET = "test-secret-for-auth-tests";

// auth.js re-checks the user row in the DB on every requireAuth (ban / delete
// enforcement). Stub ./db so the lookup resolves instantly without a real
// MySQL connection; returning null means "no ban info → degrade allow", which
// exercises the token-only path these unit tests care about.
require.cache[require.resolve("../src/db")] = {
  id: require.resolve("../src/db"),
  filename: require.resolve("../src/db"),
  loaded: true,
  exports: {
    query: async () => [],
    queryOne: async () => null,
  },
};

const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  requireAuth,
  requireRole,
  extractToken,
  COOKIE_NAME,
  TOKEN_TTL_SECONDS,
} = require("../src/auth");

const sampleUser = { id: 42, name: "Ada Lovelace", role: "customer" };

// --- password hashing ---

test("hashPassword produces a bcrypt hash, never the plaintext", async () => {
  const hash = await hashPassword("hunter2");
  assert.notEqual(hash, "hunter2");
  assert.match(hash, /^\$2[aby]\$/); // bcrypt prefix
});

test("verifyPassword accepts the right password and rejects wrong ones", async () => {
  const hash = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("correct horse", null), false);
});

// --- token sign / verify ---

test("signToken + verifyToken round-trips the user claims", () => {
  const token = signToken(sampleUser);
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, "42");
  assert.equal(payload.name, "Ada Lovelace");
  assert.equal(payload.role, "customer");
});

test("signToken produces a standard JWT with HS256 header", () => {
  const token = signToken(sampleUser);
  const [headerB64] = token.split(".");
  const header = JSON.parse(
    Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    )
  );
  assert.equal(header.alg, "HS256");
  assert.equal(header.typ, "JWT");
});

test("verifyToken rejects a tampered signature", () => {
  const token = signToken(sampleUser);
  const [body] = token.split(".");
  const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  assert.equal(verifyToken(forged), null);
});

test("verifyToken rejects a tampered payload", () => {
  const token = signToken(sampleUser);
  const parts = token.split(".");
  const evilBody = Buffer.from(
    JSON.stringify({ sub: "1", role: "admin", exp: 9999999999 })
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(verifyToken(`${parts[0]}.${evilBody}.${parts[2]}`), null);
});

test("verifyToken rejects an expired token", () => {
  const past = 1000; // far in the past
  const token = signToken(sampleUser, past);
  // verify "now" well after expiry
  assert.equal(verifyToken(token, past + TOKEN_TTL_SECONDS + 1), null);
});

test("verifyToken rejects garbage input", () => {
  assert.equal(verifyToken(""), null);
  assert.equal(verifyToken("not-a-token"), null);
  assert.equal(verifyToken(null), null);
  assert.equal(verifyToken(undefined), null);
});

// --- middleware helpers ---

// Minimal Express req/res doubles.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("requireAuth rejects a missing/invalid token with 401", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAuth({ headers: {} }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth accepts a valid token and sets req.user", async () => {
  const token = signToken(sampleUser);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;
  await requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(req.user, { id: 42, name: "Ada Lovelace", role: "customer" });
});

test("extractToken reads token from HttpOnly cookie header", () => {
  const token = signToken(sampleUser);
  const req = { headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}` } };
  assert.equal(extractToken(req), token);
});

test("requireAuth accepts token from cookie", async () => {
  const token = signToken(sampleUser);
  const req = { headers: { cookie: `${COOKIE_NAME}=${token}` } };
  const res = mockRes();
  let nextCalled = false;
  await requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 42, name: "Ada Lovelace", role: "customer" });
});

test("requireRole rejects the wrong role with 403", () => {
  const req = { user: { id: 1, role: "customer" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("admin")(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireRole allows the matching role", () => {
  const req = { user: { id: 1, role: "admin" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("admin")(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("requireRole without an authenticated user responds 401", () => {
  const res = mockRes();
  let nextCalled = false;
  requireRole("admin")({}, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
