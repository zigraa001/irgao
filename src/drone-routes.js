// IraGo drone rental routes. Mounted at /api/drones.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole, USER_NOT_DELETED } = require("./auth");
const platformSettings = require("./platform-settings");
const {
  CAMPUS_POINTS,
  lookupCampusPoint,
  parseCampusRoute,
  computeDronePosition,
  etaRemainingMin,
  STATUS_LABELS,
  DRONE_ANIM_SPEED,
} = require("./campus-points");
const {
  generateTrackingKey,
  normalizeTrackingKey,
  trackUrl,
  sendDroneTrackEmail,
} = require("./drone-track");

const router = express.Router();

const DRONE_STATUSES = [
  "pending",
  "confirmed",
  "dispatched",
  "picked_up",
  "flying",
  "arriving",
  "delivered",
  "in_progress",
  "completed",
  "cancelled",
];

const ACTIVE_JOB_STATUSES = [
  "pending",
  "confirmed",
  "dispatched",
  "picked_up",
  "flying",
  "arriving",
  "in_progress",
];

const BOOKING_SELECT = `SELECT db.*, ds.name AS serviceName, ds.category, ds.imageEmoji,
            do2.name AS operatorName, u.name AS customerName, u.email AS customerEmail,
            disp.name AS dispatcherName,
            UNIX_TIMESTAMP(db.flightStartedAt) AS flightStartedUnix,
            UNIX_TIMESTAMP(db.gpsUpdatedAt) AS gpsUpdatedUnix
     FROM drone_bookings db
     JOIN drone_services ds ON ds.id = db.serviceId
     LEFT JOIN drone_operators do2 ON do2.id = db.operatorId
     LEFT JOIN users u ON u.id = db.customerId
     LEFT JOIN users disp ON disp.id = db.dispatcherUserId`;

async function loadBooking(id) {
  return queryOne(`${BOOKING_SELECT} WHERE db.id = ?`, [id]);
}

function trackPayload(booking) {
  const pos = computeDronePosition(booking);
  return {
    booking,
    drone: pos,
    etaRemainingMin: etaRemainingMin(booking),
    statusLabel: STATUS_LABELS[booking.status] || booking.status,
    trackingKey: booking.trackingKey || null,
  };
}

function campusCoordsFromBody(b) {
  const parsed = parseCampusRoute(b.location, b.pickupName, b.dropName);
  const from = parsed.from || lookupCampusPoint(b.pickupName);
  const to = parsed.to || lookupCampusPoint(b.dropName);
  return { from, to };
}

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

function isCampusService(service) {
  return !!(service && (service.category === "campus" || /campus drone delivery/i.test(service.name || "")));
}

function droneFareBreakdown(price) {
  return {
    base: price.servicePrice,
    operatorFee: price.operatorPrice,
    taxes: price.gst,
    taxLabel: "GST (18%)",
    subtotal: price.servicePrice + price.operatorPrice,
    total: price.total,
  };
}

