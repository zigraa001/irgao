// Verifies the admin log viewer never exposes internal server details:
// DB connection config, raw SQL, absolute file paths, stack frames, and IPs are
// stripped before a line enters the admin-visible ring buffer, while ordinary
// operational logs pass through untouched.
const { test } = require("node:test");
const assert = require("node:assert");
const { redactSensitive, install, getLogs, _reset } = require("../src/log-bus");

test("redacts DB connection config values", () => {
  const out = redactSensitive(
    "[db] pool config: { host: '127.0.0.1', port: 3306, user: 'irago', database: 'irago', password: 'secret' }"
  );
  assert.ok(!out.includes("127.0.0.1"), "host/IP leaked");
  assert.ok(!out.includes("irago"), "user/database leaked");
  assert.ok(!out.includes("secret"), "password leaked");
  assert.ok(!out.includes("3306"), "port leaked");
  assert.ok(out.includes("‹redacted›"));
});

test("redacts raw SQL statements", () => {
  assert.ok(!/SELECT|FROM|bookings/.test(redactSensitive("[db] SQL > SELECT * FROM bookings WHERE id=?")));
  assert.ok(!/CREATE|INDEX/.test(redactSensitive("[db] SQL FAILED: CREATE INDEX idx ON t (a,b)")));
  assert.ok(!/INSERT|users/.test(redactSensitive("INSERT INTO users (email) VALUES (?)")));
});

test("redacts absolute file paths and stack frames and IPs", () => {
  const out = redactSensitive(
    "Error: ECONNREFUSED 10.1.2.3:3306 at query (/home/user/app/src/db.js:103:31)"
  );
  assert.ok(!out.includes("/home/user/app/src/db.js"), "path leaked");
  assert.ok(!out.includes("10.1.2.3"), "ip leaked");
  assert.ok(!out.includes(":103:31"), "stack line leaked");
});

test("leaves ordinary operational logs untouched", () => {
  const lines = [
    "[startup] Server running on port 3002 (database: connected)",
    "[demo booking#123] assigned (operator info + ETA 9 min)",
    "[admin] admin@irago.com changed setting demoMode = true",
    "[bookings] receipt email failed for #12: SMTP timeout",
  ];
  for (const l of lines) assert.strictEqual(redactSensitive(l), l);
});

test("does not misfire on the word MySQL", () => {
  const out = redactSensitive("[db] Connecting to MySQL server");
  assert.ok(out.includes("MySQL server"), "MySQL wrongly redacted");
});

test("capture() stores redacted text in the buffer", () => {
  _reset();
  install();
  console.log("[db] SQL > SELECT secretcol FROM users");
  const { logs } = getLogs({ limit: 5 });
  assert.ok(logs.length >= 1);
  assert.ok(!logs.some((e) => e.msg.includes("secretcol")), "sensitive SQL reached the buffer");
});
