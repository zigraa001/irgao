# PRD: IraGo Air Mobility Platform — MVP

## Introduction / Overview

IraGo is an AI-powered air mobility ("air taxi") platform. Today the project is a
static marketing site plus a **frontend-only consumer prototype** in `app.html`
(login, map-based pickup/destination, service selection, fare/ride search, booking
confirmation, and an animated live-tracking view) — all driven by mock data with no
backend or persistence. `server.js` is a bare static file server.

This MVP turns that prototype into a working **three-sided product** backed by a real
database:

1. **Consumer app** — riders sign up, book a flight, and track it.
2. **Operator / Pilot app** — pilots see assigned trips, accept/reject, and update status.
3. **Admin dashboard** — staff manage bookings, assign pilots/aircraft, and monitor the fleet.

All three live in the **single `app.html` file**, with the logged-in user's **role**
(`customer`, `operator`, `admin`) deciding which views render. A new Express + Prisma
backend (MySQL on Hostinger) handles authentication, bookings, assignments, and status.

The problem this solves: the current prototype cannot persist anything, has no real
accounts, and no way for pilots or staff to participate. The MVP makes the booking
loop real end-to-end (book → assign → fly → track), while intentionally **mocking**
the parts that need external integrations (fare pricing engine, real GPS, payments,
pre-flight systems) so they can be swapped for real services later.

## Goals

- Stand up an Express + Prisma backend connected to a Hostinger MySQL database.
- Create a `users` table supporting three roles: `customer`, `operator`, `admin`.
- Authenticate users with **bcrypt-hashed passwords** (one-way; never stored or returned in plaintext) and a session token.
- Let a customer sign up, book a flight, and track its status against real persisted data.
- Let an operator log in, see assigned trips, accept/reject, and push status updates that the customer sees.
- Let an admin log in, view live bookings, assign a pilot + aircraft, and monitor active trips and fleet status.
- Keep fare, live position, pre-flight checklist, and payments as **mock implementations** with clean seams for real services later.
- Serve all three experiences from one `app.html`, gated by role.

## User Stories

> Each story is sized for one focused implementation session. UI stories must be
> visually verified in the browser. All stories must pass typecheck/lint where applicable.

### Backend & Data Foundation

#### US-001: Add Express + Prisma + MySQL backend skeleton
**Description:** As a developer, I need an Express server with a Prisma/MySQL connection so the app has a real API and database, following the Hostinger Node.js + MySQL setup.

**Acceptance Criteria:**
- [ ] Add dependencies: `express`, `prisma`, `@prisma/client`, `bcrypt` (and `dotenv`).
- [ ] `server.js` (or a new `app.js`) serves the existing static files **and** mounts an `/api` router.
- [ ] **Env-driven DB selection:** `DATABASE_PROVIDER` (`mysql` default → Hostinger, or `sqlite` for local testing) and `DATABASE_URL` (connection string) pick the database with no code changes. Default/production = Hostinger MySQL per the guide; local = `file:./dev.db` SQLite. Because Prisma's datasource `provider` must be a literal, drive the switch via a schema-swap setup script (or equivalent).
- [ ] Commit `.env.example` documenting `DATABASE_PROVIDER` and `DATABASE_URL` (Hostinger MySQL default + commented local SQLite override); real `.env` is gitignored.
- [ ] `npm start` boots the server with a working DB connection (logs success, fails loudly on bad credentials).
- [ ] A `GET /api/health` route returns `{ status: "ok", db: "connected" }`.
- [ ] README/notes document the Hostinger connection steps, the env-var DB switch, and required env vars.

#### US-002: Create the database schema (users, bookings, aircraft, trips)
**Description:** As a developer, I need a Prisma schema so all app data persists with the right relationships.

