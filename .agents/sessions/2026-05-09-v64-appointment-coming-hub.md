# Session Checkpoint — V64 Appointment Coming-Hub

> 2026-05-09 EOD #19 — V64 appointment coming-hub view shipped (4 tabs + cards + actions + PDF + audit invariants).

## Summary

V64 ships the ProClinic-faithful appointment list view at the top of `/admin` `adminMode==='appointment'`. Users land on a 4-tab list (วันนี้ · พรุ่งนี้ · ล่วงหน้า 30 วัน · ย้อนหลัง 30 วัน) with a `[📋 รายการ] [📅 ปฏิทิน]` toggle that preserves the existing calendar block. Brainstormed Q1-Q5 with user (A / B+D / C / A / C); spec + plan committed first; 16 tasks executed via subagent-driven-development.

## Locked design Qs

| # | Decision | Realized in |
|---|---|---|
| Q1=A | list-first default; `[รายการ][ปฏิทิน]` toggle pill | Task 12 (AdminDashboard surgical insert) |
| Q2=B+D | doctors row primary + assistants row below; today/tomorrow only | Task 6 (DoctorCards) + Task 10 (View memo) |
| Q3=C | single-load aggregation (~6 batched queries; O(1) lookup per card) | Task 4 (Aggregator) + Task 10 (View Promise.all) |
| Q4=A | smart per-tab defaults + auto-missed-chip + dropdown override | Task 3 (Filters) + Task 9 (RowCard chip) |
| Q5=C | jsPDF export via direct html2canvas+jsPDF (V32 lock) | Task 5 (PrintTemplate) + Task 10 (handlePrint) |

## Files Touched

**NEW source files** (7 total):

- `src/lib/appointmentHubFilters.js` — Q4 per-tab predicates (Bangkok TZ stable; 25 tests)
- `src/lib/appointmentHubAggregator.js` — Q3 single-load Map (multi-wallet sum; 11 tests)
- `src/lib/appointmentHubPrintTemplate.js` — Q5 pure HTML/data builder; V32 lock (4 tests)
- `src/components/admin/AppointmentHubView.jsx` — orchestrator
- `src/components/admin/AppointmentHubDoctorCards.jsx` — doctors+assistants header
- `src/components/admin/AppointmentHubTabBar.jsx` — 4 pills with bubble counts
- `src/components/admin/AppointmentHubFilterBar.jsx` — search + 3 dropdowns + 2 buttons
- `src/components/admin/AppointmentHubRowCard.jsx` — per-row card with status-conditional buttons

**NEW backend lib helpers** (added to `src/lib/backendClient.js` + re-exported via `src/lib/scopedDataLayer.js`):

- `getAppointmentsByDateRange({from, to, branchId, allBranches})` — V54 BS-13 safe-by-default mirror (6 tests)
- `getWalletsForCustomerIds(customerIds)` — bulk fetch via `where('customerId', 'in', chunk)` chunks of 30 (7 tests; schema fix corrected from doc-id to customerId-field per V64 task2 verification)

**NEW test files** (5 total, +92 tests cumulative):

- `tests/v64-get-appointments-by-date-range.test.js` (6 V64.B1)
- `tests/v64-get-wallets-for-customer-ids.test.js` (7 V64.W1 incl. W1.2b multi-wallet repro)
- `tests/v64-appointment-hub-filters.test.js` (25 V64.F1-F6)
- `tests/v64-appointment-hub-aggregator.test.js` (11 V64.A)
- `tests/v64-appointment-hub-pdf-template.test.js` (4 V64.P)
- `tests/v64-appointment-hub-rtl.test.jsx` (24 V64.R RTL across 4 components)
- `tests/v64-appointment-hub-flow-simulate.test.jsx` (7 V64.S Rule I)
- 8 sub-tests appended to `tests/audit-branch-scope.test.js` (BS-16 ×6, AV36 ×2)

**MODIFIED**:

- `src/pages/AdminDashboard.jsx` — surgical wrap of existing ~600-LOC calendar IIFE with view-toggle pill + conditional render. Calendar block UNCHANGED. NEW state `apptViewMode: 'list' | 'calendar'`.
- `src/lib/scopedDataLayer.js` — added 2 new export lines (`getAppointmentsByDateRange` _autoInject + `getWalletsForCustomerIds` universal)
- `tests/branch-selector-bs-f-reader-refactor.test.js` — `fnSlice` helper anchored on `name(` so V64's `getAppointmentsByDateRange` doesn't shadow `getAppointmentsByDate`
- `.agents/skills/audit-branch-scope/SKILL.md` — 15 → 16 invariants (BS-16 added)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — 35 → 36 invariants (AV36 added)
- `docs/superpowers/specs/2026-05-08-appointment-coming-hub-design.md` — design spec
- `docs/superpowers/plans/2026-05-08-appointment-coming-hub.md` — implementation plan (16 tasks)

