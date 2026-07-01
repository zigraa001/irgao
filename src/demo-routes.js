// Demo mode: auto-runs a full ride lifecycle for the logged-in customer.
// Finds or creates a demo pilot, creates a paid booking, then advances
// through every status automatically with realistic delays.
const express = require("express");
const router = express.Router();
const { query, queryOne } = require("./db");
const { requireAuth, requireRole, hashPassword } = require("./auth");
const { haversineKm, estimateFare } = require("./pricing");
const { fareBreakdown } = require("./fare-breakdown");
const { pushCustomer } = require("./dispatch-hub");
const { planAvoidanceRoute } = require("./route-planner");
const { routeEnvelope } = require("./zone-geometry");
const { queryZonesInBounds } = require("./zone-routes");
const { pointInPolygon } = require("./fuel-route");

function inNoFly(zones, lat, lng) {
  return zones.some(
    (z) => z.zoneType === "no_fly" && z.geometry && pointInPolygon(lng, lat, z.geometry)
  );
}

function segmentCrossesNoFly(zones, aLat, aLng, bLat, bLng) {
  for (let t = 0; t <= 1; t += 0.04) {
    const lat = aLat + (bLat - aLat) * t;
    const lng = aLng + (bLng - aLng) * t;
    if (inNoFly(zones, lat, lng)) return true;
  }
  return false;
}

// Pick a pilot spawn point ~4.5 km from pickup that is itself OUTSIDE every
// no-fly zone AND whose straight line in to the pickup doesn't cross one — so
// the fly-in never starts inside or passes through a red zone. Tries 8 compass
// bearings and falls back to the NE offset if none are clear.
async function findClearSpawn(pickupLat, pickupLng) {
  const DEG = 0.030; // ~4.5 km combined offset
  let zones = [];
  try {
    zones = await queryZonesInBounds(
      routeEnvelope(pickupLat - DEG, pickupLng - DEG, pickupLat + DEG, pickupLng + DEG)
    );
  } catch (e) {
    return [pickupLat + DEG, pickupLng + DEG]; // no zone data → original behaviour
  }
  const latScale = Math.cos((pickupLat * Math.PI) / 180) || 1;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * 2 * Math.PI;
    const lat = pickupLat + Math.cos(ang) * DEG;
    const lng = pickupLng + (Math.sin(ang) * DEG) / latScale;
    if (!inNoFly(zones, lat, lng) && !segmentCrossesNoFly(zones, lat, lng, pickupLat, pickupLng)) {
      return [lat, lng];
    }
  }
  return [pickupLat + DEG, pickupLng + DEG];
}

// Compute the no-fly-avoiding waypoints for the in-flight leg, so the demo
// plane curves AROUND red no-fly zones instead of flying straight through them.
// Degrades to a straight [pickup, dest] line if zones/planner are unavailable.
async function avoidanceWaypoints(pickupLat, pickupLng, destLat, destLng) {
  try {
    const zones = await queryZonesInBounds(
      routeEnvelope(pickupLat, pickupLng, destLat, destLng)
    );
    const plan = planAvoidanceRoute({
      pickupLat, pickupLng, destLat, destLng, zones, service: "taxi",
    });
    if (plan && plan.feasible && Array.isArray(plan.waypoints) && plan.waypoints.length >= 2) {
      return plan.waypoints.map((w) => [w.lat, w.lng]);
    }
  } catch (e) {
    console.error("[demo] avoidance route failed, flying straight:", e.message);
  }
  return [[pickupLat, pickupLng], [destLat, destLng]];
}

// Track which bookings have an active demo sequence running in-memory.
// Prevents duplicate demo runs on page refresh while the original is
// still advancing. Entries are removed on completion/abort.
const activeDemoBookings = new Set();

const DEMO_PILOTS = [
  { name: "Capt. Arjun Mehta",     license: "DGCA-ATPL-4821",  hours: 2400, rating: 4.9 },
  { name: "Capt. Vikram Singh",    license: "DGCA-ATPL-3917",  hours: 3100, rating: 4.8 },
  { name: "Capt. Priya Sharma",    license: "DGCA-ATPL-5203",  hours: 1800, rating: 5.0 },
  { name: "Capt. Rohan Desai",     license: "DGCA-ATPL-2746",  hours: 2900, rating: 4.7 },
  { name: "Capt. Ananya Rao",      license: "DGCA-ATPL-6058",  hours: 2200, rating: 4.9 },
  { name: "Capt. Kabir Malhotra",  license: "DGCA-ATPL-3384",  hours: 3500, rating: 4.8 },
  { name: "Capt. Neha Kapoor",     license: "DGCA-ATPL-4492",  hours: 2600, rating: 5.0 },
  { name: "Capt. Aditya Nair",     license: "DGCA-ATPL-1835",  hours: 4100, rating: 4.9 },
];