async function pickCampusOperatorId() {
  const campusOp = await queryOne(
    "SELECT id FROM drone_operators WHERE available = 1 AND (email = 'arjun.campus@irago.in' OR specialization LIKE '%Campus%') ORDER BY rating DESC LIMIT 1"
  );
  if (campusOp) return campusOp.id;
  const any = await queryOne("SELECT id FROM drone_operators WHERE available = 1 ORDER BY rating DESC LIMIT 1");
  return any ? any.id : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const campusDemoRunning = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoRunCampusDemo(bookingId) {
  const id = Number(bookingId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!platformSettings.get("demoMode")) return;
  if (campusDemoRunning.has(id)) return;
  campusDemoRunning.add(id);
  try {
    const dispatcher = await queryOne(
      "SELECT id FROM users WHERE email = 'drone@irago.in' AND role = 'drone_operator' LIMIT 1"
    );
    await sleep(1200);
    let b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    if (!b || b.paymentStatus !== "paid") return;
    if (b.status === "confirmed" || b.status === "pending") {
      await query(
        `UPDATE drone_bookings
         SET status = 'dispatched',
             dispatcherUserId = COALESCE(dispatcherUserId, ?),
             droneCallsign = COALESCE(NULLIF(droneCallsign, ''), 'IITM-D1'),
             batteryPct = COALESCE(batteryPct, 94),
             etaMin = COALESCE(etaMin, 1)
         WHERE id = ? AND status IN ('confirmed', 'pending')`,
        [dispatcher ? dispatcher.id : null, id]
      );
    }
    await sleep(2500);
    b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    if (b && b.status === "dispatched") {
      await query(
        "UPDATE drone_bookings SET status = 'picked_up' WHERE id = ? AND status = 'dispatched'",
        [id]
      );
    }
    await sleep(2000);
    b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    if (b && b.status === "picked_up") {
      await query(
        `UPDATE drone_bookings
         SET status = 'flying', flightStartedAt = COALESCE(flightStartedAt, NOW())
         WHERE id = ? AND status = 'picked_up'`,
        [id]
      );
    }
    b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    const etaMin = Math.max(1, Number(b && b.etaMin) || 1);
    await sleep(etaMin * 60 * 1000 / DRONE_ANIM_SPEED + 1500);
    b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    if (b && b.status === "flying") {
      await query("UPDATE drone_bookings SET status = 'arriving' WHERE id = ? AND status = 'flying'", [id]);
    }
    await sleep(3500);
    b = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
    if (b && (b.status === "arriving" || b.status === "flying")) {
      await query(
        `UPDATE drone_bookings
         SET status = 'delivered',
             gpsLat = COALESCE(dropLat, gpsLat),
             gpsLng = COALESCE(dropLng, gpsLng),
             gpsUpdatedAt = NOW()
         WHERE id = ? AND status IN ('arriving', 'flying')`,
        [id]
      );
    }
  } catch (err) {
    console.error(`[drones] campus demo failed for #${id}:`, err.message);
  } finally {
    campusDemoRunning.delete(id);
  }
}

function maybeStartCampusDemo(booking) {
  if (!booking || !platformSettings.get("demoMode")) return;
  if (booking.paymentStatus !== "paid") return;
  if (!["confirmed", "pending", "dispatched", "picked_up"].includes(booking.status)) return;
  autoRunCampusDemo(booking.id).catch((err) => {
    console.error(`[drones] campus demo start failed for #${booking.id}:`, err.message);
  });
}

async function allocateTrackingKey() {
  for (let i = 0; i < 8; i += 1) {
    const key = generateTrackingKey();
    const clash = await queryOne("SELECT id FROM drone_bookings WHERE trackingKey = ?", [key]);
    if (!clash) return key;
  }
  throw new Error("Could not allocate tracking key");
}

async function ensureTrackingKey(booking) {
  if (!booking) return null;
  if (booking.trackingKey) return booking.trackingKey;
  const key = await allocateTrackingKey();
  await query(
    "UPDATE drone_bookings SET trackingKey = ? WHERE id = ? AND (trackingKey IS NULL OR trackingKey = '')",
    [key, booking.id]
  );
  booking.trackingKey = key;
  return key;
}

function publicTrackPayload(booking) {
  const full = trackPayload(booking);
  return {
    trackingKey: booking.trackingKey,
    statusLabel: full.statusLabel,
    etaRemainingMin: full.etaRemainingMin,
    drone: full.drone,
    booking: {
      id: booking.id,
      status: booking.status,
      pickupName: booking.pickupName,
      dropName: booking.dropName,
      parcelType: booking.parcelType,
      droneCallsign: booking.droneCallsign,
      notes: booking.notes,
      pickupLat: booking.pickupLat,
      pickupLng: booking.pickupLng,
      dropLat: booking.dropLat,
      dropLng: booking.dropLng,
      flightStartedAt: booking.flightStartedAt,
      etaMin: booking.etaMin,
      batteryPct: booking.batteryPct,
      serviceName: booking.serviceName,
      imageEmoji: booking.imageEmoji,
      location: booking.location,
    },
  };
}

async function mailTrackLink(req, booking) {
  const email = String(booking.recipientEmail || booking.customerEmail || "").trim().toLowerCase();
  if (!email) return { sent: false, reason: "NO_EMAIL" };
  const key = await ensureTrackingKey(booking);
  const mail = await sendDroneTrackEmail(email, {
    trackingKey: key,
    trackUrl: trackUrl(req, key),
    pickupName: booking.pickupName,
    dropName: booking.dropName,
    parcelType: booking.parcelType,
  });
  return { ...mail, trackingKey: key, trackUrl: trackUrl(req, key), email };
}

async function createCampusDropForEmail(req) {
  const b = req.body || {};
  const email = String(b.recipientEmail || b.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    const err = new Error("Enter the recipient's email.");
    err.status = 400;
    throw err;
  }

  const passenger = await queryOne(
    `SELECT id, name, email, role FROM users WHERE email = ? AND ${USER_NOT_DELETED}`,
    [email]
  );
  if (passenger && passenger.role !== "customer") {
    const err = new Error("That email is not a passenger account.");
    err.status = 409;
    throw err;
  }

  const service =
    (b.serviceId
      ? await queryOne("SELECT * FROM drone_services WHERE id = ? AND active = 1", [Number(b.serviceId)])
      : null) ||
    (await queryOne(
      "SELECT * FROM drone_services WHERE active = 1 AND (category = 'campus' OR name LIKE '%Campus Drone Delivery%') LIMIT 1"
    ));
  if (!service) {
    const err = new Error("Campus drone delivery is not configured.");
    err.status = 404;
    throw err;
  }

  const { from, to } = campusCoordsFromBody(b);
  if (!from || !to) {
    const err = new Error("Pick campus pickup and drop points.");
    err.status = 400;
    throw err;
  }
  if (from.name === to.name) {
    const err = new Error("Pickup and drop must be different.");
    err.status = 400;
    throw err;
  }

  const hours = Number(b.hours) || service.minHours;
  const price = calcDronePrice(service, hours, true);
  const operatorId = await pickCampusOperatorId();
  const droneCallsign = String(b.droneCallsign || b.droneId || "IITM-D1").trim().slice(0, 64) || "IITM-D1";
  const batteryPct = Math.min(100, Math.max(0, Number(b.batteryPct) || 92));
  const etaMin = Math.min(60, Math.max(1, Number(b.etaMin) || 8));
  const parcelType = b.parcelType || "food";
  const location = `${from.name} → ${to.name}, IIT Madras Campus`;
  const today = new Date().toISOString().slice(0, 10);
  const trackingKey = await allocateTrackingKey();

  const result = await query(
    `INSERT INTO drone_bookings
      (customerId, serviceId, operatorId, hours, servicePrice, operatorPrice, gst, totalPrice,
       withOperator, scheduledDate, scheduledTime, location, locationLat, locationLng, notes,
       status, paymentStatus,
       pickupName, dropName, pickupLat, pickupLng, dropLat, dropLng, parcelType,
       dispatcherUserId, droneCallsign, batteryPct, etaMin, dispatchNotes,
       trackingKey, recipientEmail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'dispatched', 'paid',
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      passenger ? passenger.id : null, service.id, operatorId, price.hours,
      price.servicePrice, price.operatorPrice, price.gst, price.total,
      b.scheduledDate || today, b.scheduledTime || null,
      location, from.lat, from.lng, b.notes || null,
      from.name, to.name, from.lat, from.lng, to.lat, to.lng, parcelType,
      req.user.id, droneCallsign, batteryPct, etaMin, b.dispatchNotes || b.notes || null,
      trackingKey, email,
    ]
  );

  const booking = await loadBooking(result.insertId);
  const mail = await mailTrackLink(req, booking);
  maybeStartCampusDemo(booking);
  return { payload: trackPayload(booking), mail };
}

// GET /api/drones/campus-points — IIT Madras drop pins for the live map.
router.get("/campus-points", (_req, res) => {
  const points = Object.entries(CAMPUS_POINTS).map(([name, coord]) => ({
    name,
    lat: coord[0],
    lng: coord[1],
  }));
  res.json({ points });
});

// GET /api/drones/services — list all active drone services.
router.get("/services", async (req, res) => {
  const rows = await query(
    "SELECT * FROM drone_services WHERE active = 1 ORDER BY (category = 'campus') DESC, category, name"
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

  const isCampus = isCampusService(service);
  if (isCampus) {
    return res.status(400).json({
      error: "Campus drops are sent by dispatch. Use the tracking key from your email.",
    });
  }
  const { from, to } = campusCoordsFromBody(b);

  let operatorId = null;
  if (withOperator || isCampus) {
    operatorId = await pickCampusOperatorId();
  }

  const location =
    isCampus && from && to
      ? `${from.name} → ${to.name}, IIT Madras Campus`
      : b.location || null;

  const result = await query(
    `INSERT INTO drone_bookings
      (customerId, serviceId, operatorId, hours, servicePrice, operatorPrice, gst, totalPrice,
       withOperator, scheduledDate, scheduledTime, location, locationLat, locationLng, notes, status, paymentStatus,
       pickupName, dropName, pickupLat, pickupLng, dropLat, dropLng, parcelType)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id, serviceId, operatorId, price.hours,
      price.servicePrice, price.operatorPrice, price.gst, price.total,
      withOperator || isCampus ? 1 : 0,
      b.scheduledDate || null, b.scheduledTime || null,
      location,
      from ? from.lat : (b.locationLat || null),
      from ? from.lng : (b.locationLng || null),
      b.notes || null,
      from ? from.name : (b.pickupName || null),
      to ? to.name : (b.dropName || null),
      from ? from.lat : null,
      from ? from.lng : null,
      to ? to.lat : null,
      to ? to.lng : null,
      b.parcelType || (isCampus ? "food" : null),
    ]
  );

  const booking = await loadBooking(result.insertId);
  res.status(201).json({
    booking,
    fare: droneFareBreakdown(price),
    track: trackPayload(booking),
  });
});

