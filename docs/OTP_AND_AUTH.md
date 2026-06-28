# OTP Email, Session Cookies & Role Dashboards

This document describes the authentication system, OTP flows, rate limits, and the three role-specific dashboards.

## Session security (JWT in HttpOnly cookie)

| Setting | Default | Env var |
|---------|---------|---------|
| Cookie name | `irago_session` | `AUTH_COOKIE_NAME` |
| Token TTL | 7 days | `AUTH_COOKIE_TTL_SECONDS` |
| Secure flag | On in production | `AUTH_COOKIE_SECURE=true` |
| SameSite | Lax | — |
| HttpOnly | Yes (JS cannot read token) | — |

The server signs tokens with HMAC-SHA256 (`AUTH_SECRET`). Clients send the cookie automatically via `credentials: 'include'`. Bearer tokens in the `Authorization` header are still accepted for tests and API clients.

**Endpoints:** `POST /api/auth/passenger|operator|admin/login`, verify-signup, and reset-password set the cookie. `POST /api/auth/logout` clears it.

**Frontend portals:** `/login/passenger`, `/login/operator`, `/login/admin` (and matching `/signup/*` URLs).

## OTP email system

### Configuration (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMTP_HOST` | `smtp.gmail.com` | Mail server |
| `SMTP_PORT` | `587` | Port |
| `SMTP_USER` | — | App email address |
| `SMTP_PASS` | — | App password (e.g. Gmail app password) |
| `SMTP_FROM` | `IraGo <noreply@...>` | From header |

If `SMTP_USER` / `SMTP_PASS` are unset or delivery fails, OTP requests return **503** with a generic error. Codes are **never** logged, returned in API responses, or shown in the UI.

OTP codes in `otp_requests.codeHash` are stored as **bcrypt hashes only** (same as passwords). Plaintext exists only in transit to email, then in memory during verification.

Signup payloads (name, password hash, role) are **AES-256-GCM encrypted** in `otp_requests.payload` using a key derived from `AUTH_SECRET`. Expired and consumed OTP rows are **purged on server startup** and before each new OTP send.

### Rate limits

| Limit | Value | Env var |
|-------|-------|---------|
| OTP validity | **1 minute** | hard-coded in `src/otp-limits.js` |
| Resend cooldown | **5 minutes** | hard-coded in `src/otp-limits.js` |
| Daily cap per email | **20 OTPs** | hard-coded in `src/otp-limits.js` |
| Max wrong guesses | 5 | hard-coded in `src/otp-limits.js` |

### Flows

1. **Customer signup (two-step)**
   - `POST /api/auth/signup-request` — validates input, sends OTP, stores bcrypt-hashed signup payload
   - `POST /api/auth/verify-signup` — verifies OTP, creates customer account, sets session cookie

2. **Forgot / reset password (all roles: customer, operator, admin)**
   - `POST /api/auth/forgot-password` — sends reset OTP (generic response; no email enumeration)
   - `POST /api/auth/reset-password` — verifies OTP, updates password, sets session cookie
   - `POST /api/auth/resend-otp` — resend with rate limits

3. **Change password (logged in)**
   - `POST /api/auth/change-password` — `{ currentPassword, newPassword }`

4. **Admin-initiated password reset**
   - `PATCH /api/admin/users/:id/password` — admin sets a new password directly (any role)
   - `POST /api/admin/users/:id/send-reset-otp` — admin triggers OTP email to that user

## Three dashboards (role routing)

After login, `routeForRole()` sends each user to their dashboard:

| Role | Dashboard | View ID | Features |
|------|-----------|---------|----------|
| `customer` | **Customer Dashboard** | `#booking-view` | Air Taxi, Golden Hour, Air Shuttle; map booking; live tracking |
| `operator` | **Pilot Console** | `#operator-view` | Assigned trips, accept/reject, trip status |
| `admin` | **Admin Console** | `#admin-view` | Add team members, list users, reset passwords, send OTP |

Entry points:
- Marketing site: [index.html](/) → **Platform** / **Book a Ride** → [app.html](/app.html)
- Single login screen; role is determined by the account, not a separate URL

## Database

Table `otp_requests` stores hashed OTP codes, purpose (`signup` | `reset_password`), optional JSON payload, expiry, and attempt counts.

Column `users.emailVerified` is set to `1` for verified signups and bootstrapped admin.

## Files changed

| File | Change |
|------|--------|
| `src/email.js` | SMTP OTP delivery |
| `src/otp.js` | OTP generation, verification, rate limits |
| `src/auth.js` | Cookie helpers, `extractToken` |
| `src/auth-routes.js` | OTP signup, forgot/reset, change-password, logout |
| `src/admin-routes.js` | Admin password reset + send OTP |
| `src/schema.js` | `otp_requests` table, `emailVerified` column |
| `server.js` | `cookie-parser` middleware |
| `app.html` | Auth UI, three dashboards, admin reset buttons |
| `index.html` | Links to platform |
| `.env.example` | SMTP and OTP variables |