**Acceptance Criteria:**
- [ ] `User` model: `id`, `name`, `email` (unique), `passwordHash`, `role` enum `customer | operator | admin`, timestamps.
- [ ] `Aircraft` model: `id`, `name`/tail number, `model`, `status` enum (e.g. `available | in_flight | maintenance`), capacity.
- [ ] `Booking` model: `id`, `customerId` (FK→User), `pickupName`/`pickupLat`/`pickupLng`, `destName`/`destLat`/`destLng`, `service` (service tier), `distanceKm`, `fareEstimate`, `status` enum (`requested | assigned | accepted | rejected | enroute | picked_up | flying | arrived | completed | cancelled`), timestamps.
- [ ] `Trip`/assignment link: a Booking can be assigned an `operatorId` (FK→User, role operator) and `aircraftId` (FK→Aircraft). (May live on Booking directly for MVP.)
- [ ] Prisma migration generates and applies cleanly to the MySQL database.
- [ ] A seed script inserts: 1 admin, 2 operators, 2 customers, and 3 aircraft (mock fleet).
- [ ] Typecheck/lint passes.

#### US-003: Signup, login, and session token API with bcrypt
**Description:** As a developer, I need auth endpoints so users can register and log in securely, with passwords hashed one-way so they can never be stolen in plaintext.

**Acceptance Criteria:**
- [ ] `POST /api/auth/signup` accepts name, email, password (role defaults to `customer`); rejects duplicate email.
- [ ] Passwords stored only as a **bcrypt hash** (salted, configurable cost); plaintext is never persisted or returned.
- [ ] `POST /api/auth/login` verifies email + password via `bcrypt.compare`, returns a session token + the user's `id`, `name`, and `role` (never the hash).
- [ ] Invalid credentials return a generic 401 (no leak of which field was wrong).
- [ ] An auth middleware validates the token on protected routes and exposes the current user + role.
- [ ] A `requireRole(role)` guard rejects requests from the wrong role with 403.
- [ ] Typecheck/lint passes.

### Consumer App (role: customer)

#### US-004: Wire signup + login UI to the auth API
**Description:** As a customer, I want to create an account and log in so my bookings are tied to me.

**Acceptance Criteria:**
- [ ] The existing `login-view` supports both login and signup (name/email/password) and calls the real API.
- [ ] On success, the session token is stored client-side and the role-appropriate view loads (customer → booking view).
- [ ] Errors (duplicate email, wrong password) show a clear inline message.
- [ ] Logout clears the token and returns to login.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-005: Pickup, destination, and service selection persisted to a booking draft
**Description:** As a customer, I want to enter pickup and destination and pick a service so the system knows my trip.

**Acceptance Criteria:**
- [ ] Existing map pickup/destination entry and service selector remain functional.
- [ ] Selected pickup/destination (name + lat/lng), service, and computed distance are captured for booking creation.
- [ ] Distance is computed (existing client calc is fine) and passed to the fare step.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-006: Fare estimate (MOCK) and booking confirmation
**Description:** As a customer, I want a fare estimate and a confirm step so I can book a flight.

**Acceptance Criteria:**
- [ ] Fare estimate is shown using a **mock pricing function** (e.g. base + per-km by service), isolated in one place clearly marked as mock-to-be-replaced.
- [ ] Confirming calls `POST /api/bookings`, persisting a Booking with status `requested` tied to the logged-in customer.
- [ ] Confirmation screen reflects the saved booking (id, route, service, fare).
- [ ] A booking cannot be created unless pickup, destination, and service are set.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-007: Booking status tracking + live tracking view (MOCK position)
**Description:** As a customer, I want to track my booking's status so I know what's happening.

**Acceptance Criteria:**
- [ ] Tracking view loads the booking's **real status** from `GET /api/bookings/:id` (polled).
- [ ] The status steps (confirmed → enroute → pickup → flying → arrived) reflect the persisted booking status set by the operator.
- [ ] Aircraft **position/ETA on the map is mocked** (animated), clearly marked as placeholder for real GPS.
- [ ] If no active booking exists, the view shows an appropriate empty state.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Operator / Pilot App (role: operator)

#### US-008: Operator login routes to the operator views
**Description:** As an operator, I want to log in and land on my pilot dashboard.

**Acceptance Criteria:**
- [ ] A user with role `operator` logging in is shown the operator view (not the customer booking view).
- [ ] Operator views live in the same `app.html`, shown/hidden by role.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-009: Assigned trip list + trip details
**Description:** As an operator, I want to see trips assigned to me and open their details.

