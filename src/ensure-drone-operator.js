// Ensure a campus drone-operator login exists on every boot.
const { query, queryOne } = require("./db");
const { hashPassword } = require("./auth");

const HARDCODED_DRONE_OP_EMAIL = "drone@irago.in";
const HARDCODED_DRONE_OP_PASSWORD = "test@321";
const HARDCODED_DRONE_OP_NAME = "Arjun Iyer";

async function ensureDroneOperator() {
  const email = HARDCODED_DRONE_OP_EMAIL;
  const passwordHash = await hashPassword(HARDCODED_DRONE_OP_PASSWORD);

  const existing = await queryOne("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    await query(
      `UPDATE users
       SET name = ?, passwordHash = ?, role = 'drone_operator',
           emailVerified = 1, deletedAt = NULL, bannedAt = NULL
       WHERE id = ?`,
      [HARDCODED_DRONE_OP_NAME, passwordHash, existing.id]
    );
    console.log(`[startup] drone operator ensured (updated): ${email}`);
    return { ok: true, email, action: "updated" };
  }

  await query(
    `INSERT INTO users (name, email, passwordHash, role, emailVerified)
     VALUES (?, ?, ?, 'drone_operator', 1)`,
    [HARDCODED_DRONE_OP_NAME, email, passwordHash]
  );
  console.log(`[startup] drone operator ensured (created): ${email}`);
  return { ok: true, email, action: "created" };
}

module.exports = {
  ensureDroneOperator,
  HARDCODED_DRONE_OP_EMAIL,
  HARDCODED_DRONE_OP_PASSWORD,
};
