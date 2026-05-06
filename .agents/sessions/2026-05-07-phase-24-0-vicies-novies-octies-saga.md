# Session 2026-05-07 EOD — Phase 24.0-vicies-novies family (octies saga)

## Summary
7-commit + 2-deploy session. Shipped OPD-save auto-attach (vicies-novies), handleDepositSync duplicate-deposit fix (bis), master-data sync source switch + branch filter + wipe (ter), local-only sync orchestrator (quater), import-target switch (sexies), WRONG allBranches-true direction (septies — REVERTED), and CORRECT migrate-mapper-stamps-branchId fix (octies). Mid-session pivot: no-deploy directive lifted; 2 deploys ran. master = prod = e36811f at session end.

## Current State
- master = prod = `e36811f` · 6646/6646 tests pass · build clean
- 2 deploys this session: combined (`vercel + firestore:rules` w/ Probe-Deploy-Probe) mid-session + vercel-only at end
- Per-branch catalog isolation now working correctly (6 catalog tabs filter by branchId; migrate stamps branchId from selectedBranchId)
- 32 NEW tests + 23 deleted (wrong septies direction) + multiple V21 lock-in updates

## Commits

```
e36811f fix(phase-24-0-vicies-novies-octies): migrate mappers stamp branchId from selectedBranchId — per-branch catalog isolation restored
1b58cb4 fix(phase-24-0-vicies-novies-septies): catalog tabs (Products/Courses/DfGroups/MedicalInstruments/ProductUnits/ProductGroups) use allBranches:true [REVERTED in octies]
3d02ad8 feat(phase-24-0-vicies-novies-sexies): switch master-data import target นครราชสีมา → พระราม 3 + sync orchestrator + (unused) wipe script
15cd0ce feat(phase-24-0-vicies-novies-quater): local-only master-data sync orchestrator (no deploy)
3301d5e feat(phase-24-0-vicies-novies-ter): sync source = production ProClinic + นครราชสีมา branch filter + master_data wipe
6eb6b28 fix(phase-24-0-vicies-novies-bis): handleDepositSync duplicate-deposit + missing-attach (post-vicies-novies miss)
6bb00f0 feat(phase-24-0-vicies-novies): OPD-save auto-attach customer-later bookings via unique session-id link
```

## Files Touched

**Source**:
- `src/lib/appointmentDepositBatch.js` — NEW `attachCustomerToOpdSessionLinks` + `provisionOpdLinkForBookingPair`; existing `buildDepositPairPayload` + `buildAppointmentPairPayload` extended to accept `linkedOpdSessionId`
- `src/pages/AdminDashboard.jsx` — `_attachLinkedBookings` closure in handleOpdClick, `coerceId` healing in handleDepositSync, linkedOpdSessionId stamping in confirmCreateDeposit + confirmCreateNoDeposit
- `src/lib/backendClient.js` — `IMPORT_TARGET_BRANCH_ID` constant (renamed from NAKHON_BRANCH_ID, value flipped to พระราม 3); `runMasterToBeMigration` accepts `branchId` opt + passes to mapper as 5th arg; 7 mappers updated (Product/Course/DfGroup/MedicalInstrument/ProductUnit/ProductGroup/Holiday) to stamp branchId; 7 wrapper migrate functions accept `{branchId}` opt; `migrateMasterBranchesToBe` + `migrateMasterStaffSchedulesToBe` filter by IMPORT_TARGET_BRANCH_ID
- `src/components/backend/MasterDataTab.jsx` — imports `useSelectedBranch`; `handleMigrate` passes `{branchId: selectedBranchId}` to target.fn
- `src/pages/BackendDashboard.jsx` — removed `setUseTrialServer(true)` mount-time call (sync source switch to production)
- `src/components/backend/SendCustomerLinkModal.jsx` — NEW (URL display + QR + copy + print)
- `src/components/backend/DepositPanel.jsx` — wired send-link button on customer-later cards
- `src/components/backend/AppointmentFormModal.jsx` — wired send-link button in pickLater section (edit mode)
- `src/components/backend/ProductsTab.jsx` / CoursesTab / DfGroupsTab / MedicalInstrumentsTab / ProductUnitsTab / ProductGroupsTab — REVERTED Phase 24.0-vicies-novies-septies allBranches:true → back to {branchId: selectedBranchId}

**Scripts**:
- `scripts/run-master-data-sync-all-from-local.mjs` — NEW (firebase-admin + custom-token + master.js handler invocation; --fresh-login flag)
- `scripts/phase-24-0-vicies-novies-ter-wipe-master-data.mjs` — NEW + EXECUTED (15 docs deleted)
- `scripts/phase-24-0-vicies-novies-quinquies-wipe-products-courses-promotions.mjs` — NEW but UNUSED (user pivoted away from wipe)

