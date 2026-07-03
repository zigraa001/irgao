// IraGo booking routes. Mounted at /api/bookings.
//
// A booking captures a customer's requested trip (pickup, destination, service)
// and the mock fare estimate, persisted with status "requested" and tied to the
// authenticated customer. Fare and distance are computed server-side so we never
// trust client-supplied money or geometry.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole } = require("./auth");
const {
  SERVICES,
  haversineKm,
  estimateFare,
  parseCoord,
  applyNewFlyerDiscount,
} = require("./pricing");
const { estimateCarbonSavedKg, carbonComparison, CREDITS_PER_KM } = require("./carbon");
const { startDispatch, stopDispatch, setOperatorDuty } = require("./dispatch");
const { pushOperator, pushCustomer } = require("./dispatch-hub");
const { rateLimit } = require("./rate-limit");
const { fareBreakdown } = require("./fare-breakdown");
const { checkRouteFeasibility } = require("./route-feasibility");
const { sendReceiptEmail, isEmailConfigured } = require("./receipt");
const { autoRunDemoForBooking, isDemoRunning } = require("./demo-routes");
const platformSettings = require("./platform-settings");

const router = express.Router();

// ── Coupon helpers ──────────────────────────────────────────────────────
async function validateCoupon(code, userId, fare, service) {
  if (!code) return { valid: false, error: "No coupon code provided" };
  const coupon = await queryOne(
    "SELECT * FROM coupons WHERE code = ? AND active = 1",
    [code.toUpperCase().trim()]
  );
  if (!coupon) return { valid: false, error: "Invalid coupon code" };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: "This coupon has expired" };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, error: "This coupon has been fully redeemed" };
  }
  if (coupon.minFare > 0 && fare < coupon.minFare) {
    return { valid: false, error: "Minimum fare of ₹" + coupon.minFare + " required" };
  }
  if (coupon.services) {
    const allowed = coupon.services.split(",").map(s => s.trim().toLowerCase());
    if (!allowed.includes(service.toLowerCase())) {
      return { valid: false, error: "This coupon is not valid for " + service + " flights" };
    }
  }
  if (coupon.perUserLimit > 0) {
    const used = await queryOne(
      "SELECT COUNT(*) AS n FROM bookings WHERE customerId = ? AND couponCode = ?",
      [userId, coupon.code]
    );
    if (used && Number(used.n) >= coupon.perUserLimit) {
      return { valid: false, error: "You have already used this coupon" };
    }
  }
  let discount = 0;
  if (coupon.discountType === "percent") {
    discount = Math.round(fare * (coupon.discountValue / 100));
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = Math.min(coupon.discountValue, fare);
  }
  discount = Math.round(discount);
  return {
    valid: true,
    coupon: {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount,
    },
    discount,
  };
}

// Pre-GST fare base after the new-flyer discount — the amount coupons and
// credits are computed against. Discounts never apply to GST; GST is charged
// on whatever remains after all discounts.
async function fareBaseForUser(booking, userId) {
  const row = await queryOne(
    "SELECT COUNT(*) AS n FROM bookings WHERE customerId = ? AND status = 'completed'",
    [userId]
  );
  const completedFlights = row ? Number(row.n) : 0;
  const baseFare = estimateFare(booking.service, booking.distanceKm);
  const discountInfo = applyNewFlyerDiscount(baseFare, completedFlights);
  const fb = fareBreakdown(booking.service, booking.distanceKm, discountInfo);
  const preGst = fb.subtotal - (fb.discount ? fb.discount.amount : 0);
  return { discountInfo, preGst };
}

