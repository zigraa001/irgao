#!/usr/bin/env node
// Verify SMTP credentials without sending mail or logging secrets.
require("dotenv").config();

const { createSmtpTransport, smtpSettings } = require("../src/smtp-transport");

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.error("FAIL: Set SMTP_USER and SMTP_PASS in .env");
  process.exit(1);
}

if (/\s/.test(pass)) {
  console.error("FAIL: SMTP_PASS contains spaces — remove them.");
  process.exit(1);
}

const { host, port, secure } = smtpSettings();
console.log(`Checking ${host}:${port} (secure=${secure}) as ${user} ...`);

const transport = createSmtpTransport();
if (!transport) {
  console.error("FAIL: Could not build SMTP transport.");
  process.exit(1);
}

transport
  .verify()
  .then(() => {
    console.log(`OK: SMTP verified for ${user} via ${host}:${port}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`FAIL: ${err.message}`);
    if (String(err.message).includes("535") || /auth/i.test(err.message)) {
      console.error("");
      if (host.includes("hostinger") || host.includes("titan")) {
        console.error("Hostinger email login failed. In hPanel check:");
        console.error("  1. Emails → your mailbox (e.g. info@irago.com) → password");
        console.error("  2. SMTP_USER must be the FULL email address");
        console.error("  3. SMTP_PASS = that mailbox password (or Hostinger app password)");
        console.error("  4. Typical settings:");
        console.error("       SMTP_HOST=smtp.hostinger.com");
        console.error("       SMTP_PORT=465");
        console.error("       SMTP_SECURE=true");
      } else if (host.includes("gmail")) {
        console.error("Gmail: use an App Password for SMTP_USER, not your normal password.");
      } else {
        console.error("Check SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env");
      }
    }
    process.exit(1);
  });
