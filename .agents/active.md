---
updated_at: "2026-05-26 — Appointment-modal deposit-section + chip นัดมาเพื่อ unification SHIPPED (LOCAL, not deployed)"
status: "master 3a5ae897 — feature complete + full suite GREEN + real-prod e2e PASS. NOT deployed (awaiting explicit 'deploy'). prod still 65ab6467."
branch: "master"
last_commit: "3a5ae897 test(appointment): V21 fixup phase-21-0 — deposit gate now effective-type"
tests: "full suite 14658/0 · real-prod e2e 21/0 · build clean ✓ 3.25s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE (treatment-blob Storage-ref) — appointment-modal feature NOT yet deployed"
firestore_rules_version: "unchanged (NO rules change — be_deposits/be_appointments already clinic-staff write; no new compound index)"
---

# Active Context

## State
- **Appointment-modal unification SHIPPED LOCAL** (brainstorm → spec → plan → executing-plans, 11 tasks E1–E11, all committed + pushed). NOT deployed.
- **① Auto deposit section**: `AppointmentFormModal` deposit section now gates on EFFECTIVE type (`showDepositSection = (safeLockedType||formData.appointmentType)==='deposit-booking'`), not `isLockedDepositType` alone → picking "จองมัดจำ" via radio shows it (create + edit). Create → `createDepositBookingPair` (atomic pair, required ยอด>0). Edit → hydrate from linked deposit (`getDeposit`) + `updateDeposit` / flip-to `createDepositForExistingAppointment` (NEW helper) / flip-away → confirm dialog (ลบ via `cancelDepositBookingPair` cascade / เก็บ) + usedAmount-guard error.
- **② Chip "นัดมาเพื่อ"**: NEW `VisitPurposePicker` (multi-select chips + อื่นๆ free-text) replaces the free-text textarea; required ≥1; stores the existing `appointmentTo` string (backward-compat via `build/parseVisitPurposeText`). `visitReasonOptions` extracted to `src/lib/visitReasonOptions.js` single source (PatientForm + AdminDashboard×2 + picker all import it — Rule C1).
- **AV130** invariant (gate=effective-type / single-source options / deposit-mutation-only-via-sanctioned-helpers).

## Verification (Rule Q + Q-honest)
- Full vitest **14658/0** · build clean ✓ · **real-prod e2e `scripts/e2e-appointment-deposit-purpose.mjs` 21/0** (create-pair cross-link + updateDeposit recalc + flip-to-create link + cancel-cascade + usedAmount-guard; TEST- fixtures, zero orphans, audit doc).
- **Honest scope**: e2e is admin-SDK doc-level L2 (no new compound-index/rules → acceptable); doc shapes mirror the REAL builders (E5 verifies them). Helper writeBatch mechanics + UI gate covered by unit + flow-simulate + RTL. **L1 (real browser) = USER post-deploy.**

## Next action
- **Await explicit "deploy"** (V18) → `vercel --prod` (frontend only — NO rules change, NO Probe-Deploy-Probe needed).
- Post-deploy **Rule Q L1 by user**: open a regular appointment-create modal → pick "จองมัดจำ" → deposit section appears + required → save → verify deposit in การเงิน → มัดจำ; edit → change amount → verify update; flip away → confirm dialog (ลบ/เก็บ); "นัดมาเพื่อ" chips required.
- **Known edge to L1-check**: Walk-in OPD-save (AdminDashboard) opens the modal locked no-deposit → no deposit section (correct); but "นัดมาเพื่อ" is now required there too — confirm that flow pre-fills or that requiring a chip is acceptable.

## Outstanding user-triggered actions
- Deploy the appointment-modal feature (master 3a5ae897 → prod) when ready.
- (carryover) นัดหมาย-tab unification brainstorm · cron monitoring (passive) · L1 verify V124-126.

## Detail
- Spec: `docs/superpowers/specs/2026-05-25-appointment-modal-deposit-purpose-unification-design.html` (+ mockup `...-unification-mockup.html`)
- Plan: `docs/superpowers/plans/2026-05-25-appointment-modal-deposit-purpose-unification.html`
