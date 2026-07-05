# US-019 Admin Dashboard Static Audit Report

Audit date: 2026-07-05
Auditor: Ralph Agent (automated)
Method: Static grep of markup, CSS, and JS -- no browser rendering

## Design Reference

Target aesthetic: `tasks/refs/us019-dashboard-reference.png` (Dribbble dashboard mockup).
Key traits matched: white rounded cards on light-gray bg, token-based shadows/borders, soft pill highlights on nav, large bold metrics with small uppercase labels, colored status chips, clean list rows with divider-only separators.

## Section Coverage Matrix

| # | Admin Section | Section ID | Container Class | Modern CSS Rule (token-based bg/border/radius) | Inline/Legacy Offenders Before | Offenders After |
|---|---|---|---|---|---|---|
| 1 | Dashboard | `admin-section-dashboard` | `.admin-section` | `.admin-page-header` (border-bottom: var(--border-subtle)), `.pd-stat` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg), box-shadow: var(--shadow-sm)) | 0 | 0 |
| 2 | Users | `admin-section-users` | `.admin-section` | `.admin-user-card` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg), box-shadow: var(--shadow-sm)), `.admin-tab` (border-radius: var(--radius-full)) | 3 inline styles (company filter display:none, select max-width, meta margin) | 0 |
| 3 | Live Map | `admin-section-live` | `.admin-section` | `.admin-live-panel` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg)), `.admin-live-map-fs` (background: var(--surface)) | 1 inline style (meta margin-top:-6px) | 0 |
| 4 | Add Member | `admin-section-add` | `.admin-section` | `.admin-form-card` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg), box-shadow: var(--shadow-sm)) | 2 inline styles (required asterisk color, add-note font-size/color/margin) | 0 |
| 5 | Companies | `admin-section-companies` | `.admin-section` | `.partner-card` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg), box-shadow: var(--shadow-sm)) | 3 inline styles (meta margin, title font-size, code input max-width) | 0 |
| 6 | Pricing | `admin-section-pricing` | `.admin-section` | `.admin-form-card` (tokens as above), `.admin-section-card` (max-width: 640px, margin-bottom: 20px) | 3 inline styles (meta margin, form max-width/margin, changelog max-width) | 0 |
| 7 | Revenue | `admin-section-revenue` | `.admin-section` | `.admin-section-card` (tokens), `.admin-table-wrap` (background: var(--surface), border: var(--border-subtle), border-radius: var(--radius-lg)) | 3 inline styles (meta margin, kpis margin, chart margin) | 0 |
| 8 | Compliance | `admin-section-compliance` | `.admin-section` | `.admin-section-card` (tokens), `.admin-list-row` (border-bottom: var(--border-subtle)), `.op-status-badge` (border-radius: var(--radius-full)) | 4 inline styles (meta margin, summary/missing/failed margins) | 0 |
| 9 | Settings | `admin-section-settings` | `.admin-section` | `.admin-form-card` (tokens), `.admin-section-card--narrow` (max-width: 560px), `.admin-toggle-row` (border-bottom: var(--border-subtle)) | 3 inline styles (meta margin, 2x form max-width/margin) | 0 |
| 10 | Drones | `admin-section-drones` | `.admin-section` | `.admin-table-wrap` (tokens), `.drone-tab-bar` (gap: 8px, flex-wrap), `.drone-sub-header` (flex layout) | 10 inline styles (tab bar flex/gap, 2x sub-header flex, 2x sub-title font, 3x display:none, bookings-list margin) | 0 |
| 11 | Logs | `admin-section-logs` | `.admin-section` | `.admin-logs-scroll` (background: var(--gray-900), border-radius: var(--radius-lg)), `.admin-log-line` (border-bottom: rgba(255,255,255,.06)) | 2 inline styles (meta margin, loading display:none) | 0 |

**Totals: 34 inline style offenders before, 0 after.**

## Static Assertion 1: CSS Coverage

Every admin section uses token-based container/card/table classes:

