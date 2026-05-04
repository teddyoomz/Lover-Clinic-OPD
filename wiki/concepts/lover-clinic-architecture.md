---
title: LoverClinic Architecture Overview
type: concept
date-created: 2026-05-04
date-updated: 2026-05-04
tags: [architecture, overview, top-level, stack]
source-count: 0
---

# LoverClinic — Top-Level Architecture

> Multi-branch dental/aesthetic clinic management system. Replaces ProClinic OPD for daily operations with branded UI + custom workflows. React 19 frontend on Vercel + Firebase Firestore + serverless API + Chrome extension for ProClinic mirror sync. Per-branch since Phase BS V2 (2026-05-06) + BSA (2026-05-04).

## Stack

- **Frontend**: React 19 + Vite 8 + Tailwind 3.4
- **Backend storage**: Firebase Firestore (Standard Edition)
- **Auth**: Firebase Authentication + custom claims (admin, isClinicStaff, branchIds[])
- **Deploy**: Vercel (frontend + serverless `api/`)
- **Cloud Functions**: Firebase (`functions/index.js` — only 1 — `onPatientSubmit` → FCM push)
- **Test**: Vitest 4.1 (4997 tests) + Playwright (40+ E2E)
- **Tools**: graphify (knowledge graph), llm-wiki (this wiki), opd.js (ProClinic inspector)

## Top-level paths

```
src/
  App.jsx                    Root routing + auth + clinic settings
  firebase.js                Firebase init
  pages/
    AdminDashboard.jsx       (legacy admin — patient queue + chat + appointments)
    AdminLogin.jsx
    PatientForm.jsx          Public patient intake (anon-auth)
    PatientDashboard.jsx     Public patient view (anon-auth)
    BackendDashboard.jsx     The ★ — modern admin (multi-branch BSA-aware)
  components/
    DateField.jsx            Canonical date input (every form uses this)
    TreatmentFormPage.jsx    The biggest UI file (4874 LOC)
    backend/                 BackendDashboard tabs + modals
  lib/
    backendClient.js         Layer 1 — raw Firestore CRUD (11k+ LOC)
    scopedDataLayer.js       Layer 2 — UI auto-inject branchId (BSA)
    branchScopeUtils.js      filterStaffByBranch / filterDoctorsByBranch (Phase BS V1 soft-gate)
    BranchContext.jsx        React context for current branch
    branchSelection.js       Pure JS branchId resolver (V36.G.51 lock)
    brokerClient.js          DEV-ONLY: ProClinic API wrapper (Rule H-bis strip target)
    cloneOrchestrator.js     DEV-ONLY: bulk customer clone from ProClinic
  hooks/
    useBranchAwareListener.js   Layer 3 — onSnapshot re-subscribe on branch switch
    useTabAccess.js             Soft-gate tab visibility based on permissions
    useTheme.js
api/
  proclinic/                 DEV-ONLY: ProClinic mirror endpoints (strip before production)
  webhook/
    facebook.js              FB Messenger inbound webhook
    line.js                  LINE OA inbound webhook (Phase BS V3 per-branch routing)
    send.js                  Outbound via FB/LINE
    saved-replies.js         Quick-reply templates
  admin/
    users.js                 Firebase user CRUD + custom claims
    customer-branch-baseline.js   Phase BS V2 migration endpoint
    cleanup-*.js             Test-pollution + orphan-stock cleanup
    line-test.js             LINE connection test (Phase BS V3 branch-aware)
    send-document.js         Doc delivery via LINE Push
    customer-line-link.js    Admin link-status actions
    link-requests.js         Customer-LINE link approval queue
    bootstrap-self.js        Genesis admin claim (V25-bis)
    wipe-master-data.js      DEV-ONLY: nuke master_data/* (V36-tris)
cookie-relay/                DEV-ONLY: Chrome MV3 extension for ProClinic cookie sync
functions/
  index.js                   Firebase Cloud Function: onPatientSubmit → FCM
docs/                        Phase plans + ProClinic intel scans
.claude/rules/               Iron-clad rules + V-log archive
.agents/                     Hot session state
wiki/                        ← THIS WIKI (Karpathy LLM Wiki pattern)
graphify-out/                Code knowledge graph (graphify skill output)
```

