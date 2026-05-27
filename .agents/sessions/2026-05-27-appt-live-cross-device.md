# 2026-05-27 EOD+11 — Appointment page LIVE cross-device + CC field row-align

## Summary
Verified (per user "เทสให้ชัวร์ว่า real time ทุก scenario, ไม่เข้าข้างตัวเอง") that the appointment-page card-list was NOT cross-device real-time for OPD/treatment + deposit/sale (only appointments were live). Shipped a listener-trigger fix (extends the proven `appointmentDataVersion` pattern) so every card-list change propagates cross-device + all-day. Caught + fixed a real V66 composite-index trap before it could break prod. Verified Rule Q L1 (real-browser pixel, 2-window cross-device demo) + L2 (real-prod onSnapshot 18/18). Also shipped a CC-field save-button row-align (cosmetic). Committed LOCAL (2 commits); NOT pushed/deployed.

## Current State
- master HEAD `0c702091` (2 commits above EOD+10 `4b8e3123`); NOT pushed. prod `8f6b7ced` unchanged (NOT deployed).
- Full suite **14958/0** (ran 2×), build clean.
- NO firestore.rules/storage/data/cron touched → frontend-only (no Probe-Deploy-Probe when deployed).
- Working tree clean except 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) — user's, untouched.

## Commits
```
0c702091 feat(appt): live cross-device card-list — treatments/deposits/sales onSnapshot triggers -> loadAll
7857a2dd fix(tfp): row-align vitals/doctor save buttons (left col flex-col + mt-auto; CC rows was a no-op under flex-1)
```

## Files Touched
- src: `backendClient.js` (+listenToTreatmentsByDateRange, +listenToAllDeposits) · `scopedDataLayer.js` (re-exports) · `admin/AppointmentHubView.jsx` (3 triggers + liveRefreshTick + resume/day-rollover) · `TreatmentFormPage.jsx` (left-col flex-col + teal mt-auto)
- tests (new): `appointment-live-cross-device.test.js` · `tfp-cc-button-row-align.test.js`
- tests (6 RTL partial-mock fixes): appt-hub-add-appointment-button · opd-pending-tab-rtl · v64/v71/v71-sub-pill/v71a appointment-hub
- scripts: `e2e-appointment-live-cross-device.mjs` (L2, kept) · `demo-live-repaint.mjs` (temp demo — DELETED after L1, Rule S)
- docs: `superpowers/{specs,plans}/2026-05-27-appointment-page-live-cross-device.*`

## Decisions (1-line each)
- Architecture = Listener-trigger (Q1=A): keep one-shot `loadAll`; add onSnapshot triggers that bump a version → loadAll. Extends `appointmentDataVersion`; minimal-risk vs full per-collection-state rewrite.
- Treatments listener = allBranches:true (Q2=A) — mirror loadAll, preserves V64-fix6 cross-branch auto-confirm; BS-13 sanctioned listener-direct.
- Sales trigger = allBranches (NOT branch-scoped) — branch-scoped sales = composite index that doesn't exist → V66 FAIL_PRECONDITION; allBranches=saleDate-only single-field (index-free). Trigger is branch-blind; loadAll branch-filters the display.
- Deposits = branch-scoped via useBranchAwareListener (where(branchId) = single-field, safe). Treatments = direct useEffect (allBranches).
- skip-first per listener (avoid mount double-load); resume guard bumps unconditionally (refresh on focus).
- CC fix: real cause is block(left)-vs-flex(right) trailing-mb-3 mismatch, not CC height; bumping `rows` is a no-op under flex-1 → bottom-pin teal via mt-auto.
- Commit local, NO push/deploy — await explicit word (V18 + EOD+9 precedent).

## Lessons
- **V66 paid off again**: "test hardest, no self-deception" surfaced a prod-breaking composite-index trap in my OWN new code; admin-SDK tests would NOT catch it (bypass indexes). Made all 3 new listeners index-free by construction.
- **Partial-mock-missing-new-export (V11-class)**: adding exports consumed by a rendered component breaks every RTL test with a full-replacement `vi.mock` of that module → must add the new exports to each mock.
- **Honest L2-vs-L1 split**: admin-SDK onSnapshot is a faithful L2 ONLY because the queries are index-free/single-field (no admin-vs-client index divergence); the browser pixel render needed real login (user) → L1 done via 2-window demo + my computer-use screenshots.
- **Fixture shape must match the consumer**: demo stepper stayed empty because `getTreatmentLifecycle` reads `t.status`/`t.vitalsignsRecordedAt` TOP-LEVEL, not under `detail` (real TFP writes top-level, TreatmentFormPage:2616) — disclosed, fixed fixture.

## Next Todo (user-triggered)
- push origin master (2 commits) + `vercel --prod` (frontend-only) — await "push"/"deploy".
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01) — user's call.
- OPD ember-band live-pixel (EOD+10 carryover) — user L1 when a patient is mid-OPD.

## Resume Prompt
See SESSION_HANDOFF.md Current State (2026-05-27 EOD+11). master `0c702091` (2 commits, NOT pushed); prod `8f6b7ced`. Appointment-page live cross-device + CC row-align COMMITTED LOCAL, verified L1 pixel + L2 18/18, full suite 14958/0. Next: push + deploy await word (V18). No commit/push/deploy without explicit word THIS turn.
