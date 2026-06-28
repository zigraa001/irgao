// Shared SMTP transport config (Hostinger, Gmail, Mailtrap, etc.).
const nodemailer = require("nodemailer");

function smtpSettings() {
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure =
    process.env.SMTP_SECURE === "true" ||
    (process.env.SMTP_SECURE !== "false" && port === 465);
  const isGmail =
    host === "smtp.gmail.com" || host === "gmail.googleapis.com";

  return { host, port, secure, isGmail };
}

function createSmtpTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  const { host, port, secure, isGmail } = smtpSettings();

  if (isGmail) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(port === 587
      ? { requireTLS: true, tls: { minVersion: "TLSv1.2" } }
      : { tls: { minVersion: "TLSv1.2" } }),
  });
}

module.exports = { smtpSettings, createSmtpTransport };