// POST /api/drones/:id/pay — dummy gateway, same pattern as air taxi.
router.post("/:id/pay", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const claim = await query(
    "UPDATE drone_bookings SET paymentStatus = 'paid', status = 'confirmed' WHERE id = ? AND paymentStatus = 'pending'",
    [id]
  );
  if (claim.affectedRows === 0) {
    const already = await loadBooking(id);
    maybeStartCampusDemo(already);
    return res.json({
      booking: already,
      fare: droneFareBreakdown({
        servicePrice: already.servicePrice,
        operatorPrice: already.operatorPrice,
        gst: already.gst,
        total: already.totalPrice,
      }),
      track: trackPayload(already),
      message: "Already paid",
    });
  }

  const updated = await loadBooking(id);
  maybeStartCampusDemo(updated);
  res.json({
    booking: updated,
    fare: droneFareBreakdown({
      servicePrice: updated.servicePrice,
      operatorPrice: updated.operatorPrice,
      gst: updated.gst,
      total: updated.totalPrice,
    }),
    track: trackPayload(updated),
    message: "Payment successful.",
  });
});

// GET /api/drones/my-bookings — customer's drone bookings.
router.get("/my-bookings", requireAuth, requireRole("customer"), async (req, res) => {
  const kind = String(req.query.kind || "all");
  const email = String(req.user.email || "").trim().toLowerCase();
  let extra = "";
  if (kind === "rental") {
    extra = " AND ds.category != 'campus' AND db.dispatcherUserId IS NULL AND (db.trackingKey IS NULL OR db.trackingKey = '')";
  } else if (kind === "delivery") {
    extra = " AND (ds.category = 'campus' OR db.dispatcherUserId IS NOT NULL OR (db.trackingKey IS NOT NULL AND db.trackingKey != ''))";
  }
  const rows = await query(
    `${BOOKING_SELECT}
     WHERE (db.customerId = ? OR LOWER(COALESCE(db.recipientEmail, '')) = ?)
     ${extra}
     ORDER BY db.createdAt DESC LIMIT 50`,
    [req.user.id, email]
  );
  res.json({ bookings: rows });
});