## Firestore data model

Base path: `artifacts/loverclinic-opd-4c39b/public/data/<collection>`

### Universal collections

- `be_customers` — patient records (universal — visible at every branch)
- `be_staff`, `be_doctors` — universal with `branchIds[]` soft-gate filter
- `be_branches`, `be_permission_groups`, `be_document_templates`, `be_audiences`
- `be_admin_audit`, `be_central_stock_*`, `be_vendors`, `be_link_tokens`
- `system_config` / `clinic_settings`, `chat_conversations`
- Customer-attached: wallets, memberships, points, treatments, sales, appointments, deposits-by-customer, course-changes

### Branch-scoped collections (filtered by current selected branchId)

- Transactional: `be_treatments`, `be_sales`, `be_appointments`, `be_quotations`, `be_vendor_sales`, `be_online_sales`, `be_sale_insurance_claims`, `be_deposits`
- Stock: all `be_stock_*` (`locationId` field)
- Master data: `be_products`, `be_courses`, `be_product_groups`, `be_product_units`, `be_medical_instruments`, `be_holidays`
- DF: `be_df_groups`, `be_df_staff_rates`
- Finance: `be_bank_accounts`, `be_expense_categories`, `be_expenses`
- Schedules: `be_staff_schedules`
- Linking: `be_link_requests`
- Marketing: `be_promotions`, `be_coupons`, `be_vouchers` (with `allBranches:true` doc-field OR-merge)
- LINE OA: `be_line_configs/{branchId}` (Phase BS V3)

### DEV-ONLY collections (strip before production per Rule H-bis)

- `master_data/*` — ProClinic mirror (initial seed only — Rule H-quater forbids reads at runtime)
- `pc_*` — ProClinic-side mirrors of appointments / customers (used by chat link flow + intake)
- `clinic_settings/proclinic_session*` — cookie-relay extension data
- `broker_jobs`, `proclinic_session` — broker queue

## Authentication + authorization

### 4 auth tiers

1. **Anon auth** — public-link routes (`?session=`, `?patient=`, `?schedule=`). Limited writes (whitelist on `opd_sessions` per V23).
2. **Customer auth** — currently NONE; planned via LINE link flow (Phase BS V3 admin-mediated).
3. **Clinic staff** — Firebase Auth user with `isClinicStaff:true` custom claim. Reads most collections.
4. **Admin** — `admin:true` custom claim. Writes most collections + privileged endpoints (`api/admin/*`).

### Permission system (Phase 11.7 + 16.3)

- 130 permission keys × 14 modules
- `be_permission_groups` — admin-defined groups (e.g. `gp-owner`, `gp-frontdesk`, `gp-doctor`)
- Each `be_staff` has `permissionGroupId` → resolves to `permissions: { key: bool }` map
- Custom claim `isClinicStaff: true` for any group; `admin: true` for owner group
- Soft-gate UI via `useTabAccess` hook + `useHasPermission`

## Multi-branch design (Phase BS V2 + BSA)

Top-right BranchSelector → `BranchContext.branchId` → flows through 3 BSA layers:

1. **Layer 1** ([backendClient.js](../entities/scoped-data-layer.md)) — parameterized
2. **Layer 2** ([scopedDataLayer.js](../entities/scoped-data-layer.md)) — auto-inject
3. **Layer 3** ([useBranchAwareListener](../entities/use-branch-aware-listener.md)) — re-subscribe on switch

Soft-gate filter (`branchScopeUtils.js`) for staff/doctor pickers — universal collection + per-record `branchIds[]` field controls visibility per branch.

Per-branch LINE OA via `be_line_configs/{branchId}` collection — webhook routes by `event.destination`.

See [Branch-Scope Architecture concept](branch-scope-architecture.md) for full detail.

## ProClinic integration (DEV-ONLY)

ProClinic is the legacy thai dental clinic system that LoverClinic replaces. During development:

