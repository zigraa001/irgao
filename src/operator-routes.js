// IraGo operator routes. Mounted at /api/operator.
//
// These endpoints are scoped to the logged-in operator (pilot). An operator
// only ever sees bookings that dispatch has assigned to them
// (booking.operatorId === req.user.id). Accept/reject and status-advance
// actions are added in US-010/US-011.
const express = require("express");
const { query, queryOne } = require("./db");
const { requireAuth, requireRole } = require("./auth");

const router = express.Router();

// Take a flat JOIN row (booking columns + aliased customer_*/aircraft_* columns)
// and reshape it into the nested { ...booking, customer, aircraft } object the
// client expects. A LEFT JOIN means aircraft may be absent (null id).
function shapeTrip(row) {
  const {
    customer_id,
    customer_name,
    customer_email,
    aircraft_id,
    aircraft_name,
    aircraft_model,
    aircraft_status,
    ...booking
  } = row;

  return {
    ...booking,
    customer: customer_id
      ? { id: customer_id, name: customer_name, email: customer_email }
      : null,
    aircraft: aircraft_id
      ? {
          id: aircraft_id,
          name: aircraft_name,
          model: aircraft_model,
          status: aircraft_status,
        }
      : null,
  };
}

// SELECT list shared by the trips queries: every booking column plus the public
// fields of the joined customer and aircraft (never the customer passwordHash).
const TRIP_SELECT = `
  b.*,
  c.id    AS customer_id,
  c.name  AS customer_name,
  c.email AS customer_email,
  a.id    AS aircraft_id,
  a.name  AS aircraft_name,
  a.model AS aircraft_model,
  a.status AS aircraft_status
  FROM bookings b
  JOIN users c ON c.id = b.customerId
  LEFT JOIN aircraft a ON a.id = b.aircraftId
`;

// GET /api/operator/trips — bookings assigned to the logged-in operator.
// Includes the customer and assigned aircraft so the list can show route,
// customer, service, status, and aircraft, and the details view has the full
// pickup/destination, distance, fare, and customer info. Newest first.
router.get(
  "/trips",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const rows = await query(
      `SELECT ${TRIP_SELECT} WHERE b.operatorId = ? ORDER BY b.createdAt DESC`,
      [req.user.id]
    );
    res.json({ trips: rows.map(shapeTrip) });
  }
);

// Load the booking named by :id and confirm it is assigned to the logged-in
// operator. Returns the booking, or sends the appropriate error response and
// returns null so the caller can `if (!booking) return;`.
async function loadOwnTrip(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid trip id" });
    return null;
  }
  const booking = await queryOne("SELECT * FROM bookings WHERE id = ?", [id]);
  // Re-check operatorId on the loaded record (don't trust the id alone): an
  // operator may only act on a mission dispatch actually assigned to them.
  if (!booking || booking.operatorId !== req.user.id) {
    res.status(404).json({ error: "Trip not found" });
    return null;
  }
  return booking;
}

// POST /api/operator/trips/:id/accept — accept an assigned mission.
// Only a trip currently in "assigned" status can be accepted; this moves it to
// "accepted" so dispatch (and the customer's tracking view) knows the pilot
// will fly it.
router.post(
  "/trips/:id/accept",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const booking = await loadOwnTrip(req, res);
    if (!booking) return;

    if (booking.status !== "assigned") {
      return res.status(409).json({
        error: "Only an assigned trip can be accepted",
      });
    }

    await query("UPDATE bookings SET status = ? WHERE id = ?", [
      "accepted",
      booking.id,
    ]);
    const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [
      booking.id,
    ]);
    res.json({ booking: updated });
  }
);

// POST /api/operator/trips/:id/reject — reject an assigned mission.
// Sets status to "rejected" and frees the booking for reassignment by clearing
// the operator and aircraft so an admin can assign it to someone else.
router.post(
  "/trips/:id/reject",
  requireAuth,
  requireRole("operator"),
  async (req, res) => {
    const booking = await loadOwnTrip(req, res);
    if (!booking) return;

    if (booking.status !== "assigned") {
      return res.status(409).json({
        error: "Only an assigned trip can be rejected",
      });
    }

    await query(
      "UPDATE bookings SET status = ?, operatorId = NULL, aircraftId = NULL WHERE id = ?",
      ["rejected", booking.id]
    );
    const updated = await queryOne("SELECT * FROM bookings WHERE id = ?", [
      booking.id,
    ]);
    res.json({ booking: updated });
  }
);

module.exports = router;
