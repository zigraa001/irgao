// Shared OTP signup handlers per role (passenger / operator).
const { query, queryOne } = require("./db");
const { hashPassword } = require("./auth");
const { createAndSendOtp, verifyOtp } = require("./otp");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignupBody(body) {
  const { name, email, password } = body || {};
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
  };
}

async function emailTaken(email) {
  return queryOne("SELECT id FROM users WHERE email = ?", [email]);
}

function createSignupHandlers(config, authResponse) {
  const { purpose, role, label, beforeRequest } = config;

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
        return res
          .status(409)
          .json({ error: "An account with that email already exists" });
      }

      const passwordHash = await hashPassword(validated.password);
      const result = await createAndSendOtp(validated.email, purpose, {
        name: validated.name,
        passwordHash,
        role,
      });

      if (!result.ok) {
        return res.status(result.status).json({
          error: result.error,
          code: result.code,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      return res.json({
        message: `${label} verification code sent to your email.`,
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

  async function verifySignup(req, res) {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ error: "email and otp are required" });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await emailTaken(normalizedEmail);
    if (existing) {
      return res
        .status(409)
        .json({ error: "An account with that email already exists" });
    }

    const verified = await verifyOtp(normalizedEmail, purpose, otp);
    if (!verified.ok) {
      return res.status(verified.status).json({
        error: verified.error,
        code: verified.code,
      });
    }

    const { name, passwordHash, role: payloadRole } = verified.payload || {};
    if (!name || !passwordHash || payloadRole !== role) {
      return res
        .status(400)
        .json({ error: "Invalid signup session. Start over." });
    }

    const insert = await query(
      `INSERT INTO users (name, email, passwordHash, role, emailVerified)
       VALUES (?, ?, ?, ?, 1)`,
      [name, normalizedEmail, passwordHash, role]
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
