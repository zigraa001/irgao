# PRD: Simplify Auth — Remove Google Sign-In & Phone OTP, Full-Page Login, Single-Form Registration

## Introduction

The IraGo auth experience at `https://irago.in/app.html` currently advertises features that don't work in production (Google sign-in has no configured credentials, and mobile OTP verification isn't supported), uses a split-screen login layout with a marketing panel, and spreads passenger registration across a 2-step wizard (personal details → email OTP + phone OTP).

This feature simplifies the entire auth surface:

1. **Remove Google sign-in** everywhere (UI button, dead code paths, phone-collection card).
2. **Remove mobile/phone OTP verification** from registration — email OTP only.
3. **Full-page login** — remove the right-side dark hero panel; center the auth card on the full viewport.
4. **Single-form registration** — all fields (name, gender, age, email, password) on one page with inline email OTP verification. `https://irago.in/app.html?register=1` deep-links straight to this form.
5. **Prominent signup CTA** — replace the small "Don't have an account? Register" text link with a clearly visible secondary "Create passenger account" button.
6. **Login page critique fixes** — visual and UX-flow improvements identified in the critique below (Section: Design Considerations).

## Goals

- Zero non-functional auth options visible to users (no Google button, no phone OTP fields).
- Registration completes in a single form with only email verification.
- `app.html?register=1` opens the registration form directly (no extra clicks).
- Login page renders as a single centered full-page layout on all screen sizes.
- Signup CTA is a visible button, not a text link — discoverable within 2 seconds of page load.
- Improved perceived quality: loading states, password visibility toggle, inline validation, better error copy.

## Current State (for the implementer)

| Piece | Location |
|---|---|
| Login view markup (`#login-view`, `.login-left`, `.login-right`) | `app.html:50-335` |
| Google button (`.btn-google`, `doGoogleSignIn`) | `app.html:75-78` |
| Register step-1 card (`#register-passenger-card`) | `app.html:103-138` |
| Register step-2 card with email + phone OTP (`#register-verify-card`) | `app.html:141-203` |
| Google phone-collection card (`#google-phone-card`) | `app.html:273-306` |
| Auth client JS (register flow, google flow, `goToSignupPortal`, `?register=1` handling) | `js/app/02-auth.js` (bundled to `js/app.bundle.js`) |
| Login/auth CSS (`#login-view`, `.login-left/right`, `.btn-google`, `.auth-switch`) | `css/app.css:73-165, 474-537, 2069` |
| Signup server handlers (email + phone OTP) | `src/role-signup.js` |
| Google OAuth server routes (`/api/auth/google*`) | `src/auth-routes.js:419+`, `src/google-auth.js` |
| Profile modal phone-verification block (`#profile-phone-block`) | `app.html:1277-1304` |

Note: the JS is developed in `js/app/*.js` modules and bundled to `js/app.bundle.js`. Both must stay in sync (check for a build script; if edits are made directly to the bundle, mirror them in the module files).

## User Stories

### US-001: Remove Google sign-in from the client
**Description:** As a passenger, I should not see a "Continue with Google" option that doesn't work, so that I'm never dead-ended.

**Acceptance Criteria:**
- [ ] `.btn-google` button removed from `app.html`
- [ ] `#google-phone-card` markup removed from `app.html`
- [ ] Client JS removed/neutralized: `doGoogleSignIn`, `googlePhoneSendOtp`, `googlePhoneVerify`, `googlePhoneResendOtp`, `googlePending` state, and the `google_success`/`google_error`/`google_pending` URL-param handling in `js/app/02-auth.js` (and rebundled)
- [ ] `.btn-google` CSS removed from `css/app.css`
- [ ] No console errors on page load after removal
- [ ] Verify in browser using dev-browser skill

### US-002: Remove Google OAuth server routes
**Description:** As a maintainer, I want dead Google OAuth endpoints removed so the attack/maintenance surface shrinks.

**Acceptance Criteria:**
- [ ] `GET /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/google/send-phone-otp` (and any sibling google routes) removed from `src/auth-routes.js`
- [ ] `src/google-auth.js` deleted; all imports of it removed
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` entries removed from `.env.example`
- [ ] Server boots without errors; existing email/password login still works (manual test)

### US-003: Full-page login layout (remove right panel)
**Description:** As a passenger, I want a focused full-page sign-in screen so the login feels clean and direct.

**Acceptance Criteria:**
- [ ] `.login-right` markup (dark hero with "Sky is no longer the limit") removed from `app.html`
- [ ] `#login-view` renders the auth card centered horizontally and vertically on the full viewport (desktop and mobile)
- [ ] Related CSS (`.login-right*`, `.login-features`, `.login-feature*`) removed; `.login-left` restyled to fill the page (rename to `.login-page` or reuse)
- [ ] Logo + tagline remain above the card; page has a subtle non-distracting background
- [ ] No horizontal scroll at 360px, 768px, 1440px widths
- [ ] Verify in browser using dev-browser skill

