# 2026-06-04 — Appointment-system looping bug-hunt (12 rounds) CONVERGED + DEPLOYED

## Summary
`/systematic-debugging` looping adversarial bug-hunt over the appointment system (app Core) + its cross-system wiring (deposit/treatment/sale/stock/reminder/calendar/restore). Loop = audit → fix → re-hunt, until a fresh hunt finds nothing. **12 rounds → CONVERGED.** ~12 real purpose-breaking bugs fixed (R5-R11), each L2-verified on REAL prod + RED→GREEN. Then verified **no-regression** (Rule A) in 3 layers + **DEPLOYED** (vercel-only).

## Current State
- master = Vercel prod = `0e80af8d` (DEPLOYED, aliased to https://lover-clinic-app.vercel.app, live). Tree clean.
- Deploy brought prod `bff0bced`→`0e80af8d` = the 4 prior-session undeployed commits + R5-R11 + happy-path.
- NO firestore.rules/storage change across the whole loop → vercel-only deploy, no Probe-Deploy-Probe.
- Full vitest 16219/0 · build clean · happy-path e2e 29/0 + behavior/RTL 122/0 + 7 round-e2e all GREEN on real prod.
- Convergence confirmed by R12 fresh hunt + 2 independent R11 hunts + my own Rule-P class-check of every `be_appointments.status` writer.

## Commits
```
0e80af8d test(appointment): happy-path regression e2e (no-regression, Rule A)
e2ca97b7 fix R11 — LINE confirm postback must not resurrect a cancelled appt
3e50e0c8 fix R10 — treatment-link customer join-validation + phantom-slot reconcile
cf63e0ba fix R9  — restore rebuilds AP1 slot guard + AP1 msg + roomId soft-scan
1e9d85b1 fix R8  — slot guard frees orphan (parent cancelled/missing) + cancelled badge
e32646cf fix R7  — doctor-clear orphan + cross-branch relocate + refund leak + reminder suppress
021974b9 fix R6  — deposit reminder never fired + non-atomic deposit cancel/delete + treatment brick + cron
d241ac69 fix R5  — un-cancel/edit reserve must not HIJACK a slot taken in the cancelled window
```

## Bugs fixed (each L2 on REAL prod, shipped fns not mocks, RED→GREEN where deterministic)
- **R5** updateBackendAppointment timeChanged/un-cancel reserve overwrote a slot another live appt took during the cancelled window → corruption + reborn double-book. Fix: `_reserveSlotsConditional` (no-hijack).
- **R6** (a) `buildAppointmentPairPayload` dropped notifyChannel → deposit-booking reminders never fired (V67). (b) cancel/deleteDepositBookingPair were getDoc→writeBatch → concurrent applyDepositToSale lost-update money (Rule T) → runTransaction in-tx usedAmount re-guard + tolerate-missing-appt. (c) deleteBackendTreatment now clears appt.linkedTreatmentId. (d) reminder cron per-appt try/catch.
- **R7** (a) clearing the doctor on a roomless appt orphaned its slots (ghost over-block) → release on ANY key-set change. (b) edit payload stamped selectedBranchId unconditionally → relocates cross-branch appt → preserve appt.branchId on edit. (c) refund touched only the deposit → phantom slot-holding appt → full-unused refund cancels the appt + releases slots. (d) reminder log date-agnostic → reschedule suppressed → sentForDate date-aware idempotency.
- **R8** AP1 reserve guard keyed only on slot.cancelled, not the parent appt status → a slot whose parent is cancelled/missing blocked forever invisibly → read parent in-tx, free orphans. + cancelled appt no longer shows green "done" badge (effectiveStatus cancelled-precedence).
- **R9** be_appointment_slots not in branch/customer-only backup scope → restore dropped the atomic ROOM guard → `computeAppointmentSlotDocs` rebuild in both restore executors. + clear room-vs-doctor AP1 message + soft room-scan keys on roomId.
- **R10** appt.linkedTreatmentId only invalidated at treatment-delete → customer-change bricked the appt + cross-attributed → render-time customer join-validation. + concurrent same-appt edits left a phantom slot (ghost over-block, not R8-healable: owner live) → reconcile slots to current keys.
- **R11** LINE confirm-postback set status='confirmed' unconditionally → customer tapping an old reminder resurrected a cancelled appt unguarded → gate to a confirmable state.

## Files Touched
Source: src/lib/backendClient.js · src/lib/appointmentDepositBatch.js · src/lib/appointmentSlotKeys.js · src/lib/lineReminderClient.js · src/components/backend/AppointmentFormModal.jsx · src/components/admin/AppointmentHubRowCard.jsx · src/components/admin/AppointmentHubView.jsx · api/cron/line-reminder-fire.js · api/cron/line-reminder-retry.js · api/webhook/line.js · api/admin/branch-restore.js · api/admin/_lib/wholeSystemRestoreExecutor.js.
Tests/e2e: 7 `tests/appt-r{5,6,7,8,9,10,11}-*.test.js` + 8 `scripts/e2e-appt-r{5..10}-*.mjs` + `scripts/e2e-appt-happy-path-regression.mjs` + V21 fixups (ap1-schema, slot-guard, phase-21-0, vicies-quinquies, v50-phase3, v73-bs1, appt-r4).

## Decisions (1-line; full reasoning → v-log-archive.md if escalated)
- Each round = real-prod L2 (admin token → client SDK → shipped fn) + RED→GREEN proof, NOT mock (Rule Q).
- Rule T: deposit cancel/delete pair made atomic with in-tx usedAmount re-guard (mirror V155).
- R8/R10 slot guards are AUTO-HEALING (read parent status / reconcile to current keys) — recover existing orphans, not just prevent new ones.
- No-regression proven by happy-path e2e (29/0) + existing RTL/behavior pass unchanged; V21 fixups only re-lock the new (better) shape.
- Deferred sub-bar residuals (C2/B2/cross-month staleness/recurring date math) documented as not-damage-vectors, not unfixed bugs.

## Next Todo
- IDLE / await direction. Loop converged + deployed + no-regression confirmed.
- Optional L1 (user, prod): create/edit/cancel a real appointment; tap LINE "ยืนยันนัด" on a reminder.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-04 EOD.
Read: CLAUDE.md → SESSION_HANDOFF.md (master=0e80af8d, prod=0e80af8d) → .agents/active.md (16219 tests) → .claude/rules/00-session-start.md → this checkpoint.
Status: master=0e80af8d = prod 0e80af8d LIVE; appointment looping bug-hunt CONVERGED (12 rounds), no-regression verified (happy-path 29/0 + 122/0 + 16219/0).
Next: idle / await direction.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules.
/session-start
