// India-wide flight zone seed (GeoJSON polygons + altitude bands in metres AGL).
const { zonesQuery, zonesQueryOne } = require("./zones-db");
const { dbg } = require("./db");
const { INDIA_ZONES } = require("./india-zones-data");
const { bboxFromGeometry } = require("./zone-geometry");

const ZONE_TYPES = ["restricted", "no_fly"];

// Legacy Delhi-only names replaced by the national catalog (removed on sync).
const LEGACY_ZONE_NAMES = [
  "IGI Airport — no-fly",
  "Central Delhi — restricted",
  "NCR urban air corridor",
  "Gurugram approach — flight corridor",
];

async function upsertZone(z) {
  if (!ZONE_TYPES.includes(z.zoneType)) return "skip";

  const bbox = bboxFromGeometry(z.geometry);
  if (!bbox) return "skip";

  const existing = await zonesQueryOne("SELECT id FROM flight_zones WHERE name = ?", [
    z.name,
  ]);
  const geometry = JSON.stringify(z.geometry);
  const category = z.category || null;

  if (existing) {
    await zonesQuery(
      `UPDATE flight_zones
       SET zoneType = ?, minAltitudeM = ?, maxAltitudeM = ?, category = ?,
           minLat = ?, maxLat = ?, minLng = ?, maxLng = ?, geometry = ?
       WHERE id = ?`,
      [
        z.zoneType,
        z.minAltitudeM,
        z.maxAltitudeM,
        category,
        bbox.minLat,
        bbox.maxLat,
        bbox.minLng,
        bbox.maxLng,
        geometry,
        existing.id,
      ]
    );
    return "updated";
  }

  await zonesQuery(
    `INSERT INTO flight_zones
       (name, zoneType, minAltitudeM, maxAltitudeM, category, minLat, maxLat, minLng, maxLng, geometry)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      z.name,
      z.zoneType,
      z.minAltitudeM,
      z.maxAltitudeM,
      category,
      bbox.minLat,
      bbox.maxLat,
      bbox.minLng,
      bbox.maxLng,
      geometry,
    ]
  );
  return "inserted";
}

async function removeLegacyZones() {
  for (const name of LEGACY_ZONE_NAMES) {
    await zonesQuery("DELETE FROM flight_zones WHERE name = ?", [name]);
  }
  // flight_corridor zones were removed from the catalog — purge any that still
  // exist from earlier seeds so they don't linger on the map.
  await zonesQuery("DELETE FROM flight_zones WHERE zoneType = 'flight_corridor'");
}

// Idempotent sync: upserts the full India catalog on every boot.
async function seedFlightZones() {
  let inserted = 0;
  let updated = 0;

  await removeLegacyZones();

  for (const z of INDIA_ZONES) {
    const result = await upsertZone(z);
    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
  }

  const total = (await zonesQueryOne("SELECT COUNT(*) AS n FROM flight_zones")).n;
  dbg(
    `seedFlightZones: India catalog synced — ${inserted} inserted, ${updated} updated (${total} total)`
  );
  return { inserted, updated, total };
}

module.exports = { ZONE_TYPES, INDIA_ZONES, seedFlightZones };
