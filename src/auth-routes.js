// IraGo auth routes: signup + login. Mounted at /api/auth.
const express = require("express");
const { query, queryOne } = require("./db");
const { hashPassword, verifyPassword, signToken } = require("./auth");

const router = express.Router();

// Minimal email sanity check — real validation is the email provider's job.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shape the user object returned to clients: never include the password hash.
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/signup — register a new customer account.
// Body: { name, email, password }. role always defaults to "customer";
// elevated roles are created by seeding/admin tooling, not self-signup.
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "name, email, and password are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (String(password).length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  const normalizedEmail = String(email).toLowerCase();

  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [
    normalizedEmail,
  ]);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await hashPassword(String(password));
  const result = await query(
    "INSERT INTO users (name, email, passwordHash, role) VALUES (?, ?, ?, ?)",
    [String(name), normalizedEmail, passwordHash, "customer"]
  );

  // Re-read the freshly inserted row so the response and token reflect exactly
  // what the database stored (id, defaults, timestamps).
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [
    result.insertId,
  ]);

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login — verify credentials and return a session token.
// Invalid email OR wrong password both return the same generic 401 so we
// never leak which field was wrong.
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await queryOne("SELECT * FROM users WHERE email = ?", [
    String(email).toLowerCase(),
  ]);

  const ok = user && (await verifyPassword(String(password), user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

module.exports = router;
