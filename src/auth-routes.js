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
const crypto = require("crypto");
const { query, queryOne } = require("./db");
const {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  USER_NOT_DELETED,
  invalidateUserStatus,
} = require("./auth");
const {
  createAndSendOtp,
  verifyOtp,
  parseStoredPayload,
  PURPOSES,
} = require("./otp");
const { mountRoleSignup } = require("./role-signup");
const { createRoleLoginHandler } = require("./role-login");
const {
  googleConfigured,
  SCOPES,
  GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI,
  exchangeCode,
  fetchGoogleProfile,
  fetchGooglePhone,
  authResponse: googleAuthResponse,
  setPending,
  getPending,
  deletePending,
  normalizePhone,
} = require("./google-auth");
const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_PURPOSES = PURPOSES.filter((p) => p.startsWith("signup"));

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

router.post("/passenger/signup-request", passengerHandlers.signupRequest);
router.post("/passenger/verify-signup", passengerHandlers.verifySignup);

// Operator & admin accounts are admin-provisioned only — a logged-in admin
// creates them (with a temp password the new user must reset on first login).
// Public self-signup for these roles is closed.
router.post("/operator/signup-request", (_req, res) => {
  res.status(403).json({
    error:
      "Operator accounts are created by an admin only. Ask an administrator to provision your account.",
    code: "ADMIN_PROVISIONED_ONLY",
  });
});
router.post("/operator/verify-signup", (_req, res) => {
  res.status(403).json({
    error:
      "Operator accounts are created by an admin only. Ask an administrator to provision your account.",
    code: "ADMIN_PROVISIONED_ONLY",
  });
});

