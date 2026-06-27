# PRD: Multi-Role Auth Page & Admin User Management

## Introduction

The IraGo auth page at `https://irago.in/app.html` currently shows a customer-style
login form and a single registration form. The platform actually serves three
roles — **customer**, **operator** (pilot), and **admin** — but there is no clear,
correct path for each one:

- The login form does not communicate that operators and admins also sign in here,
  and admins have no landing page (they currently fall back to the customer booking
  view).
- The registration form looks generic but the backend always creates a `customer`
  account, with no way for an admin to create operator or admin accounts from the UI.

This feature reshapes the auth experience around how accounts are actually created:

- **Customers** self-register through the public registration form.
- **Operators and admins** are **not** self-registered. They are created by an
  existing admin from a new **Admin Dashboard** (admins can add operators and add
  other admins).
- **Login** is shared by all three roles and routes each user to the correct area:
  customers → booking, operators → pilot console, admins → the new Admin Dashboard.

## Goals

- Make the auth page clearly serve all three roles, with correct routing per role.
- Keep public self-registration limited to **customers** only.
- Give admins a dashboard with a **User Management** section to create operator and
  admin accounts and view existing users.
- Add a secure, admin-only backend API for creating and listing users.
- Ensure operator/admin accounts can never be created by public self-signup.

## User Stories

### US-001: Admin-only "create user" API
**Description:** As an admin, I want a secure endpoint to create operator and admin accounts so that elevated accounts are never self-registered.

**Acceptance Criteria:**
- [ ] New route file `src/admin-routes.js`, mounted at `/api/admin` in `src/api.js`.
- [ ] `POST /api/admin/users` is protected by `requireAuth` then `requireRole("admin")`.
- [ ] Accepts JSON body `{ name, email, password, role }`.
- [ ] Validates: name/email/password required, email matches the existing `EMAIL_RE`, password length ≥ 6 (mirror `auth-routes.js` rules).
- [ ] `role` must be one of `["operator", "admin"]`; reject `"customer"` and any unknown value with `400` (customers use public signup).
- [ ] Returns `409` if the email already exists (case-insensitive, lowercased like signup).
- [ ] Password stored only as a bcrypt hash via `hashPassword`; response never includes `passwordHash`.
- [ ] On success returns `201` with the public user object `{ id, name, email, role }`.
- [ ] A non-admin (customer/operator) token receives `403`; a missing/invalid token receives `401`.
- [ ] Lint/typecheck passes (`npm run` lint/check as configured).

### US-002: Admin-only "list users" API
**Description:** As an admin, I want to list existing users so the dashboard can show who already has access.

**Acceptance Criteria:**
- [ ] `GET /api/admin/users` protected by `requireAuth` + `requireRole("admin")`.
- [ ] Returns `{ users: [{ id, name, email, role, createdAt }, ...] }` ordered by `createdAt` descending (or `id` descending).
- [ ] Response never includes `passwordHash`.
- [ ] Optional `?role=operator|admin|customer` query filters by role when present; invalid values are ignored or `400` (document which).
- [ ] Non-admin → `403`; unauthenticated → `401`.
- [ ] Lint/typecheck passes.

### US-003: Admin Dashboard view shell + role routing
**Description:** As an admin, I want to land on a dedicated dashboard after login so I have a home base instead of the customer booking view.

**Acceptance Criteria:**
- [ ] New `<div id="admin-view" class="view">` added to `app.html`, structured like `operator-view` (nav with logo, role badge "Admin Console", avatar with `logout()`).
- [ ] `routeForRole()` gains an `admin` case that calls `showView('admin-view')` and loads the user list (US-005), and sets the avatar initial + a welcome line.
- [ ] Admins no longer fall back to the booking view.
- [ ] Customer and operator routing are unchanged.
- [ ] Lint passes.
- [ ] Verify in browser using dev-browser skill: logging in as `admin@irago.test` / `password123` lands on the Admin Dashboard.

### US-004: "Add user" form on the Admin Dashboard
**Description:** As an admin, I want a form to add an operator or another admin so I can provision team accounts.

**Acceptance Criteria:**
- [ ] Admin Dashboard has an "Add Team Member" form with fields: Full Name, Email, Password, and a **Role** selector limited to `Operator` and `Admin`.
- [ ] Submitting calls `POST /api/admin/users` using the shared authed fetch wrapper (sends the bearer token).
- [ ] Client-side validation mirrors the server (all fields required, password ≥ 6) with inline error messaging consistent with the existing `showAuthError`/auth-error styling.
- [ ] On success: form clears, a success message shows, and the user list (US-005) refreshes to include the new account.
- [ ] Server errors (e.g. `409` duplicate email, `403`) are surfaced as readable messages.
- [ ] Submit button shows a busy state while the request is in flight (reuse `setBusy` pattern).
- [ ] Lint passes.
- [ ] Verify in browser using dev-browser skill: add an operator, confirm it appears in the list and can then log in.

### US-005: User list on the Admin Dashboard
**Description:** As an admin, I want to see existing users so I know who already has access and what role they hold.

**Acceptance Criteria:**
- [ ] On entering the Admin Dashboard, the client calls `GET /api/admin/users` and renders a list/table of users with name, email, and a role badge.
- [ ] Role badges are visually distinct (e.g. admin / operator / customer colors), reusing existing badge styling where possible.
- [ ] Empty/loading and error states are handled (e.g. "Could not load users").
- [ ] Lint passes.
- [ ] Verify in browser using dev-browser skill: list shows the seeded admin, operators, and customers.