// GET /api/drones/follow/:key — public live track (no login). Tracking key from email.
router.get("/follow/:key", async (req, res) => {
  const key = normalizeTrackingKey(req.params.key);
  if (!key) return res.status(400).json({ error: "Tracking key is required." });
  const booking = await queryOne(`${BOOKING_SELECT} WHERE db.trackingKey = ?`, [key]);
  if (!booking) return res.status(404).json({ error: "No drone found for that tracking key." });
  maybeStartCampusDemo(booking);
  res.json(publicTrackPayload(booking));
});

// GET /api/drones/track/:id — live campus snapshot (customer / dispatcher / admin).
router.get("/track/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const booking = await loadBooking(id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const role = req.user.role;
  const allowed =
    role === "admin" ||
    role === "drone_operator" ||
    (role === "customer" && Number(booking.customerId) === req.user.id);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  if (booking.paymentStatus !== "paid" && role === "customer") {
    return res.status(409).json({ error: "Pay for this order to start live tracking." });
  }
  maybeStartCampusDemo(booking);
  res.json(trackPayload(booking));
});

// GET /api/drones/operator/jobs — campus dispatch queue.
router.get("/operator/jobs", requireAuth, requireRole("drone_operator"), async (_req, res) => {
  const rows = await query(
    `${BOOKING_SELECT}
     WHERE db.paymentStatus = 'paid'
       AND db.status IN (${ACTIVE_JOB_STATUSES.map(() => "?").join(",")})
     ORDER BY (ds.category = 'campus') DESC, db.createdAt DESC
     LIMIT 80`,
    ACTIVE_JOB_STATUSES
  );
  rows.forEach((row) => maybeStartCampusDemo(row));
  res.json({ jobs: rows.map((row) => trackPayload(row)) });
});