### US-004: Prominent "Create passenger account" button
**Description:** As a new passenger, I want an obvious signup button on the login page so I don't hunt for a small text link.

**Acceptance Criteria:**
- [ ] The "Don't have an account?" text-link row is replaced by: a visual divider (e.g. a thin rule with "New to IraGo?" label) followed by a full-width secondary button labeled **"Create passenger account"**
- [ ] Button styled as secondary (outlined/tonal), visually distinct from the primary "Sign In" button but clearly a button (not a link)
- [ ] Clicking it navigates to `/app.html?register=1`
- [ ] Button only appears for the Passenger role tab (operator/admin roles keep no self-signup)
- [ ] Verify in browser using dev-browser skill

### US-005: Single-form registration with email-only verification
**Description:** As a new passenger, I want to register on one page with just my email verified so signup takes under a minute.

**Acceptance Criteria:**
- [ ] `#register-passenger-card` and `#register-verify-card` replaced by ONE card containing: Full Name, Gender, Age, Email, Password — plus inline email OTP verification
- [ ] Step indicator ("1 Personal details / 2 Verify") removed
- [ ] Flow: user fills all fields → clicks "Send verification code" → email OTP input appears inline on the same card → user enters 6-digit code → clicks "Create account"
- [ ] All phone fields, phone OTP inputs, and `regSendPhoneOtp`/`regResendPhoneOtp` client code removed
- [ ] Client-side validation before sending OTP: name non-empty, valid email format, password ≥ 6 chars (gender/age optional per current server rules)
- [ ] Resend-code button with the existing 30s cooldown pattern
- [ ] "Already have an account? Sign in" link retained at the bottom
- [ ] Verify in browser using dev-browser skill

### US-006: Server accepts email-only signup
**Description:** As a maintainer, I want the signup endpoints to create accounts with email OTP alone, with phone code paths removed.

**Acceptance Criteria:**
- [ ] `src/role-signup.js`: `verify-signup` creates the account with a verified email OTP only; phone/phoneOtp parameters and `send-phone-otp` endpoint removed
- [ ] Phone-uniqueness check in `signup-request` removed (no phone collected at signup)
- [ ] New accounts persist with `phone = NULL` and no phone-verified flag; login works immediately after creation
- [ ] Existing accounts that already have phone numbers are unaffected
- [ ] Manual test: full register → verify → login round-trip succeeds

### US-007: `?register=1` deep link opens the registration form
**Description:** As a marketer/passenger, I want `https://irago.in/app.html?register=1` to land directly on the create-account form.

**Acceptance Criteria:**
- [ ] Loading `/app.html?register=1` while logged out shows the single registration card immediately (no login card flash where avoidable)
- [ ] Loading it while logged in redirects to the normal logged-in view (current behavior preserved)
- [ ] `goToSignupPortal()` / landing-page `signupUrl` links keep working
- [ ] Verify in browser using dev-browser skill

### US-008: Login card UX polish
**Description:** As a passenger, I want a smoother, clearer sign-in experience.

**Acceptance Criteria:**
- [ ] Password field has a show/hide (eye) toggle on login AND registration forms
- [ ] "Sign In" button shows a loading state (spinner or "Signing in…") and is disabled while the request is in flight
- [ ] Failed login shows a friendly inline error ("Incorrect email or password" — not raw server text) without clearing the email field
- [ ] Email field autofocuses on page load (login card) and on card switch (register card focuses name field)
- [ ] Inline field validation on blur: invalid email format and short password show per-field hints before submit
- [ ] "Forgot password?" moved next to the Password label (right-aligned) per common convention
- [ ] Role switcher (Passenger/Operator/Admin) remains functional and visually de-emphasized below the signup CTA
- [ ] Verify in browser using dev-browser skill

### US-009: Clean up phone verification remnants in profile
**Description:** As a signed-in passenger, I should not be pushed to verify a phone number that the platform no longer verifies.

**Acceptance Criteria:**
- [ ] Profile modal `#profile-phone-block` either (a) removed, or (b) reduced to an optional plain phone-number field with no OTP flow — pick (b) if bookings/dispatch display passenger phone anywhere, else (a)
- [ ] No "Verify phone" CTAs remain anywhere in the passenger UI
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The login view must not render any Google sign-in UI or reference `/api/auth/google*` endpoints.
- FR-2: The server must not expose Google OAuth or phone-OTP signup endpoints (`/api/auth/google*`, `.../send-phone-otp`).
- FR-3: The login view must be a single centered column (logo, tagline, auth card) filling the viewport; the right-side hero panel must be removed.
- FR-4: The login card must contain, in order: title, subtext, email field, password field (with show/hide toggle and right-aligned "Forgot password?" link), primary Sign In button, error region, divider, secondary "Create passenger account" button, role switcher.
- FR-5: Passenger registration must be a single card with fields: Full Name (required), Gender (optional select), Age (optional number), Email (required), Password (required, min 6).
- FR-6: Registration must verify email via 6-digit OTP inline on the same card: "Send verification code" → OTP input appears → "Create account" enabled once a 6-digit code is entered.
- FR-7: The OTP resend button must follow the existing 30-second cooldown pattern with a countdown hint.
- FR-8: `GET /app.html?register=1` must display the registration card on load for logged-out users.
- FR-9: `POST .../verify-signup` must create the account when the email OTP is valid, with no phone parameters accepted or required.
- FR-10: Auth buttons must be disabled with a visible loading state during any in-flight request.
- FR-11: All server error responses shown to users must be mapped to human-friendly messages; raw error codes must never render.
- FR-12: Forgot-password / reset flow (email OTP) must continue to work unchanged.
- FR-13: Operator and Admin sign-in via the role switcher must continue to work unchanged (no self-signup for those roles).

