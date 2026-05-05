# Phase 20.0 — Frontend rewire to be_* + BranchSelector

**Date**: 2026-05-06
**Status**: Approved (skipping user spec-review per directive "approve ไม่ต้อง review จัดการทำได้เลย")
**Predecessor**: Phase 19.0 (V15 #22 LIVE) — appointment 15-min slots + 4-type taxonomy

## User directive (verbatim, 2026-05-06)

> "ต่อไปเป็นเรื่องของ Frontend หรือหน้า Admindashboard และหน้าย่อย ปุ่มย่อย modal ย่อยของเขาทั้งหมด
>
> * ข้อที่ 1 จะทำให้ Frontend นั้นแทนที่ตอนนี้ไปบันทึกข้อมูลลง Proclinic ที่อื่น แต่ตอนนี้ระบบหลังบ้านเรารองรับระบบจาก Frontend ทุกระบบแล้ว เลยจะต้องทำให้ Frontend เชื่อมกับ backend เราแทน โดยทั้งหน้า คิว, จองมัดจำ, จองไม่มัดจำ, นัดหมาย อะไรที่เป็นการดึงหรือบันทึกข้อมูลจาก proclinic นอก vercel เรา ให้ตัดทิ้งทั้งหมด ให้ทุกปุ่ม ปุก function rewiring หรือ refactor มาเข้ากับ backend ของเราอย่าง seamlessly โดยปุกปุ่มใน Frontend นั้นยังทำงานเหมือนเดิมได้ทุกอย่างทุกปุ่ม ให้ test มาด้วยทุกกรณีว่าใช้ได้จริงทุกกรณี ทุกmodal ทุกปุ่มทุกหน้า เหมือนเดิม
>
> * ข้อที่ 2 เพิ่ม Branch tab เปลี่ยนสาขาได้เหมือน Backend โดยถ้าเปลี่ยน Branch tab เป็นสาขาไหน Frontend ก็จะไปเชื่อมกับสาขานั้นตามข้อแรกด้านบนที่ได้อธิบายไป
>
> ความไม่แน่ใจเรื่อง Dependencies เลยไม่แน่ใจว่าควรทำข้อที่ 1 หรือข้อที่ 2 ก่อน เรียงลำดับที่มันควรจะเป็นและทำให้เกิด error และความผิดพลาดให้น้อยที่สุด"

Translation:
1. AdminDashboard (queue + deposit booking + no-deposit booking + appointment) writes to ProClinic today via brokerClient + `/api/proclinic/*`. Backend now supports every flow via `be_*`. Strip ProClinic completely from AdminDashboard, rewire to `be_*` seamlessly. Every button must keep working identically. Test every modal, button, and page in every case.
2. Add a BranchSelector to Frontend (mirrors BackendDashboard). Switching branch must scope the Frontend's reads/writes to that branch.
3. Resolve dependency: which order minimizes errors?

## Approved decisions (locked from brainstorming Q1-Q4)

- **Q1 — Ordering**: Item 1 first, Item 2 second. Item 2 alone is a no-op (ProClinic doesn't honor branch context); Item 1 makes the Frontend branch-aware-by-default via Phase BSA infrastructure (auto-stamp via `_resolveBranchIdForWrite`, auto-filter via `resolveSelectedBranchId()`).
- **Q1.b — Sub-approach**: Per-flow phased — 5 PRs (Flow A→D→C→B→Misc) + 1 PR for Item 2 = 6 commits total. Each PR has its own Rule I full-flow simulate per Q4 calibration. Lower risk, easy bisect, clean rollback per phase.
- **Q2 — Modal extraction**: (b) Extract all 4 inline modals from `AdminDashboard.jsx` to `src/components/frontend/{DepositBookingModal,NoDepositBookingModal,AppointmentModal,AppointmentEditModal}.jsx`. Mirrors BackendDashboard's `AppointmentFormModal` pattern (Rule C1 — share-pattern across 5 surfaces). Diff is +30-50% per flow but AdminDashboard.jsx (~2000 LOC today) shrinks substantially + each modal is testable in isolation.
- **Q3 — Migration policy**: (α) Full migration `pc_appointments → be_appointments` via Rule M script before Flow A ships. Covers historical data continuity (admin sees pre-rewire appointments in the new Frontend). Default branchId = นครราชสีมา (Phase 17.2 newest-default). Forensic-trail fields: `migratedFromPc=true` + `pcMonthDocId=YYYY-MM` + `migratedAt=serverTimestamp()`. Idempotent (skip if `be_appointments/{id}` exists OR `migratedFromPc=true` already set).
- **Q4 — Test depth**: (β) Calibrated per Rule I —
  - Flow A (read-only swap): grep + simulate (a+c). No preview_eval needed for pure read.
  - Flow B/C/D (writes): full Rule I a+b+c+d+e (simulate + preview_eval against TEST-prefixed fixtures + grep + adversarial + lifecycle).
  - Flow Misc (strip): grep + build pass (c).
  - Flow Item 2 (BranchSelector): a+c+e (UI swap, no new write semantics).
- **Q4.b — Test prefix helpers**: NEW `tests/helpers/testAppointment.js` (V33.13) + `tests/helpers/testDeposit.js` (V33.14) mirroring V33.10/11/12 shape (`createTestAppointmentId` / `createTestDepositId` / `isTestAppointmentId` / `isTestDepositId` / `getTestAppointmentPrefix` / `getTestDepositPrefix` / frozen `TEST_APPOINTMENT_PREFIXES` / `TEST_DEPOSIT_PREFIXES`). Rule 02-workflow.md V33.13/14 sections added. Drift-catcher tests `tests/v33-13-test-appointment-prefix.test.js` + `tests/v33-14-test-deposit-prefix.test.js`.

## Architecture

### Layer changes

| Layer | Before | After |
|---|---|---|
| Frontend reads | `pc_appointments/{YYYY-MM}` getDoc + opd_sessions onSnapshot | `be_appointments` via `listenToAppointmentsByDate` (scopedDataLayer) wrapped in `useBranchAwareListener` + opd_sessions onSnapshot (unchanged) |
| Frontend writes | `broker.createAppointment/update/delete` → ProClinic → cookie-relay mirror to `pc_appointments` | `createBackendAppointment / updateBackendAppointment / deleteBackendAppointment` → `be_appointments` (auto-stamp `branchId` via `_resolveBranchIdForWrite`) |
| Dropdowns | `broker.getDepositOptions` / `broker.getLivePractitioners` | `listStaff` / `listDoctors` / `listExamRooms` from scopedDataLayer (auto-filter by selected branch) |
| Customer search | `broker.searchCustomers(q)` | `listCustomers` filtered client-side OR new `searchBackendCustomers` helper if Frontend search semantics differ |
| Customer courses | `broker.getCourses(proClinicId)` | direct `customer.courses[]` read from `be_customers` doc (already loaded) |
| Modals | inline JSX in AdminDashboard.jsx (~2000 LOC) | Extracted: `src/components/frontend/{DepositBookingModal,NoDepositBookingModal,AppointmentModal,AppointmentEditModal}.jsx` |
| Branch | none — single-clinic-only | `<BranchSelector/>` in AdminDashboard header + `useBranchAwareListener` wraps onSnapshots in AdminDashboard tree |
| Dead UI | "ทดสอบเชื่อมต่อ" button + session-expired banner + cookie-relay status | Removed from AdminDashboard surface (not from cookie-relay backend or MasterDataTab — dev sync still works) |

### Out of scope (locked, do not touch)

- `src/lib/brokerClient.js` — file persists; AdminDashboard simply stops importing. Removal is part of pre-launch H-bis ProClinic strip (user-triggered separately, not this phase).
- `api/proclinic/*` endpoints — persist for MasterDataTab dev sync.
- `cookie-relay/` Chrome extension — persists for MasterDataTab dev sync.
- `clinic_settings/proclinic_session*` Firestore docs — persist for cookie-relay backend.
- BackendDashboard tabs — already Firestore-only per Rule E. Only AdminDashboard's surface is in scope.
- PatientForm.jsx + PatientDashboard.jsx + ClinicSchedule.jsx — separate Frontend pages; out of scope (user said "หน้า Admindashboard และหน้าย่อย ปุ่มย่อย modal ย่อยของเขาทั้งหมด").
- `pc_appointments/{YYYY-MM}` documents — left as-is post-migration. Read-side eyeball ceases. Permanent strip is a separate H-bis pass.
- Cookie-relay banner / "expand session" UI in `ClinicSettingsPanel.jsx` — that lives in BackendDashboard's settings, not AdminDashboard. Untouched.

## Execution — 6 phases (commits)

### Phase 0 — Migration prep + V33.13/14 helpers (commit; NO deploy, NO --apply)

Files created/modified:
- NEW `scripts/phase-20-0-migrate-pc-appointments-to-be.mjs`
- NEW `tests/helpers/testAppointment.js` (V33.13)
- NEW `tests/helpers/testDeposit.js` (V33.14)
- NEW `tests/v33-13-test-appointment-prefix.test.js`
- NEW `tests/v33-14-test-deposit-prefix.test.js`
- NEW `tests/phase-20-0-migration-script.test.js` (M1-M8 — pure helper unit tests for `mapPcAppointmentToBe` + idempotency + audit-doc shape)
- MODIFY `.claude/rules/02-workflow.md` — append V33.13 + V33.14 sections (mirror V33.10/11/12 prose).

User runs `--dry-run` first, sanity-checks distribution, then `--apply` (Rule M — explicit user authorization required for prod data mutation; not auto-triggered by this phase ship).

Commit: `feat(phase-20-0/task-0): migration script scaffold + V33.13/14 prefix helpers`

### Phase 1 — Flow A queue read-source swap (commit, ship-ready)

Files modified:
- `src/pages/AdminDashboard.jsx` — replace `pc_appointments/{month}` `getDoc` calls (lines 484, 753, 1141, 1219) with `listenToAppointmentsByDate` from scopedDataLayer (per-date subscriptions; aggregate within Frontend since `pc_appointments` was monthly while `be_appointments` is per-doc). Replace `broker.syncAppointments(month)` calls (lines 484, 500, 517, 571, 803, 1111, 1209) with no-op (the be_* listener auto-refreshes — no manual sync needed).
- Wrap onSnapshot subscriptions in `useBranchAwareListener` (Layer 3) so future BranchSelector toggles auto-resubscribe.

Tests:
- NEW `tests/phase-20-0-flow-a-queue-read-source.test.jsx` —
  - A1 source-grep: `pc_appointments` not read in AdminDashboard.jsx
  - A2 source-grep: `broker.syncAppointments` not called in AdminDashboard.jsx
  - A3 source-grep: `listenToAppointmentsByDate` imported from scopedDataLayer in AdminDashboard.jsx
  - A4 source-grep: `useBranchAwareListener` wraps any onSnapshot in AdminDashboard tree
  - A5 simulate (jsdom): mount AdminDashboard with be_appointments fixture → queue calendar renders correct count
  - A6 adversarial: empty fixture → empty queue (no crash); large fixture (200 appts) → renders without error

Commit: `feat(phase-20-0/task-1): Flow A queue reads be_appointments via scopedDataLayer`

### Phase 2 — Flow D appointment modal CRUD + extract (commit)

Files created/modified:
- NEW `src/components/frontend/AppointmentModal.jsx` — extracted from AdminDashboard.jsx (~lines 668-695 + 1704-1777 view portion).
- NEW `src/components/frontend/AppointmentEditModal.jsx` — extracted from AdminDashboard.jsx (edit portion).
- MODIFY `src/pages/AdminDashboard.jsx` — replace inline JSX with `<AppointmentModal />` + `<AppointmentEditModal />`. Replace `broker.listCustomerAppointments` (lines 610, 678, 694) with `listAppointmentsByCustomer(customerId)` from scopedDataLayer (NEW helper if missing — check first; might be `listenToAppointmentsByDate` filtered or new). Replace `broker.createAppointment` (line 671) with `createBackendAppointment`. Replace `broker.updateAppointment` (line 669) with `updateBackendAppointment`. Replace `broker.deleteAppointment` (lines 690, 1864) with `deleteBackendAppointment`.

Tests:
- NEW `tests/phase-20-0-flow-d-appointment-modal-flow-simulate.test.jsx` — Rule I full (a+b+c+d+e):
  - D1 (a) Pure simulate: AppointmentModal create flow → assert payload shape on `createBackendAppointment` mock
  - D2 (a) Pure simulate: edit flow → assert `updateBackendAppointment` payload
  - D3 (a) Pure simulate: delete flow → assert `deleteBackendAppointment` called with correct ID
  - D4 (a) Pure simulate: list customer's appointments via filter
  - D5 (c) Source-grep: AdminDashboard.jsx + AppointmentModal.jsx + AppointmentEditModal.jsx have NO `brokerClient` import
  - D6 (c) Source-grep: scopedDataLayer imports present
  - D7 (d) Adversarial: invalid time → validation error surfaces; empty customerId → block submit
  - D8 (d) Adversarial: concurrent edit collision → `updateBackendAppointment` shows last-write-wins (or whatever current contract)
  - D9 (e) Lifecycle: post-save doc has `branchId` stamped + `appointmentType` valid + audit-trail fields preserved
  - D10 (b) preview_eval: live dev server, create real be_appointments doc with TEST-APPT-{ts} → verify branchId stamp + cleanup via existing admin endpoint

Commit: `feat(phase-20-0/task-2): Flow D appointment modal CRUD on be_*`

### Phase 3 — Flow C no-deposit booking modal + extract (commit)

Files created/modified:
- NEW `src/components/frontend/NoDepositBookingModal.jsx` — extracted from AdminDashboard.jsx (~lines 1625-1701 + 1704-1777 if no-deposit-edit branch shares).
- MODIFY `src/pages/AdminDashboard.jsx` — replace inline JSX with `<NoDepositBookingModal />`. Replace `broker.createAppointment` (line 1664) with `createBackendAppointment`. Replace `broker.updateAppointment` (line 1746) with `updateBackendAppointment`. Replace `broker.createAppointment` retry (line 1754) with `createBackendAppointment`.
- Preserve `opd_sessions` linking (link session-id to appointment-id) — anon-auth path; per V23 hasOnly whitelist still applies.

Tests:
- NEW `tests/phase-20-0-flow-c-no-deposit-flow-simulate.test.jsx` — Rule I full (a+b+c+d+e):
  - C1-C5 (a) Pure simulate: kiosk booking lifecycle (create / update / retry-on-failure / link-to-session / cancel)
  - C6 (c) Source-grep: AdminDashboard + NoDepositBookingModal have NO brokerClient
  - C7 (d) Adversarial: invalid customer / past time / cross-branch staffId → validation error
  - C8 (e) Lifecycle: post-save be_appointments has branchId + appointmentType='no-deposit-booking' + opd_sessions has linkedAppointmentId
  - C9 (b) preview_eval: live booking with TEST-APPT-{ts} + TEST-customer → confirm both docs + cleanup

Commit: `feat(phase-20-0/task-3): Flow C no-deposit booking on be_*`

### Phase 4 — Flow B deposit booking modal + extract (commit)

Files created/modified:
- NEW `src/components/frontend/DepositBookingModal.jsx` — extracted from AdminDashboard.jsx (~lines 1568+).
- MODIFY `src/pages/AdminDashboard.jsx` — replace inline JSX with `<DepositBookingModal />`. Replace `broker.getDepositOptions` (line 1568) with parallel `Promise.all([listStaff(), listDoctors(), listExamRooms()])` from scopedDataLayer.
- Verify deposit submission goes through `createDeposit` (be_*) — should be already; if AdminDashboard previously wrote via broker, swap that.

Tests:
- NEW `tests/phase-20-0-flow-b-deposit-flow-simulate.test.jsx` — Rule I full:
  - B1-B5 (a) Pure simulate: deposit flow with each combo of (with-appointment / without-appointment) × (4 appointment types) when chosen
  - B6 (c) Source-grep: no brokerClient remnants
  - B7 (d) Adversarial: invalid amount / no payment method
  - B8 (e) Lifecycle: post-save be_deposits + (if appt) be_appointments both stamped with branchId + appointmentType='deposit-booking' on the appointment side
  - B9 (b) preview_eval: live deposit with TEST-DEPOSIT-{ts} + TEST-customer + TEST-APPT-{ts} → verify shape + cleanup

Commit: `feat(phase-20-0/task-4): Flow B deposit booking on be_*`

### Phase 5 — Misc broker strip + dead UI removal (commit)

Files modified:
- `src/pages/AdminDashboard.jsx` —
  - Replace `broker.searchCustomers` (line 594) with `listCustomers` filter or new `searchBackendCustomers` helper if needed.
  - Replace `broker.getCourses(proClinicId)` (line 1473) with direct `customer.courses[]` read.
  - Remove `broker.getLivePractitioners` (line 148) — all consumers should already use listStaff/listDoctors via Phase 2-4.
  - Remove `broker.getProClinicCredentials` (line 441) + the "ทดสอบเชื่อมต่อ" / settings panel test section.
  - Remove session-expired banner UI (any inline JSX checking ProClinic session state).
  - Remove `ensureExtensionHasCredentials` / `requestExtensionSync` calls if any remain.
  - Remove `import` of brokerClient from AdminDashboard.jsx entirely.
- Possibly NEW `searchBackendCustomers` helper in scopedDataLayer if list+filter doesn't satisfy current AdminDashboard search behavior (HN search, phone search, ID-card search).

Tests:
- NEW `tests/phase-20-0-flow-misc-broker-strip.test.js` —
  - X1 source-grep: AdminDashboard.jsx has ZERO `brokerClient` references (regression guard)
  - X2 source-grep: ZERO `from 'lib/brokerClient'` import
  - X3 source-grep: ZERO `broker.X(` calls in any `src/components/frontend/*.jsx`
  - X4 build pass — `npm run build` clean (catches dangling references the runtime can't)

Commit: `feat(phase-20-0/task-5): Misc broker strip + dead UI removal`

### Phase 6 — Item 2 BranchSelector in AdminDashboard header (commit)

Files modified:
- `src/pages/AdminDashboard.jsx` — render `<BranchSelector/>` (existing component from `src/components/backend/BranchSelector.jsx`, repurposed for Frontend) in the header. Confirm BranchProvider is mounted at App.jsx (Phase 17.2 — already done).
- Confirm all onSnapshots in AdminDashboard tree wrapped in `useBranchAwareListener` (already done in Phase 1+2 prep; double-check after extracted modals).

Tests:
- NEW `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx` — calibrated (a+c+e):
  - Z1 (a) Simulate: BranchSelector renders in AdminDashboard header, default selection from BranchContext
  - Z2 (a) Simulate: switch branch → onSnapshots resubscribe (mock useBranchAwareListener verifies)
  - Z3 (a) Simulate: new appointment created post-switch → branchId in payload matches new selection
  - Z4 (c) Source-grep: AdminDashboard imports `BranchSelector` + `useSelectedBranch`
  - Z5 (c) Source-grep: AdminDashboard onSnapshots use `useBranchAwareListener` (no raw onSnapshot for branch-scoped collections)
  - Z6 (e) Lifecycle: 2-branch test fixture → switch from branch A to B → queue list refreshes → new write goes to B

Commit: `feat(phase-20-0/task-6): BranchSelector in AdminDashboard header (Item 2)`

## Migration script (Phase 0, Rule M)

`scripts/phase-20-0-migrate-pc-appointments-to-be.mjs`:

- Firebase Admin SDK; service-account credential via `.env.local.prod` (pulled via `vercel env pull`).
- PEM key conversion: `key.split('\\n').join('\n')` (Phase 19.0 lesson lock).
- Canonical path: `artifacts/loverclinic-opd-4c39b/public/data/{collection}` (Rule M).
- Source: `pc_appointments/{YYYY-MM}` — monthly summary docs holding embedded array of appointment objects.
- Target: `be_appointments/{appointmentId}` — one doc per appointment.
- Reads ALL `pc_appointments/*` docs (cross-month).
- For each embedded appointment in each month doc:
  - Map shape pc_appointments.embedded → be_appointments validator schema (use `migratePcAppointmentToBe` pure helper for testability).
  - Stamp `branchId = 'BR-1777095572005-ae97f911'` (นครราชสีมา default per Phase 17.2 newest-default).
  - Stamp `migratedFromPc = true`, `pcMonthDocId = 'YYYY-MM'`, `migratedAt = serverTimestamp()`.
  - Map ProClinic 2-type → 4-type: `'sales'` → `'no-deposit-booking'` (Phase 19.0 Option B uniform), `'followup'` → `'follow-up'`.
- Skip docs where `be_appointments/{appointmentId}` already exists OR target doc has `migratedFromPc=true` (idempotent).
- Audit doc: `be_admin_audit/phase-20-0-migrate-pc-appointments-{ts}-{rand}` with `{ scanned, migrated, skipped, beforeDistribution, afterDistribution, appliedAt }`.
- Two-phase: dry-run by default; `--apply` flag commits writes.
- Invocation guard: `if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(...)`.
- Crypto-secure audit-doc randHex: `randomBytes(8).toString('hex')`.

## Test plan (target +N tests)

### New test files

| File | Coverage |
|---|---|
| `tests/v33-13-test-appointment-prefix.test.js` | V33.13 helper unit + drift catcher (12 tests) |
| `tests/v33-14-test-deposit-prefix.test.js` | V33.14 helper unit + drift catcher (12 tests) |
| `tests/phase-20-0-migration-script.test.js` | M1 mapPcAppointmentToBe shape · M2 idempotent re-run · M3 audit-doc shape · M4 type-map: 'sales' → 'no-deposit-booking' · M5 'followup' → 'follow-up' · M6 unknown → 'no-deposit-booking' · M7 forensic-trail fields present · M8 dry-run yields no writes |
| `tests/phase-20-0-flow-a-queue-read-source.test.jsx` | A1-A6 |
| `tests/phase-20-0-flow-d-appointment-modal-flow-simulate.test.jsx` | D1-D10 |
| `tests/phase-20-0-flow-c-no-deposit-flow-simulate.test.jsx` | C1-C9 |
| `tests/phase-20-0-flow-b-deposit-flow-simulate.test.jsx` | B1-B9 |
| `tests/phase-20-0-flow-misc-broker-strip.test.js` | X1-X4 |
| `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx` | Z1-Z6 |

Estimated +75-90 tests across 9 files.

### Updated test files

- `tests/audit-branch-scope.test.js` — BS-1..BS-9 untouched (no new branch-scoped collection). BUT: BS-1 grep should now find AdminDashboard.jsx clean of `brokerClient` import — verify the audit picks this up.
- `tests/branch-collection-coverage.test.js` — no new collection.

### preview_eval verification (Rule I item-b NON-NEGOTIABLE for write paths — Phases 2/3/4)

Per Rule I:
- Spawn dev server.
- Each write-flow phase: create real be_* doc through the modal with TEST-APPT-{ts} / TEST-DEPOSIT-{ts} / TEST-customer prefix.
- Read Firestore back, assert shape + branchId stamp + appointmentType + audit-trail.
- Cleanup test docs via existing `/api/admin/cleanup-test-*` endpoints.

**Critical safeguard**: NEVER click real action buttons against production data without TEST- prefix (locked per `feedback_no_real_action_in_preview_eval.md` — chanel customer 2853 incident).

## Risk + rollback

**Per-phase risk profile**:

| Phase | Risk | Rollback |
|---|---|---|
| 0 (migration prep) | Shape mismatch in dry-run | Fix helper + re-dry-run; no prod state change until --apply |
| 1 (Flow A read swap) | Zero data loss (read-only); be_appointments empty for date → blank queue | `git revert` + redeploy |
| 2 (Flow D writes) | Writes go to be_*, not ProClinic | `git revert` (note: be_appointments docs created remain — admin can clean via test-prefix or keep; ProClinic side stops receiving updates) |
| 3 (Flow C writes) | Same as Flow D | Same |
| 4 (Flow B writes) | Same as Flow D | Same |
| 5 (Misc strip) | UI deletions only | `git revert` |
| 6 (BranchSelector) | UI add only | `git revert` |

## Deploy plan (per Rule B Probe-Deploy-Probe + V15 #N convention)

- **V15 #23**: Phase 0 migration script ship + Phase 0 `--apply` run from local (Rule M — script ships, --apply runs locally, NOT deploy-coupled). User authorizes --apply explicitly.
- **V15 #24**: Phases 1+2 bundled (Flow A read + Flow D modal CRUD — biggest single deploy chunk; Flow A's listener prep is foundation for Flow D's modal extraction).
- **V15 #25**: Phase 3 alone (Flow C no-deposit; depends on Flow D's modal pattern).
- **V15 #26**: Phases 4 + 5 + 6 (Flow B small + Misc strip + BranchSelector — all small, bundle).

Total: ~4 deploys spaced 0.5-1 day apart. Each needs explicit "deploy" THIS turn (V18 lock).

`firestore.rules`: NO change (be_appointments / be_deposits / be_exam_rooms / be_customers rules already shipped). Deploys are idempotent rules re-publish + vercel build per V15 convention.

### V23 Probe list (Rule B endpoints, unchanged)

1. POST `chat_conversations/test-probe-{ts}` → 200
2. PATCH `pc_appointments/test-probe?updateMask.fieldPaths=probe` → 200
3. PATCH `clinic_settings/proclinic_session?updateMask.fieldPaths=probe` → 200
4. PATCH `clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe` → 200
5. POST + PATCH `opd_sessions/test-probe-anon-{ts}` (anon-auth path) → 200/200
6. CREATE `be_exam_rooms/test-probe-{ts}` → 200 (clinic-staff only)

NOTE: per Phase 19.0 EOD lesson, Rule B docs need an `artifacts/{APP_ID}/public/data/` prefix clarification. That doc fix is on the outstanding actions list and may land alongside this phase's migration script. Not blocking.

## Build + test count expectations

- **Tests**: target +75-90 new (5463 → ~5540).
- **Build**: clean. No new dependencies.
- **firestore.rules**: v26 unchanged.
- **Bundle size**: marginally smaller (4 inline modals → 4 lazy-loadable extracted files; AdminDashboard.jsx shrinks by ~600-800 LOC).

## Cross-references

- Rule E: backend = Firestore only — Phase 20.0 brings AdminDashboard into compliance (one less violation surface).
- Rule H-bis: dev-only scaffolding strip — Phase 20.0 is the FRONTEND portion of the strip; brokerClient + cookie-relay backend remain for MasterDataTab. Full strip is a future user-triggered phase.
- Rule I: full-flow simulate at sub-phase end — applied per-phase per Q4 calibration.
- Rule J: superpowers — brainstorming HARD-GATE met (Q1-Q4 locked); plan-mode skipped per "approve ไม่ต้อง review".
- Rule K: work-first-test-last — each phase builds source first, then test bank in single batch before commit.
- Rule L: BSA — Phase 20.0 leverages Layer 1 (`_resolveBranchIdForWrite`) + Layer 2 (`scopedDataLayer.js` auto-inject) + Layer 3 (`useBranchAwareListener`). No new BS-N invariant; existing BS-1..BS-9 cover.
- Rule M: data ops via local + admin SDK + pull env — migration script template mirrors Phase 18.0 + 19.0; `--apply` runs from local, never deploy-coupled.
- V18 lock: deploy authorization per turn — each V15 #23/24/25/26 needs fresh "deploy" THIS turn.
- V23 anon-auth probe: opd_sessions whitelist preserved (no rule changes).
- V33.10/11/12 prefix discipline: V33.13/14 added (appointment + deposit).
- Phase 17.2 newest-default branchId: นครราชสีมา default for migration target.
- Phase 18.0 + 19.0 migration templates: canonical for `--apply` script shape.
- Phase 19.0 appointmentType 4-type taxonomy: Phase 20.0 migration maps PC 2-type → BE 4-type per Q1 Option B uniform.

## Sequencing within session (auto-execution)

Per user "approve ไม่ต้อง review จัดการทำได้เลย":

1. Write spec (this file). ✅
2. Spec self-review (inline).
3. Commit spec.
4. Invoke writing-plans skill → write detailed plan (sub-tasks per phase).
5. Commit plan.
6. Execute Phase 0: scaffold migration script + V33.13/14 helpers + migration tests + V33 drift-catcher tests.
7. Execute Phase 1: Flow A queue read swap + tests.
8. Execute Phase 2: Flow D modal extraction + CRUD swap + tests.
9. Execute Phase 3: Flow C modal extraction + booking swap + tests.
10. Execute Phase 4: Flow B modal extraction + dropdown swap + tests.
11. Execute Phase 5: Misc strip + tests.
12. Execute Phase 6: BranchSelector + tests.
13. Run `npm test -- --run` ALL PASS + `npm run build` clean.
14. Commit + push per phase as it completes.
15. **HALT** before:
    - `--apply` migration on prod (Rule M user-explicit-authorization required)
    - `vercel --prod` (Rule V18 user-explicit-authorization required THIS turn)
    - `firebase deploy --only firestore:rules` (Rule B + V18 user-explicit-authorization required)
16. Report progress + await user "deploy" + "apply migration" authorization.

## Approval gate

Spec approved per user directive 2026-05-06 ("approve ไม่ต้อง review จัดการทำได้เลย"). Hand off to writing-plans skill for detailed task plan → execute autonomously to halt point #15.