**Acceptance Criteria:**
- [ ] `GET /api/operator/trips` returns bookings assigned to the logged-in operator.
- [ ] List shows route, customer, service, status, and assigned aircraft.
- [ ] Selecting a trip opens a details view with full pickup/destination, distance, fare, and customer info.
- [ ] Empty state when no trips are assigned.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-010: Accept / reject an assigned mission
**Description:** As an operator, I want to accept or reject an assigned trip so dispatch knows if I'll fly it.

**Acceptance Criteria:**
- [ ] Accept sets booking status to `accepted`; reject sets it to `rejected` (and frees it for reassignment by admin).
- [ ] Action calls `POST /api/operator/trips/:id/accept` / `/reject` with role check.
- [ ] The customer's tracking view and the admin dashboard reflect the change.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-011: Status update actions
**Description:** As an operator, I want to push status updates (enroute, picked up, flying, arrived, completed) so the customer and admin see live progress.

**Acceptance Criteria:**
- [ ] Operator can advance the trip through the status sequence via buttons.
- [ ] Each update persists via `POST /api/operator/trips/:id/status` and is reflected in the customer tracking view (US-007).
- [ ] Statuses can only move forward in a sensible order (no skipping backward).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-012: Basic pre-flight checklist (MOCK)
**Description:** As an operator, I want a pre-flight checklist before starting a flight.

**Acceptance Criteria:**
- [ ] A checklist of items (e.g. battery, weather, weight, comms) is shown before moving the trip to `flying`.
- [ ] Implementation is **mock/UI-only** for now (state not necessarily persisted), clearly marked for future real integration.
- [ ] Cannot mark "flying" until all items are checked (client-side gate).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Admin Dashboard (role: admin)

#### US-013: Admin login routes to the admin dashboard
**Description:** As an admin, I want to log in and land on the dashboard.

**Acceptance Criteria:**
- [ ] A user with role `admin` is shown the admin dashboard views, gated by role on both client and API.
- [ ] Admin views live in the same `app.html`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-014: Live bookings dashboard + customer/booking list
**Description:** As an admin, I want to see all bookings and customers so I can manage operations.

**Acceptance Criteria:**
- [ ] `GET /api/admin/bookings` returns all bookings with customer, status, operator, aircraft.
- [ ] Dashboard shows live bookings (auto-refresh/poll) with status indicators.
- [ ] A list view shows customers and their bookings, filterable by status.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-015: Booking assignment screen (pilot + aircraft)
**Description:** As an admin, I want to assign a pilot and aircraft to a booking so the trip can be flown.

**Acceptance Criteria:**
- [ ] For a `requested` (or `rejected`) booking, admin can pick an available operator and aircraft.
- [ ] `POST /api/admin/bookings/:id/assign` sets `operatorId` + `aircraftId` and status to `assigned`.
- [ ] Assigned trip then appears in that operator's list (US-009).
- [ ] Only available aircraft and operators are selectable.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-016: Aircraft / fleet status view + active trip monitoring
**Description:** As an admin, I want to see fleet status and active trips so I can monitor operations.

**Acceptance Criteria:**
- [ ] Fleet view lists aircraft with status (`available | in_flight | maintenance`) from the DB.
- [ ] Active trip monitor shows in-progress bookings with their current status and assigned pilot/aircraft.
- [ ] View reflects status changes pushed by operators (US-011).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-017: Reporting dashboard
**Description:** As an admin, I want a simple reporting view so I can see operational totals.

