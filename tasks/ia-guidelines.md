# IraGo Navigation & Information Architecture Guidelines

Reference document for all current and future views. Every role's navigation must conform to this model.

---

## 1. Navigation Model

Every view uses a **two-tier navigation** structure:

### Tier 1: Top Bar (`.booking-nav`)
- Shared across all roles (64px height, white bg, subtle bottom border)
- Contains: logo, role badge, profile actions (Profile, Log out, avatar)
- Passenger adds **service tabs** (`.service-tabs`) as a segmented pill control for primary service switching
- Operator/Admin show only the role badge (no service tabs)

### Tier 2: Section Navigation (role-specific)
| Role | Pattern | Location |
|------|---------|----------|
| Passenger | `.service-tabs` segmented pill in top bar | Inline in `.booking-nav` |
| Operator | `.op-nav` vertical list in sidebar panel | Inside `.booking-panel` below duty card |
| Admin | `.admin-drawer-nav` vertical list in aside rail | Inside `.admin-drawer` sidebar |

---

## 2. Group Hierarchy

When a role has 5+ navigation items, group them under **labeled headers** using `.admin-nav-group-label`:

```
.admin-nav-group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-400);
  padding: 12px 12px 4px;
}
```

### Group ordering principle:
1. **Primary task** group first (what this role does most)
2. **Operational/domain** groups in the middle
3. **De-emphasized zone** pinned to the bottom (personal/system/config)

### De-emphasized zone pattern:
- Wrapped in a container class (`.admin-nav-group-system` or `.op-nav-group-system`)
- `margin-top: auto` (when parent is flex column) or `border-top + padding-top` (inline)
- Items use `color: var(--gray-400)` with active/hover overrides

### Current group assignments:

**Admin** (`.admin-nav-group-system` wraps System zone):
- OVERVIEW: Dashboard, Live Map
- MANAGEMENT: Users, Companies, Drones
- FINANCE: Pricing, Revenue
- GOVERNANCE: Compliance
- SYSTEM (de-emphasized): Settings, Logs

**Operator** (`.op-nav-group-system` wraps Personal zone):
- FLIGHTS: Trips (default/primary)
- OPERATIONS: Pre-flight, Altitude
- PERSONAL (de-emphasized): Earnings, Account

**Passenger** (no groups needed - only 4 flat service tabs):
- Air Taxi (default), Golden Hour, Air Shuttle, Drones

---

## 3. Wayfinding (Current-Section Heading)

Every visible section must have a heading so the user always knows where they are.

### Heading classes by context:
| Context | Class | Size | Weight |
|---------|-------|------|--------|
| Panel section (passenger, operator) | `.panel-step-heading` | 16px | 700 |
| Full-page section (admin) | `.admin-page-header .op-welcome` | 24px | 700 |
| Tracking overlay | `.tracking-panel-title` | 13px uppercase | 600 |

### Rules:
- Every switchable section has a heading visible when that section is active
- Headings describe the content, not the action (e.g., "Assigned trips" not "View trips")
- Admin sections use `.admin-page-header` with title + optional subtitle (`.op-welcome-sub`)
- Operator sections use `.panel-step-heading` per section container
- Passenger steps use `.panel-step-heading` for the current booking step

---

## 4. Single Primary CTA Rule

Each visible step/section has at most **one** primary action button (solid blue, full-width or prominent). Secondary actions use outline/ghost variants.

| Role | Example |
|------|---------|
| Passenger | "Search flights" (search step), "Confirm Booking" (results step) |
| Operator | Duty toggle (always visible), "Accept" per trip card |
| Admin | "+ Add member" in Users header, "Save" in forms |

---

## 5. Shared CSS Classes (reuse these)

| Class | Purpose |
|-------|---------|
| `.admin-nav-group-label` | Group header in any vertical nav |
| `.admin-nav-group-system` | De-emphasized bottom zone (admin drawer) |
| `.op-nav-group-system` | De-emphasized bottom zone (operator nav) |
| `.panel-step-heading` | Section wayfinding heading in panels |
| `.admin-page-header` | Full-page section header with title + subtitle |
| `.admin-section-header` | Section header with inline action button |

---

## 6. No Orphaned Sections

Every section defined in markup must be reachable from its role's navigation:
- Admin: all 11 sections (including "add" via Users header button) reachable from drawer nav
- Operator: all 5 sections reachable from `.op-nav`
- Passenger: all 4 services reachable from `.service-tabs`; sub-flows (tracking, payment, confirmation) triggered by user actions within the booking flow

---

## 7. Naming Conventions

- De-emphasized zone label should NOT reuse a primary group label from another role
  - Admin primary group: "Overview" -> Operator must NOT use "Overview" for its de-emphasized zone
  - Operator de-emphasized: "Personal" (contains pilot's own data: Earnings, Account)
  - Admin de-emphasized: "System" (contains platform config: Settings, Logs)
- Group labels are short (1 word preferred), uppercase, purely descriptive
