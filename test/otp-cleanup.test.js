// OTP payload encryption and expired-row cleanup.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.AUTH_SECRET = "test-otp-cleanup-secret";

const deleted = [];

const fakeDb = {
  async query(sql) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("DELETE FROM otp_requests")) {
      deleted.push(s);
      return { affectedRows: 2 };
    }
    return [];
  },
  async queryOne() {
    return null;
  },
};

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
  exports: { sendOtpEmail: async () => ({}), isConfigured: () => true },
};

const {
  ENCRYPTED_PREFIX,
  encryptPayload,
  parseStoredPayload,
  cleanupExpiredOtps,
  OTP_MAX_VERIFY_ATTEMPTS,
} = require("../src/otp");

test("OTP_MAX_VERIFY_ATTEMPTS is 5", () => {
  assert.equal(OTP_MAX_VERIFY_ATTEMPTS, 5);
});

test("signup payload is encrypted at rest, not plaintext JSON", () => {
  const stored = encryptPayload({
    name: "Ada",
    passwordHash: "$2b$10$fakehash",
    role: "customer",
  });
  assert.ok(stored.startsWith(ENCRYPTED_PREFIX));
  assert.ok(!stored.includes("fakehash"));

  const parsed = parseStoredPayload(stored);
  assert.equal(parsed.name, "Ada");
  assert.equal(parsed.passwordHash, "$2b$10$fakehash");
  assert.equal(parsed.role, "customer");
});

test("parseStoredPayload reads legacy plaintext JSON", () => {
  const legacy = JSON.stringify({ name: "Legacy", role: "customer" });
  assert.deepEqual(parseStoredPayload(legacy), {
    name: "Legacy",
    role: "customer",
  });
});

test("cleanupExpiredOtps deletes expired and stale consumed rows", async () => {
  const n = await cleanupExpiredOtps();
  assert.equal(n, 2);
  assert.equal(deleted.length, 1);
  assert.match(deleted[0], /expiresAt < NOW\(\)/);
});
