# 2026-05-27 EOD+9 — Deposit-without-appointment + Finance deposit modernize (LOCAL)

## Summary
brainstorm → spec.html → plan.html → execution (subagent-driven attempted, switched to INLINE per user + a 1M-context credits error). Added a `ไม่นัดหมาย` (deposit-only) mode to `AppointmentFormModal` + modernized the Finance `DepositPanel` create form (`เลือกลูกค้าภายหลัง` + `มัดจำสำหรับ`), preserving all money fields. 9 tasks, 10 commits on **master (LOCAL — not pushed/deployed per V18)**.

## Current State
- master tip = `ff9a775d` (+ EOD docs commit) — **10+ commits ahead of origin/master `9209ec70`, NOT pushed**.
- prod UNCHANGED = `0805da87` (V122) — feature **NOT deployed**.
- Full suite **14929/0** · build clean · **Rule Q L2 real-prod e2e 21/0** (`scripts/e2e-deposit-no-appointment.mjs --apply` — TEST- fixtures + cleanup + audit doc).
- NO firestore.rules/storage/data/cron touched → frontend+serverless only (no Probe-Deploy-Probe when deployed).
- L1 (real-browser UI) = USER. Repo never RTL-mounts these heavy modals (Firebase/Branch deps) → behavior covered by source-grep + L2 e2e + L1; only VisitPurposePicker is genuinely RTL-tested (Rule Q V66 — no mocks-that-lie).

## Commits
```
ff9a775d test(deposit): Rule Q L2 real-prod e2e no-appointment round-trip
0ad839bb test: V21 fixups for V-deposit-noappt shape changes
4d6d04ab test(deposit): VisitPurposePicker label prop RTL (real render)
d8f9540d test(deposit): Rule I flow-simulate + source-grep
a5d30f09 feat(finance): DepositPanel เลือกลูกค้าภายหลัง + มัดจำสำหรับ + table fallback
e33df0e1 feat(appt): ไม่นัดหมาย save writes deposit-only via createDeposit
e5d8dabf feat(appt): ไม่นัดหมาย toggle hides appt fields + skips validations
f9df247e feat(deposit): createDeposit stamps purpose/temp + guards recalc
216ece36 feat(deposit): validator learns purpose + temp-customer identity
85c5d579 feat(deposit): VisitPurposePicker gains backward-compat label prop
```

## Files Touched
- src: `VisitPurposePicker.jsx` · `lib/depositValidation.js` · `lib/backendClient.js` (createDeposit) · `components/backend/AppointmentFormModal.jsx` · `components/backend/DepositPanel.jsx`
- tests (new): `deposit-validation-purpose` · `create-deposit-purpose` · `deposit-no-appointment-flow-simulate` · `deposit-no-appointment-rtl`
- tests (V21 fixups): `appointment-modal-purpose-rtl` · `finance-subtab-wiring-flow-simulate` · `phase-21-0-quinquies-visual-polish` · `phase-24-0-undecies-visit-purpose-other`
- scripts (new): `e2e-deposit-no-appointment.mjs`
- docs: `docs/superpowers/{specs,plans}/2026-05-27-deposit-no-appointment-and-finance-modernize*.html`

## Decisions (1-line)
- Q1 = Modernize-in-place (keep DepositPanel; appt modal gains only the toggle) · Q2 = Port-all (no money field dropped).
- Advisor → 100% seller (existing pair-path pattern :930) → NO new advisorId field; be_deposits +3 fields only.
- มัดจำสำหรับ = reuse นัดมาเพื่อ VisitPurposePicker via new backward-compat `label` prop (default 'นัดมาเพื่อ').
- Gating = conditional-render (`{!formData.noAppointment && (...)}`, matches existing modal style "อิงของเก่า"), NOT CSS-hide.
- createDeposit guards `recalcCustomerDepositBalance` on empty customerId (pickLater/temp-customer deposits).
- 7 V21 source-grep fixups (picker-JSX window, createDeposit slice len, table-cell optional-chain + dep.purpose + cell-block windows 800→1100).
- Branch `feat/deposit-no-appointment` created then FF-merged to master per user "merge branch to master"; continued on master.
- Honest Rule Q scope: L2 (real-prod data contract) verified; L1 (real-browser UI hide/show + Finance display) = user.

## Next Todo (user-triggered)
- push master (10+ commits, local) + deploy (frontend+serverless, NO Probe-Deploy-Probe) — await explicit word (V18).
- L1 hands-on (acceptance scenarios in active.md).
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) uncommitted (user's).

## Resume Prompt
See SESSION_HANDOFF.md Current State (2026-05-27 EOD+9). master tip `ff9a775d` (+EOD docs, LOCAL not pushed); prod `0805da87` (V122). Feature deposit-no-appointment + Finance modernize DONE + tested (14929/0, L2 e2e 21/0); L1 + push + deploy pending. No commit/deploy without explicit word THIS turn (V18).
