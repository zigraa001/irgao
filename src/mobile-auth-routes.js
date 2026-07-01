// IraGo mobile OTP authentication routes.
//
// End-to-end mobile OTP login pipeline:
//   POST /api/auth/mobile/send-otp    — send OTP to phone (via WhatsApp → MSG91 → email)
//   POST /api/auth/mobile/verify-otp  — verify OTP → login existing user or register new
//   POST /api/auth/mobile/resend-otp  — resend OTP for an active mobile login flow
//
// For now, OTP is delivered via email (the phone number's linked email address).
// TODO [Channel switch]: When WhatsApp/MSG91 are live, OTP goes to the phone directly.
//
// Flow:
//   1. User enters phone number on the mobile-login card.
//   2. Server looks up the phone in the users table.
//      • Existing user → send OTP to their registered email (later: phone).
//      • New phone     → user must also provide name; send OTP to entered email (later: phone).
//   3. User enters 6-digit code.
//   4. Server verifies code → returns JWT session (creates account if new).

const express = require("express");
const { query, queryOne } = require("./db");
const {
  createAndSendMobileOtp,
  verifyOtp,
} = require("./otp");
const { normalizePhone, maskPhone } = require("./otp-channel");
const {
  signToken,
  setAuthCookie,
  hashPassword,
  USER_NOT_DELETED,
} = require("./auth");

const router = express.Router();

const PHONE_RE = /^[0-9]{10,15}$/;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
    mustResetPassword: Boolean(user.mustResetPassword),
  };
}

function authResponse(res, status, user) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return res.status(status).json({ user: publicUser(user), token });
}

// ─── POST /send-otp ────────────────────────────────────────────────────
// Body: { phone, name?, email? }
//   • phone  (required) — 10-digit Indian mobile or E.164 digits
//   • email  (required for new users) — OTP is sent here until WhatsApp/MSG91 are live
//   • name   (required for new users) — display name for new account creation
router.post("/send-otp", async (req, res) => {
  const { phone: rawPhone, name, email } = req.body || {};

  if (!rawPhone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return res
      .status(400)
      .json({ error: "Enter a valid 10-digit Indian mobile number." });
  }

  // Look up existing user by phone.
  const existingUser = await queryOne(
    `SELECT id, name, email, phone, role, bannedAt FROM users WHERE phone = ? AND ${USER_NOT_DELETED}`,
    [phone]
  );

  if (existingUser && existingUser.bannedAt) {
    return res.status(403).json({
      error: "This account has been suspended. Contact support.",
      code: "ACCOUNT_BANNED",
    });
  }

  // For existing users, send OTP to their registered email.
  // For new users, require email (and name) so we can deliver + create account.
  let recipientEmail;
  let isNewUser = false;

  if (existingUser) {
    recipientEmail = existingUser.email;
  } else {
    if (!email) {
      return res.status(400).json({
        error: "Email is required for new accounts (OTP will be sent to your email for now).",
        code: "EMAIL_REQUIRED_NEW_USER",
        isNewUser: true,
      });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: "Name is required for new accounts.",
        code: "NAME_REQUIRED_NEW_USER",
        isNewUser: true,
      });
    }
    // Check if email is already taken by another account.
    const emailUser = await queryOne(
      "SELECT id FROM users WHERE email = ? AND " + USER_NOT_DELETED,
      [String(email).toLowerCase()]
    );
    if (emailUser) {
      return res.status(409).json({
        error: "An account with that email already exists. Try logging in with email instead.",
      });
    }
    recipientEmail = String(email).toLowerCase();
    isNewUser = true;
  }

  // TODO [Channel switch]: When WhatsApp/MSG91 are live, `recipientEmail`
  // becomes optional — the OTP goes directly to the phone number.
  // The email fallback will only be used if WhatsApp + MSG91 both fail.
  const payload = isNewUser
    ? { name: String(name).trim(), email: recipientEmail, role: "customer", isNewUser: true }
    : { userId: existingUser.id, isNewUser: false };

  const result = await createAndSendMobileOtp(
    phone,
    "mobile_login",
    recipientEmail,
    payload
  );

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return res.json({
    // TODO [Channel switch]: Change this message once OTP goes to phone.
    // e.g. "OTP sent to your WhatsApp" or "OTP sent via SMS".
    message: isNewUser
      ? "Verification code sent to your email. Enter it below to create your account."
      : "Verification code sent to your registered email.",
    phone: maskPhone(phone),
    isNewUser,
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  });
});