- **`brokerClient.js`** — wraps `api/proclinic/*` endpoints — relays cookie-authed REST calls to ProClinic via Vercel serverless (so admin gets dev data without manually hitting ProClinic)
- **`cookie-relay/`** — Chrome MV3 extension that syncs ProClinic browser cookies → Firestore so the broker can authenticate
- **`MasterDataTab.jsx`** — admin UI to "ดูด" (suck/sync) products/courses/staff/etc. from ProClinic into `master_data/*` mirror, then migrate to `be_*`
- **`opd.js`** — `F:\replicated\scraper\opd.js` (out-of-tree) — CLI inspector that captures ProClinic page intel/forms/network for replication

ALL of these are dev-only per Rule H-bis. Production strip checklist:
- [ ] Remove `MasterDataTab.jsx` + `CloneTab.jsx`
- [ ] Remove `brokerClient.js` consumers
- [ ] Remove `api/proclinic/*` endpoints
- [ ] Remove `cookie-relay/` extension
- [ ] Wipe `master_data/*` collection (admin endpoint exists)
- [ ] Wipe `broker_jobs`, `proclinic_session`, `pc_*` (some `pc_*` are runtime — audit per collection)

## Phase progression (chronological)

| Phase | Period | Focus |
|---|---|---|
| 1-6 | 2026-Q1 | Foundation: patient form, admin dashboard, chat, appointments, broker, clone |
| 7 | early 2026 | Finance: deposit + wallet + membership + points |
| 8 | 2026 | Stock: orders/batches/movements/transfers/withdrawals (V34 + V35 hardened) |
| 9 | 2026-04-19 | Marketing: promotions/coupons/vouchers — Rule E violation here, recovered |
| 10 | 2026 | Reports: 10 report tabs + aggregators |
| 11 | 2026-04-20 | Master Data Suite + Rule H-bis — 6 CRUD tabs (product groups, units, instruments, holidays, branches, permission groups) |
| 12 | 2026-04-25 | Financial completeness — staff/doctors validators + bank accounts + expenses + online-sale + sale insurance claim + P&L report |
| 13 | 2026-04-25 to 04-26 | Replication parity: quotation, schedule (doctor + employee), DF, customer-product-change, smart audience |
| 14 | 2026-04-25 to 04-26 | Document management + print: 16 ProClinic templates, bulk PDF, audit log, treatment timeline |
| 15 | 2026-04-26 to 04-28 | Stock central tier + Phase BS V1 (per-staff branchIds[] soft-gate) + V34 stock invariants + V35 leaks |
| 16 | 2026-04-29 | Polish: System Settings tab, Smart Audience, Order parity, payroll/hourly/commission |
| Phase BS | 2026-05-04 | Multi-branch infra: BranchContext + selector + per-branch master data |
| Phase BS V2 | 2026-05-06 | Master-data tabs branch-scoped via per-callsite `{branchId}` |
| **Phase BSA** | **2026-05-04** | **3-layer wrapper + audit** — see [BSA concept](branch-scope-architecture.md) |
| Phase BS V3 | 2026-05-04 | LINE OA per-branch via `be_line_configs/{branchId}` |
| Phase 17 | TBD | (planning) |

## Test coverage (4997 as of 2026-05-04)

- 177 test files across `tests/`
- Vitest unit + integration (~4900) + Playwright E2E (~40)
- Audit skills with source-grep regression banks (BS-1..BS-8 / S1..S28 / etc.)
- Per-skill flow-simulate per Rule I

## Known DEV-ONLY surfaces to strip before production

(See `concepts/rule-h-quater.md` + `concepts/iron-clad-rules.md` Rule H-bis)

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md)
- Concept: [Iron-Clad Rules A-L](iron-clad-rules.md)
- Concept: [Rule H-quater](rule-h-quater.md)
- Concept: [LLM Wiki pattern](llm-wiki-pattern.md) — pattern this wiki implements
- Project root: [`F:/LoverClinic-app/CLAUDE.md`](../../CLAUDE.md) — onboarding index

## History

- 2026-05-04 — Wiki concept page created during BSA wiki bootstrap. Top-level architecture snapshot at master `45ad80c`.