// One authoritative payment quote: new-flyer discount + optional coupon +
// optional carbon credits (max 50% of the remaining pre-GST fare), then GST.
// Used by both /quote (live preview) and /pay (final charge) so the number
// the customer sees is always the number they are charged.
async function buildPaymentQuote(booking, userId, opts) {
  const { discountInfo, preGst } = await fareBaseForUser(booking, userId);

  let coupon = null;
  let couponError = null;
  let couponDiscount = 0;
  if (opts.couponCode) {
    const cv = await validateCoupon(opts.couponCode, userId, preGst, booking.service);
    if (cv.valid) {
      coupon = cv.coupon;
      couponDiscount = cv.discount;
    } else {
      couponError = cv.error;
    }
  }

  const userCred = await queryOne("SELECT carbonCredits FROM users WHERE id = ?", [userId]);
  const creditBalance = userCred ? Number(userCred.carbonCredits) || 0 : 0;
  let creditsUsed = 0;
  if (opts.useCredits && creditBalance > 0) {
    const afterCoupon = Math.max(0, preGst - couponDiscount);
    creditsUsed = Math.min(creditBalance, Math.floor(afterCoupon * 0.5));
  }

  const fare = fareBreakdown(
    booking.service,
    booking.distanceKm,
    discountInfo,
    creditsUsed,
    coupon ? { code: coupon.code, discount: couponDiscount } : null
  );
  return { fare, discountInfo, coupon, couponError, couponDiscount, creditsUsed, creditBalance };
}

// Minimum trip distance (km). Pickup == destination yields a 0-km booking
// priced at just the base fare — reject it.
const MIN_TRIP_KM = 0.1;

