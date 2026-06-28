#!/usr/bin/env node
// Generate or refresh IraGo `.env` secrets.
//
// Usage:
//   npm run env:gen              # create .env from .env.example + new AUTH_SECRET
//   npm run env:gen -- --rotate    # replace AUTH_SECRET in an existing .env
//
// Never commits secrets — writes only to `.env` (gitignored).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXAMPLE = path.join(ROOT, ".env.example");
const ENV = path.join(ROOT, ".env");

const PLACEHOLDER_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "",
]);

function generateAuthSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function readOrCreateEnv(rotate) {
  if (!fs.existsSync(ENV)) {
    if (!fs.existsSync(EXAMPLE)) {
      console.error("Missing .env.example — cannot bootstrap .env");
      process.exit(1);
    }
    fs.copyFileSync(EXAMPLE, ENV);
    console.log("Created .env from .env.example");
    return fs.readFileSync(ENV, "utf8");
  }
  if (rotate) {
    console.log("Rotating AUTH_SECRET in existing .env");
  }
  return fs.readFileSync(ENV, "utf8");
}

function upsertAuthSecret(content, secret) {
  const line = `AUTH_SECRET="${secret}"`;
  if (/^AUTH_SECRET=.*$/m.test(content)) {
    return content.replace(/^AUTH_SECRET=.*$/m, line);
  }
  return content.trimEnd() + `\n${line}\n`;
}

function main() {
  const rotate = process.argv.includes("--rotate");
  let content = readOrCreateEnv(rotate);

  const current = content.match(/^AUTH_SECRET=(.*)$/m);
  const currentVal = current
    ? current[1].replace(/^["']|["']$/g, "")
    : "";

  const needsSecret =
    rotate ||
    !fs.existsSync(ENV) ||
    PLACEHOLDER_SECRETS.has(currentVal);

  if (!needsSecret) {
    console.log(
      "AUTH_SECRET already set in .env — skipping (use --rotate to replace)."
    );
    return;
  }

  const secret = generateAuthSecret();
  content = upsertAuthSecret(content, secret);
  fs.writeFileSync(ENV, content, "utf8");
  console.log("AUTH_SECRET generated (64-char hex) and saved to .env");
  console.log("Next: fill DB_PASSWORD, SMTP_*, ADMIN_PASSWORD, then npm run db:init");
}

main();
