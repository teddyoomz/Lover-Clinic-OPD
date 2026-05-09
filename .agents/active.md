---
updated_at: "2026-05-09 EOD #23 — Phase 25.0 Walk-in shipped (NOT YET DEPLOYED)"
status: "master=141f927 · prod=ad7ee0e · 1 ahead · 8242/8245 + 1 pending · build clean · NOT YET DEPLOYED"
branch: "master"
last_commit: "feat(Phase 25.0): Walk-in 5th appointment type + frontend tab rename + OPD-save → modal flow"
tests: 8242
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ad7ee0e"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<HEAD>` (1 ahead of prod `ad7ee0e`) — Phase 25.0 batch shipped + pushed; NOT yet deployed (awaiting explicit "deploy" per Rule V18)
- 8242/8245 tests passed + 1 pending (1 pre-existing `bsa-task7-h-quater-fix` flake; 0 Phase 25.0 regressions)
- Build clean
- Invariant set unchanged + extended: `lockedChannel` prop on AppointmentFormModal joins lockedCustomer + lockedAppointmentType as the 3rd member of the locked-field family (Rule of 3 reached)

## What this session shipped
- **Phase 25.0 — Walk-in 5th appointment type + Walk-in queue integration** (1 commit) — User's 4-task batch:
  1. (25.0a) `walk-in` registered in SSOT (`appointmentTypes.js` 5th frozen entry with `defaultColor='น้ำตาลอ่อน'`, order 4) + backend nav sub-tab `appointment-walk-in` below `appointment-follow-up` (Footprints icon, amber palette) + `BackendDashboard` tab guard + activeTab→type mapper extended + V64 hub `TYPE_CHIP_CLS` amber-100/950 chip wired
  2. (25.0b) AdminDashboard frontend tab rename "คิว"/"หน้าคิว" → "คิว Walk-IN" (mobile + desktop, internal mode key `'dashboard'` unchanged)
  3. (25.0c) NEW `lockedChannel` prop on `AppointmentFormModal` (mirror of Phase 21.0 `lockedAppointmentType`); NEW `_maybeOpenWalkInModal` helper in `AdminDashboard.handleOpdClick` gated on `adminMode === 'dashboard'`, wired at all 3 customer-save success branches; modal mounts with `lockedAppointmentType='walk-in'` + `lockedChannel='Walk-in'` + `lockedCustomer={just-saved-customer}` + `initialDate=thaiTodayISO()` + `skipCollisionCheck=true`. Customer is auto-provisioned by existing OPD-save flow → modal opens with full be_customers doc already present (no `lockedTempCustomer` pattern needed)
  4. (25.0d) V64 hub auto-displays walk-in via existing infrastructure (`getAppointmentsByDateRange` wide-range fetch + `applyTabFilter('today')` + `sortApptsByDateTimeAsc` + V64-fix9 `appointmentDataVersion` real-time refresh). NO edits needed.
- **Tests**: 4 NEW Phase 25.0 test files (44 tests: SSOT + lockedChannel prop + tab rename + Rule I full-flow simulate F1-F14); 5 EXISTING Phase 19/21 tests updated for 4→5 type expansion (parameterized N_TYPES; nav section count 5→6); 1 source-comment fix in AdminDashboard for B.11 V12 anti-regression
- **Wiki**: UPDATED `appointment-types-ssot.md` (4→5-type) + `appointment-15min-and-4types.md` (Phase 25.0a evolution section + `lockedChannel` Rule of 3 mirror doc) + appended `log.md` Phase 25.0 entry

## Next action
Awaiting explicit "deploy" (Rule V18) for combined `vercel --prod` + `firebase deploy --only firestore:rules` (idempotent — no rules change). OR additional user-direction.

## Outstanding user-triggered actions
- 🚨 **Phase 25.0 deploy** (1 commit ahead of prod). User must explicitly type "deploy" THIS turn per V18.
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 false-positive trim.
- (Optional, unchanged) `bsa-task7-h-quater-fix` flake (passes standalone, flakes in full-suite parallel runs).

## Institutional memory anchors
- **Phase 25.0c — `lockedChannel` prop on AppointmentFormModal** is the canonical Rule of 3 mirror of Phase 21.0's `lockedAppointmentType`. Future locked-X props for the modal MUST mirror the `safeLockedX = ALLOWED.includes(prop) ? prop : null` validation + payload-override + chip-render-with-🔒 + `data-locked-X` attr pattern.
- **Walk-in flow inversion** — vs. other 4 appointment types (booking BEFORE customer arrives), walk-in records customer FIRST → THEN creates appointment. `_maybeOpenWalkInModal` helper gates on `adminMode === 'dashboard'` so other tabs (จองมัดจำ / จองไม่มัดจำ) keep their existing pre-arrival flow.
- **Auto-scaling consumers** — every consumer that iterates `APPOINTMENT_TYPES.map` / calls `resolveAppointmentTypeLabel` auto-picks up new types. Hardcoded chip-class maps (TYPE_CHIP_CLS) need explicit additions. Future 6th type = SSOT entry + 1 chip class entry + 1 nav item; everything else auto-scales.
- **V64 hub appointmentDataVersion (V64-fix9)** — counter on `listenToAppointmentsByMonth` callback. Walk-in saves via Phase 25.0c flow trigger this same listener → V64 hub silent-reloads → real-time display without F5.
- (Carried) `_apptHubStyles.js` shared module (V64-fix11) — single source of truth for hub buttons / tabs / accent bars / status chips.
- (Carried) `customerNavigation.js` Phase 15.7-septies pattern — canonical for "navigate to customer detail in new tab".
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV36 + CB-1..5 (no changes this session).