// POST /api/bookings — create a booking for the logged-in customer.
// Body: { pickupName, pickupLat, pickupLng, destName, destLat, destLng,
//         service }. distanceKm + fareEstimate are computed server-side.
router.post("/", requireAuth, requireRole("customer"), rateLimit("bookings.create"), async (req, res) => {
  const b = req.body || {};

  const pickupName = typeof b.pickupName === "string" ? b.pickupName.trim() : "";
  const destName = typeof b.destName === "string" ? b.destName.trim() : "";
  const pickupLat = parseCoord(b.pickupLat, "lat");
  const pickupLng = parseCoord(b.pickupLng, "lng");
  const destLat = parseCoord(b.destLat, "lat");
  const destLng = parseCoord(b.destLng, "lng");
  const service = typeof b.service === "string" ? b.service : "";

  // Guard: a booking cannot be created unless pickup, destination, and service
  // are all set (mirrors the client-side bookingDraftReady() gate).
  if (
    !pickupName ||
    pickupLat === null ||
    pickupLng === null ||
    !destName ||
    destLat === null ||
    destLng === null
  ) {
    return res
      .status(400)
      .json({ error: "Pickup and destination (name + coordinates) are required" });
  }
  if (!SERVICES.includes(service)) {
    return res.status(400).json({ error: "A valid service must be selected" });
  }

  const distanceKm =
    Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;
  if (distanceKm < MIN_TRIP_KM) {
    return res
      .status(400)
      .json({ error: "Pickup and destination must be different locations" });
  }

  // Route feasibility: reject bookings whose path crosses a no-fly zone or
  // whose pickup/destination sits inside one, and offer 3 nearest legal spots.
  // Degrades to "feasible" if the zones catalog is unreachable.
  const feasibility = await checkRouteFeasibility({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    service,
  });
  if (!feasibility.feasible) {
    return res.status(409).json({
      error: "This route crosses a no-fly zone or starts/ends inside one.",
      code: "ROUTE_BLOCKED",
      violations: feasibility.violations,
      warnings: feasibility.warnings,
      blockedEndpoints: feasibility.blockedEndpoints,
    });
  }

  const [completedRow, userCredRow] = await Promise.all([
    queryOne("SELECT COUNT(*) AS n FROM bookings WHERE customerId = ? AND status = 'completed'", [req.user.id]),
    queryOne("SELECT carbonCredits FROM users WHERE id = ?", [req.user.id]),
  ]);
  const completedFlights = completedRow ? Number(completedRow.n) : 0;
  const creditBalance = userCredRow ? Number(userCredRow.carbonCredits) || 0 : 0;
  const baseFare = estimateFare(service, distanceKm);
  const discountInfo = applyNewFlyerDiscount(baseFare, completedFlights);
  let fareEstimate = discountInfo.fare;

  const carbonSavedKg = estimateCarbonSavedKg(service, distanceKm);

  // Find the nearest active regional office to the pickup point.
  let nearestOffice = null;
  try {
    const offices = await query(
      "SELECT ro.*, oc.name AS companyName FROM regional_offices ro JOIN operator_companies oc ON oc.id = ro.companyId WHERE ro.active = 1 AND oc.active = 1"
    );
    let minDist = Infinity;
    for (const office of offices) {
      const d = haversineKm(pickupLat, pickupLng, office.lat, office.lng);
      if (d < minDist) {
        minDist = d;
        nearestOffice = office;
      }
    }
  } catch (err) {
    // Degrade gracefully — office assignment is best-effort.
  }

  const bookingCompanyId = nearestOffice ? nearestOffice.companyId : null;
  const bookingOfficeId = nearestOffice ? nearestOffice.id : null;

  const result = await query(
    `INSERT INTO bookings
       (customerId, pickupName, pickupLat, pickupLng, destName, destLat, destLng,
        service, distanceKm, fareEstimate, carbonSavedKg, paymentStatus, status,
        companyId, officeId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      req.user.id,
      pickupName,
      pickupLat,
      pickupLng,
      destName,
      destLat,
      destLng,
      service,
      distanceKm,
      fareEstimate,
      carbonSavedKg,
      "requested",
      bookingCompanyId,
      bookingOfficeId,
    ]
  );

  // Return the persisted row so the client gets the generated id, status, and
  // timestamps exactly as stored.
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [
    result.insertId,
  ]);

  const creditsRate = CREDITS_PER_KM[service] || CREDITS_PER_KM.taxi;

  res.status(201).json({
    booking,
    fare: fareBreakdown(service, distanceKm, discountInfo),
    discount: discountInfo,
    carbonCredits: { balance: creditBalance, willEarn: Math.round(creditsRate * distanceKm) },
    warnings: feasibility.warnings,
    emergencyBypass: feasibility.emergencyBypass || false,
    route: feasibility.route || null,
    company: nearestOffice ? { name: nearestOffice.companyName, officeCity: nearestOffice.city } : null,
  });
});

// GET /api/bookings/active — the customer's in-progress (paid & dispatched) booking.
router.get("/active", requireAuth, requireRole("customer"), async (req, res) => {
  const booking = await queryOne(
    `SELECT * FROM bookings
     WHERE customerId = ? AND status IN ('dispatching','assigned','accepted','enroute','at_pickup','picked_up','flying')
     ORDER BY createdAt DESC LIMIT 1`,
    [req.user.id]
  );
  if (!booking) return res.json({ booking: null });
  let operator = null;
  if (booking.operatorId) {
    operator = await queryOne(
      "SELECT id, name, gpsLat, gpsLng, aircraftType, aircraftReg FROM users WHERE id = ?",
      [booking.operatorId]
    );
    if (operator && operator.name && /demo-pilot/.test(
      (await queryOne("SELECT email FROM users WHERE id = ?", [operator.id]) || {}).email || ""
    )) {
      const { demoPilotProfile } = require("./demo-routes");
      const profile = demoPilotProfile(booking.id);
      operator.license = profile.license;
      operator.flightHours = profile.flightHours;
      operator.rating = profile.rating;
      operator.companyName = profile.companyName;
    }
  }
  let company = null;
  if (booking.companyId) {
    const row = await queryOne(
      `SELECT oc.name, ro.city FROM operator_companies oc
       LEFT JOIN regional_offices ro ON ro.companyId = oc.id AND ro.id = ?
       WHERE oc.id = ?`,
      [booking.officeId, booking.companyId]
    );
    if (row) company = { name: row.name, officeCity: row.city };
  }

  // Auto-resume demo sequence if the server restarted and the in-memory demo
  // sequence for this booking was lost (fire-and-forget demo lives in memory).
  // Only resumes if demo mode is on and no demo is already running.
  if (
    platformSettings.get("demoMode") &&
    booking.paymentStatus === "paid" &&
    !isDemoRunning(booking.id) &&
    !["completed", "cancelled", "no_pilot", "rejected"].includes(booking.status)
  ) {
    try {
      const op = await autoRunDemoForBooking(booking);
      if (op && !operator) operator = op;
    } catch (err) {
      console.error(`[bookings] auto-resume demo for #${booking.id}:`, err.message);
    }
  }

  res.json({ booking, operator, company });
});

