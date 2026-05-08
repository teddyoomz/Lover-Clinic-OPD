---
updated_at: "2026-05-09 EOD #21 — V64-fix8 patient name link DEPLOYED to prod"
status: "master=dcb6c41 · prod=dcb6c41 · 0 ahead of prod · 8187 passed · build clean · DEPLOYED"
branch: "master"
last_commit: "feat(V64-fix8): patient name → clickable link to customer detail (new tab)"
tests: 8187
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "dcb6c41"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `dcb6c41` · prod = `dcb6c41` (0 ahead — combined deploy 2026-05-09 #21; vercel 50s + firebase idempotent)
- Invariant set unchanged: AV1-AV30 + AV32-AV36 + BS-1..BS-16 + CB-1..5
- V64-fix8 brings AppointmentHubRowCard name surface into Phase 15.7-septies pattern — 4th adopter of `customerNavigation.js` helpers (after AdminDashboard kiosk + AppointmentFormModal + DepositPanel + MembershipPanel)

## What this session shipped
- **V64-fix8 — patient name → link to customer detail (new tab)** (`dcb6c41`) — V64 AppointmentHubRowCard patient name now `<a target="_blank">` with `href=buildCustomerDetailUrl(customerId)`; reuses Phase 15.7-septies canonical helper (Rule of 3, no new logic). Conditional render: customerId truthy → `<a>` with hover underline + sky-500 + data-customer-id; falsy → fallback `<div>` (no `<a href="#">` dead links). +7 RTL tests (V64.R8.1-R8.7) in `tests/v64-appointment-hub-rtl.test.jsx`. 47/47 V64 RTL+flow-simulate GREEN; full suite 8187 passed; build clean. Combined deploy: vercel --prod (50s exit 0; alias https://lover-clinic-app.vercel.app) + firebase --only firestore:rules (idempotent — rules unchanged from `1da05bb`). Probe-Deploy-Probe: probe 1 + probe 5 GREEN both pre+post (probes 2/3/4 = expected V50-followup-2 false-positives, ignored manually per Session #20 EOD precedent). Cleanup: 31 probe artifacts nuked. Detail at `.agents/sessions/2026-05-09-v64-fix8-patient-name-link.md`.

## Next action
Idle — V64-fix8 deployed; production stable.

## Outstanding user-triggered actions
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 still test V50-stripped collections — false-positive 403 each deploy; ignored manually per Session #20 + #21 precedent. User may trim if desired.
- (Optional, unchanged) `bsa-task7-h-quater-fix` flake — passes standalone, flakes in full-suite parallel runs (TFP line 666 comment + Windows shell-spawn timing).

## Institutional memory anchors (still valid)
- Phase 15.7-septies — `buildCustomerDetailUrl(id)` + `openCustomerInNewTab(id)` are the canonical "navigate to customer detail" helpers. New UI surfaces wanting this UX MUST reuse, NOT reinvent. V64-fix8 confirmed Rule of 3 lock at 4 callsites.
- V63 + V62-bis / AV35 — AdminDashboard calendars MUST drive 🔥 from canonical `be_staff_schedules` via `canonicalDoctorDays`.
- V62 / AV34 — schedule-link `doctorDays` + `customDoctorHours` MUST derive from canonical for ALL link modes.
- V61 / AV33 — schedule-link modal room dropdown MUST derive from canonical schedules.
- V60 / AV32 — schedule-link `doctorDays` derive-and-merge canonical pattern.
- V54 / BS-13 — raw listener safe-by-default (architectural backstop).
- V53 / BS-12 — time-axis branch-aware (TIME_SLOTS readers via `getVisibleTimeSlotsForDate`).
- V52 / BS-11 — report-tab branch-refresh.
