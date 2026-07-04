// IraGo drone rental routes. Mounted at /api/drones.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole } = require("./auth");

const router = express.Router();

const GST_RATE = 0.18;

function calcDronePrice(service, hours, withOperator) {
  const h = Math.max(service.minHours, Math.min(hours, service.maxHours));
  const servicePrice = service.pricePerHour * h;
  const operatorPrice = withOperator ? service.operatorPricePerHour * h : 0;
  const subtotal = servicePrice + operatorPrice;
  const gst = Math.round(subtotal * GST_RATE);
  const total = Math.round(subtotal + gst);
  return { hours: h, servicePrice, operatorPrice, gst, total };
}

// GET /api/drones/services — list all active drone services.
router.get("/services", async (req, res) => {
  const rows = await query(
    "SELECT * FROM drone_services WHERE active = 1 ORDER BY category, name"
  );
  res.json({ services: rows });
});

// GET /api/drones/services/:id — single service details.
router.get("/services/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid service id" });
  const service = await queryOne("SELECT * FROM drone_services WHERE id = ? AND active = 1", [id]);
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json({ service });
});

// POST /api/drones/quote — get price quote without booking.
router.post("/quote", async (req, res) => {
  const { serviceId, hours, withOperator } = req.body || {};
  const service = await queryOne("SELECT * FROM drone_services WHERE id = ? AND active = 1", [serviceId]);
  if (!service) return res.status(404).json({ error: "Service not found" });
  const h = Number(hours) || service.minHours;
  const price = calcDronePrice(service, h, Boolean(withOperator));
  res.json({
    service: { id: service.id, name: service.name, pricePerHour: service.pricePerHour, operatorPricePerHour: service.operatorPricePerHour },
    ...price,
    withOperator: Boolean(withOperator),
    operatorRequired: Boolean(service.operatorRequired),
  });
});

// GET /api/drones/operators — list available drone operators.
router.get("/operators", async (req, res) => {
  const rows = await query("SELECT * FROM drone_operators WHERE available = 1 ORDER BY rating DESC");
  res.json({ operators: rows });
});

// POST /api/drones/book — create a drone booking (customer only).
router.post("/book", requireAuth, requireRole("customer"), async (req, res) => {
  const b = req.body || {};
  const serviceId = Number(b.serviceId);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: "serviceId is required" });
  }
  const service = await queryOne("SELECT * FROM drone_services WHERE id = ? AND active = 1", [serviceId]);
  if (!service) return res.status(404).json({ error: "Service not found" });

  const hours = Number(b.hours) || service.minHours;
  const withOperator = service.operatorRequired ? true : Boolean(b.withOperator);
  const price = calcDronePrice(service, hours, withOperator);

  let operatorId = null;
  if (withOperator) {
    const op = await queryOne("SELECT id FROM drone_operators WHERE available = 1 ORDER BY rating DESC LIMIT 1");
    operatorId = op ? op.id : null;
  }

  const result = await query(
    `INSERT INTO drone_bookings
      (customerId, serviceId, operatorId, hours, servicePrice, operatorPrice, gst, totalPrice,
       withOperator, scheduledDate, scheduledTime, location, locationLat, locationLng, notes, status, paymentStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid')`,
    [
      req.user.id, serviceId, operatorId, price.hours,
      price.servicePrice, price.operatorPrice, price.gst, price.total,
      withOperator ? 1 : 0,
      b.scheduledDate || null, b.scheduledTime || null,
      b.location || null, b.locationLat || null, b.locationLng || null,
      b.notes || null,
    ]
  );

  const booking = await queryOne(
    `SELECT db.*, ds.name AS serviceName, ds.category, ds.imageEmoji,
            do2.name AS operatorName
     FROM drone_bookings db
     JOIN drone_services ds ON ds.id = db.serviceId
     LEFT JOIN drone_operators do2 ON do2.id = db.operatorId
     WHERE db.id = ?`,
    [result.insertId]
  );

  res.status(201).json({ booking });
});

// GET /api/drones/my-bookings — customer's drone bookings.
router.get("/my-bookings", requireAuth, requireRole("customer"), async (req, res) => {
  const rows = await query(
    `SELECT db.*, ds.name AS serviceName, ds.category, ds.imageEmoji,
            do2.name AS operatorName
     FROM drone_bookings db
     JOIN drone_services ds ON ds.id = db.serviceId
     LEFT JOIN drone_operators do2 ON do2.id = db.operatorId
     WHERE db.customerId = ?
     ORDER BY db.createdAt DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ bookings: rows });
});

// POST /api/drones/bookings/:id/cancel — cancel a drone booking.
router.post("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  const booking = await queryOne("SELECT * FROM drone_bookings WHERE id = ? AND customerId = ?", [id, req.user.id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "cancelled" || booking.status === "completed") {
    return res.status(409).json({ error: "Cannot cancel a " + booking.status + " booking" });
  }
  await query("UPDATE drone_bookings SET status = 'cancelled' WHERE id = ?", [id]);
  res.json({ message: "Drone booking cancelled.", bookingId: id });
});

// ── Admin drone routes ──────────────────────────────────────────────────

// GET /api/drones/admin/services — all services (active + inactive).
router.get("/admin/services", requireAuth, requireRole("admin"), async (req, res) => {
  const rows = await query("SELECT * FROM drone_services ORDER BY category, name");
  res.json({ services: rows });
});

// POST /api/drones/admin/services — create a new drone service.
router.post("/admin/services", requireAuth, requireRole("admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !b.pricePerHour) {
    return res.status(400).json({ error: "name, category, and pricePerHour are required" });
  }
  const result = await query(
    `INSERT INTO drone_services (name, category, description, specs, pricePerHour, operatorRequired, operatorPricePerHour, minHours, maxHours, imageEmoji)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.name, b.category, b.description || '', b.specs || null, Number(b.pricePerHour),
     b.operatorRequired ? 1 : 0, Number(b.operatorPricePerHour) || 0,
     Number(b.minHours) || 1, Number(b.maxHours) || 8, b.imageEmoji || '🛸']
  );
  const service = await queryOne("SELECT * FROM drone_services WHERE id = ?", [result.insertId]);
  res.status(201).json({ service });
});