// GET /api/bookings/history — ride history for the logged-in customer
// (incl. cancelled trips), newest first. MUST be declared before the "/:id"
// route below — otherwise Express matches "history" as an :id (NaN → 400) and
// this endpoint becomes unreachable.
router.get("/history", requireAuth, requireRole("customer"), async (req, res) => {
  const rows = await query(
    `SELECT id, pickupName, destName, service, distanceKm, fareEstimate,
            status, paymentStatus, cancellationFee, createdAt, updatedAt,
            cancelledAt
     FROM bookings
     WHERE customerId = ?
     ORDER BY createdAt DESC
     LIMIT 100`,
    [req.user.id]
  );
  res.json({ rides: rows });
});

// GET /api/bookings/:id — fetch a single booking for status tracking (US-007).
// Returns the persisted booking (including its current status, which the
// operator advances). Readable by the owning customer, the assigned operator,
// or an admin; anyone else gets 403.
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  const u = req.user;
  const allowed =
    u.role === "admin" ||
    booking.customerId === u.id ||
    booking.operatorId === u.id;
  if (!allowed) {
    return res.status(403).json({ error: "Not allowed to view this booking" });
  }

  res.json({ booking });
});

// POST /api/bookings/feasibility — pre-check a route before the customer pays.
// Returns the same shape as a blocked booking creation so the client can render
// the "restricted area — pick a nearby spot" alert and suggestions up front.
router.post("/feasibility", requireAuth, requireRole("customer"), async (req, res) => {
  const b = req.body || {};
  const pickupLat = parseCoord(b.pickupLat, "lat");
  const pickupLng = parseCoord(b.pickupLng, "lng");
  const destLat = parseCoord(b.destLat, "lat");
  const destLng = parseCoord(b.destLng, "lng");
  const service = typeof b.service === "string" ? b.service : "";
  if (
    pickupLat === null ||
    pickupLng === null ||
    destLat === null ||
    destLng === null
  ) {
    return res
      .status(400)
      .json({ error: "pickupLat, pickupLng, destLat, destLng are required" });
  }
  if (!SERVICES.includes(service)) {
    return res.status(400).json({ error: "A valid service must be selected" });
  }
  const feasibility = await checkRouteFeasibility({
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    service,
  });
  const distanceKm =
    Math.round(haversineKm(pickupLat, pickupLng, destLat, destLng) * 10) / 10;
  const [completedRow, userRow] = await Promise.all([
    queryOne("SELECT COUNT(*) AS n FROM bookings WHERE customerId = ? AND status = 'completed'", [req.user.id]),
    queryOne("SELECT carbonCredits FROM users WHERE id = ?", [req.user.id]),
  ]);
  const completedFlights = completedRow ? Number(completedRow.n) : 0;
  const creditBalance = userRow ? Number(userRow.carbonCredits) || 0 : 0;
  const baseFare = estimateFare(service, distanceKm);
  const discountInfo = applyNewFlyerDiscount(baseFare, completedFlights);
  const creditsRate = CREDITS_PER_KM[service] || CREDITS_PER_KM.taxi;
  const creditsWillEarn = Math.round(creditsRate * distanceKm);
  res.json({
    feasible: feasibility.feasible,
    emergencyBypass: feasibility.emergencyBypass || false,
    violations: feasibility.violations,
    warnings: feasibility.warnings,
    blockedEndpoints: feasibility.blockedEndpoints,
    distanceKm,
    fare: fareBreakdown(service, distanceKm, discountInfo),
    discount: discountInfo,
    carbonComparison: carbonComparison(distanceKm, 1),
    carbonCredits: { balance: creditBalance, willEarn: creditsWillEarn },
    route: feasibility.route || null,
  });
});

