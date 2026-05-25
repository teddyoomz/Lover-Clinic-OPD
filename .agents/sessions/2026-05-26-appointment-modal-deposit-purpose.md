# Checkpoint — 2026-05-26 — Appointment-modal deposit-section + chip "นัดมาเพื่อ" unification

## Summary

Full cycle (`/session-start` → `brainstorming` w/ Visual Companion → spec → `writing-plans` → `executing-plans`, 11 tasks inline). Two asks: (1) every appointment-create modal auto-shows the deposit ("รายละเอียดมัดจำ") section when "จองมัดจำ" is selected — not just when locked; (2) "นัดมาเพื่อ" becomes a chip multi-select like the Frontend สร้างคิว. Both land on the ONE shared `AppointmentFormModal` (4 callers). SHIPPED LOCAL, full suite + real-prod e2e green, NOT deployed (await "deploy").

## Current State

- master = `def9e256`; prod UNCHANGED `65ab6467` (feature awaits explicit "deploy", V18).
- Full vitest **14658/0** · build clean ✓ 3.25s · real-prod e2e **21/0** (`scripts/e2e-appointment-deposit-purpose.mjs`).
- NO firestore.rules change (be_deposits/be_appointments already clinic-staff write; no new compound index → no Probe-Deploy-Probe).
- Verification honest scope (Rule Q-honest): L2 = admin-SDK doc-level e2e on real prod (acceptable — no new index/rules; doc shapes mirror REAL builders, E5 verifies them) + full vitest + flow-simulate + RTL. **L1 real-browser = USER post-deploy.**
- 1 V21 fixup: phase-21-0 F1.6+F1.8 locked the old locked-only gate → updated to effective-type.

## Architecture

- **Deposit gate** broadened: NEW `effectiveAppointmentType = safeLockedType || formData.appointmentType` → `isDepositBooking` → `showDepositSection` (create+edit). Replaces locked-only `isLockedDepositType && mode==='create'` at render gate + `isCreatingDepositBooking` (create save still create-only for the pair-write).
- **Create**: `createDepositBookingPair` (existing, atomic pair, required ยอด>0). **Edit** (4 cases): (1) existing link → `getDeposit` hydrate + `updateDeposit`; (2) flip-to + (4) legacy no-link → NEW `createDepositForExistingAppointment` (reverse of `createAppointmentForExistingDeposit`, reuses `buildDepositPairPayload`); (3) flip-away (was-deposit→non-deposit w/ link) → pre-`setSaving` confirm-dialog gate (`flipAwayDecisionRef`) → ลบ via `cancelDepositBookingPair` cascade (usedAmount>0 → error) / เก็บ = appt-only.
- **Chip**: NEW `VisitPurposePicker` (chips + อื่นๆ free-text) ↔ `appointmentTo` string via `build/parseVisitPurposeText`. `visitReasonOptions` → `src/lib/visitReasonOptions.js` single source (PatientForm + AdminDashboard×2 + picker import it).

## Commits

```
def9e256 docs(agents): appointment-modal deposit + chip unification SHIPPED (local)
3a5ae897 test: V21 fixup phase-21-0 — deposit gate now effective-type
03ec1394 test: Rule Q L2 real-prod e2e — deposit pair/update/flip-to/flip-away (21/0)
8ddb7250 test: Rule I flow-simulate (25/0)
c1056611 test(audit): AV130
b19fc265 feat: flip-away confirm (delete cascade / keep) + usedAmount guard
(+ E6 edit reconcile, E5 helper, E4 gate, E3 wire, E2 picker, E1 constant, spec, plan)
```

## Files Touched

- NEW: `src/lib/visitReasonOptions.js` · `src/components/VisitPurposePicker.jsx` · `scripts/e2e-appointment-deposit-purpose.mjs` · spec + plan + mockup HTML
- MOD: `src/components/backend/AppointmentFormModal.jsx` (gate + picker + edit hydrate/reconcile + flip-away dialog) · `src/lib/appointmentDepositBatch.js` (createDepositForExistingAppointment) · `src/pages/PatientForm.jsx` · `src/pages/AdminDashboard.jsx` (×2 chip sites) · `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV130)
- TESTS: visit-reason-options · visit-purpose-picker-rtl · appointment-modal-{purpose-rtl,deposit-gate,edit-deposit,flip-away} · av130 · appointment-deposit-purpose-flow-simulate · phase-21-0 (V21 fixup)

## Decisions (1-line each)

- Q1=A: auto deposit + required + atomic pair (matches tab จองมัดจำ).
- Q2=A: chip required multi-select + อื่นๆ; store appointmentTo string (backward-compat).
- Scope = create + edit (both modes show the section).
- Option list = single source `visitReasonOptions.js`, used in 3 sites (Rule C1).
- Flip-away = choice-at-confirm (ลบ via cancel-cascade / เก็บ); modal never deletes a money record silently.
- Edit deposit getter/updater imported from scopedDataLayer (BS-1 compliant; both universal pass-through).
- e2e = admin-SDK doc-level (mirror v98 pattern) — acceptable L2 (no new index/rules); real builders verified separately by E5 unit.

## Next Todo

- Await explicit "deploy" → `vercel --prod` (frontend only).
- Post-deploy Rule Q L1 (user): pick จองมัดจำ → section+required → save → การเงิน→มัดจำ; edit amount → update; flip-away → dialog; chips required.
- L1-check edge: Walk-in OPD-save now requires a "นัดมาเพื่อ" chip — confirm acceptable (else gate required to booking flows only).

## Resume Prompt

Resume LoverClinic — continue from 2026-05-26 EOD.

Read: CLAUDE.md → SESSION_HANDOFF.md (master=def9e256, prod=65ab6467 LIVE) → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.

Status: master=`def9e256`, full suite 14658/0, prod=`65ab6467` LIVE. Appointment-modal deposit-section + chip นัดมาเพื่อ unification SHIPPED LOCAL, NOT deployed.
Next: await "deploy" (vercel --prod, frontend only, no rules) → then user L1.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q + Q-honest (real-adversarial; disclose gap).
/session-start
