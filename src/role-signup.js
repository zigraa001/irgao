// Shared OTP signup handlers per role (passenger / operator).
//
// Two-page registration flow:
//   Page 1: name, gender, age, password (client-side only)
//   Page 2: email OTP + phone OTP verified inline, then create account
//
// Endpoints:
//   POST .../signup-request      — validate + send email OTP
//   POST .../send-phone-otp      — send phone OTP (unauthenticated, signup only)
//   POST .../verify-signup       — verify both OTPs + create account
const { query, queryOne } = require("./db");
const { hashPassword } = require("./auth");
const { createAndSendOtp, verifyOtp } = require("./otp");
const { createAndSendMobileOtp } = require("./otp");
const { normalizePhone } = require("./otp-channel");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10}$/;

function validateSignupBody(body) {
  const { name, email, password, phone, gender, age } = body || {};
  if (!name || !email || !password) {
    return { error: "name, email, and password are required" };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "A valid email is required" };
  }
  if (String(password).length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  const result = {
    name: String(name),
    email: String(email).toLowerCase(),
    password: String(password),
    gender: gender ? String(gender) : null,
    age: age ? parseInt(age, 10) || null : null,
  };
  if (phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return { error: "Enter a valid 10-digit mobile number" };
    }
    result.phone = normalized;
  }
  return result;
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

      if (validated.phone) {
        const phoneTaken = await queryOne(
          "SELECT id FROM users WHERE phone = ?",
          [validated.phone]
        );
        if (phoneTaken) {
          return res.status(409).json({ error: "An account with that phone number already exists" });
        }
      }

      const passwordHash = await hashPassword(validated.password);
      const result = await createAndSendOtp(validated.email, purpose, {
        name: validated.name,
        passwordHash,
        role,
        phone: validated.phone || null,
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

  // POST .../send-phone-otp — send phone OTP during signup (unauthenticated).
  async function sendPhoneOtp(req, res) {
    const { phone: rawPhone, email } = req.body || {};
    if (!rawPhone) {
      return res.status(400).json({ error: "Phone number is required." });
    }
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number." });
    }

    const phoneTaken = await queryOne(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );
    if (phoneTaken) {
      return res.status(409).json({ error: "This phone number is already linked to another account." });
    }

    const result = await createAndSendMobileOtp(
      phone,
      "phone_verify",
      String(email).toLowerCase(),
      { phone, signupFlow: true }
    );

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return res.json({
      message: "Phone verification code sent to your email.",
      expiresInSeconds: result.expiresInSeconds,
      resendCooldownSeconds: result.resendCooldownSeconds,
    });
  }

  // POST .../verify-signup — verify both email + phone OTPs, create account.
  async function verifySignup(req, res) {
    const { email, emailOtp, phone: rawPhone, phoneOtp } = req.body || {};

    // Legacy support: if only email + otp sent (no phone), use old flow.
    const otp = req.body?.otp;
    const emailCode = emailOtp || otp;

    if (!email || !emailCode) {
      return res.status(400).json({ error: "email and verification code are required" });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await emailTaken(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    // Verify email OTP.
    const emailVerified = await verifyOtp(normalizedEmail, purpose, emailCode);
    if (!emailVerified.ok) {
      return res.status(emailVerified.status).json({
        error: emailVerified.error,
        code: emailVerified.code,
        field: "email",
      });
    }

    const { name, passwordHash, role: payloadRole, phone: payloadPhone, gender, age } =
      emailVerified.payload || {};
    if (!name || !passwordHash || payloadRole !== role) {
      return res.status(400).json({ error: "Invalid signup session. Start over." });
    }

    // Verify phone OTP if phone was provided.
    let verifiedPhone = null;
    const phone = rawPhone ? normalizePhone(rawPhone) : payloadPhone;
    if (phone && phoneOtp) {
      const phoneVerified = await verifyOtp(phone, "phone_verify", phoneOtp);
      if (!phoneVerified.ok) {
        return res.status(phoneVerified.status).json({
          error: phoneVerified.error,
          code: phoneVerified.code,
          field: "phone",
        });
      }
      verifiedPhone = phone;
    }

    // Both verified — create account.
    const insert = await query(
      `INSERT INTO users (name, email, phone, gender, age, passwordHash, role, emailVerified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, normalizedEmail, verifiedPhone, gender || null, age || null, passwordHash, role]
    );

    const user = await queryOne("SELECT * FROM users WHERE id = ?", [
      insert.insertId,
    ]);

    return authResponse(res, 201, user);
  }

  return { signupRequest, sendPhoneOtp, verifySignup };
}

function mountRoleSignup(router, config, authResponse) {
  const handlers = createSignupHandlers(config, authResponse);
  router.post("/signup-request", handlers.signupRequest);
  router.post("/send-phone-otp", handlers.sendPhoneOtp);
  router.post("/verify-signup", handlers.verifySignup);
  return handlers;
}

module.exports = {
  EMAIL_RE,
  validateSignupBody,
  createSignupHandlers,
  mountRoleSignup,
};
