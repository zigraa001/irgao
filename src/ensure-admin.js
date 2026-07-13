// Ensure a hardcoded admin exists on every boot (Hostinger-friendly).
const { query, queryOne } = require("./db");
const { hashPassword } = require("./auth");

const HARDCODED_ADMIN_EMAIL = "admin@irago.in";
const HARDCODED_ADMIN_PASSWORD = "@IRAGO9air";

async function ensureAdmin() {
  const email = HARDCODED_ADMIN_EMAIL;
  const password = HARDCODED_ADMIN_PASSWORD;
  const passwordHash = await hashPassword(password);

  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [
    email,
  ]);

  if (existing) {
    await query(
      `UPDATE users
       SET name = ?, passwordHash = ?, role = 'admin',
           emailVerified = 1, deletedAt = NULL, bannedAt = NULL
       WHERE id = ?`,
      ["Admin", passwordHash, existing.id]
    );
    console.log(`[startup] admin ensured (updated): ${email}`);
    return { ok: true, email, action: "updated" };
  }

  await query(
    `INSERT INTO users (name, email, passwordHash, role, emailVerified)
     VALUES (?, ?, ?, 'admin', 1)`,
    ["Admin", email, passwordHash]
  );
  console.log(`[startup] admin ensured (created): ${email}`);
  return { ok: true, email, action: "created" };
}

module.exports = {
  ensureAdmin,
  HARDCODED_ADMIN_EMAIL,
  HARDCODED_ADMIN_PASSWORD,
};