## Non-Goals (Out of Scope)

- No re-implementation of Google sign-in (future work when OAuth credentials exist).
- No SMS infrastructure or phone verification of any kind.
- No changes to operator/admin provisioning flows (admin-created accounts, forced password reset).
- No password-strength meter or password policy changes (min 6 chars stays).
- No changes to the booking, payment, or dashboard views.
- No database migration to drop existing phone columns/data — existing phone data stays; it's just no longer collected/verified at signup.
- No rate-limiting changes (existing OTP cooldowns are kept as-is).

## Design Considerations — Login Page Critique & Improvements

Critique of the current login page, driving US-003/004/008:

1. **Dead options erode trust** — a Google button that errors out and a phone OTP that never delivers make the product feel broken. *Fix: remove entirely (US-001/005).*
2. **Split-screen dilutes focus** — the marketing hero repeats the landing page's job; on login the user has already decided. *Fix: single centered column, max-width ~420px card (US-003).*
3. **Buried signup path** — "Register" is a small inline text button; new users scan for a button. *Fix: full-width secondary CTA with divider (US-004).*
4. **2-step wizard for 5 fields is over-engineered** — a step indicator for one screen of inputs adds friction and abandonment risk. *Fix: single form, inline OTP (US-005).*
5. **No feedback during async actions** — buttons stay static during network calls; double-click causes duplicate requests. *Fix: loading/disabled states (US-008, FR-10).*
6. **No password visibility toggle** — typos in masked fields are the top login-failure cause on mobile. *Fix: eye toggle (US-008).*
7. **"Forgot password?" placement** — currently below the submit button where users look last. *Fix: right of the password label (US-008).*
8. **Role switcher prominence** — 3 equally-weighted role tabs confuse ordinary passengers; 95%+ of visitors are passengers. *Fix: keep passenger as default, visually de-emphasize the switcher at the card's bottom (US-008).*
9. **Reuse existing components:** `.auth-card`, `.auth-field`, `.btn-auth-primary`, `.auth-error`, `.otp-resend-hint` patterns, and the existing toast system. New secondary button can mirror `.btn-profile-outline`.

## Technical Considerations

- **JS bundle discipline:** source modules live in `js/app/*.js` (auth logic in `02-auth.js`) and are bundled into `js/app.bundle.js` referenced with a `?v=` cache-buster. Update the bundle AND bump the `?v=` hash in `app.html:1340`, or stale clients will run old auth code (there is aggressive SW/cache-nuking in `app.html` but the `?v=` bump is still the intended mechanism).
- **Server compatibility window:** keep `verify-signup` tolerant of (ignoring) stray `phone`/`phoneOtp` params for a deploy overlap window rather than 400-ing.
- **`otp-channel.js` / mobile OTP helpers:** `createAndSendMobileOtp` and `normalizePhone` become unused by signup — remove imports from `role-signup.js`; delete the helpers only if nothing else (profile flow per US-009 decision) uses them.
- **Legacy `#otp-card`:** kept — still used by forgot-password and operator flows (`app.html:209`).
- **`register=1` while a session cookie exists:** current behavior redirects to the app; preserve it.

## Success Metrics

- Registration completion (start → account created) requires ≤ 2 network actions from the user's perspective (send code, create account).
- Zero user-facing references to Google sign-in or phone verification after deploy.
- Login page renders correctly (no layout break, no dead buttons) at 360px, 768px, 1440px.
- No regression in login success for existing passengers, operators, or admins.

## Open Questions

1. US-009 choice: does any operator/dispatch/admin screen display passenger phone numbers (making the optional plain phone field worth keeping in the profile)? Grep for `phone` usage in operator/admin render code before deciding remove-vs-simplify.
2. Should the `users.phone` column and `send-phone-otp` OTP-channel code be fully deleted now, or left dormant for a future re-introduction? (PRD assumes: leave column, delete dead endpoints.)
3. Is there a build script for `js/app/*.js` → `app.bundle.js`, or is the bundle maintained by concatenation? Implementer must confirm before editing.
