// IraGo OTP generation, storage, verification, and rate limiting.
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { query, queryOne } = require("./db");
const { sendOtpEmail } = require("./email");
const { deliverOtp: deliverOtpViaChannel, maskPhone } = require("./otp-channel");
const { deriveOtpPayloadKey } = require("./auth");
const {
  OTP_EXPIRY_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_DAILY_LIMIT,
  OTP_MAX_VERIFY_ATTEMPTS,
} = require("./otp-limits");

const PURPOSES = [
  "signup",
  "signup_passenger",
  "signup_operator",
  "reset_password",
  "mobile_login",
];

const ENCRYPTED_PREFIX = "enc:v1:";

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function verifyCode(code, hash) {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
}

function encryptPayload(payload) {
  const key = deriveOtpPayloadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, ciphertext]).toString("base64url");
  return ENCRYPTED_PREFIX + blob;
}

function parseStoredPayload(stored) {
  if (!stored) return null;
  if (typeof stored === "object") {
    return stored;
  }
  const str = String(stored);
  if (str.startsWith(ENCRYPTED_PREFIX)) {
    try {
      const key = deriveOtpPayloadKey();
      const raw = Buffer.from(str.slice(ENCRYPTED_PREFIX.length), "base64url");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function serializePayload(payload) {
  if (!payload) return null;
  return encryptPayload(payload);
}

// Remove expired rows and consumed rows older than 1 hour (drops stale password hashes).
async function cleanupExpiredOtps() {
  const result = await query(
    `DELETE FROM otp_requests
     WHERE expiresAt < NOW()
        OR (consumedAt IS NOT NULL
            AND consumedAt < DATE_SUB(NOW(), INTERVAL 1 HOUR))`
  );
  return result?.affectedRows ?? 0;
}

// Check daily cap and resend cooldown before issuing a new OTP.
async function checkSendLimits(email, purpose) {
  const normalized = String(email).toLowerCase();

  const daily = await queryOne(
    `SELECT COUNT(*) AS cnt FROM otp_requests
     WHERE email = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    [normalized]
  );
  if (Number(daily.cnt) >= OTP_DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: "Daily OTP limit reached (20 per day). Try again tomorrow.",
      code: "DAILY_LIMIT",
    };
  }

  const last = await queryOne(
    `SELECT createdAt FROM otp_requests
     WHERE email = ? AND purpose = ?
     ORDER BY createdAt DESC LIMIT 1`,
    [normalized, purpose]
  );
  if (last) {
    const elapsed =
      (Date.now() - new Date(last.createdAt).getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds = Math.ceil(
        OTP_RESEND_COOLDOWN_SECONDS - elapsed
      );
      return {
        ok: false,
        status: 429,
        error: `Please wait ${retryAfterSeconds} seconds before requesting a new code.`,
        code: "RESEND_COOLDOWN",
        retryAfterSeconds,
      };
    }
  }

  return { ok: true };
}

// Invalidate any previous unconsumed OTP for this email+purpose, then store bcrypt hash only.
async function createAndSendOtp(email, purpose, payload = null) {
  if (!PURPOSES.includes(purpose)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid verification request.",
      code: "INVALID_OTP_PURPOSE",
    };
  }

  try {
    const limits = await checkSendLimits(email, purpose);
    if (!limits.ok) return limits;

    await cleanupExpiredOtps();

    const normalized = String(email).toLowerCase();
    const code = generateCode();
    const codeHash = await hashCode(code);
    const payloadStored = serializePayload(payload);

    await query(
      `UPDATE otp_requests SET consumedAt = NOW()
       WHERE email = ? AND purpose = ? AND consumedAt IS NULL`,
      [normalized, purpose]
    );

    const insertResult = await query(
      `INSERT INTO otp_requests (email, purpose, codeHash, payload, attempts, expiresAt)
       VALUES (?, ?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [normalized, purpose, codeHash, payloadStored, OTP_EXPIRY_SECONDS]
    );

    try {
      await sendOtpEmail(normalized, code, purpose);
    } catch (err) {
      if (insertResult?.insertId) {
        await query(`UPDATE otp_requests SET consumedAt = NOW() WHERE id = ?`, [
          insertResult.insertId,
        ]);
      }
      return {
        ok: false,
        status: 503,
        error:
          "Could not send verification email. Check SMTP settings or contact support.",
        code: err.code || "EMAIL_SEND_FAILED",
      };
    }

    return {
      ok: true,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  } catch (err) {
    console.error(
      `[otp] createAndSendOtp failed (${purpose}): ${err.code || ""} ${err.message}`
    );
    return {
      ok: false,
      status: 500,
      error: "Could not send verification code. Please try again in a moment.",
      code: "OTP_SEND_FAILED",
    };
  }
}

// Find the latest active (unconsumed, unexpired) OTP row for email+purpose.
async function findActiveOtp(email, purpose) {
  return queryOne(
    `SELECT * FROM otp_requests
     WHERE email = ? AND purpose = ?
       AND consumedAt IS NULL
       AND expiresAt > NOW()
     ORDER BY createdAt DESC LIMIT 1`,
    [String(email).toLowerCase(), purpose]
  );
}

// Verify a submitted code. Increments attempt counter on failure; consumes on success.
async function verifyOtp(email, purpose, code) {
  const row = await findActiveOtp(email, purpose);
  if (!row) {
    return {
      ok: false,
      status: 400,
      error: "Code expired or not found. Request a new one.",
      code: "OTP_INVALID",
    };
  }

  if (row.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    await query(`UPDATE otp_requests SET consumedAt = NOW() WHERE id = ?`, [
      row.id,
    ]);
    return {
      ok: false,
      status: 400,
      error: "Too many incorrect attempts. Request a new code.",
      code: "OTP_LOCKED",
    };
  }

  const match = await verifyCode(String(code), row.codeHash);
  if (!match) {
    await query(`UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?`, [
      row.id,
    ]);
    const remaining = OTP_MAX_VERIFY_ATTEMPTS - row.attempts - 1;
    return {
      ok: false,
      status: 400,
      error:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt(s) remaining.`
          : "Incorrect code. Request a new one.",
      code: "OTP_WRONG",
    };
  }

  await query(`UPDATE otp_requests SET consumedAt = NOW() WHERE id = ?`, [
    row.id,
  ]);

  return { ok: true, payload: parseStoredPayload(row.payload) };
}

// Mobile OTP: uses the channel router (WhatsApp → MSG91 → Email) instead of
// direct email. The `identifier` is the phone number (E.164 digits), and
// `recipientEmail` is passed through to the email fallback channel.
async function createAndSendMobileOtp(phone, purpose, recipientEmail, payload = null) {
  if (!PURPOSES.includes(purpose)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid verification request.",
      code: "INVALID_OTP_PURPOSE",
    };
  }

  try {
    const limits = await checkSendLimits(phone, purpose);
    if (!limits.ok) return limits;

    await cleanupExpiredOtps();

    const code = generateCode();
    const codeHash = await hashCode(code);
    const payloadStored = serializePayload(payload);

    await query(
      `UPDATE otp_requests SET consumedAt = NOW()
       WHERE email = ? AND purpose = ? AND consumedAt IS NULL`,
      [phone, purpose]
    );

    const insertResult = await query(
      `INSERT INTO otp_requests (email, purpose, codeHash, payload, attempts, expiresAt)
       VALUES (?, ?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [phone, purpose, codeHash, payloadStored, OTP_EXPIRY_SECONDS]
    );

    // TODO [Channel switch]: When WhatsApp/MSG91 are live, deliverOtpViaChannel
    // will send via those channels first, falling back to email only if they fail.
    // For now, all delivery goes through email.
    try {
      const delivery = await deliverOtpViaChannel(phone, code, purpose, recipientEmail);
      if (!delivery.sent) {
        if (insertResult?.insertId) {
          await query(`UPDATE otp_requests SET consumedAt = NOW() WHERE id = ?`, [
            insertResult.insertId,
          ]);
        }
        return {
          ok: false,
          status: 503,
          error: "Could not send verification code. Please try again.",
          code: "OTP_DELIVERY_FAILED",
        };
      }
      console.log(
        `[otp] mobile OTP sent to ${maskPhone(phone)} via ${delivery.channel} (${purpose})`
      );
    } catch (err) {
      if (insertResult?.insertId) {
        await query(`UPDATE otp_requests SET consumedAt = NOW() WHERE id = ?`, [
          insertResult.insertId,
        ]);
      }
      return {
        ok: false,
        status: 503,
        error: "Could not send verification code. Check configuration or contact support.",
        code: err.code || "OTP_SEND_FAILED",
      };
    }

    return {
      ok: true,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  } catch (err) {
    console.error(
      `[otp] createAndSendMobileOtp failed (${purpose}): ${err.code || ""} ${err.message}`
    );
    return {
      ok: false,
      status: 500,
      error: "Could not send verification code. Please try again in a moment.",
      code: "OTP_SEND_FAILED",
    };
  }
}

module.exports = {
  OTP_EXPIRY_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_DAILY_LIMIT,
  OTP_MAX_VERIFY_ATTEMPTS,
  PURPOSES,
  ENCRYPTED_PREFIX,
  generateCode,
  hashCode,
  verifyCode,
  encryptPayload,
  parseStoredPayload,
  cleanupExpiredOtps,
  checkSendLimits,
  createAndSendOtp,
  createAndSendMobileOtp,
  findActiveOtp,
  verifyOtp,
};
