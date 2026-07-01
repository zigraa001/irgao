// IraGo OTP delivery channel router.
//
// Pipeline: WhatsApp (primary) → MSG91 SMS (fallback) → Email (current).
// For now ALL channels redirect to email. Each channel function has comments
// marking where to integrate the real provider SDK.
//
// To switch a channel live, set env vars:
//   OTP_CHANNEL=whatsapp   → try WhatsApp first, then MSG91, then email
//   OTP_CHANNEL=msg91      → try MSG91 first, then email
//   OTP_CHANNEL=email      → email only (default)

const { sendOtpEmail } = require("./email");

// ─── Channel: WhatsApp Business API ────────────────────────────────────
// TODO [WhatsApp Integration]:
//   1. Install the WhatsApp Business API SDK:
//        npm install whatsapp-business-api   (or use the official Meta Cloud API)
//   2. Set env vars:
//        WHATSAPP_API_URL=https://graph.facebook.com/v18.0/<PHONE_NUMBER_ID>/messages
//        WHATSAPP_ACCESS_TOKEN=<your-token>
//        WHATSAPP_OTP_TEMPLATE_NAME=<your-approved-otp-template>
//   3. Replace the body of sendViaWhatsApp() with the real API call.
//   4. The template must be pre-approved by Meta with a {{1}} placeholder for the OTP code.
//
// Example real implementation:
//   const res = await fetch(process.env.WHATSAPP_API_URL, {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       messaging_product: 'whatsapp',
//       to: phone,              // E.164 format: 919876543210
//       type: 'template',
//       template: {
//         name: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
//         language: { code: 'en' },
//         components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
//       },
//     }),
//   });
//   if (!res.ok) throw new Error('WhatsApp send failed: ' + (await res.text()));
async function sendViaWhatsApp(phone, code, purpose) {
  // TODO: Replace with real WhatsApp Business API call (see above).
  // For now, falls through to email.
  return { sent: false, reason: "whatsapp_not_configured" };
}

// ─── Channel: MSG91 SMS Gateway ────────────────────────────────────────
// TODO [MSG91 Integration]:
//   1. Sign up at msg91.com and get your authkey + template/sender IDs.
//   2. Set env vars:
//        MSG91_AUTH_KEY=<your-authkey>
//        MSG91_TEMPLATE_ID=<your-otp-template-id>
//        MSG91_SENDER_ID=IRAGO   (6-char sender ID registered with DLT)
//   3. Replace the body of sendViaMsg91() with the real API call.
//   4. The DLT-registered template must include {OTP} placeholder.
//
// Example real implementation:
//   const res = await fetch('https://control.msg91.com/api/v5/otp', {
//     method: 'POST',
//     headers: {
//       'authkey': process.env.MSG91_AUTH_KEY,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       template_id: process.env.MSG91_TEMPLATE_ID,
//       mobile: phone,           // with country code: 919876543210
//       otp: code,               // MSG91 can auto-generate, but we pass ours for consistency
//     }),
//   });
//   if (!res.ok) throw new Error('MSG91 send failed: ' + (await res.text()));
async function sendViaMsg91(phone, code, purpose) {
  // TODO: Replace with real MSG91 API call (see above).
  // For now, falls through to email.
  return { sent: false, reason: "msg91_not_configured" };
}

// ─── Channel: Email (current active channel) ───────────────────────────
// This is the working fallback. OTP is sent to the email address linked
// to the phone number in the users table.
async function sendViaEmail(email, code, purpose) {
  if (!email) {
    return { sent: false, reason: "no_email_for_phone" };
  }
  await sendOtpEmail(email, code, purpose);
  return { sent: true, channel: "email" };
}

// ─── Normalise phone to E.164 (Indian numbers) ────────────────────────
// Strips spaces, dashes, leading 0, and ensures +91 prefix.
function normalizePhone(raw) {
  let digits = String(raw).replace(/[\s\-().+]/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  if (!digits.startsWith("91") || digits.length !== 12) return null;
  return digits; // E.164 without '+': 919876543210
}

function maskPhone(phone) {
  if (!phone || phone.length < 6) return "***";
  return phone.slice(0, 4) + "****" + phone.slice(-2);
}

// ─── Main delivery function ────────────────────────────────────────────
// Tries channels in priority order. Returns { sent, channel, reason? }.
//
// `recipientEmail` is the email linked to this phone — used by the email
// fallback channel. When WhatsApp/MSG91 are live this param becomes optional.
async function deliverOtp(phone, code, purpose, recipientEmail) {
  const channel = (process.env.OTP_CHANNEL || "email").toLowerCase();
  const attempts = [];

  // ── Priority 1: WhatsApp ──
  // TODO: When WhatsApp is configured, this becomes the primary channel.
  if (channel === "whatsapp") {
    try {
      const wa = await sendViaWhatsApp(phone, code, purpose);
      if (wa.sent) return wa;
      attempts.push(wa);
    } catch (err) {
      console.error(`[otp-channel] WhatsApp failed for ${maskPhone(phone)}: ${err.message}`);
      attempts.push({ sent: false, reason: "whatsapp_error", error: err.message });
    }

    // ── Priority 2: MSG91 fallback ──
    // TODO: When MSG91 is configured, auto-fallback from WhatsApp failure.
    try {
      const sms = await sendViaMsg91(phone, code, purpose);
      if (sms.sent) return sms;
      attempts.push(sms);
    } catch (err) {
      console.error(`[otp-channel] MSG91 failed for ${maskPhone(phone)}: ${err.message}`);
      attempts.push({ sent: false, reason: "msg91_error", error: err.message });
    }
  }

  // ── Priority 2 standalone: MSG91 ──
  if (channel === "msg91") {
    try {
      const sms = await sendViaMsg91(phone, code, purpose);
      if (sms.sent) return sms;
      attempts.push(sms);
    } catch (err) {
      console.error(`[otp-channel] MSG91 failed for ${maskPhone(phone)}: ${err.message}`);
      attempts.push({ sent: false, reason: "msg91_error", error: err.message });
    }
  }

  // ── Priority 3: Email fallback (always available) ──
  // This is the current active path. Once WhatsApp/MSG91 are live,
  // email becomes the last-resort fallback.
  try {
    const em = await sendViaEmail(recipientEmail, code, purpose);
    if (em.sent) {
      if (attempts.length > 0) {
        console.log(
          `[otp-channel] fell back to email for ${maskPhone(phone)} after ${attempts.length} failed channel(s)`
        );
      }
      return em;
    }
    attempts.push(em);
  } catch (err) {
    console.error(`[otp-channel] email failed for ${maskPhone(phone)}: ${err.message}`);
    attempts.push({ sent: false, reason: "email_error", error: err.message });
  }

  // All channels exhausted.
  console.error(
    `[otp-channel] all channels failed for ${maskPhone(phone)}: ${JSON.stringify(attempts)}`
  );
  return {
    sent: false,
    reason: "all_channels_failed",
    attempts,
  };
}

module.exports = {
  deliverOtp,
  normalizePhone,
  maskPhone,
  sendViaWhatsApp,
  sendViaMsg91,
  sendViaEmail,
};
