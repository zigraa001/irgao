# PRD: Modern UX Redesign — app.html (All Views)

## Introduction

The IraGo web app (`app.html`) is functionally complete but visually dated — square corners (2–4px radii), flat gray surfaces, cramped spacing, Helvetica-only typography, and utilitarian tables make it feel like a website from 20 years ago. This PRD modernizes the UX of **all four views** — Login/Auth, Passenger Booking, Operator (Pilot) Console, and Admin Console — while **keeping the existing IraGo brand** (deep navy `#0B1F3A`, corporate blue `#0057B8`) and **preserving every existing flow and JS behavior**.

The redesign direction: contemporary product-app look — soft rounded corners, layered shadows, refined typography with a modern font, generous whitespace, clear visual hierarchy, smooth micro-interactions — comparable to modern mobility apps (Uber, Lyft) and modern admin dashboards (Linear, Vercel).

Passenger-facing surfaces (login + booking) get the deepest polish; operator and admin get a full but slightly lighter pass.

## Goals

- Modernize the visual design of every view in `app.html` without breaking any existing functionality
- Keep the IraGo brand palette (navy + corporate blue) as the identity anchor
- Establish a single modern design token set in `css/app.css` that all components use
- Improve perceived quality: typography, spacing rhythm, elevation, interactive states (hover/focus/active/disabled)
- Improve information hierarchy on data-dense screens (admin tables, dashboards, ride lists)
- Maintain responsiveness at 360px, 768px, 1024px, and 1440px widths

## Hard Constraints (apply to EVERY story)

These are non-negotiable and must be respected in every story:

1. **Do NOT rename or remove any element `id` attribute** — the vanilla JS in `js/app/*.js` references them directly.
2. **Do NOT rename existing CSS classes that JS references** (e.g., classes toggled via `classList`, queried via `querySelector`). Adding new classes alongside existing ones is fine. Grep `js/app/*.js` for a class name before renaming it.
3. **Do NOT change any `onclick`/`onkeydown`/inline handler wiring** unless a story explicitly says so.
4. **Never edit `js/app.bundle.js` directly** — edit `js/app/*.js` and run `npm run build:js` (auto-bumps cache-busters in app.html).
5. After CSS-only changes, manually bump the `?v=` cache-buster on the `css/app.css` link in `app.html`.
6. Watch for smart/curly quotes in JS — they pass typecheck but crash at runtime.
7. `npm run typecheck` must pass before every commit.
8. Marketing pages (`index.html`, `contact.html`, etc.) use `css/tokens.css` and other stylesheets — **do not modify those files**; the app redesign lives entirely in `css/app.css` (+ `app.html` markup).

## User Stories

### US-001: Modern design foundation (tokens, typography, base styles)
**Description:** As a user, I want the app to use a modern type scale, rounded corners, and soft elevation so every screen immediately feels current.

**Acceptance Criteria:**
- [ ] Add Google Fonts `Inter` (weights 400/500/600/700/800, `display=swap`) to `app.html` head with preconnect; body font-family becomes `'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- [ ] Update `:root` tokens in `css/app.css`: `--radius-sm: 8px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 18px`, `--radius-2xl: 24px` (keep `--radius-full`)
- [ ] Replace shadow tokens with modern layered shadows (e.g., `--shadow-sm: 0 1px 2px rgba(15,23,42,.06)`, `--shadow-md: 0 4px 12px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.05)`, `--shadow-lg: 0 12px 32px rgba(15,23,42,.12), 0 2px 6px rgba(15,23,42,.06)`, `--shadow-xl: 0 24px 60px rgba(15,23,42,.18)`)
- [ ] Add new tokens: `--focus-ring: 0 0 0 3px rgba(0,87,184,.25)`, `--surface: #FFFFFF`, `--surface-subtle: #F6F8FB`, `--border-subtle: #E6EAF0`, `--transition: .18s cubic-bezier(.4,0,.2,1)`
- [ ] Page background becomes a subtle cool off-white (`#F6F8FB` or similar), not flat `#F0F4F8`
- [ ] Global `:focus-visible` style using `--focus-ring` on buttons, inputs, selects, textareas, and links; remove any `outline: none` without replacement
- [ ] Because most components inherit `var(--radius-*)`/`var(--shadow-*)`, the whole app visibly softens with this one change — spot-check login card, booking panel, admin tables for breakage
- [ ] No element id/class renames; no JS changes required
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (screenshot login + booking views)

