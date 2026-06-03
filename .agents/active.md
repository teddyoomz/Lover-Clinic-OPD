---
updated_at: "2026-06-04 EOD — Appointment-system looping bug-hunt CONVERGED (12 rounds) + DEPLOYED. No-regression verified 3 layers."
status: "Appointment Core hardened R5-R11 (~12 real bugs fixed, all L2 on real prod) → fresh hunt finds nothing → converged. DEPLOYED to Vercel prod. Full vitest 16219/0."
branch: "master"
last_commit: "0e80af8d (test: happy-path regression e2e). Loop: d241ac69 R5 · 021974b9 R6 · e32646cf R7 · 1e9d85b1 R8 · cf63e0ba R9 · 3e50e0c8 R10 · e2ca97b7 R11."
tests: "Full vitest 16219/0 (ran this session, exit 0). Happy-path e2e 29/0 + behavior/RTL 122/0 + 7 round e2e all on REAL prod. Build clean. NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "Vercel prod = 0e80af8d (DEPLOYED this session — brought prod bff0bde6 → 0e80af8d: the 4 prior undeployed commits + R5-R11 + happy-path). Aliased + live."
firestore_rules_version: "UNCHANGED. No firestore.rules/storage.rules change across R5-R11 → no Probe-Deploy-Probe."
---

# Active — 2026-06-04 EOD — Appointment looping bug-hunt converged + deployed

## State
- master `0e80af8d` = Vercel prod `0e80af8d` (DEPLOYED, aliased, live). Working tree clean.
- 12-round adversarial loop CONVERGED: final fresh hunt (R12) + 2 independent R11 hunts + Rule-P class-check all confirm the appointment Core is bulletproof at the money/double-book/double-charge/corruption bar.
- No firestore.rules change → vercel-only deploy, no Probe-Deploy-Probe.

## What this session shipped (detail → checkpoint 2026-06-04-appointment-loop-converged.md)
- **~12 real purpose-breaking bugs fixed (R5-R11), each L2-verified on REAL prod + RED→GREEN**: R5 un-cancel/edit slot HIJACK · R6 deposit-booking reminder never fired + non-atomic deposit cancel/delete (Rule T money) + treatment-delete brick + cron isolation · R7 doctor-clear orphan + edit cross-branch relocate + refund→slot-leak + reschedule reminder-suppress · R8 orphan-slot over-block (parent-status guard) + cancelled badge · R9 restore-rebuild slot guard + AP1 message + roomName→roomId · R10 treatment-link customer join-validation + concurrent-edit phantom-slot reconcile · R11 LINE-confirm resurrects cancelled appt.
- **No-regression proof (Rule A)**: happy-path e2e 29/0 (prod) + existing behavior/RTL/flow-simulate 122/0 + full vitest 16219/0. Every normal flow (create/edit/cancel/un-cancel/delete/deposit-lifecycle/reminder) unchanged; guards catch only bug scenarios.
- Artifacts: 8 new `scripts/e2e-appt-r{5..10}-*.mjs` + happy-path e2e + 7 new `tests/appt-r{5..11}-*.test.js` + AVxx invariants + V21 fixups.

## Next action
- IDLE / await direction. Loop converged + deployed + no-regression confirmed.

## Outstanding user-triggered actions
- **Deferred (sub-bar, documented, NOT bugs)**: C2 note-edit stale-status resurrection (needs 2nd race; soft-scan backstop), B2 restore-dangling link for out-of-window deleted treatment (rare partial-backup), hub future-tab cross-month real-time staleness (self-reconciles), recurring-multiplier date math (correct for TH admins). Pick up only if asked.
- L1 hands-on on prod (user's, optional): create/edit/cancel a real appointment; tap LINE "ยืนยันนัด".