// ─── POST /verify-otp ──────────────────────────────────────────────────
// Body: { phone, otp }
// Verifies the 6-digit code. On success:
//   • Existing user → logs in (returns JWT).
//   • New user      → creates account with the payload data, then logs in.
router.post("/verify-otp", async (req, res) => {
  const { phone: rawPhone, otp } = req.body || {};

  if (!rawPhone || !otp) {
    return res
      .status(400)
      .json({ error: "Phone number and OTP code are required." });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return res
      .status(400)
      .json({ error: "Enter a valid 10-digit Indian mobile number." });
  }

  const verified = await verifyOtp(phone, "mobile_login", String(otp));
  if (!verified.ok) {
    return res.status(verified.status).json({
      error: verified.error,
      code: verified.code,
    });
  }

  const payload = verified.payload || {};

  // ── Existing user login ──
  if (!payload.isNewUser && payload.userId) {
    const user = await queryOne(
      `SELECT * FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
      [payload.userId]
    );
    if (!user) {
      return res.status(400).json({
        error: "Account not found. It may have been deleted.",
        code: "USER_NOT_FOUND",
      });
    }
    if (user.bannedAt) {
      return res.status(403).json({
        error: "This account has been suspended. Contact support.",
        code: "ACCOUNT_BANNED",
      });
    }
    return authResponse(res, 200, user);
  }

  // ── New user registration ──
  if (payload.isNewUser) {
    const { name, email, role } = payload;
    if (!name || !email) {
      return res.status(400).json({
        error: "Invalid signup session. Start over.",
        code: "INVALID_PAYLOAD",
      });
    }

    // Double-check email + phone not taken (race condition guard).
    const emailTaken = await queryOne(
      "SELECT id FROM users WHERE email = ? AND " + USER_NOT_DELETED,
      [email]
    );
    if (emailTaken) {
      return res.status(409).json({
        error: "An account with that email already exists.",
      });
    }
    const phoneTaken = await queryOne(
      "SELECT id FROM users WHERE phone = ? AND " + USER_NOT_DELETED,
      [phone]
    );
    if (phoneTaken) {
      return res.status(409).json({
        error: "An account with that phone number already exists.",
      });
    }

    // Create account — passwordless (phone-OTP authenticated).
    // A random unusable password hash is set so the passwordHash NOT NULL
    // constraint is satisfied. The user can set a real password later via
    // "change password" if they want email+password login too.
    const randomHash = await hashPassword(
      require("crypto").randomBytes(32).toString("hex")
    );

    const insert = await query(
      `INSERT INTO users (name, email, phone, passwordHash, role, emailVerified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name, email, phone, randomHash, role || "customer"]
    );

    const user = await queryOne("SELECT * FROM users WHERE id = ?", [
      insert.insertId,
    ]);

    return authResponse(res, 201, user);
  }

  // Payload didn't match expected shapes.
  return res.status(400).json({
    error: "Invalid verification session. Start over.",
    code: "INVALID_PAYLOAD",
  });
});

// ─── POST /resend-otp ──────────────────────────────────────────────────
// Body: { phone }
// Resends the mobile login OTP using the same channel pipeline.
router.post("/resend-otp", async (req, res) => {
  const { phone: rawPhone } = req.body || {};

  if (!rawPhone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return res
      .status(400)
      .json({ error: "Enter a valid 10-digit Indian mobile number." });
  }

  // Find the pending OTP to get the payload (has the email for fallback).
  const { findActiveOtp, parseStoredPayload } = require("./otp");
  const activeOtp = await findActiveOtp(phone, "mobile_login");
  if (!activeOtp) {
    return res.status(400).json({
      error: "No pending verification for this phone. Start over.",
    });
  }

  const payload = parseStoredPayload(activeOtp.payload);
  let recipientEmail;

  if (payload?.isNewUser) {
    recipientEmail = payload.email;
  } else if (payload?.userId) {
    const user = await queryOne("SELECT email FROM users WHERE id = ?", [
      payload.userId,
    ]);
    recipientEmail = user?.email;
  }

  if (!recipientEmail) {
    return res.status(503).json({
      error: "Could not determine delivery address. Start over.",
    });
  }

  const result = await createAndSendMobileOtp(
    phone,
    "mobile_login",
    recipientEmail,
    payload
  );

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return res.json({
    message: "Verification code resent.",
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  });
});

module.exports = router;
