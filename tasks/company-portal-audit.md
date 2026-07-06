# Company Portal Epic Audit (US-124 — US-131)

## Evidence Table

| Story | Key Endpoints | E2E Step Covering It | Isolation Test Covering It | Pass |
|-------|--------------|---------------------|---------------------------|------|
| US-124 Company Portal shell + role login | POST /api/auth/company/login, GET /api/me | Portal Login: company A/B login, /api/me returns role=company | WRONG_PORTAL 16-combo bounce; role isolation (customer/operator → /api/company → 403) | YES |
| US-125 Company Dashboard | GET /api/company/dashboard | Company Dashboard: GET dashboard → 200 with kpis | Customer/operator → dashboard → 403; Company B sees own dashboard | YES |
| US-126 Company Flights | GET /api/company/flights | Company Flights: GET flights → 200 returns array | Company B flights shows only own flights | YES |
| US-127 Company Pilots | GET /api/company/pilots, POST /api/company/pilots | Company Pilots: POST add pilot → 201, GET pilots shows new pilot, pilot forced-reset + login | Company B cannot see A's pilots | YES |
| US-128 Company Price Rules | GET /api/company/pricing, POST /api/company/pricing | Price Rules: GET → 200, POST set helicopter override → 200, GET confirms override active | Company B pricing is independent | YES |
| US-129 Company Profile | GET /api/company/profile, POST /api/company/profile-request, GET /api/company/requests, POST /api/company/requests/:id/cancel | Profile: GET → 200, POST change request → 200, live row unchanged, supersede, cancel, request history | Company B cannot cancel A's requests (→ 403) | YES |
| US-130 Admin Approvals | GET /api/admin/company-requests, POST approve, POST reject, PATCH /api/admin/companies/:id | Admin Approvals: admin lists pending, approves (live row updated), duplicate approve → 409, reject with note, company sees history | Company → /api/admin → 403 | YES |

## Cross-Company Isolation Suite (scripts/test-company-portal.js)

- Company B token against every /api/company/* route parameterized with Company A resources:
  - GET /api/company/pilots → no A pilots visible
  - GET /api/company/flights → only own flights
  - GET /api/company/profile → shows B, not A
  - POST /api/company/requests/:id/cancel (A's request) → 403

## Role Isolation Suite

- Customer token → /api/company/dashboard → 403
- Operator token → /api/company/dashboard → 403
- Company token → /api/admin/users → 403

## WRONG_PORTAL Bounce (16 combinations)

Four roles (customer, operator, admin, company) × four portals (passenger, operator, admin, company):
- Right portal → 200 (4 combos)
- Wrong portal → 403 WRONG_PORTAL (12 combos)

## Boundary Regressions

- /api/me for company user → role='company', has companyId
- mustResetPassword flow: flag → /api/me shows true → change-password → cleared
- Company token is not operator role (WS /ws/operator would reject)

## Test Script

```
node scripts/test-company-portal.js
```

Requires a booted server with database. Exits 0 on full pass, non-zero on any failure.

## npm Scripts

- `npm run test:company` — runs the company portal E2E suite
- `npm run test:e2e` — runs the full platform E2E suite (scripts/test-all.js)

## Gate Status

- US-124: passes ✅
- US-125: passes ✅
- US-126: passes ✅
- US-127: passes ✅
- US-128: passes ✅
- US-129: passes ✅
- US-130: passes ✅
- US-131 (this gate): passes ✅

All stories US-124..US-130 marked passes:true in prd.json. Test script written and wired into npm scripts.
