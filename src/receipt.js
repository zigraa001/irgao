// Ride receipt / invoice email.
//
// Payment is mocked, but the customer still gets a real emailed receipt on
// payment (and on completion if we later re-invoice). Reuses the SMTP
// transport from email.js so there's a single configured mailer.
const { getTransporter, fromAddress, isConfigured, maskEmail } = require("./email");
const { fareBreakdown } = require("./fare-breakdown");

function money(n) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function buildReceipt({ booking, fare, customerName }) {
  const fb = fare || fareBreakdown(booking.service, booking.distanceKm);
  const timeFmt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const created = booking.createdAt ? timeFmt.format(new Date(booking.createdAt)) : "—";

  const lines = [
    `Booking #${booking.id}`,
    customerName ? `Customer: ${customerName}` : null,
    `From: ${booking.pickupName}`,
    `To: ${booking.destName}`,
    `Service: ${booking.service}`,
    `Distance: ${fb.distanceKm} km`,
    "",
    "Fare breakdown",
    `  Base fare:        ${money(fb.base)}`,
    `  Per-km (${money(fb.perKm)}/km × ${fb.distanceKm} km): ${money(fb.kmCharge)}`,
    fb.surge ? `  Surge:            ${money(fb.surge)}` : null,
    fb.taxes ? `  Taxes:            ${money(fb.taxes)}` : null,
    `  Subtotal:         ${money(fb.subtotal)}`,
    `  Total:            ${money(fb.total)}`,
    "",
    `Carbon saved: ${Number(booking.carbonSavedKg || 0).toFixed(2)} kg`,
    "",
    "Payment is currently in mock mode — no real charge has been made.",
    "— IraGo",
  ].filter(Boolean);

  const text = lines.join("\n");

  const row = (label, val) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555;">${label}</td>` +
    `<td style="padding:4px 0;text-align:right;font-weight:600;">${val}</td></tr>`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">IraGo Receipt</h2>
      <p style="color:#888;margin-top:0;">Booking #${booking.id} · ${created}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 0;color:#555;">From</td><td style="text-align:right;">${booking.pickupName}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">To</td><td style="text-align:right;">${booking.destName}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Service</td><td style="text-align:right;">${booking.service}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Distance</td><td style="text-align:right;">${fb.distanceKm} km</td></tr>
      </table>
      <h3 style="margin-bottom:6px;">Fare breakdown</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Base fare", money(fb.base))}
        ${row(`Per-km (${money(fb.perKm)}/km × ${fb.distanceKm} km)`, money(fb.kmCharge))}
        ${fb.surge ? row("Surge", money(fb.surge)) : ""}
        ${fb.taxes ? row("Taxes", money(fb.taxes)) : ""}
        ${row("Subtotal", money(fb.subtotal))}
        <tr><td colspan="2" style="border-top:1px solid #eee;padding-top:8px;"></td></tr>
        ${row("Total", money(fb.total))}
      </table>
      <p style="color:#999;font-size:12px;margin-top:24px;">
        Carbon saved: ${Number(booking.carbonSavedKg || 0).toFixed(2)} kg ·
        Payment is in mock mode — no real charge has been made.
      </p>
      <p style="color:#aaa;font-size:12px;">— IraGo</p>
    </div>`;

  return { subject: `IraGo receipt — booking #${booking.id}`, text, html };
}

async function sendReceiptEmail(to, payload) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured");
  }
  const { subject, text, html } = buildReceipt(payload);
  const info = await transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
  console.log(
    `[email] Receipt sent to ${maskEmail(to)} for booking #${payload.booking.id}` +
      (info.messageId ? ` id=${info.messageId}` : "")
  );
  return info;
}

module.exports = { sendReceiptEmail, buildReceipt, isEmailConfigured: isConfigured };
