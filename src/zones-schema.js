// Airspace catalog schema — lives in the dedicated zones database (see zones-db.js).
const { zonesQuery, zonesQueryOne } = require("./zones-db");
const { dbg } = require("./db");
const { bboxFromGeometry } = require("./zone-geometry");

const FLIGHT_ZONES_DDL = `CREATE TABLE IF NOT EXISTS flight_zones (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  zoneType     VARCHAR(32)  NOT NULL,
  minAltitudeM INT          NOT NULL DEFAULT 0,
  maxAltitudeM INT          NOT NULL DEFAULT 500,
  minLat       DOUBLE       NOT NULL,
  maxLat       DOUBLE       NOT NULL,
  minLng       DOUBLE       NOT NULL,
  maxLng       DOUBLE       NOT NULL,
  geometry     LONGTEXT     NOT NULL,
  createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_zones_type (zoneType),
  INDEX idx_zones_bbox (minLat, maxLat, minLng, maxLng)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

async function ensureColumn(table, column, definition) {
  const rows = await zonesQuery(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (rows.length === 0) {
    await zonesQuery(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    dbg(`[zones-schema] added ${table}.${column}`);
  }
}

async function backfillZoneBboxes() {
  const rows = await zonesQuery(
    `SELECT id, geometry FROM flight_zones
     WHERE minLat = 0 AND maxLat = 0 AND minLng = 0 AND maxLng = 0`
  );
  for (const row of rows) {
    let geometry = null;
    try {
      geometry = JSON.parse(row.geometry);
    } catch {
      continue;
    }
    const bbox = bboxFromGeometry(geometry);
    if (!bbox) continue;
    await zonesQuery(
      `UPDATE flight_zones
       SET minLat = ?, maxLat = ?, minLng = ?, maxLng = ?
       WHERE id = ?`,
      [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng, row.id]
    );
  }
}

async function initZonesSchema() {
  dbg("[zones-schema] ensuring flight_zones table in zones database ...");
  await zonesQuery(FLIGHT_ZONES_DDL);
  await ensureColumn("flight_zones", "minLat", "minLat DOUBLE NOT NULL DEFAULT 0");
  await ensureColumn("flight_zones", "maxLat", "maxLat DOUBLE NOT NULL DEFAULT 0");
  await ensureColumn("flight_zones", "minLng", "minLng DOUBLE NOT NULL DEFAULT 0");
  await ensureColumn("flight_zones", "maxLng", "maxLng DOUBLE NOT NULL DEFAULT 0");
  try {
    await zonesQuery(
      "CREATE INDEX idx_zones_bbox ON flight_zones (minLat, maxLat, minLng, maxLng)"
    );
  } catch (err) {
    dbg(`[zones-schema] idx_zones_bbox note: ${err.message}`);
  }
  await ensureColumn("flight_zones", "category", "category VARCHAR(64) NULL");
  await backfillZoneBboxes();
  const { seedFlightZones } = require("./seed-zones");
  await seedFlightZones();
  const total = (await zonesQueryOne("SELECT COUNT(*) AS n FROM flight_zones")).n;
  dbg(`[zones-schema] done (${total} zone(s) in catalog)`);
}

module.exports = { initZonesSchema };