// POST /api/bookings/:id/coupon — validate and preview a coupon for a booking.
router.post("/:id/coupon", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const code = (req.body && req.body.code) ? String(req.body.code).trim().toUpperCase() : "";
  if (!code) return res.status(400).json({ valid: false, error: "Enter a coupon code" });
  const { preGst } = await fareBaseForUser(booking, req.user.id);
  const result = await validateCoupon(code, req.user.id, preGst, booking.service);
  res.json(result);
});

// POST /api/bookings/:id/quote — recompute the payable total with an optional
// coupon and carbon credits toggle. Pure preview: nothing is persisted. The
// client re-renders the fare breakdown from this so the preview always matches
// what /pay will charge.
router.post("/:id/quote", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const body = req.body || {};
  const q = await buildPaymentQuote(booking, req.user.id, {
    couponCode: body.couponCode ? String(body.couponCode).trim().toUpperCase() : null,
    useCredits: body.useCredits === true || body.useCredits === "true",
  });
  res.json({
    fare: q.fare,
    total: q.fare.total,
    coupon: q.coupon,
    couponError: q.couponError,
    couponDiscount: q.couponDiscount,
    creditsUsed: q.creditsUsed,
    creditBalance: q.creditBalance,
  });
});

// GET /api/bookings/:id/coupons — list available coupons for this booking.
router.get("/:id/coupons", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const allCoupons = await query(
    "SELECT * FROM coupons WHERE active = 1 AND (expiresAt IS NULL OR expiresAt > NOW())"
  );
  const { preGst } = await fareBaseForUser(booking, req.user.id);
  const available = [];
  for (const c of allCoupons) {
    if (c.maxUses > 0 && c.usedCount >= c.maxUses) continue;
    if (c.minFare > 0 && preGst < c.minFare) continue;
    if (c.services) {
      const allowed = c.services.split(",").map(s => s.trim().toLowerCase());
      if (!allowed.includes(booking.service.toLowerCase())) continue;
    }
    if (c.perUserLimit > 0) {
      const used = await queryOne(
        "SELECT COUNT(*) AS n FROM bookings WHERE customerId = ? AND couponCode = ?",
        [req.user.id, c.code]
      );
      if (used && Number(used.n) >= c.perUserLimit) continue;
    }
    let discount = 0;
    if (c.discountType === "percent") {
      discount = Math.round(preGst * (c.discountValue / 100));
      if (c.maxDiscount && discount > c.maxDiscount) discount = c.maxDiscount;
    } else {
      discount = Math.min(c.discountValue, preGst);
    }
    available.push({
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscount: c.maxDiscount,
      discount,
    });
  }
  res.json({ coupons: available });
});