// PATCH /api/drones/admin/services/:id — update a drone service.
router.patch("/admin/services/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const service = await queryOne("SELECT * FROM drone_services WHERE id = ?", [id]);
  if (!service) return res.status(404).json({ error: "Service not found" });
  const b = req.body || {};
  const fields = [];
  const params = [];
  for (const key of ["name", "category", "description", "specs", "imageEmoji"]) {
    if (b[key] !== undefined) { fields.push(`${key} = ?`); params.push(b[key]); }
  }
  for (const key of ["pricePerHour", "operatorPricePerHour", "minHours", "maxHours"]) {
    if (b[key] !== undefined) { fields.push(`${key} = ?`); params.push(Number(b[key])); }
  }
  if (b.operatorRequired !== undefined) { fields.push("operatorRequired = ?"); params.push(b.operatorRequired ? 1 : 0); }
  if (b.active !== undefined) { fields.push("active = ?"); params.push(b.active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: "No fields to update" });
  params.push(id);
  await query(`UPDATE drone_services SET ${fields.join(", ")} WHERE id = ?`, params);
  const updated = await queryOne("SELECT * FROM drone_services WHERE id = ?", [id]);
  res.json({ service: updated });
});

// GET /api/drones/admin/bookings — all drone bookings.
router.get("/admin/bookings", requireAuth, requireRole("admin"), async (req, res) => {
  const rows = await query(
    `SELECT db.*, ds.name AS serviceName, ds.category, ds.imageEmoji,
            do2.name AS operatorName, u.name AS customerName, u.email AS customerEmail
     FROM drone_bookings db
     JOIN drone_services ds ON ds.id = db.serviceId
     LEFT JOIN drone_operators do2 ON do2.id = db.operatorId
     JOIN users u ON u.id = db.customerId
     ORDER BY db.createdAt DESC LIMIT 100`
  );
  const stats = await queryOne(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN totalPrice ELSE 0 END), 0) AS revenue
     FROM drone_bookings`
  );
  res.json({ bookings: rows, stats });
});

// GET /api/drones/admin/operators — all drone operators.
router.get("/admin/operators", requireAuth, requireRole("admin"), async (req, res) => {
  const rows = await query("SELECT * FROM drone_operators ORDER BY name");
  res.json({ operators: rows });
});

// POST /api/drones/admin/operators — add a drone operator.
router.post("/admin/operators", requireAuth, requireRole("admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name is required" });
  const result = await query(
    `INSERT INTO drone_operators (name, email, phone, specialization, experienceYears, rating)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [b.name, b.email || null, b.phone || null, b.specialization || null,
     Number(b.experienceYears) || 1, Number(b.rating) || 4.5]
  );
  const op = await queryOne("SELECT * FROM drone_operators WHERE id = ?", [result.insertId]);
  res.status(201).json({ operator: op });
});

// PATCH /api/drones/admin/operators/:id — update a drone operator.
router.patch("/admin/operators/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const op = await queryOne("SELECT * FROM drone_operators WHERE id = ?", [id]);
  if (!op) return res.status(404).json({ error: "Operator not found" });
  const b = req.body || {};
  const fields = [];
  const params = [];
  for (const key of ["name", "email", "phone", "specialization"]) {
    if (b[key] !== undefined) { fields.push(`${key} = ?`); params.push(b[key]); }
  }
  for (const key of ["experienceYears", "rating"]) {
    if (b[key] !== undefined) { fields.push(`${key} = ?`); params.push(Number(b[key])); }
  }
  if (b.available !== undefined) { fields.push("available = ?"); params.push(b.available ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: "No fields to update" });
  params.push(id);
  await query(`UPDATE drone_operators SET ${fields.join(", ")} WHERE id = ?`, params);
  const updated = await queryOne("SELECT * FROM drone_operators WHERE id = ?", [id]);
  res.json({ operator: updated });
});

// PATCH /api/drones/admin/bookings/:id/status — update booking status.
router.patch("/admin/bookings/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!["pending", "confirmed", "in_progress", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  await query("UPDATE drone_bookings SET status = ? WHERE id = ?", [status, id]);
  res.json({ message: "Status updated", bookingId: id, status });
});

module.exports = router;