### US-002: Login & auth cards redesign
**Description:** As a passenger, I want a polished, welcoming sign-in screen so my first impression of IraGo is a modern, trustworthy product.

**Acceptance Criteria:**
- [ ] `#login-view` background upgraded from flat gray to a subtle brand treatment (e.g., very soft radial/linear gradient from `--blue-50` to white, or navy-tinted top area) — must stay calm and non-distracting
- [ ] `.auth-card` restyled: `--radius-2xl` corners, `--shadow-lg`, ~32–40px padding, max-width ~420px
- [ ] All auth inputs: 48px min height, `--radius-md` corners, `--border-subtle` 1px border, white background, focus state = blue border + `--focus-ring`; placeholder color `--gray-400`
- [ ] `.btn-auth-primary`: solid `--blue`, white text, 48px height, `--radius-md`, hover = `--blue-dark` + slight lift (`translateY(-1px)` + shadow), active = pressed (no lift), disabled = 50% opacity; smooth `--transition`
- [ ] `.btn-google` restyled to match the new input/button geometry (48px, rounded, subtle border, hover background `--gray-50`)
- [ ] Role switcher (`.auth-role-switcher`) becomes a subtle segmented control (pill container with `--gray-100` background, active segment white with `--shadow-sm`) — keep the same button elements, ids, data attributes, and `switchLoginRole` wiring
- [ ] Card headings: `h2` at 24–28px weight 700, `.auth-subtext` at 15px `--gray-500`
- [ ] Same treatment applied consistently to ALL auth cards: `#login-card`, `#register-passenger-card`, `#otp-card`, `#forgot-card`, `#reset-card`
- [ ] Error (`.auth-error`) and success (`.auth-success`) messages styled as soft rounded alert chips (light red/green backgrounds, small icon optional)
- [ ] No element ids removed/renamed; registration and forgot/reset flows still work end to end
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (login card, register card, forgot card screenshots)

### US-003: Booking view top navigation & service tabs redesign
**Description:** As a passenger, I want a clean modern app header with clear service switching so navigation feels effortless.

