// IraGo phone verification routes.
//
// These are NOT for passwordless login. They let a logged-in user add or
// change the phone number on their profile, verified via OTP.
//
//   POST /api/auth/mobile/send-otp    — send OTP to new phone number
//   POST /api/auth/mobile/verify-otp  — verify OTP → save phone to profile
//   POST /api/auth/mobile/resend-otp  — resend OTP for an active verification
//
// OTP delivery pipeline: WhatsApp → MSG91 → Email (fallback).
// For now all channels redirect to email. Set OTP_CHANNEL env var to switch.

const express = require("express");
const { query, queryOne } = require("./db");
const {
  createAndSendMobileOtp,
  verifyOtp,
} = require("./otp");
const { normalizePhone, maskPhone } = require("./otp-channel");
const {
  requireAuth,
  USER_NOT_DELETED,
} = require("./auth");

const router = express.Router();

// ─── POST /send-otp ────────────────────────────────────────────────────
// Body: { phone }
// Requires auth. Sends OTP to the given phone number so the user can
// verify ownership before it's saved to their profile.
router.post("/send-otp", requireAuth, async (req, res) => {
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

  // Check if this phone is already taken by another user.
  const phoneTaken = await queryOne(
    `SELECT id FROM users WHERE phone = ? AND id != ? AND ${USER_NOT_DELETED}`,
    [phone, req.user.id]
  );
  if (phoneTaken) {
    return res.status(409).json({
      error: "This phone number is already linked to another account.",
    });
  }

  // Get the current user's email for OTP delivery fallback.
  const user = await queryOne(
    `SELECT id, email FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
    [req.user.id]
  );
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const payload = { userId: req.user.id, phone };

  const result = await createAndSendMobileOtp(
    phone,
    "phone_verify",
    user.email,
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
    message: "Verification code sent to your email. Enter it below to verify your phone number.",
    phone: maskPhone(phone),
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  });
});

// ─── POST /verify-otp ──────────────────────────────────────────────────
// Body: { phone, otp }
// Requires auth. Verifies the OTP and saves the phone to the user's profile.
router.post("/verify-otp", requireAuth, async (req, res) => {
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

  const verified = await verifyOtp(phone, "phone_verify", String(otp));
  if (!verified.ok) {
    return res.status(verified.status).json({
      error: verified.error,
      code: verified.code,
    });
  }

  const payload = verified.payload || {};

  // Ensure the OTP was generated for this user.
  if (payload.userId !== req.user.id) {
    return res.status(403).json({
      error: "This verification code was not generated for your account.",
    });
  }

  // Double-check phone not taken (race condition guard).
  const phoneTaken = await queryOne(
    `SELECT id FROM users WHERE phone = ? AND id != ? AND ${USER_NOT_DELETED}`,
    [phone, req.user.id]
  );
  if (phoneTaken) {
    return res.status(409).json({
      error: "This phone number is already linked to another account.",
    });
  }

  // Save verified phone to profile.
  await query("UPDATE users SET phone = ? WHERE id = ?", [phone, req.user.id]);

  return res.json({
    message: "Phone number verified and saved.",
    phone: maskPhone(phone),
  });
});

// ─── POST /resend-otp ──────────────────────────────────────────────────
// Body: { phone }
// Requires auth. Resends the phone verification OTP.
router.post("/resend-otp", requireAuth, async (req, res) => {
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

  const user = await queryOne(
    `SELECT id, email FROM users WHERE id = ? AND ${USER_NOT_DELETED}`,
    [req.user.id]
  );
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const payload = { userId: req.user.id, phone };

  const result = await createAndSendMobileOtp(
    phone,
    "phone_verify",
    user.email,
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