router.post("/:id/pay", requireAuth, requireRole("customer"), rateLimit("bookings.pay"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const body = req.body || {};

  // Race-safe claim FIRST: only the first concurrent /pay flips pending → paid.
  // Claiming before any coupon/credit side effects means a duplicate /pay can
  // never double-redeem a coupon or double-deduct carbon credits.
  const claim = await query(
    "UPDATE bookings SET paymentStatus = 'paid' WHERE id = ? AND paymentStatus = 'pending'",
    [id]
  );
  if (claim.affectedRows === 0) {
    const alreadyPaid = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    return res.json({ booking: alreadyPaid, message: "Already paid" });
  }

  // Recompute the authoritative total server-side (never trust client math),
  // using the exact same quote the customer previewed via /quote.
  const quote = await buildPaymentQuote(booking, req.user.id, {
    couponCode: body.couponCode ? String(body.couponCode).trim().toUpperCase() : null,
    useCredits: body.useCredits === true || body.useCredits === "true",
  });
  await query(
    "UPDATE bookings SET fareEstimate = ?, couponCode = ?, couponDiscount = ?, creditsUsed = ? WHERE id = ?",
    [
      quote.fare.total,
      quote.coupon ? quote.coupon.code : null,
      quote.couponDiscount,
      quote.creditsUsed,
      id,
    ]
  );
  if (quote.coupon) {
    await query("UPDATE coupons SET usedCount = usedCount + 1 WHERE code = ?", [quote.coupon.code]);
  }
  if (quote.creditsUsed > 0) {
    await query("UPDATE users SET carbonCredits = carbonCredits - ? WHERE id = ?", [quote.creditsUsed, req.user.id]);
  }

  const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);

  // Demo mode: auto-assign a demo pilot and run the full animated lifecycle
  // instead of real dispatch. This avoids the no-pilot race (real dispatch
  // would time out to "no_pilot" when no live operators are on duty) and makes
  // the workflow self-complete. The booking is parked at "dispatching" so the
  // tracking panel restores on refresh until the demo sequence advances it.
  let demoOperator = null;
  if (platformSettings.get("demoMode")) {
    await query("UPDATE bookings SET status = 'dispatching' WHERE id = ?", [id]);
    try {
      demoOperator = await autoRunDemoForBooking(updated);
    } catch (err) {
      console.error(`[bookings] demo auto-run failed for #${id}:`, err.message);
    }
  } else {
    await startDispatch(id);
  }
  const fresh = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);

  // Email a receipt/invoice on payment. Payment itself stays mocked, but the
  // customer gets a real emailed breakdown (base + per-km). Best-effort: a
  // failed send never blocks the ride.
  let receiptEmailed = false;
  if (isEmailConfigured()) {
    try {
      const customer = await queryOne(
        "SELECT email, name FROM users WHERE id = ?",
        [updated.customerId]
      );
      if (customer) {
        await sendReceiptEmail(customer.email, {
          booking: updated,
          fare: quote.fare,
          customerName: customer.name,
        });
        receiptEmailed = true;
      }
    } catch (err) {
      console.error(`[bookings] receipt email failed for #${id}:`, err.message);
    }
  }

  res.json({
    booking: fresh,
    message: "Payment successful. Finding a nearby pilot…",
    carbonSavedKg: updated.carbonSavedKg,
    fare: quote.fare,
    discount: quote.discountInfo,
    coupon: quote.coupon,
    couponDiscount: quote.couponDiscount,
    creditsUsed: quote.creditsUsed,
    receiptEmailed,
    operator: demoOperator,
  });
});

// POST /api/bookings/:id/retry-dispatch — let a customer re-dispatch a booking
// that gave up with status "no_pilot". Re-enters the nearest-pilot dispatch
// loop (which excludes operators already offered this trip).
router.post(
  "/:id/retry-dispatch",
  requireAuth,
  requireRole("customer"),
  rateLimit("bookings.retry"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.customerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (booking.paymentStatus !== "paid") {
      return res.status(409).json({ error: "This booking has not been paid yet." });
    }
    if (booking.status !== "no_pilot") {
      return res
        .status(409)
        .json({ error: "This booking is not in a retryable state." });
    }

    // Move back to a dispatchable state and re-enter the dispatch loop.
    await query(
      "UPDATE bookings SET status = 'dispatching', pendingOperatorId = NULL WHERE id = ?",
      [id]
    );
    await startDispatch(id);
    const fresh = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    res.json({
      booking: fresh,
      message: "Searching for a nearby pilot again…",
    });
  }
);