**Acceptance Criteria:**
- [ ] Shows summary metrics: total bookings, completed trips, active trips, bookings by status, fleet utilization.
- [ ] Metrics come from real persisted data (`GET /api/admin/reports`).
- [ ] Numbers update on refresh.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: Provide an Express backend serving existing static files and an `/api` router.
- FR-2: Connect to Hostinger MySQL via Prisma using env-configured credentials (`DATABASE_URL`), never committed.
- FR-3: Maintain a `users` table with roles `customer`, `operator`, `admin`.
- FR-4: Hash all passwords one-way with bcrypt; never store or return plaintext or the hash.
- FR-5: Provide signup, login (token-issuing), and a token-validating auth middleware with per-role guards.
- FR-6: After login, render consumer, operator, or admin views from the single `app.html` based on the user's role.
- FR-7: Allow customers to create bookings (pickup, destination, service, distance, mock fare) persisted with status `requested`.
- FR-8: Compute fare via a clearly isolated **mock** pricing function.
- FR-9: Allow customers to view their booking status and a live-tracking view (status real; aircraft position **mocked**).
- FR-10: Allow operators to view assigned trips, view details, and accept/reject missions (status persisted).
- FR-11: Allow operators to advance trip status (enroute → picked_up → flying → arrived → completed), reflected to customer and admin.
- FR-12: Provide a **mock** pre-flight checklist that gates marking a trip "flying" client-side.
- FR-13: Allow admins to view all bookings/customers (live), assign a pilot + aircraft to a booking, and monitor active trips.
- FR-14: Provide an aircraft/fleet status view and a reporting dashboard from real data.
- FR-15: Provide a seed script with sample admin, operators, customers, and aircraft.
- FR-16: Mark every mock seam (fare, position/GPS, checklist, payments) clearly in code for later real integration.

## Non-Goals (Out of Scope)

- **Payments / billing** — no real payment processing; fare is a mock estimate only.
- **Real GPS / telemetry** — aircraft position and ETA are simulated, not from real hardware.
- **Real pricing engine** — fare uses a placeholder formula, not surge/dynamic pricing.
- **Real pre-flight / avionics integration** — checklist is UI-only.
- **Push notifications / SMS / email** — no external messaging.
- **Password reset, email verification, OAuth/social login, 2FA** — basic email+password only for MVP.
- **Native mobile apps** — web only, in `app.html`.
- **Multi-leg / scheduled / recurring trips** — single on-demand trips only.
- **Roles beyond the three specified.**

## Design Considerations

- Reuse the existing `app.html` design system (CSS variables, Leaflet map, view/panel components, tracking step UI).
- Operator and admin views should follow the same visual language as the consumer prototype.
- Keep all three role experiences in `app.html`; switch via a single role-aware router/show-hide.
- Existing consumer flow (map, autocomplete, route drawing, tracking steps) should be reused, not rebuilt — only its data source changes from mock to API.

## Technical Considerations

- **Stack:** Node + Express + Prisma ORM, bcrypt for hashing. **DB is env-switchable:** Hostinger **MySQL** by default (production), **SQLite** (`file:./dev.db`) for local testing — selected via `DATABASE_PROVIDER` + `DATABASE_URL`. Keep the schema DB-agnostic (avoid MySQL-only types) so it migrates on both.
- **Reference:** Hostinger MySQL → Node.js connection guide
  (https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/).
- **Env/secrets:** DB credentials and any token secret in `.env` (gitignored); document required vars.
- **Auth token:** a signed or random session token is sufficient for MVP (JWT optional); role is checked server-side, never trusted from the client.
- **Mock seams:** isolate fare calc, position simulation, and checklist so each can be replaced by a real service without touching unrelated code.
- **Existing server:** `server.js` static-serving logic can be folded into Express (`express.static`).
- **Polling vs realtime:** status/tracking updates can use simple polling for MVP (no websockets required).

## Success Metrics

- A customer can sign up, book a flight, and watch its status change end-to-end against real data.
- An admin can assign a pilot + aircraft, and that trip appears for the operator.
- An operator can accept a trip and advance its status, and the customer sees each change.
- Passwords exist in the database only as bcrypt hashes (verified by inspection).
- All three roles are served from the single `app.html`.
- No regression in the existing consumer map/booking UI.

## Open Questions

- Should `customer` signup be public while `operator`/`admin` accounts are created only by an admin (or seeded)? (Recommended: operators/admins seeded or admin-created; only customers self-signup.)
- Token storage: `localStorage` vs cookie — any preference given the single-file app?
- Should rejected bookings auto-return to the admin queue, or notify admin explicitly?
- Exact service tiers and their mock base/per-km fares — use the tiers already in `app.html`?
- Aircraft status transitions — should assigning a trip flip an aircraft to `in_flight` automatically on trip start?