### US-006: Auth page clarity — customer-only registration, all-role login
**Description:** As a visitor, I want the auth page to make clear that registration is for customers while operators/admins sign in with provisioned accounts, so I don't get confused.

**Acceptance Criteria:**
- [ ] The registration card is explicitly framed as customer signup (e.g. heading/subtext "Create your customer account").
- [ ] A short helper line tells operators/admins to sign in with the account provided by their administrator (no public operator/admin registration).
- [ ] The login card heading/subtext communicates it serves all roles (single shared login).
- [ ] No role selector is added to the public signup form (signup stays customer-only; backend continues to ignore/deny any client-supplied role on `/api/auth/signup`).
- [ ] Existing customer signup and login flows still work unchanged.
- [ ] Lint passes.
- [ ] Verify in browser using dev-browser skill: copy renders correctly and toggling between login/register still works.

### US-007: Backend signup hardening (defense in depth)
**Description:** As a security-conscious developer, I want public signup to be incapable of creating elevated accounts even if the client sends a `role`.

**Acceptance Criteria:**
- [ ] `POST /api/auth/signup` ignores any `role` field in the body and always inserts `role = "customer"` (confirm current behavior and add a test).
- [ ] A test asserts that posting `{ role: "admin" }` to `/api/auth/signup` still yields a `customer` account.
- [ ] Existing `test/auth.test.js` continues to pass.
- [ ] Lint/tests pass.

## Functional Requirements

- FR-1: Add `src/admin-routes.js` exposing `POST /api/admin/users` and `GET /api/admin/users`, mounted at `/api/admin` in `src/api.js`.
- FR-2: Both admin routes must require a valid bearer token (`requireAuth`) and the `admin` role (`requireRole("admin")`).
- FR-3: `POST /api/admin/users` must accept `{ name, email, password, role }`, validate inputs, restrict `role` to `operator` or `admin`, reject duplicate emails (`409`), hash the password with bcrypt, and return the public user object (`201`).
- FR-4: `GET /api/admin/users` must return all users (or filtered by `?role=`) without password hashes.
- FR-5: `app.html` must contain an `#admin-view` with an Admin Console nav, an "Add Team Member" form, and a user list section.
- FR-6: `routeForRole()` must route `admin` users to `#admin-view`, customers to `#booking-view`, and operators to `#operator-view`.
- FR-7: The Add Team Member form's role selector must offer only `Operator` and `Admin`.
- FR-8: The public registration form must remain customer-only in both UI copy and backend behavior.
- FR-9: All admin API calls from the client must use the existing authenticated fetch wrapper so the bearer token is attached and `401` triggers the existing logout/redirect handling.

## Non-Goals (Out of Scope)

- No public self-registration for operators or admins.
- No invite-code or email-verification flow for created accounts (admin sets the initial password directly).
- No edit/delete/disable user functionality in this iteration (create + list only).
- No password reset / change-password flow.
- No real Google OAuth (the existing `googleStub` stays as-is).
- No operator-specific provisioning beyond account creation (aircraft assignment etc. is unchanged).
- No changes to the customer booking or operator trip flows.

## Design Considerations

- Reuse existing patterns and styles already in `app.html`:
  - View switching via `showView()` and the `.view` / `.view.active` convention.
  - Auth form field styling (`.auth-field`, `.btn-auth-primary`), error styling (`.auth-error`, `showAuthError`/`hideAuthError`), and busy state (`setBusy`).
  - Nav structure and role badge styling from `#operator-view` (`.op-role-badge`).
- The Admin Console should visually echo the Operator Console (same nav, badge labeled "Admin Console") for consistency.
- Role badges in the user list should be color-coded (admin, operator, customer).

## Technical Considerations

- **Bootstrapping the first admin:** the seed script (`scripts/seed.js`) already creates `admin@irago.test` (password `password123`). This is how the first admin exists; the dashboard then creates the rest. Document this in the README if not already.
- **Auth utilities already exist:** `requireAuth`, `requireRole`, `hashPassword`, `ROLES` in `src/auth.js`; `EMAIL_RE` + `publicUser` pattern in `src/auth-routes.js` (consider extracting `publicUser`/`EMAIL_RE` to a shared spot to avoid duplication).
- **DB:** `users` table already has `role VARCHAR(32)` and a unique `email`; no schema migration required.
- **Client session:** reuse the shared authed fetch wrapper (around `app.html:1967`) that injects the bearer token and handles `401`.
- **Testing:** extend `test/auth.test.js` (or a new `test/admin.test.js`) to cover admin route authz (401/403/201/409) and the signup role-hardening case.

## Success Metrics

- An admin can create an operator account in under 30 seconds from the dashboard, and that operator can immediately log in and reach the pilot console.
- 100% of attempts to self-register as operator/admin via the public form or API result in a `customer` account or a rejection (never an elevated account).
- Each role lands on its correct view on login with no fallback to the wrong dashboard.

## Open Questions

- Should the user list support pagination/search now, or is a simple full list acceptable for the expected number of users?
- Should admins be able to create `customer` accounts from the dashboard too, or strictly operator/admin (current assumption: operator/admin only)?
- Should there be any guardrail preventing removal/lockout of the last admin (relevant once edit/delete is added later)?
- Do operators or admins need a phone number captured at creation (the customer register form has a phone field; the create-user API currently does not)?