// POST /api/bookings/:id/cancel — customer cancels a booking.
//
// Mirrors Uber/Ola India cancellation rules:
//  • Free before a pilot is assigned (requested / dispatching / no_pilot).
//  • Free within a 5-minute grace window after assignment (assignedAt).
//  • Free if the pilot made no progress (status still assigned/accepted).
//  • Cannot cancel once airborne or picked up (flying / picked_up).
//  • Otherwise a cancellation fee applies (recorded; payment stays mock, so the
//    "refund" is computed but not actually moved).
// Side effects: stop dispatch, release aircraft, flip the assigned operator
// off-duty, notify the operator and the customer.
const FREE_CANCEL_SECONDS = 300; // 5-minute grace after assignment
const CANCEL_FEE_MIN = 25; // ₹ floor
const CANCEL_FEE_RATE = 0.25; // 25% of fare (mock)

// assignedSecondsAgo MUST be computed in SQL (TIMESTAMPDIFF(SECOND, assignedAt,
// NOW())), NOT by parsing booking.assignedAt with a JS Date — mysql2 returns
// naive DATETIME columns reinterpreted in the connection timezone, so JS-vs-SQL
// time math is off by the server's UTC offset (it wrongly charged a fee for a
// cancel made seconds after assignment). null = no assignedAt timestamp.
function computeCancellationPolicy(booking, assignedSecondsAgo = null) {
  const fare = Number(booking.fareEstimate) || 0;
  // No pilot assigned yet → always free.
  if (!booking.operatorId) {
    return { policy: "free", fee: 0, refund: fare, reason: "no_pilot_assigned" };
  }
  // Pilot accepted but hasn't started moving toward pickup → no progress → free.
  const noProgress = ["assigned", "accepted"].includes(booking.status);
  const withinGrace =
    assignedSecondsAgo != null &&
    assignedSecondsAgo >= 0 &&
    assignedSecondsAgo <= FREE_CANCEL_SECONDS;
  if (noProgress || withinGrace) {
    return {
      policy: "free",
      fee: 0,
      refund: fare,
      reason: noProgress ? "no_progress" : "within_grace_window",
    };
  }
  // Pilot made progress and the grace window elapsed → charge a fee.
  const fee = Math.max(CANCEL_FEE_MIN, Math.round(fare * CANCEL_FEE_RATE));
  return {
    policy: "fee",
    fee,
    refund: Math.max(0, fare - fee),
    reason: "post_grace_with_progress",
  };
}

router.post(
  "/:id/cancel",
  requireAuth,
  requireRole("customer"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.customerId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (["cancelled", "completed"].includes(booking.status)) {
      return res
        .status(409)
        .json({ error: `Booking already ${booking.status}` });
    }
    // Once the passenger is aboard or airborne, cancellation isn't possible.
    if (["flying", "picked_up"].includes(booking.status)) {
      return res
        .status(409)
        .json({ error: "Cannot cancel once the trip is underway" });
    }

    // Compute assignment age in SQL (server timezone) to avoid JS↔MySQL Date
    // timezone skew in the grace-window check.
    let assignedSecondsAgo = null;
    if (booking.assignedAt) {
      const ageRow = await queryOne(
        "SELECT TIMESTAMPDIFF(SECOND, assignedAt, NOW()) AS secs FROM bookings WHERE id = ?",
        [id]
      );
      assignedSecondsAgo = ageRow ? Number(ageRow.secs) : null;
    }
    const { policy, fee, refund, reason } = computeCancellationPolicy(
      booking,
      assignedSecondsAgo
    );

    // Race-safe: only the first concurrent cancel flips the status. A second
    // concurrent caller gets affectedRows=0 and a conflict response.
    const claim = await query(
      `UPDATE bookings
       SET status = 'cancelled', cancelledAt = NOW(), cancellationFee = ?
       WHERE id = ? AND status NOT IN ('cancelled', 'completed')`,
      [fee, id]
    );
    if (claim.affectedRows === 0) {
      return res.status(409).json({ error: "Booking already cancelled or completed" });
    }

    await stopDispatch(id);

    // Auto off-duty for the assigned operator on cancellation.
    if (booking.operatorId) {
      await setOperatorDuty(booking.operatorId, 0);
    }

    // Notify the assigned operator (if any) that the trip was cancelled.
    if (booking.operatorId) {
      pushOperator(booking.operatorId, "ride_cancelled", {
        bookingId: id,
        by: "customer",
        policy,
        fee,
      });
    }
    // Notify the customer's own stream.
    pushCustomer(id, "ride_update", {
      bookingId: id,
      status: "cancelled",
      message:
        policy === "free"
          ? "Trip cancelled. No charge applied."
          : `Trip cancelled. A cancellation fee of ₹${fee} applies.`,
    });

    const fresh = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
    res.json({
      booking: fresh,
      cancellation: { policy, fee, refund, reason, freeSeconds: FREE_CANCEL_SECONDS },
    });
  }
);