**Tests** (NEW files):
- `tests/phase-24-0-vicies-novies-opd-save-auto-attach.test.js` (~30)
- `tests/phase-24-0-vicies-novies-send-customer-link.test.js` (~32)
- `tests/phase-24-0-vicies-novies-flow-simulate.test.js` (~21 Rule I E2E scenarios)
- `tests/phase-24-0-vicies-novies-bis-handle-deposit-sync.test.js` (~17)
- `tests/phase-24-0-vicies-novies-bis-end-to-end-scenarios.test.js` (~26 E2E)
- `tests/phase-24-0-vicies-novies-ter-sync-source-switch.test.js` (~30)
- `tests/phase-24-0-vicies-novies-octies-migrate-stamps-branchid.test.js` (~32)

**Tests** (DELETED — wrong direction lock-in):
- `tests/phase-24-0-vicies-novies-septies-catalog-tabs-allbranches.test.js`

**V21 lock-in updates** (existing tests amended for new shape):
- `phase-20-0-task-5c-deposit-sync` (W4.1)
- `phase-21-0-appointment-form-modal-locked-type` (F1.12)
- `phase-24-0-terdecies-customer-later-flow` (CLF.D.3)
- `phase15.7-sexies-appt-modal-delete-and-customer-link` (SX3.5)

## Decisions (one-line each)
- **OPD-save auto-attach** uses bidirectional unique-link match (opd_sessions.linkedDepositId/Apptid + be_deposits/be_appointments.linkedOpdSessionId). No phone fallback, no fuzzy match — pure session-id-based per user directive "เวลาเราส่ง link ให้ใครอะ มันสร้าง unique link มาอยู่แล้ว".
- **handleDepositSync** is a separate handler from handleOpdClick (was missed in vicies-novies); fix uses linkedDepositId resolution + updateDeposit + attachCustomerToOpdSessionLinks cascade.
- **Sync source switch** = remove `setUseTrialServer(true)` from BackendDashboard mount (single switch point); brokerClient still exports the helper for explicit opt-in.
- **`IMPORT_TARGET_BRANCH_ID` rename** (was NAKHON_BRANCH_ID): generic name lets future flips be value-only (e.g. switched นครราชสีมา → พระราม 3 with 1 line change).
- **Per-branch catalog isolation = migrate stamps branchId** (NOT allBranches:true on tabs). User directive: "อยู่ดีๆ ไปใช้คอร์ส กับ สินค้า ที่ไม่ใช่สิ่งที่ universal ร่วมกันเฉยเลย". Septies was wrong direction; octies reverts + fixes correctly.
- **MasterDataTab handleMigrate plumbing**: `useSelectedBranch()` → handleMigrate passes `{branchId}` to fn → wrapper forwards to runMasterToBeMigration → mapper stamps. Mappers without branch dimension (branches/permissions/staff/doctors) ignore the 5th arg backward-compatibly.
- **Rule M data-ops**: master_data wipe + sync orchestrator both follow Rule M canonical pattern (firebase-admin SDK from local + .env.local.prod + audit doc + idempotent + crypto-secure randHex).
- **Production credential discovery**: PROCLINIC_EMAIL/PASSWORD env was for a wrong/limited user (4/18 sync OK on first attempt); user updated to Owner credentials → still failed; root cause was Vercel CLI env-pull \\n escape bug (script env parser fixed to dotenv-compatible).

## Lessons (link to v-log-archive.md candidates)
- **Septies → octies anti-pattern**: when user reports "X doesn't show", default direction matters. allBranches:true was the WRONG simplification (violated Phase BSA per-branch design). Real fix = stamp branchId at write-time so per-branch filter works as designed. Future: when in doubt about per-branch vs global, ASK before flipping pattern.
- **Mapper signature extension** (5th arg pattern): adding optional branchId arg with `= ''` default is backward-compatible (mappers without branch dimension simply ignore). Good convention for future cross-cutting concerns.
- **Vercel CLI \n escape**: multi-line env values exported by `vercel env pull` use literal `\n` (backslash + n) in quoted strings. JS createSession's `.trim()` doesn't strip these. Custom env parser must JSON-decode escape sequences (mirrors dotenv).

## Next Todo
Idle. Awaiting user directive.

## Resume Prompt
See `SESSION_HANDOFF.md` `## Resume Prompt` block.