// POST /api/drones/operator/send — pad starts a drop for any recipient email.
router.post("/operator/send", requireAuth, requireRole("drone_operator"), async (req, res) => {
  try {
    const { payload, mail } = await createCampusDropForEmail(req);
    res.status(201).json({
      ...payload,
      trackingKey: mail.trackingKey,
      trackUrl: mail.trackUrl,
      emailed: mail.sent,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[drones] operator send failed:", err.message);
    res.status(status).json({ error: err.message || "Could not send this drop." });
  }
});

// POST /api/drones/admin/send — same drop, from admin console.
router.post("/admin/send", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { payload, mail } = await createCampusDropForEmail(req);
    res.status(201).json({
      ...payload,
      trackingKey: mail.trackingKey,
      trackUrl: mail.trackUrl,
      emailed: mail.sent,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[drones] admin send failed:", err.message);
    res.status(status).json({ error: err.message || "Could not send this drop." });
  }
});

// POST /api/drones/operator/jobs/:id/dispatch — fill drone ID, battery, ETA.
router.post("/operator/jobs/:id/dispatch", requireAuth, requireRole("drone_operator"), async (req, res) => {
  const id = Number(req.params.id);
  const booking = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["pending", "confirmed"].includes(booking.status)) {
    return res.status(409).json({ error: "This order is already dispatched." });
  }
  const b = req.body || {};
  const droneCallsign = String(b.droneCallsign || b.droneId || "").trim().slice(0, 64);
  if (!droneCallsign) {
    return res.status(400).json({ error: "droneCallsign is required (e.g. IITM-D1)." });
  }
  const batteryPct = Math.min(100, Math.max(0, Number(b.batteryPct) || 90));
  const etaMin = Math.min(60, Math.max(1, Number(b.etaMin) || 8));
  const dispatchNotes = b.notes || b.dispatchNotes || null;

  await query(
    `UPDATE drone_bookings
     SET status = 'dispatched', dispatcherUserId = ?, droneCallsign = ?, batteryPct = ?,
         etaMin = ?, dispatchNotes = ?
     WHERE id = ?`,
    [req.user.id, droneCallsign, batteryPct, etaMin, dispatchNotes, id]
  );
  const updated = await loadBooking(id);
  res.json(trackPayload(updated));
});

// POST /api/drones/operator/jobs/:id/status — advance the delivery.
router.post("/operator/jobs/:id/status", requireAuth, requireRole("drone_operator"), async (req, res) => {
  const id = Number(req.params.id);
  const next = String((req.body || {}).status || "");
  const booking = await queryOne("SELECT * FROM drone_bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const allowed = {
    dispatched: ["picked_up"],
    picked_up: ["flying"],
    flying: ["arriving"],
    arriving: ["delivered", "completed"],
    in_progress: ["arriving", "delivered", "completed"],
  };
  const okNext = allowed[booking.status] || [];
  if (!okNext.includes(next)) {
    return res.status(409).json({
      error: `Cannot move from ${booking.status} to ${next || "(empty)"}.`,
    });
  }

  const fields = ["status = ?"];
  const params = [next];
  if (next === "flying") {
    fields.push("flightStartedAt = COALESCE(flightStartedAt, NOW())");
  }
  if (next === "delivered" || next === "completed") {
    fields.push("gpsLat = COALESCE(dropLat, gpsLat)");
    fields.push("gpsLng = COALESCE(dropLng, gpsLng)");
    fields.push("gpsUpdatedAt = NOW()");
  }
  params.push(id);
  await query(`UPDATE drone_bookings SET ${fields.join(", ")} WHERE id = ?`, params);
  const updated = await loadBooking(id);
  res.json(trackPayload(updated));
});

// POST /api/drones/operator/jobs/:id/location — live GPS ping from the pad.
router.post("/operator/jobs/:id/location", requireAuth, requireRole("drone_operator"), async (req, res) => {
  const id = Number(req.params.id);
  const lat = Number((req.body || {}).lat);
  const lng = Number((req.body || {}).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  const booking = await queryOne("SELECT id FROM drone_bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  await query(
    "UPDATE drone_bookings SET gpsLat = ?, gpsLng = ?, gpsUpdatedAt = NOW() WHERE id = ?",
    [lat, lng, id]
  );
  const updated = await loadBooking(id);
  res.json(trackPayload(updated));
});

async function handleResendTrack(req, res, booking) {
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const mail = await mailTrackLink(req, booking);
  if (!mail.email) {
    return res.status(400).json({ error: "This drop has no recipient email." });
  }
  res.json({
    emailed: mail.sent,
    trackingKey: mail.trackingKey,
    trackUrl: mail.trackUrl,
    reason: mail.reason || null,
  });
}

router.post("/operator/jobs/:id/resend-track", requireAuth, requireRole("drone_operator"), async (req, res) => {
  const booking = await loadBooking(Number(req.params.id));
  return handleResendTrack(req, res, booking);
});

router.post("/admin/bookings/:id/resend-track", requireAuth, requireRole("admin"), async (req, res) => {
  const booking = await loadBooking(Number(req.params.id));
  return handleResendTrack(req, res, booking);
});

// POST /api/drones/bookings/:id/cancel — cancel a drone booking.
router.post("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  const booking = await queryOne("SELECT * FROM drone_bookings WHERE id = ? AND customerId = ?", [id, req.user.id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (["cancelled", "completed", "delivered", "flying", "arriving"].includes(booking.status)) {
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
  const filter = String(req.query.filter || "all");
  let where = "";
  if (filter === "live" || filter === "inflight") {
    where = `WHERE db.status IN ('pending','confirmed','dispatched','picked_up','flying','arriving','in_progress')`;
  } else if (filter === "done") {
    where = `WHERE db.status IN ('delivered','completed')`;
  } else if (filter === "cancelled") {
    where = `WHERE db.status = 'cancelled'`;
  }
  const rows = await query(
    `${BOOKING_SELECT}
     ${where}
     ORDER BY db.createdAt DESC
     LIMIT 100`
  );
  const stats = await queryOne(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status IN ('pending','confirmed','dispatched','picked_up','flying','arriving','in_progress') THEN 1 ELSE 0 END) AS live,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status IN ('delivered','completed') THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN totalPrice ELSE 0 END), 0) AS revenue
     FROM drone_bookings`
  );
  res.json({ bookings: rows, stats, total: rows.length });
});

// GET /api/drones/admin/live — active campus drops for the admin live map.
router.get("/admin/live", requireAuth, requireRole("admin"), async (_req, res) => {
  const rows = await query(
    `${BOOKING_SELECT}
     WHERE db.paymentStatus = 'paid'
       AND db.status IN ('pending','confirmed','dispatched','picked_up','flying','arriving','in_progress')
     ORDER BY db.createdAt DESC
     LIMIT 50`
  );
  rows.forEach((row) => maybeStartCampusDemo(row));
  res.json({
    deliveries: rows.map((row) => trackPayload(row)),
    campusPoints: CAMPUS_POINTS,
  });
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
  if (!DRONE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  await query("UPDATE drone_bookings SET status = ? WHERE id = ?", [status, id]);
  res.json({ message: "Status updated", bookingId: id, status });
});

module.exports = router;