- **`.admin-section`** -- base class on all 11 sections (inherits bg from `.admin-main`)
- **`.admin-page-header`** -- Dashboard header with `border-bottom: 1px solid var(--border-subtle)`, padding 20px
- **`.pd-stat`** -- Dashboard stat cards: `background: var(--surface)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`, hover `var(--shadow-md)`
- **`.admin-user-card`** -- Users list cards: `background: var(--surface)`, `border: var(--border-subtle)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`
- **`.admin-form-card`** -- Add Member/Pricing/Settings forms: `background: var(--surface)`, `border: var(--border-subtle)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`
- **`.admin-table-wrap`** -- Tables in Revenue/Drones: `background: var(--surface)`, `border: var(--border-subtle)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`
- **`.admin-live-panel`** -- Live Map panels: `background: var(--surface)`, `border: var(--border-subtle)`, `border-radius: var(--radius-lg)`
- **`.admin-logs-scroll`** -- Logs output: `background: var(--gray-900)`, `border-radius: var(--radius-lg)`
- **`.partner-card`** -- Companies cards: `background: var(--surface)`, `border: var(--border-subtle)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`
- **`.admin-toggle-row`** -- Settings toggles: `border-bottom: 1px solid var(--border-subtle)`
- **`.op-status-badge`** -- Status chips: `border-radius: var(--radius-full)`, color variants via `--blue-50`, `--green-50`, `--red-50`, `--amber-50`, `--gray-100`

## Static Assertion 2: No Regressions

### Inline styles in admin HTML sections

```
$ sed -n '/id="admin-section-dashboard"/,/<\/main>/p' app.html | grep -c 'style='
0
```

**Result: ZERO inline style= attributes in admin section markup.**

### Hardcoded hex colors in admin CSS rules

```
$ grep '#[0-9A-Fa-f]' css/app.css | grep -i 'admin\|\.pd-' | grep -v 'var(--'
(empty)
```

**Result: ZERO hardcoded hex colors in admin-specific CSS rules.**

All color references use CSS custom properties: `var(--surface)`, `var(--border-subtle)`, `var(--shadow-sm)`, `var(--blue)`, `var(--green-dark)`, `var(--red-dark)`, `var(--amber-dark)`, `var(--purple)`, `var(--purple-50)`, `var(--gray-*)`.

### JS-generated admin markup

Hardcoded hex colors in JS admin rendering functions: **0 remaining** (all converted to `var(--*)` tokens).
Inline layout styles in JS: **2 remaining** (both are dynamic percentage values for chart bars that must be inline).

## Tokens Added

New color tokens added to `:root` in `css/app.css`:
- `--amber: #F59E0B` / `--amber-dark: #B45309` / `--amber-50: #FFFBEB` / `--amber-light: #FDE68A`
- `--purple-50: #E8EDF4` / `--purple-light: #C9D5E6`

## Utility Classes Extracted

New CSS classes replacing inline styles:
- `.admin-meta-hint` (margin-top: -6px)
- `.admin-meta-footer` (margin-top: 14px)
- `.admin-section-card` / `--narrow` / `--spaced` (max-width + spacing)
- `.admin-company-filter` / `.admin-company-filter-select` (filter UI)
- `.drone-tab-bar` / `.drone-sub-header` / `.drone-sub-title` (drones section layout)
- `.drone-form-desc` / `.drone-form-actions` (drone form layout)
- `.admin-add-note` / `.required-asterisk` (add member form)
- `.admin-company-code-input` (company code input width)
- `.drone-bookings-list-wrap` (bookings list spacing)
- `.admin-bar-chart` / `.admin-bar-col` / `.admin-bar-fill` / `.admin-bar-label` (revenue chart)
- `.admin-changelog-row` (pricing changelog layout)
- `.pricing-save-btn` / `.pricing-msg` / `.pricing-input-sm` (pricing form)
- `.admin-payouts-wrap` / `.td-commission` / `.td-bold` (revenue payouts)
- `.admin-missing-meta` / `.admin-failed-title` (compliance sections)
- `.badge-ml` / `.op-status-badge-sm` / `.admin-users-meta--flush` (utilities)
- `.star-active` / `.star-inactive` (company star ratings)
- `.earnings-month-grid` / `.earnings-month-card` / etc. (operator earnings)
- `.compliance-history-row` / `.compliance-status` / etc. (compliance history)
- `.table-meta` (table cell secondary text)
- `.admin-nav-label` (nav text nowrap)

## Duplicate CSS Rules Removed

- `.op-badge--red` duplicate (was at ~line 3486, same as existing token-based rule at line 3044)
- `.op-badge--amber` duplicate (was at ~line 4129, conflicted with token-based rule at line 3045)

## Cache-Busters

- `css/app.css` link `?v=` bumped by build script (content-hash based)
- `js/app.bundle.js` link `?v=` bumped by build script (content-hash based)