**Acceptance Criteria:**
- [ ] `.booking-nav` restyled: white/translucent background with subtle bottom border (`--border-subtle`), consistent 64px height, comfortable horizontal padding, optional `backdrop-filter: blur` (with solid fallback)
- [ ] `.service-tabs` becomes a modern segmented control: pill-shaped container (`--gray-100` bg, `--radius-full`), active tab = white bg + `--shadow-sm` + `--blue` text/icon, inactive = `--gray-500` with hover state; smooth transition when switching
- [ ] Keep all four `data-service` buttons, their ids, icons, and `switchService()` handlers untouched
- [ ] `.customer-role-badge`, `.op-role-badge`, `.admin-role-badge` restyled as small rounded chips (soft blue/navy backgrounds, 12px semibold text) — same class names
- [ ] `.nav-bell` and `.nav-text-btn` get 36–40px circular/rounded hover targets with `--gray-100` hover background
- [ ] `.nav-avatar` becomes a 36px circle with brand-gradient background (navy→blue) and white initial, subtle ring on hover
- [ ] Nav is responsive: at ≤768px the service tab labels may hide leaving icons (CSS-only, e.g., hiding text via media query while keeping accessible labels via `aria-label` added in markup)
- [ ] Same nav treatment applied to the operator and admin navs (they share `.booking-nav`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (desktop + 375px width screenshots)

### US-004: Booking panel redesign (locations, routes, ride results)
**Description:** As a passenger, I want the booking panel to feel like a premium mobility app so finding and booking a ride is pleasant and clear.

**Acceptance Criteria:**
- [ ] `.booking-panel` restyled: white surface, `--shadow-lg` edge or clean border, comfortable section padding (20–24px), refined section rhythm
- [ ] Location inputs group redesigned as a single connected card: pickup/destination inputs inside one rounded container (`--radius-lg`, `--border-subtle`), with the pickup dot, vertical connector line, and destination dot rendered as a left rail (CSS on existing `.loc-dot` elements or new decorative elements); inputs borderless inside the container with an inner divider
- [ ] `.loc-input` focus highlights the whole group (border color → `--blue` + focus ring on the container via `:focus-within`)
- [ ] `.swap-btn` becomes a floating circular button (white, `--shadow-md`, border) positioned on the divider between the two inputs; keep `swapLocations()` wiring
- [ ] `.loc-suggest` dropdown restyled: `--radius-lg`, `--shadow-xl`, 8px padding, rounded hover rows with `--gray-50` hover
- [ ] Popular routes (`#popular-routes-area` content) styled as horizontal scrollable rounded chips with icon + hover state (style whatever markup JS renders into it — check `js/app/06-booking.js` for the generated class names and style those)
- [ ] `.search-btn`: full-width, 50px, `--radius-md`, brand blue with hover lift, loading state style preserved
- [ ] Ride result cards in `#rides-list` (classes generated by JS — check `js/app/06-booking.js`): white rounded cards (`--radius-lg`), `--border-subtle`, hover = border-blue + `--shadow-md`, selected = 2px `--blue` border + `--blue-50` tint; price emphasized (18px bold navy), metadata in `--gray-500` 13px
- [ ] `.profile-account-card` restyled to match the new card language
- [ ] Drone panel (`#drone-panel`) sections inherit the same card/chip styling (category filter pills, service list cards)
- [ ] No behavior changes; booking flow works end to end (search → select → book)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (booking panel with results, screenshots)

### US-005: Live tracking panel & map overlay redesign
**Description:** As a passenger, I want ride tracking to look like a live, premium experience so I trust what's happening with my flight.

**Acceptance Criteria:**
- [ ] `.tracking-panel` restyled: `--radius-xl` corners, `--shadow-xl`, white surface, 20–24px padding
- [ ] `.tracking-progress-bar` becomes a slim rounded gradient bar (blue→sky) with smooth width transition
- [ ] `.tracking-steps` modernized: step dots become 28px circles with clear states — done (solid blue, white check), active (blue ring + soft pulse animation), pending (gray-200); connector line between steps; labels 11–12px
- [ ] `.tracking-pilot-card` restyled as a rounded `--gray-50` card with 44px avatar circle (brand gradient) and clear name/meta hierarchy
- [ ] `.tracking-otp-card` visually prominent: dashed blue border or `--blue-50` background, OTP digits in large (28px) bold monospace with letter-spacing
- [ ] `.tracking-eta` block: big bold ETA number (24px+) with small label; status dot gets a soft pulse animation
- [ ] Rating stars (`.tracking-rate-stars button`) enlarged (28px+) with gold hover/selected color and scale transition
- [ ] `.route-info-bar` and `.booking-map-legend` restyled as floating rounded chips over the map (`--radius-full`/`--radius-lg`, white bg, `--shadow-md`)
- [ ] `.btn-end-tracking` and `#tracking-cancel-btn` follow the new button language (secondary/outline + danger variants)
- [ ] All ids and JS-toggled classes (`done`, `active`, etc.) unchanged
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Payment, confirmation & overlay modals redesign
**Description:** As a passenger, I want checkout and confirmations to feel crisp and trustworthy so paying is friction-free.

**Acceptance Criteria:**
- [ ] `.confirm-overlay` backdrop: `rgba(15,23,42,.5)` with `backdrop-filter: blur(4px)` (solid fallback); subtle fade-in animation
- [ ] `.payment-page` and `.confirm-card`: `--radius-2xl`, `--shadow-xl`, entrance animation (fade + slight scale/translate up, ~200ms, respects `prefers-reduced-motion`)
- [ ] Payment step dots become a clear 2-step indicator (numbered circles or labeled progress) — keep `#payment-dot-1/2` ids
- [ ] `.payment-fare-breakdown` styled as clean list rows (label left `--gray-500`, value right, dividers `--border-subtle`, total row emphasized)
- [ ] Coupon chips (`#coupon-chips` generated content) as rounded outline chips with applied state (blue fill); coupon input row modernized
- [ ] `.payment-summary-card`: `--blue-50`/navy-tinted rounded card with large amount display
- [ ] `.confirm-check` success icon: 64px circle, green background, white check, pop-in animation (respects reduced motion)
- [ ] `.confirm-details` grid cells restyled as soft rounded tiles (`--gray-50` bg)
- [ ] `#must-reset-overlay` card inherits the same modal language
- [ ] Toasts (`.toast-container` children — check `js/app/*.js` for the toast markup/classes): rounded (`--radius-lg`), `--shadow-lg`, white with colored left accent or icon per type, slide-in animation
- [ ] Profile modal (`.js-open-profile` target — find its markup/classes in app.html/JS) inherits the same modal styling
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (payment overlay + confirmation screenshots)

### US-007: Operator (pilot) console redesign
**Description:** As a pilot, I want a clean modern console so my duty status and trip queue are instantly readable.

**Acceptance Criteria:**
- [ ] `.op-welcome` becomes a proper page header (22–24px bold navy) with `.op-welcome-sub` in `--gray-500`
- [ ] `.op-duty-card` redesigned: white rounded card (`--radius-lg`, `--shadow-md`); duty status text color-coded (green when on duty, gray when off)
- [ ] `.op-duty-switch` becomes a modern iOS-style toggle: 48×28px track, sliding knob with `--transition`, green track when on (`aria-pressed` still drives state; keep id and `toggleOperatorDuty()` wiring)
- [ ] Trip/dispatch cards in the operator list (classes generated by `js/app/04-operator.js` — grep and style them): rounded cards with status chips (colored rounded badges per trip state), clear route display, action buttons following the new button language (primary accept, outline/danger reject)
- [ ] `.op-section-title` styled as an eyebrow label (12px, uppercase, letter-spacing, `--gray-400`)
- [ ] `.op-back` styled as a subtle rounded back link with hover
- [ ] Empty states (`.op-empty-sub` and similar) centered with muted icon/text styling
- [ ] Operator profile card matches the new card language
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Admin console — navigation drawer & dashboard redesign
**Description:** As an admin, I want a modern dashboard shell so the console feels like a current-generation admin product.

**Acceptance Criteria:**
- [ ] `.admin-drawer` restyled: white (or very dark navy — pick one, consistent) rail with `--border-subtle`, comfortable item spacing
- [ ] `.admin-nav-item`: rounded (`--radius-md`) hover background, active state = `--blue-50` background + `--blue` text/icon + 3px left accent bar (or pill highlight); smooth transitions; keep all `data-admin-section` attributes and `showAdminSection()` wiring
- [ ] `.admin-drawer-toggle` modernized with rounded hover state
- [ ] `.admin-page-header` (and `.op-welcome` inside admin) styled as clear page titles with subtitle
- [ ] Dashboard stat/summary cards (`.admin-summary-bar`, `#admin-platform-stats` generated content — grep `js/app/03-admin-profile.js`/relevant module for generated class names): white rounded cards (`--radius-lg`, `--shadow-sm`, hover `--shadow-md`) with big metric numbers (24px+ bold navy), small uppercase labels, optional trend/accent color
- [ ] `.admin-main` gets consistent max-width/padding and section spacing
- [ ] Drawer collapse behavior (if any) still works; responsive at 768px (drawer overlays or collapses gracefully)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (dashboard screenshot)

### US-009: Admin console — tables, forms & remaining sections redesign
**Description:** As an admin, I want readable modern tables and forms across Users, Live Map, Add Member, Companies, Pricing, Revenue, Compliance, Drones, Logs, and Settings.

**Acceptance Criteria:**
- [ ] All admin tables (grep the classes used in admin sections/generated rows): header row = 12px uppercase `--gray-400` semibold with bottom border; body rows 14px with `--border-subtle` row dividers (no full grid borders), row hover = `--gray-50`; contained in a rounded white card with overflow-x auto
- [ ] Status/role indicators in tables become colored rounded chips (green/blue/red/gray soft backgrounds)
- [ ] Table action buttons become compact rounded icon/text buttons with hover states
- [ ] Add Member + Settings forms: inputs/selects follow the US-002 input language (44–48px, rounded, focus ring); labels 13px medium `--gray-600`; grouped in rounded card sections
- [ ] Pricing/Revenue/Compliance/Drones/Logs sections: content blocks wrapped in the consistent card language; `.pd-loading` and empty states styled softly
- [ ] Log output (if monospace) styled in a rounded dark or `--gray-50` code block
- [ ] No section behavior changes; every admin section still renders its data
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (Users table + Add Member form screenshots)

### US-010: Responsive & interaction polish sweep (all views)
**Description:** As any user on any device, I want the app to be responsive and interactions to feel smooth so nothing looks broken or janky.

**Acceptance Criteria:**
- [ ] No horizontal scroll and no broken/overlapping layouts at 360px, 768px, 1024px, 1440px in all four views (fix what's found)
- [ ] All interactive elements have visible hover, active, focus-visible, and (where relevant) disabled states — sweep for stragglers missed in earlier stories
- [ ] Custom scrollbar styling for panels/lists (thin, rounded, gray thumb; WebKit + `scrollbar-width`)
- [ ] Add `@media (prefers-reduced-motion: reduce)` block disabling non-essential animations/transitions
- [ ] Text contrast: body text and labels meet WCAG AA against their backgrounds (spot-fix violations, e.g. gray-on-gray from earlier stories)
- [ ] Touch targets ≥40px for primary mobile actions in booking/tracking panels
- [ ] Consistent spacing audit: panel sections, card paddings, and gaps use a 4px-based rhythm
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (360px and 1440px screenshots of all four views)

## Functional Requirements

- FR-1: All redesign changes live in `css/app.css` and `app.html` (plus minimal `js/app/*.js` edits only where a story explicitly needs markup generated by JS to carry a class — regenerate the bundle via `npm run build:js`)
- FR-2: Brand palette anchors: primary `#0057B8` (blue), `#0B1F3A` (navy); semantic green/red/orange retained for status
- FR-3: Every element id, JS-referenced class, and inline handler must keep working — zero functional regressions
- FR-4: The font must load via Google Fonts with `display=swap` and degrade gracefully to system fonts offline
- FR-5: Animations must be subtle (≤250ms) and respect `prefers-reduced-motion`
- FR-6: Each story is one commit on `main` in the form `feat: [US-xxx] - [Title]`

## Non-Goals (Out of Scope)

- No changes to marketing pages (`index.html`, `vision.html`, `team.html`, `contact.html`) or their stylesheets (`css/tokens.css`, `css/components.css`, etc.)
- No dark mode / theme toggle
- No new features, flows, or backend/API changes
- No framework adoption (stays vanilla HTML/CSS/JS)
- No renaming/restructuring of the JS module architecture
- No accessibility overhaul beyond focus states, contrast, and reduced motion (full a11y audit is a separate effort)

## Design Considerations

- Reference feel: Uber/Lyft booking panels, Linear/Vercel admin surfaces — but expressed through IraGo's navy/blue corporate palette
- The map remains the visual hero of the booking view; panels float above it with clear elevation
- Data-dense admin screens prioritize scanability (dividers not grids, chips not raw text states)
- Elevation hierarchy: page background < cards (`--shadow-sm/md`) < floating panels (`--shadow-lg`) < modals (`--shadow-xl`)

## Technical Considerations

- `css/app.css` is ~4000 lines and organized by view sections with banner comments — edit in place, keep the section organization
- JS-generated markup (ride cards, popular routes, admin tables, toasts, dispatch cards) means some class names live in `js/app/*.js`; stories call out grepping the relevant module before styling
- The build script (`npm run build:js`) auto-bumps cache-busters; for CSS-only commits bump the CSS `?v=` manually
- Browser verification via the dev-browser skill against the local server (`npm start` / `scripts/local/start.sh`)

## Success Metrics

- All 10 stories committed to `main` with green typecheck
- Side-by-side before/after screenshots show a clearly modern UI in all four views
- Zero functional regressions in: login, registration, forgot/reset, booking search→pay→track, operator duty toggle + trip actions, all 11 admin sections rendering

## Open Questions

- None blocking. If the Inter font CDN is unreachable in the dev environment, proceed — the system font fallback is acceptable for verification.