const DEMO_AIRCRAFT = [
  { type: "IraGo X1 eVTOL",  reg: "VT-IRA001" },
  { type: "IraGo X1 eVTOL",  reg: "VT-IRA004" },
  { type: "IraGo S2 eVTOL",  reg: "VT-IRA007" },
  { type: "IraGo S2 eVTOL",  reg: "VT-IRA012" },
];

const DEMO_PILOT = {
  email: "demo-pilot@irago.internal",
  password: "DemoIraGo@2025",
};

const DEMO_COMPANY = "IraGo Air Mobility";

function demoPilotProfile(bookingId) {
  const p = DEMO_PILOTS[bookingId % DEMO_PILOTS.length];
  const aircraft = DEMO_AIRCRAFT[bookingId % DEMO_AIRCRAFT.length];
  return {
    name: p.name, license: p.license, flightHours: p.hours, rating: p.rating,
    aircraftType: aircraft.type, aircraftReg: aircraft.reg,
    companyName: DEMO_COMPANY,
  };
}

// Demo routes — each has a pilot spawn point just next to the pickup
const DEMO_SCENARIOS = [
  {
    pickupName: "Noida Sec 62 Vertiport",
    pickupLat: 28.6270, pickupLng: 77.3650,
    destName: "Gurugram Cyber Hub",
    destLat: 28.4950, destLng: 77.0880,
    city: "Delhi NCR",
  },
  {
    pickupName: "Thane Vertiport, Mumbai",
    pickupLat: 19.2183, pickupLng: 72.9781,
    destName: "Navi Mumbai Vertiport",
    destLat: 19.0330, destLng: 73.0297,
    city: "Mumbai",
  },
  {
    pickupName: "Whitefield Vertiport, Bengaluru",
    pickupLat: 12.9698, pickupLng: 77.7499,
    destName: "Electronic City Vertiport, Bengaluru",
    destLat: 12.8399, destLng: 77.6770,
    city: "Bengaluru",
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setBookingStatus(bookingId, status, extra = {}, pilotPayload = null) {
  const cols = ["status = ?", "updatedAt = NOW()"];
  const vals = [status];
  for (const [k, v] of Object.entries(extra)) {
    // Sentinel: write MySQL NOW() (server timezone) rather than a JS Date, so
    // timestamp columns match the rest of the row and the cancellation grace
    // window reads them consistently (Node TZ ≠ MySQL TZ otherwise).
    if (v === "__NOW__") {
      cols.push(`${k} = NOW()`);
      continue;
    }
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(bookingId);
  await query(`UPDATE bookings SET ${cols.join(", ")} WHERE id = ?`, vals);
  const b = await queryOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
  const payload = { status, booking: b };
  if (pilotPayload) payload.pilot = pilotPayload;
  pushCustomer(bookingId, "ride_update", payload);
}

// True once the passenger has cancelled (or the booking otherwise left the
// active set). The demo loop polls this so a cancelled ride stops moving its
// plane and the pilot is retired instead of flying on regardless.
async function isAborted(bookingId) {
  const b = await queryOne("SELECT status FROM bookings WHERE id = ?", [bookingId]);
  return !b || ["cancelled", "completed", "rejected", "no_pilot"].includes(b.status);
}

// Smoothly fly the pilot marker from its current GPS to a target point over a
// fixed number of GPS pushes. Each push moves the DB position and emits a
// ride_gps event the passenger's map animates between. Stops early if the ride
// is cancelled mid-flight.
async function flyPilotTo(bookingId, operatorId, fromLat, fromLng, toLat, toLng, steps, stepMs) {
  for (let i = 1; i <= steps; i++) {
    await sleep(stepMs);
    if (await isAborted(bookingId)) return false;
    const frac = i / steps;
    const lat = fromLat + (toLat - fromLat) * frac;
    const lng = fromLng + (toLng - fromLng) * frac;
    await query("UPDATE users SET gpsLat=?, gpsLng=?, gpsUpdatedAt=NOW() WHERE id=?", [lat, lng, operatorId]);
    const distanceKm = haversineKm(lat, lng, toLat, toLng);
    pushCustomer(bookingId, "ride_gps", { lat, lng, distanceKm });
  }
  return true;
}

// Fly through a polyline of [lat,lng] waypoints, distributing `totalSteps`
// GPS pushes across the legs by length so the speed is roughly constant.
// Returns false if aborted mid-flight.
async function flyPilotAlong(bookingId, operatorId, waypoints, totalSteps, stepMs) {
  const legLens = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineKm(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
    legLens.push(d);
    total += d;
  }
  if (total === 0) return true;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const legSteps = Math.max(2, Math.round((legLens[i] / total) * totalSteps));
    const ok = await flyPilotTo(
      bookingId, operatorId,
      waypoints[i][0], waypoints[i][1],
      waypoints[i + 1][0], waypoints[i + 1][1],
      legSteps, stepMs
    );
    if (!ok) return false;
  }
  return true;
}

async function runDemoSequence(bookingId, operatorId, scenario) {
  const log = (msg) => console.log(`[demo booking#${bookingId}] ${msg}`);

  // Guard: don't run a second demo for the same booking (e.g. page refresh
  // while the original sequence is still in progress).
  if (activeDemoBookings.has(bookingId)) {
    log("demo already running — skipping duplicate");
    return;
  }
  activeDemoBookings.add(bookingId);

  try {
    const pilotRow = await queryOne("SELECT id, name, gpsLat, gpsLng, aircraftType, aircraftReg FROM users WHERE id = ?", [operatorId]);
    if (!pilotRow) return;
    const b = await queryOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
    if (!b) return;

    // OTP is generated up front so it can be shown to the passenger the moment
    // the pilot is assigned (used at pickup, like a real ride).
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const profile = demoPilotProfile(bookingId);
    const pilotInfo = {
      id: pilotRow.id, name: pilotRow.name, lat: pilotRow.gpsLat, lng: pilotRow.gpsLng,
      aircraftType: pilotRow.aircraftType, aircraftReg: pilotRow.aircraftReg,
      license: profile.license, flightHours: profile.flightHours,
      rating: profile.rating, companyName: profile.companyName,
    };

    // The per-booking demo pilot is retired (off-duty + GPS cleared) in the
    // finally block below — covers completion, every abort-return, and errors.

    // ── 1) "Request sent to operator" — hold ~3s on dispatching ────────────
    await sleep(3000);
    if (await isAborted(bookingId)) return log("aborted before assign"); // finally retires pilot

    // ── 2) Assigned: show operator info + ETA + OTP, then pilot departs ─────
    const etaMin = Math.max(2, Math.round(haversineKm(pilotRow.gpsLat, pilotRow.gpsLng, b.pickupLat, b.pickupLng) / 2.5));
    await setBookingStatus(
      bookingId,
      "assigned",
      { operatorId, rideOtp: otp, assignedAt: "__NOW__", estimatedPickupMin: etaMin },
      pilotInfo
    );
    // Also push the ETA to the customer stream.
    pushCustomer(bookingId, "ride_update", {
      bookingId,
      status: "assigned",
      operatorId,
      estimatedPickupMin: etaMin,
      pilot: pilotInfo,
    });
    log("assigned (operator info + ETA " + etaMin + " min + OTP shown)");
    await sleep(1500);
    if (await isAborted(bookingId)) return log("aborted at assign"); // finally retires pilot
    await setBookingStatus(bookingId, "enroute", {}, pilotInfo);
    log("enroute — pilot flying to pickup");

    // ── 3) Plane flies IN from its spawn (~4.5 km out) to the pickup ───────
    // 20 steps over ~20s — a clearly visible approach.
    if (!(await flyPilotTo(
      bookingId, operatorId,
      pilotRow.gpsLat, pilotRow.gpsLng,
      b.pickupLat, b.pickupLng,
      20, 1000
    ))) return log("aborted during fly-in"); // finally retires pilot

    // ── 4) Arrived at pickup — passenger shares OTP. Long hold (~10s) gives a
    // real window to cancel before boarding. ──────────────────────────────
    await setBookingStatus(bookingId, "at_pickup", {}, pilotInfo);
    log("at_pickup");
    await sleep(10000);
    if (await isAborted(bookingId)) return log("aborted at pickup"); // finally retires pilot

    // ── 5) OTP verified, passenger boards ─────────────────────────────────
    await setBookingStatus(bookingId, "picked_up", { rideOtpVerified: 1 }, pilotInfo);
    log("picked_up (otp auto-verified)");
    await sleep(2500);

    // ── 6) In flight — carry the passenger to the destination, following the
    // no-fly-avoiding waypoints so the plane curves AROUND red zones instead of
    // cutting straight through them. ──────────────────────────────────────────
    await setBookingStatus(bookingId, "flying", {}, pilotInfo);
    log("flying to destination");
    const route = await avoidanceWaypoints(b.pickupLat, b.pickupLng, b.destLat, b.destLng);
    // Send the curved flight path to the client so it can draw it on the map.
    pushCustomer(bookingId, "ride_path", { waypoints: route });
    await flyPilotAlong(bookingId, operatorId, route, 24, 1100);

    // ── 7) Arrived ────────────────────────────────────────────────────────
    await setBookingStatus(bookingId, "completed", {}, pilotInfo);
    log("completed ✓");
  } catch (e) {
    console.error(`[demo booking#${bookingId}] sequence error:`, e.message);
  } finally {
    activeDemoBookings.delete(bookingId);
    // ALWAYS retire the per-booking pilot — covers the success path, every
    // early abort-return, AND a mid-sequence throw. The pilot is single-use, so
    // it never needs to stay on duty after this function exits. Without this,
    // an error mid-flight left the pilot onDuty=1 with GPS forever (it then
    // polluted the real dispatcher and the nearby fleet).
    try {
      await query("UPDATE users SET onDuty=0, gpsLat=NULL, gpsLng=NULL WHERE id=?", [operatorId]);
    } catch (e2) {
      console.error(`[demo booking#${bookingId}] retire pilot failed:`, e2.message);
    }
  }
}

// POST /api/demo/start
// Starts an automated demo ride for the logged-in customer.
router.post("/start", requireAuth, requireRole("customer"), async (req, res) => {
  const customerId = req.user.id;

  // Block if customer already has an active booking
  const existing = await queryOne(
    `SELECT id, status FROM bookings
     WHERE customerId = ? AND status IN ('dispatching','assigned','accepted','enroute','at_pickup','picked_up','flying')
     LIMIT 1`,
    [customerId]
  );
  if (existing) {
    return res.status(409).json({
      error: "You already have an active ride. Cancel it first to start a demo.",
      bookingId: existing.id,
    });
  }

  // Pick scenario
  const idx = Number(req.body?.scenario || 0) % DEMO_SCENARIOS.length;
  const scenario = DEMO_SCENARIOS[idx];

  // Find a regional office near the scenario city
  const office = await queryOne(
    `SELECT ro.id AS officeId, ro.companyId
     FROM regional_offices ro
     JOIN operator_companies oc ON oc.id = ro.companyId
     WHERE ro.city = ? LIMIT 1`,
    [scenario.city]
  ).catch(() => null) || await queryOne(
    `SELECT ro.id AS officeId, ro.companyId FROM regional_offices ro LIMIT 1`
  ).catch(() => null);

  // Create booking (already paid — demo skips payment screen)
  const distanceKm = Math.round(
    haversineKm(scenario.pickupLat, scenario.pickupLng, scenario.destLat, scenario.destLng) * 10
  ) / 10;
  const fareEstimate = estimateFare("taxi", distanceKm);
  const carbonSavedKg = Math.round(distanceKm * 0.22 * 10) / 10;

  const br = await query(
    `INSERT INTO bookings
       (customerId, pickupName, pickupLat, pickupLng,
        destName, destLat, destLng, service, distanceKm,
        fareEstimate, carbonSavedKg, paymentStatus, status, companyId, officeId)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'taxi', ?, ?, ?, 'paid', 'dispatching', ?, ?)`,
    [customerId,
     scenario.pickupName, scenario.pickupLat, scenario.pickupLng,
     scenario.destName, scenario.destLat, scenario.destLng,
     distanceKm, fareEstimate, carbonSavedKg,
     office?.companyId || null, office?.officeId || null]
  );
  const bookingId = br.insertId;
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
  const fare = fareBreakdown("taxi", distanceKm);

  // Use the SAME per-booking pilot path as /pay and /run — no shared pilot row
  // (the shared row caused the GPS-collision bug when two demos overlapped).
  const demoOp = await autoRunDemoForBooking(booking);

  res.json({
    booking,
    fare,
    operator: {
      id: demoOp.id,
      name: demoOp.name,
      gpsLat: demoOp.gpsLat,
      gpsLng: demoOp.gpsLng,
      aircraftType: demoOp.aircraftType,
      aircraftReg: demoOp.aircraftReg,
    },
  });
  // autoRunDemoForBooking already kicked off the background lifecycle.
});

// Spawn (or reuse) the demo pilot just outside a booking's pickup and kick off
// the full animated lifecycle. Returns the demo operator descriptor so callers
// can show the pilot card immediately. Shared by POST /run/:id and the
// auto-demo path invoked from /api/bookings/:id/pay.
async function autoRunDemoForBooking(booking) {
  const office = await queryOne(
    `SELECT ro.id AS officeId, ro.companyId FROM regional_offices ro LIMIT 1`
  ).catch(() => null);

  // Spawn pilot ~4.5 km from pickup at a bearing that is clear of no-fly zones
  // (and whose fly-in line doesn't cross one), so the plane never starts inside
  // or flies through a red zone on its way to the passenger.
  const spawn = await findClearSpawn(booking.pickupLat, booking.pickupLng);
  const pilotLat = spawn[0];
  const pilotLng = spawn[1];
  const hash = await hashPassword(DEMO_PILOT.password);

  // Use a UNIQUE demo pilot per booking. A single shared pilot row corrupts the
  // map when two demo rides overlap — each sequence drives the same gpsLat/Lng,
  // so one ride's plane jumps to the other ride's position (the "plane stuck
  // off-route" bug). Per-booking pilots keep each ride's GPS independent.
  const pilotEmail = `demo-pilot+${booking.id}@irago.internal`;

  const profile = demoPilotProfile(booking.id);

  let demoOp = await queryOne("SELECT id FROM users WHERE email = ?", [pilotEmail]);
  if (demoOp) {
    await query(
      `UPDATE users SET name=?, passwordHash=?, role='operator', onDuty=1,
       gpsLat=?, gpsLng=?, companyId=?, officeId=?, aircraftType=?, aircraftReg=?,
       deletedAt=NULL WHERE id=?`,
      [profile.name, hash, pilotLat, pilotLng,
       office?.companyId || null, office?.officeId || null,
       profile.aircraftType, profile.aircraftReg, demoOp.id]
    );
  } else {
    const r = await query(
      `INSERT INTO users (email, name, passwordHash, role, onDuty, gpsLat, gpsLng, companyId, officeId, aircraftType, aircraftReg)
       VALUES (?, ?, ?, 'operator', 1, ?, ?, ?, ?, ?, ?)`,
      [pilotEmail, profile.name, hash,
       pilotLat, pilotLng, office?.companyId || null, office?.officeId || null,
       profile.aircraftType, profile.aircraftReg]
    );
    demoOp = { id: r.insertId };
  }

  const scenario = {
    pickupLat: booking.pickupLat, pickupLng: booking.pickupLng,
    destLat: booking.destLat, destLng: booking.destLng,
  };
  runDemoSequence(booking.id, demoOp.id, scenario);

  return {
    id: demoOp.id, name: profile.name, gpsLat: pilotLat, gpsLng: pilotLng,
    aircraftType: profile.aircraftType, aircraftReg: profile.aircraftReg,
    license: profile.license, flightHours: profile.flightHours,
    rating: profile.rating, companyName: profile.companyName,
  };
}

// POST /api/demo/run/:id
// Starts a demo sequence for an existing paid booking (any pickup/dest).
// Spawns a demo pilot 0.5km from the booking's pickup and runs the full lifecycle.
router.post("/run/:id", requireAuth, requireRole("customer"), async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!bookingId) return res.status(400).json({ error: "Invalid booking id" });

  const booking = await queryOne(
    "SELECT * FROM bookings WHERE id = ? AND customerId = ? AND paymentStatus = 'paid'",
    [bookingId, req.user.id]
  );
  if (!booking) return res.status(404).json({ error: "Booking not found or not paid" });

  const operator = await autoRunDemoForBooking(booking);
  res.json({ ok: true, operator });
});