// ── Ratings & feedback ─────────────────────────────────────────────────────
// After a trip completes, both sides rate each other (1–5 + comment). The
// rater is the caller; the ratee is the other party on the booking. A
// UNIQUE(bookingId, raterId) constraint makes re-rating an upsert-safe no-op.
function parseStars(v) {
  const n = Math.round(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// POST /api/bookings/:id/rate — customer rates operator, or operator rates
// customer. Booking must be completed and the caller must be a participant.
router.post("/:id/rate", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const stars = parseStars(req.body?.stars);
  const comment =
    typeof req.body?.comment === "string"
      ? req.body.comment.trim().slice(0, 1000)
      : "";
  if (stars === null) {
    return res.status(400).json({ error: "stars must be an integer 1–5" });
  }

  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const u = req.user;
  let rateeId = null;
  let raterRole = u.role;
  if (u.role === "customer" && booking.customerId === u.id) {
    rateeId = booking.operatorId;
    raterRole = "customer";
  } else if (u.role === "operator" && booking.operatorId === u.id) {
    rateeId = booking.customerId;
    raterRole = "operator";
  } else {
    return res.status(403).json({ error: "Not a participant on this booking" });
  }
  if (!rateeId) {
    return res
      .status(409)
      .json({ error: "No one to rate yet (the other party is missing)" });
  }
  if (booking.status !== "completed") {
    return res
      .status(409)
      .json({ error: "Ratings are only available after the trip completes" });
  }

  // Insert; if this (bookingId, raterId) already rated, update instead.
  try {
    await query(
      `INSERT INTO ratings (bookingId, raterId, raterRole, rateeId, stars, comment)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE stars = VALUES(stars), comment = VALUES(comment)`,
      [id, u.id, raterRole, rateeId, stars, comment]
    );
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Could not save rating", detail: err.message });
  }

  res.json({ bookingId: id, stars, comment, raterRole, rateeId });
});

// GET /api/bookings/:id/ratings — both sides' ratings for a booking (caller
// must be a participant or admin).
router.get("/:id/ratings", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const u = req.user;
  const allowed =
    u.role === "admin" ||
    booking.customerId === u.id ||
    booking.operatorId === u.id;
  if (!allowed) {
    return res.status(403).json({ error: "Not allowed to view this booking" });
  }
  const rows = await query(
    "SELECT raterId, raterRole, rateeId, stars, comment, createdAt FROM ratings WHERE bookingId = ?",
    [id]
  );
  res.json({ ratings: rows });
});

// GET /api/bookings/:id/ride-otp — the 4-digit ride OTP for the booking.
// Only the owning customer can see it, and only once the status is 'enroute'
// or later (the pilot is on the way / at the pickup).
router.get("/:id/ride-otp", requireAuth, requireRole("customer"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const otpVisibleStatuses = ["enroute", "at_pickup", "picked_up", "flying", "completed"];
  if (!otpVisibleStatuses.includes(booking.status)) {
    return res.status(409).json({
      error: "Ride OTP is available only once the pilot is en route.",
    });
  }
  res.json({ rideOtp: booking.rideOtp || null, verified: Boolean(booking.rideOtpVerified) });
});

module.exports = router;
