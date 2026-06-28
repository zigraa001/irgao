// OTP codes are stored as bcrypt hashes only — never returned in API responses.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.AUTH_SECRET = "test-otp-hash-storage";

const fakeDb = (() => {
  const stored = { codeHash: null, email: null };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("INSERT INTO otp_requests")) {
      stored.email = params[0];
      stored.codeHash = params[2];
      return { insertId: 1 };
    }
    if (s.includes("COUNT(*) AS cnt FROM otp_requests")) return [{ cnt: 0 }];
    if (s.includes("createdAt FROM otp_requests")) return [];
    if (s.startsWith("UPDATE otp_requests SET consumedAt = NOW() WHERE id")) {
      return { affectedRows: 1 };
    }
    if (s.startsWith("UPDATE otp_requests SET consumedAt = NOW() WHERE email")) {
      return { affectedRows: 0 };
    }
    return [];
  }

  async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }

  return { query, queryOne, _stored: stored };
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
  exports: { sendOtpEmail: async () => ({}), isConfigured: () => true },
};

const { createAndSendOtp } = require("../src/otp");

test("createAndSendOtp stores bcrypt hash, never plaintext or screenOtp in response", async () => {
  const result = await createAndSendOtp("user@irago.com", "signup_passenger", {
    name: "Test",
    role: "customer",
  });
  assert.equal(result.ok, true);
  assert.equal(result.screenOtp, undefined);
  assert.match(fakeDb._stored.codeHash, /^\$2[aby]\$/);
  assert.notEqual(fakeDb._stored.codeHash, "123456");
});