router.post("/admin/signup-request", (_req, res) => {
  res.status(403).json({
    error:
      "Admin accounts are provisioned by an admin only. Run: npm run admin:bootstrap for the first admin.",
    code: "ADMIN_PROVISIONED_ONLY",
  });
});
router.post("/admin/verify-signup", (_req, res) => {
  res.status(403).json({
    error:
      "Admin accounts are provisioned by an admin only. Run: npm run admin:bootstrap for the first admin.",
    code: "ADMIN_PROVISIONED_ONLY",
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
  const user = await queryOne("SELECT * FROM users WHERE id = ? AND " + USER_NOT_DELETED, [
    req.user.id,
  ]);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  // Env-bootstrap admins (mustResetPassword = 0) keep their password in .env.
  // Console-created admins (mustResetPassword = 1) MAY change theirs.
  if (user.role === "admin" && !user.mustResetPassword) {
    return res.status(403).json({
      error:
        "Admin password is managed via .env only. Update ADMIN_PASSWORD and run npm run admin:bootstrap.",
      code: "ADMIN_ENV_ONLY",
    });
  }
  const ok = await verifyPassword(String(currentPassword), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
  const passwordHash = await hashPassword(String(newPassword));
  await query(
    "UPDATE users SET passwordHash = ?, mustResetPassword = 0 WHERE id = ?",
    [passwordHash, user.id]
  );
  const updated = await queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
  return authResponse(res, 200, updated);
});

// POST /api/auth/delete-account — soft-delete the logged-in account (customer/operator).
// Body: { password }. Admin accounts cannot be deleted online.
router.post("/delete-account", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: "password is required" });
  }

  const user = await queryOne("SELECT * FROM users WHERE id = ? AND " + USER_NOT_DELETED, [
    req.user.id,
  ]);
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (user.role === "admin") {
    return res.status(403).json({
      error: "Admin accounts cannot be deleted online.",
      code: "ADMIN_ENV_ONLY",
    });
  }

  const ok = await verifyPassword(String(password), user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Password is incorrect" });
  }

  const activeBooking = await queryOne(
    `SELECT id FROM bookings
     WHERE customerId = ? AND status NOT IN ('completed', 'cancelled', 'rejected')
     LIMIT 1`,
    [user.id]
  );
  if (activeBooking) {
    return res.status(409).json({
      error:
        "You have an active booking. Cancel or complete it before deleting your account.",
      code: "ACTIVE_BOOKING",
    });
  }

  const operatorBooking = await queryOne(
    `SELECT id FROM bookings
     WHERE operatorId = ? AND status NOT IN ('completed', 'cancelled', 'rejected')
     LIMIT 1`,
    [user.id]
  );
  if (operatorBooking) {
    return res.status(409).json({
      error:
        "You have an assigned trip in progress. Finish or hand off the trip before deleting your account.",
      code: "ACTIVE_TRIP",
    });
  }

  const tombstoneEmail =
    "deleted." + user.id + "." + Date.now() + "@irago.invalid";
  const unusableHash = await hashPassword(crypto.randomBytes(32).toString("hex"));

  await query(
    `UPDATE users
     SET deletedAt = NOW(), email = ?, name = ?, passwordHash = ?
     WHERE id = ?`,
    [tombstoneEmail, "Deleted user", unusableHash, user.id]
  );
  // Drop the cached status so the soft-delete takes effect on the next request
  // (their token would otherwise stay valid until expiry).
  invalidateUserStatus(user.id);

  clearAuthCookie(res);
  return res.json({
    message: "Your account has been deleted.",
  });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  const normalizedEmail = String(email).toLowerCase();
  const user = await queryOne("SELECT id, role FROM users WHERE email = ? AND deletedAt IS NULL", [
    normalizedEmail,
  ]);

  // Always return the same generic "code sent" response so this endpoint can't
  // be used to enumerate which emails have accounts (login already avoids this).
  const genericSent = () =>
    res.json({
      message: "If an account exists for this email, a verification code has been sent.",
    });

  if (!user) {
    // No account — don't reveal that. Pretend we sent a code.
    return genericSent();
  }

  // Admin passwords are managed via .env only.
  if (user.role === "admin") {
    return genericSent();
  }

  const result = await createAndSendOtp(normalizedEmail, "reset_password", {});
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return res.json({
    message: "A verification code has been sent to your email.",
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  });
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

// ── Google OAuth2 ──────────────────────────────────────────────────────

// GET /api/auth/google — redirect to Google consent screen.
router.get("/google", (req, res) => {
  if (!googleConfigured()) {
    return res.status(503).json({ error: "Google sign-in is not configured." });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID(),
    redirect_uri: GOOGLE_REDIRECT_URI(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    state,
    prompt: "consent",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — Google redirects here after consent.
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect("/app.html?google_error=access_denied");
  }

  try {
    const tokenData = await exchangeCode(code);
    if (tokenData.error) {
      console.error("[google-auth] token exchange failed:", tokenData);
      return res.redirect("/app.html?google_error=token_failed");
    }

    const profile = await fetchGoogleProfile(tokenData.access_token);
    if (!profile || !profile.email) {
      return res.redirect("/app.html?google_error=no_email");
    }

    const email = String(profile.email).toLowerCase();
    const name = profile.name || email.split("@")[0];

    // Check if user already exists.
    const existing = await queryOne(
      "SELECT * FROM users WHERE email = ? AND deletedAt IS NULL",
      [email]
    );

    if (existing) {
      // Existing user — log them in.
      if (existing.bannedAt) {
        return res.redirect("/app.html?google_error=banned");
      }
      const auth = googleAuthResponse(res, existing);
      // Store in a temp cookie so the frontend can pick it up.
      const payload = encodeURIComponent(JSON.stringify(auth));
      res.cookie("irago_google_auth", payload, { maxAge: 60000, path: "/" });
      return res.redirect("/app.html?google_success=1");
    }

    // New user — try to get phone from Google.
    let phone = null;
    try {
      phone = await fetchGooglePhone(tokenData.access_token);
    } catch (err) {
      console.warn("[google-auth] could not fetch phone:", err.message);
    }

    if (phone) {
      // Phone available — check it's not already taken.
      const phoneTaken = await queryOne(
        "SELECT id FROM users WHERE phone = ?",
        [phone]
      );
      if (phoneTaken) {
        phone = null; // fall through to manual phone entry
      }
    }

    if (phone) {
      // Have email + name + phone → create account directly.
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await hashPassword(randomPassword);
      const insert = await query(
        `INSERT INTO users (name, email, phone, passwordHash, role, emailVerified)
         VALUES (?, ?, ?, ?, 'customer', 1)`,
        [name, email, phone, passwordHash]
      );
      const user = await queryOne("SELECT * FROM users WHERE id = ?", [insert.insertId]);
      const auth = googleAuthResponse(res, user);
      const payload = encodeURIComponent(JSON.stringify(auth));
      res.cookie("irago_google_auth", payload, { maxAge: 60000, path: "/" });
      return res.redirect("/app.html?google_success=1");
    }

    // No phone — store pending signup, redirect to phone collection page.
    const pendingState = setPending({ name, email });
    return res.redirect(`/app.html?google_pending=1&state=${pendingState}`);
  } catch (err) {
    console.error("[google-auth] callback error:", err);
    return res.redirect("/app.html?google_error=server_error");
  }
});

// POST /api/auth/google/send-phone-otp — send OTP to Google email for phone verification.
router.post("/google/send-phone-otp", async (req, res) => {
  const { state, phone: rawPhone } = req.body || {};
  if (!state) return res.status(400).json({ error: "Missing state." });
  const pending = getPending(state);
  if (!pending) return res.status(400).json({ error: "Session expired. Try signing in with Google again." });
  if (!rawPhone) return res.status(400).json({ error: "Phone number is required." });

  const phone = normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });

  const phoneTaken = await queryOne("SELECT id FROM users WHERE phone = ?", [phone]);
  if (phoneTaken) return res.status(409).json({ error: "This phone number is already linked to another account." });

  // Send OTP to the Google email (not SMS — same as demo/existing flow).
  const result = await createAndSendOtp(pending.email, "google_phone_verify", { phone, name: pending.name });
  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return res.json({
    message: `Verification code sent to ${pending.email}.`,
    email: pending.email,
    expiresInSeconds: result.expiresInSeconds,
    resendCooldownSeconds: result.resendCooldownSeconds,
  });
});