## Architectural notes

- **Single-load aggregation strategy** (Q3=C): one `Promise.all` of 6 batched queries (`getAppointmentsByDateRange + getAllCustomers + getAllDeposits + getAllSales + getAllMemberships + listStaffSchedules`) + secondary `getWalletsForCustomerIds` chunked-fetch keyed by customerId. Aggregator builds `Map<customerId, summary>` for O(1) lookup per row card. ZERO N+1 even at 120+ rows on past tab.
- **Composite wallet doc-id schema** (V64 task2 verification fix): `be_customer_wallets` uses `${customerId}__${walletTypeId}` doc IDs with `customerId` as a field. Initial spec wrongly used `where(documentId(), 'in', ...)` which would return zero matches against real prod data. Implementer subagent's pre-flight schema check caught the gap; corrected before downstream wiring; aggregator updated to SUM balances per customerId across N wallet types.
- **Branch-scope discipline (BS-16)**: View imports from `scopedDataLayer.js` (NOT raw backendClient); subscribes `useSelectedBranch`; passes `selectedBranchId` to all branch-scoped loaders + includes in useEffect deps. Resets filters on branch switch (Phase 17.0 BS-9 pattern). All hub helpers branch-blind (toString.grep regression locks).
- **PDF V32 lock (AV36)**: `appointmentHubPrintTemplate.js` is a pure HTML/data builder with no html2pdf import. The View's `handlePrint` lazy-imports `html2canvas` + `jspdf` directly and calls `jsPDF.addImage(...mm dimensions)` — V32 blank-2nd-page bug avoided.
- **Action wiring**: 5 status flows (pending / confirmed-future / confirmed-past-missed / done / cancelled) each get correct buttons. All mutation handlers reuse existing AdminDashboard helpers (`updateBackendAppointment`, `setApptFormMode`, `setTreatmentFormMode`, `setShowSessionModal`). NO new mutation logic introduced.

## Commits (18 V64-related, atop V52..V63 + V63 backfill)

```
df33505 fix(V64): build-warning + BS-F.3 fnSlice prefix-shadow regression
183b946 test(V64 task14): BS-16 + AV36 audit invariants
d9535e7 test(V64 task13): Rule I full-flow simulate
25e1e14 feat(V64 task12): AdminDashboard appointment-tab integrates V64 hub view
bede683 test(V64 task11): RTL bank — 24 cases
dfe8ef2 feat(V64 task10): AppointmentHubView orchestrator
c01c395 feat(V64 task9): AppointmentHubRowCard
1f008bc feat(V64 task8): AppointmentHubFilterBar
80695bb feat(V64 task7): AppointmentHubTabBar
3486a15 feat(V64 task6): AppointmentHubDoctorCards
f966944 feat(V64 task5): appointmentHubPrintTemplate
d1da93c feat(V64 task4): appointmentHubAggregator
9124926 feat(V64 task3): appointmentHubFilters
f54955a fix(V64 task2): correct getWalletsForCustomerIds query for composite doc-id schema
e0402bd feat(V64 task2): getWalletsForCustomerIds
32fd07b feat(V64 task1): getAppointmentsByDateRange
3615f04 plan(V64): appointment coming-hub view implementation plan (16 tasks)
9ba30a9 spec(V64): appointment coming-hub view design (5 Qs locked)
```

## Verification

- **Targeted V64 tests**: 92/92 GREEN (all V64.B1 + W1 + F1-F6 + A + P + R + S + BS-16 + AV36 banks)
- **Full vitest** (`npm test -- --run`): 8150 passed | 1 skipped (8152) — **+92 net vs prior session 8059**
- **One pre-existing flake**: `bsa-task7-h-quater-fix.test.js T7.regression-guard` passes standalone but flakes in full-suite parallel runs (TFP line 666 comment from V50 + Windows shell-spawn timing in execSync). NOT V64-related; deferred.
- **Build** (`npm run build`): CLEAN (no warnings post-fix).

## Audit invariants added

- **BS-16** — AppointmentHub* components branch-scope discipline (6 sub-tests)
- **AV36** — V64 PDF print V32 lock universal (2 sub-tests)

Cumulative: AV1-AV30 + AV32-AV36 + BS-1..BS-16 + CB-1..CB-5.

## Next Todo

- Combined `vercel --prod` for V52..V64 (50 commits ahead of prod). User-explicit "deploy" THIS turn required.
- (Optional) address pre-existing bsa-task7-h-quater flake by either tightening the test's shell-spawn pattern OR removing the parenthesis from TFP line 666 comment.

## Resume Prompt

See SESSION_HANDOFF.md `## Resume Prompt` block (auto-updated this checkpoint).
