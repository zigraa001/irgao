#!/usr/bin/env node
// Generate VAPID keys for Web Push and print them as .env lines.
// Run: node scripts/gen-vapid.js
// Then paste the output into your .env and restart the server.
const webpush = require("web-push");

if (!webpush) {
  console.error("web-push is not installed. Run: npm install web-push");
  process.exit(1);
}

const keys = webpush.generateVAPIDKeys();
const subject = process.env.VAPID_SUBJECT || "mailto:ops@irago.com";

console.log("# Web Push VAPID keys — add these to .env and restart.");
console.log(`VAPID_SUBJECT=${subject}`);
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
