// OTP email must never be logged to the console.
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("sendOtpEmail throws when SMTP is not configured (no console OTP)", async () => {
  const prevUser = process.env.SMTP_USER;
  const prevPass = process.env.SMTP_PASS;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  delete require.cache[require.resolve("../src/email")];
  const email = require("../src/email");

  const logs = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));

  try {
    await assert.rejects(
      () => email.sendOtpEmail("user@example.com", "123456", "signup_passenger"),
      (err) => err.code === "SMTP_NOT_CONFIGURED"
    );
    assert.ok(!logs.some((line) => line.includes("123456")));
  } finally {
    console.warn = origWarn;
    console.error = origError;
    if (prevUser !== undefined) process.env.SMTP_USER = prevUser;
    else delete process.env.SMTP_USER;
    if (prevPass !== undefined) process.env.SMTP_PASS = prevPass;
    else delete process.env.SMTP_PASS;
    delete require.cache[require.resolve("../src/email")];
  }
});
