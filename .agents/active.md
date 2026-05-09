---
updated_at: "2026-05-09 EOD #24 — Phase 25.0 Walk-in DEPLOYED to prod"
status: "master=ccef3c2 · prod=ccef3c2 · 0 ahead · 8242 passed · build clean · DEPLOYED"
branch: "master"
last_commit: "docs(agents+wiki): Phase 25.0 status docs — Walk-in 5th type shipped"
tests: 8242
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `ccef3c2` · prod = `ccef3c2` (0 ahead — combined deploy 2026-05-09 EOD #24)
- 8242/8245 tests passed + 1 pending (1 pre-existing `bsa-task7-h-quater-fix` flake; 0 Phase 25.0 regressions)
- Invariant set extended: `lockedChannel` joins `lockedCustomer` + `lockedAppointmentType` as 3rd member of the locked-field prop family on `AppointmentFormModal` (Rule of 3 reached)

## What this session shipped
- **Phase 25.0 — Walk-in 5th appointment type + Walk-in queue integration** (`141f927`) — User's 4-task batch:
  - 25.0a: `walk-in` SSOT 5th entry (น้ำตาลอ่อน amber order:4) + nav sub-tab `appointment-walk-in` below `appointment-follow-up` (Footprints icon) + `BackendDashboard` tab guard + activeTab→type mapper + V64 hub `TYPE_CHIP_CLS` amber chip wired
  - 25.0b: AdminDashboard frontend tab rename "คิว"/"หน้าคิว" → "คิว Walk-IN" (mobile + desktop, internal mode key `'dashboard'` unchanged)
  - 25.0c: NEW `lockedChannel` prop on `AppointmentFormModal` (mirror of Phase 21.0 `lockedAppointmentType` pattern); NEW `_maybeOpenWalkInModal` helper in `AdminDashboard.handleOpdClick` gated on `adminMode === 'dashboard'`, wired at all 3 customer-save success branches; modal mounts with `lockedAppointmentType='walk-in'` + `lockedChannel='Walk-in'` + `lockedCustomer={just-saved-customer}` + `initialDate=thaiTodayISO()` + `skipCollisionCheck=true`
  - 25.0d: V64 hub auto-displays walk-in via existing `getAppointmentsByDateRange` + `applyTabFilter('today')` + `sortApptsByDateTimeAsc` + V64-fix9 `appointmentDataVersion` (NO file edits)
- **Tests**: 4 NEW Phase 25.0 test files (44 tests); 5 EXISTING Phase 19/21 tests updated for 4→5 type expansion (parameterized N_TYPES; nav section count 5→6); B.11 V12 regression caught + fixed via comment edit
- **Wiki**: UPDATED `entities/appointment-types-ssot.md` (4→5-type) + `concepts/appointment-15min-and-4types.md` (Phase 25.0a evolution + lockedChannel Rule of 3 doc) + appended `log.md` ingest entry
- **DEPLOY** — combined `vercel --prod` (exit 0; aliased https://lover-clinic-app.vercel.app) + `firebase deploy --only firestore:rules` (idempotent — rules unchanged from `1da05bb`). Pre+post probe 1 + 5 GREEN; 2/3/4 V50-followup-2 expected false-positive. Cleanup: 4 probe artifacts nuked
- Detail: `.agents/sessions/2026-05-09-phase-25-0-walk-in.md`

## Next action
Idle — Phase 25.0 deployed; production stable.

## Outstanding user-triggered actions
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 still test V50-stripped collections — false-positive 403 each deploy; ignored manually per Sessions #20-#24 precedent.
- (Optional, unchanged) `bsa-task7-h-quater-fix` flake — passes standalone, flakes in full-suite parallel runs.

## Institutional memory anchors
- **Phase 25.0c — `lockedChannel` prop** is the canonical Rule of 3 mirror. Future locked-X props on `AppointmentFormModal` MUST mirror: `safeLockedX = ALLOWED.includes(prop) ? prop : null` validation + payload-override (lock wins) + chip-render-with-🔒 + `data-locked-X` attr + `data-testid` for tests.
- **Walk-in flow inversion** — record customer FIRST (existing OPD-save) → THEN modal-create. `_maybeOpenWalkInModal` gated on `adminMode === 'dashboard'` so other tabs (จองมัดจำ/จองไม่มัดจำ) keep pre-arrival flow.
- **Auto-scaling SSOT consumers** — `APPOINTMENT_TYPES.map` + `resolveAppointmentTypeLabel` callers auto-pick up new types. Hardcoded chip-class maps (TYPE_CHIP_CLS) need explicit additions per new type.
- (Carried) `_apptHubStyles.js` (V64-fix11) shared module unchanged.
- (Carried) `customerNavigation.js` Phase 15.7-septies pattern — canonical "navigate to customer detail in new tab".
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV36 + CB-1..5.
