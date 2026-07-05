// Shared OTP signup handlers per role (passenger / operator).
//
// Endpoints:
//   POST .../signup-request      — validate + send email OTP
//   POST .../verify-signup       — verify email OTP + create account
const { query, queryOne } = require("./db");
const { hashPassword } = require("./auth");
const { createAndSendOtp, verifyOtp } = require("./otp");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignupBody(body) {
  const { name, email, password, gender, age } = body || {};
  if (!name || !email || !password) {
    return { error: "name, email, and password are required" };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "A valid email is required" };
  }
  if (String(password).length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  return {
    name: String(name),
    email: String(email).toLowerCase(),
    password: String(password),
    gender: gender ? String(gender) : null,
    age: age ? parseInt(age, 10) || null : null,
  };
}

async function emailTaken(email) {
  return queryOne("SELECT id FROM users WHERE email = ?", [email]);
}

function createSignupHandlers(config, authResponse) {
  const { purpose, role, label, beforeRequest } = config;

  // POST .../signup-request — validate fields, send email OTP.
  async function signupRequest(req, res) {
    try {
      const validated = validateSignupBody(req.body);
      if (validated.error) {
        return res.status(400).json({ error: validated.error });
      }

      if (beforeRequest) {
        const block = await beforeRequest(req, validated);
        if (block) return res.status(block.status).json(block.body);
      }

      const existing = await emailTaken(validated.email);
      if (existing) {
        return res.status(409).json({ error: "An account with that email already exists" });
      }

      const passwordHash = await hashPassword(validated.password);
      const result = await createAndSendOtp(validated.email, purpose, {
        name: validated.name,
        passwordHash,
        role,
        gender: validated.gender,
        age: validated.age,
      });

      if (!result.ok) {
        return res.status(result.status).json({
          error: result.error,
          code: result.code,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      return res.json({
        message: `Verification code sent to ${validated.email}.`,
        email: validated.email,
        role,
        expiresInSeconds: result.expiresInSeconds,
        resendCooldownSeconds: result.resendCooldownSeconds,
      });
    } catch (err) {
      console.error(`[signup] ${purpose} signup-request failed: ${err.message}`);
      return res.status(500).json({
        error: "Could not start registration. Please try again.",
        code: "SIGNUP_REQUEST_FAILED",
      });
    }
  }

  // POST .../verify-signup — verify email OTP + create account.
  async function verifySignup(req, res) {
    const { email, emailOtp } = req.body || {};

    const emailCode = emailOtp || req.body?.otp;

    if (!email || !emailCode) {
      return res.status(400).json({ error: "email and verification code are required" });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await emailTaken(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const emailVerified = await verifyOtp(normalizedEmail, purpose, emailCode);
    if (!emailVerified.ok) {
      return res.status(emailVerified.status).json({
        error: emailVerified.error,
        code: emailVerified.code,
        field: "email",
      });
    }

    const { name, passwordHash, role: payloadRole, gender, age } =
      emailVerified.payload || {};
    if (!name || !passwordHash || payloadRole !== role) {
      return res.status(400).json({ error: "Invalid signup session. Start over." });
    }

    const insert = await query(
      `INSERT INTO users (name, email, phone, gender, age, passwordHash, role, emailVerified)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 1)`,
      [name, normalizedEmail, gender || null, age || null, passwordHash, role]
    );

    const user = await queryOne("SELECT * FROM users WHERE id = ?", [
      insert.insertId,
    ]);

    return authResponse(res, 201, user);
  }

  return { signupRequest, verifySignup };
}

function mountRoleSignup(router, config, authResponse) {
  const handlers = createSignupHandlers(config, authResponse);
  router.post("/signup-request", handlers.signupRequest);
  router.post("/verify-signup", handlers.verifySignup);
  return handlers;
}

module.exports = {
  EMAIL_RE,
  validateSignupBody,
  createSignupHandlers,
  mountRoleSignup,
};
