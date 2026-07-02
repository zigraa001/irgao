// IraGo transactional email via SMTP (nodemailer).
//
// OTP codes are NEVER logged. SMTP_USER + SMTP_PASS are required for any OTP flow.
const { createSmtpTransport } = require("./smtp-transport");
const { OTP_EXPIRY_SECONDS } = require("./otp-limits");

class EmailDeliveryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}

let _transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function maskEmail(email) {
  const normalized = String(email || "");
  const at = normalized.indexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const maskedLocal =
    local.length <= 2
      ? "**"
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!isConfigured()) return null;
  _transporter = createSmtpTransport();
  return _transporter;
}

function stripQuotes(value) {
  const s = String(value || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

// Hostinger requires the From address to match SMTP_USER exactly.
function fromAddress() {
  const user = stripQuotes(process.env.SMTP_USER);
  if (!user) {
    return stripQuotes(process.env.SMTP_FROM) || "IraGo <noreply@irago.com>";
  }

  let displayName = "IraGo";
  const raw = stripQuotes(process.env.SMTP_FROM);
  if (raw) {
    const bracketed = raw.match(/^(.+?)\s*<([^>]+)>\s*$/);
    if (bracketed) {
      displayName = bracketed[1].trim();
    } else if (!raw.includes("@")) {
      displayName = raw;
    }
  }

  return { name: displayName, address: user };
}

function validateEmailConfig() {
  if (isConfigured()) return true;

  console.warn(
    "[startup] SMTP_USER and SMTP_PASS are not set. OTP emails are never logged to the console. " +
      "Signup and password reset will return 503 until SMTP is configured in the server environment."
  );
  return false;
}

async function sendOtpEmail(to, code, purpose) {
  const labels = {
    reset_password: {
      subject: "IraGo — Password reset code",
      intro: "Use this code to reset your IraGo password:",
    },
    signup_passenger: {
      subject: "IraGo — Passenger verification code",
      intro: "Use this code to finish creating your IraGo passenger account:",
    },
    signup_operator: {
      subject: "IraGo — Operator verification code",
      intro: "Use this code to finish creating your IraGo operator account:",
    },
    signup_admin: {
      subject: "IraGo — Admin verification code",
      intro: "Use this code to finish creating your IraGo admin account:",
    },
    signup: {
      subject: "IraGo — Verify your email",
      intro: "Use this code to verify your email and finish creating your IraGo account:",
    },
    phone_verify: {
      subject: "IraGo — Verify your phone number",
      intro: "Use this code to verify your phone number on your IraGo account:",
    },
    google_phone_verify: {
      subject: "IraGo — Verify your phone number",
      intro: "Use this code to verify your phone number and complete your Google sign-in:",
    },
  };
  const copy = labels[purpose] || labels.signup;
  const expirySeconds = OTP_EXPIRY_SECONDS;
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + expirySeconds * 1000);
  const timeFmt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const sentLabel = timeFmt.format(sentAt);
  const expiresLabel = timeFmt.format(expiresAt);

  const text = [
    copy.intro,
    "",
    code,
    "",
    `Sent: ${sentLabel}`,
    `Expires: ${expiresLabel} (${Math.round(expirySeconds / 60)} minute)`,
    "If you did not request this, you can ignore this email.",
    "",
    "— IraGo",
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <p>${copy.intro}</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0;">${code}</p>
      <p style="color:#666;font-size:14px;margin:0 0 6px;">Sent: <strong>${sentLabel}</strong></p>
      <p style="color:#666;font-size:14px;margin:0 0 12px;">Expires: <strong>${expiresLabel}</strong> (${Math.round(expirySeconds / 60)} minute)</p>
      <p style="color:#666;font-size:14px;">If you did not request this, you can ignore this email.</p>
      <p style="color:#999;font-size:12px;margin-top:32px;">— IraGo</p>
    </div>`;

  const transporter = getTransporter();
  if (!transporter) {
    throw new EmailDeliveryError(
      "SMTP is not configured",
      "SMTP_NOT_CONFIGURED"
    );
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to,
      subject: copy.subject,
      text,
      html,
    });
    console.log(
      `[email] OTP sent to ${maskEmail(to)} (${purpose})` +
        (info.messageId ? ` id=${info.messageId}` : "")
    );
  } catch (err) {
    console.error(
      `[email] SMTP send failed for ${maskEmail(to)} (${purpose}): ${err.message}`
    );
    throw new EmailDeliveryError("Failed to deliver verification email", "SMTP_SEND_FAILED");
  }
}

module.exports = {
  sendOtpEmail,
  isConfigured,
  getTransporter,
  validateEmailConfig,
  fromAddress,
  maskEmail,
  EmailDeliveryError,
};
