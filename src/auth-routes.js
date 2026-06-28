// IraGo auth routes. Mounted at /api/auth.
//
// Role-specific signup:
//   POST /api/auth/passenger/signup-request  + /verify-signup  → customer
//   POST /api/auth/operator/signup-request   + /verify-signup  → operator
//
// Admin accounts: env bootstrap only (npm run admin:bootstrap) — no OTP signup or reset.
//
// Role-specific login (each portal rejects other roles):
//   POST /api/auth/passenger/login  → customer only
//   POST /api/auth/operator/login   → operator only
//   POST /api/auth/admin/login      → admin only
const express = require("express");
const { query, queryOne } = require("./db");
const {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require("./auth");
const {
  createAndSendOtp,
  verifyOtp,
  parseStoredPayload,
  PURPOSES,
} = require("./otp");
const { mountRoleSignup } = require("./role-signup");
const { createRoleLoginHandler } = require("./role-login");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_PURPOSES = PURPOSES.filter((p) => p.startsWith("signup"));

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
  };
}

function authResponse(res, status, user) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return res.status(status).json({ user: publicUser(user) });
}

function genericOtpSent(res, timing) {
  const body = {
    message:
      "If an account exists for that email, a verification code has been sent.",
  };
  if (timing) {
    body.expiresInSeconds = timing.expiresInSeconds;
    body.resendCooldownSeconds = timing.resendCooldownSeconds;
  }
  return res.json(body);
}

function otpDeliveryJson(result, message) {
  return {
    message,
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  };
}

const passengerHandlers = mountRoleSignup(
  express.Router(),
  { purpose: "signup_passenger", role: "customer", label: "Passenger" },
  authResponse
);
const operatorHandlers = mountRoleSignup(
  express.Router(),
  { purpose: "signup_operator", role: "operator", label: "Operator" },
  authResponse
);

router.post("/passenger/signup-request", passengerHandlers.signupRequest);
router.post("/passenger/verify-signup", passengerHandlers.verifySignup);
router.post("/operator/signup-request", operatorHandlers.signupRequest);
router.post("/operator/verify-signup", operatorHandlers.verifySignup);

router.post("/admin/signup-request", (_req, res) => {
  res.status(403).json({
    error:
      "Admin accounts are provisioned from .env only. Run: npm run admin:bootstrap",
    code: "ADMIN_ENV_ONLY",
  });
});
router.post("/admin/verify-signup", (_req, res) => {
  res.status(403).json({
    error:
      "Admin accounts are provisioned from .env only. Run: npm run admin:bootstrap",
    code: "ADMIN_ENV_ONLY",
  });
});

router.post("/passenger/login", createRoleLoginHandler("customer", authResponse));
router.post("/operator/login", createRoleLoginHandler("operator", authResponse));
router.post("/admin/login", createRoleLoginHandler("admin", authResponse));

// Legacy passenger login alias
router.post("/login", createRoleLoginHandler("customer", authResponse));

// Legacy passenger aliases
router.post("/signup-request", passengerHandlers.signupRequest);
router.post("/verify-signup", passengerHandlers.verifySignup);

router.post("/resend-otp", async (req, res) => {
  const { email, purpose } = req.body || {};

  if (!email || !purpose) {
    return res.status(400).json({ error: "email and purpose are required" });
  }

  const otpPurpose = purpose === "signup" ? "signup_passenger" : purpose;
  if (!PURPOSES.includes(otpPurpose)) {
    return res.status(400).json({ error: "Invalid purpose" });
  }

  const normalizedEmail = String(email).toLowerCase();

  if (SIGNUP_PURPOSES.includes(otpPurpose) || purpose === "signup") {
    const pending = await queryOne(
      `SELECT payload FROM otp_requests
       WHERE email = ? AND purpose = ? AND consumedAt IS NULL
       ORDER BY createdAt DESC LIMIT 1`,
      [normalizedEmail, otpPurpose]
    );
    const payload = parseStoredPayload(pending?.payload);
    if (!payload) {
      return res.status(400).json({
        error: "No pending signup for this email. Start registration again.",
      });
    }
    const result = await createAndSendOtp(normalizedEmail, otpPurpose, payload);
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return res.json(otpDeliveryJson(result, "Verification code resent."));
  }

  if (otpPurpose !== "reset_password") {
    return res.status(400).json({ error: "Invalid purpose" });
  }

  const user = await queryOne("SELECT id FROM users WHERE email = ?", [
    normalizedEmail,
  ]);
  if (!user) return genericOtpSent(res);

  const result = await createAndSendOtp(normalizedEmail, "reset_password", {});
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return res.json(otpDeliveryJson(result, "Reset code resent."));
});

router.post("/signup", (_req, res) => {
  res.status(400).json({
    error:
      "Use /api/auth/passenger|operator/signup-request then verify-signup.",
  });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "currentPassword and newPassword are required" });
  }
  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ error: "newPassword must be at least 6 characters" });
  }
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  if (user.role === "admin") {
    return res.status(403).json({
      error:
        "Admin password is managed via .env only. Update ADMIN_PASSWORD and run npm run admin:bootstrap.",
      code: "ADMIN_ENV_ONLY",
    });
  }
  const ok = await verifyPassword(String(currentPassword), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
  const passwordHash = await hashPassword(String(newPassword));
  await query("UPDATE users SET passwordHash = ? WHERE id = ?", [
    passwordHash,
    user.id,
  ]);
  const updated = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
  return authResponse(res, 200, updated);
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  const normalizedEmail = String(email).toLowerCase();
  const user = await queryOne("SELECT id, role FROM users WHERE email = ?", [
    normalizedEmail,
  ]);
  if (user && user.role !== "admin") {
    const result = await createAndSendOtp(normalizedEmail, "reset_password", {});
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
  }
  return genericOtpSent(res);
});

router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json({ error: "email, otp, and newPassword are required" });
  }
  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }
  const normalizedEmail = String(email).toLowerCase();
  const user = await queryOne("SELECT * FROM users WHERE email = ?", [
    normalizedEmail,
  ]);
  if (user?.role === "admin") {
    return res.status(403).json({
      error:
        "Admin password cannot be reset online. Update ADMIN_PASSWORD in .env and run npm run admin:bootstrap.",
      code: "ADMIN_ENV_ONLY",
    });
  }
  if (!user) {
    await verifyOtp(normalizedEmail, "reset_password", otp);
    return res.status(400).json({
      error: "Invalid or expired code. Request a new one.",
      code: "RESET_FAILED",
    });
  }
  const verified = await verifyOtp(normalizedEmail, "reset_password", otp);
  if (!verified.ok) {
    return res.status(verified.status).json({
      error: verified.error,
      code: verified.code,
    });
  }
  const passwordHash = await hashPassword(String(newPassword));
  await query("UPDATE users SET passwordHash = ? WHERE id = ?", [
    passwordHash,
    user.id,
  ]);
  const updated = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
  return res.json({
    message: "Password updated successfully. Sign in with your new password.",
    email: updated.email,
  });
});

module.exports = router;