// POST /api/auth/google/verify-phone — verify OTP and create account.
router.post("/google/verify-phone", async (req, res) => {
  const { state, phone: rawPhone, otp } = req.body || {};
  if (!state || !otp) return res.status(400).json({ error: "State and OTP are required." });
  const pending = getPending(state);
  if (!pending) return res.status(400).json({ error: "Session expired. Try signing in with Google again." });

  const phone = normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });

  // Verify the OTP.
  const verified = await verifyOtp(pending.email, "google_phone_verify", otp);
  if (!verified.ok) {
    return res.status(verified.status).json({ error: verified.error, code: verified.code });
  }

  // Check phone not taken (race condition guard).
  const phoneTaken = await queryOne("SELECT id FROM users WHERE phone = ?", [phone]);
  if (phoneTaken) return res.status(409).json({ error: "This phone number is already linked to another account." });

  // Check email not taken (race condition guard).
  const emailTaken = await queryOne("SELECT id FROM users WHERE email = ?", [pending.email]);
  if (emailTaken) {
    deletePending(state);
    // Log them in instead.
    const auth = googleAuthResponse(res, emailTaken);
    return res.json(auth);
  }

  // Create the account.
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(randomPassword);
  const insert = await query(
    `INSERT INTO users (name, email, phone, passwordHash, role, emailVerified)
     VALUES (?, ?, ?, ?, 'customer', 1)`,
    [pending.name, pending.email, phone, passwordHash]
  );
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [insert.insertId]);
  deletePending(state);

  const auth = googleAuthResponse(res, user);
  return res.json(auth);
});

// GET /api/auth/google/status — check if Google OAuth is configured.
router.get("/google/status", (_req, res) => {
  res.json({ configured: googleConfigured() });
});

module.exports = router;