// Startup reconcile: a server crash/restart mid-demo loses the in-memory
// sequence, leaving the per-booking pilot stuck onDuty=1 with GPS — which then
// pollutes the real dispatcher and nearby fleet. On boot, retire every demo
// pilot whose booking is no longer actively in flight. Active rides get resumed
// lazily by the /active endpoint, which re-spawns the pilot as needed.
async function reconcileDemoPilotsOnStartup() {
  try {
    const r = await query(
      `UPDATE users u
       SET u.onDuty = 0, u.gpsLat = NULL, u.gpsLng = NULL
       WHERE u.email LIKE 'demo-pilot%@irago.internal'
         AND u.onDuty = 1
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.operatorId = u.id
             AND b.status IN ('assigned','accepted','enroute','at_pickup','picked_up','flying')
         )`
    );
    if (r.affectedRows) {
      console.log(`[demo] startup reconcile: retired ${r.affectedRows} orphaned demo pilot(s).`);
    }
  } catch (e) {
    console.error("[demo] startup reconcile failed:", e.message);
  }
}

module.exports = router;
module.exports.autoRunDemoForBooking = autoRunDemoForBooking;
module.exports.isDemoRunning = (bookingId) => activeDemoBookings.has(bookingId);
module.exports.reconcileDemoPilotsOnStartup = reconcileDemoPilotsOnStartup;
module.exports.demoPilotProfile = demoPilotProfile;
