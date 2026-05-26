---
updated_at: "2026-05-26 EOD+7 — Real-time intake notif on นัดหมาย cards (AV137) SHIPPED LOCAL"
status: "LOCAL — committed + pushed; NOT deployed (awaits explicit 'deploy', V18). prod = 459a4ea3→ec8fcce6 (appointment-card redesign DEPLOYED earlier this session); this fix NOT yet deployed."
branch: "master"
last_commit: "60d77694 test(appt-realtime): Rule I flow-simulate + source-grep + AV137 (fix 3d5acdee)"
tests: "full suite 14830 pass + 1 isolated-pass flake (phase15.5b global.fetch-leak, 51/0 isolated, NOT mine) · build clean · new bank 13/0"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ec8fcce6 LIVE (appointment-card redesign) — realtime-intake-notif fix NOT yet deployed"
firestore_rules_version: "UNCHANGED — frontend-only (no rules/index/data) → no Probe-Deploy-Probe"
---

# Active Context

## State
- /systematic-debugging fix: patient-form submissions sent off a นัดหมาย card (card-flow: createdFromBackendBooking + isHiddenFromQueue) stopped surfacing real-time + bubble/sound/push after EOD+2 queue-tab removal + V120 hideFromQueue.
- Root cause (3 mechanisms, verified): ① hub re-fetch ผูก be_appointments only + resolveLinkedSession card-flow → stale one-shot getDoc cache; ② card-flow excluded from data/ndData → not in allNotifData → detector blind; ③ push = HTTP fn (PatientForm calls it; NOT tab-removal) — Rule R diag: 7 tokens, not muted, all ~2 months stale.
- Fix (all AdminDashboard.jsx, no new screen, additive): ① live `allLinkedSessions` (listener allDocs, READ-ONLY setState) → sessionsById memo → resolveLinkedSession fresh → card flips real-time (AppointmentHubView not memo'd + resolves per-card at render:600 → confirmed re-renders; mirrors proven lazyFetchedTick); ② `cardFlowNotif` merged into allNotifData → blue bubble + sound (reuse isNotifEnabled + dedup + first-load stamp); ③ app-load useEffect re-registers FCM token when lc_push_enabled + permission granted. Listener stays read-only (V34/V36); queue filters / V124 count / V125 cascade untouched.

## What this session shipped (this fix)
- spec `0c95a6f1` + plan `303f4abc` (HTML, mockup+flow). source `3d5acdee` · tests+AV137 `60d77694`. NEW `tests/realtime-intake-notif-appointment-cards.test.js` (13/0) + AV137 + `scripts/diag-push-config.mjs` (Rule R).
- (Earlier this session: appointment-card 5-band redesign DEPLOYED to prod = ec8fcce6.)

## Verification (Rule Q-honest)
- VERIFIED: logic (flow-simulate F1/F2 real mirrors) + reactivity (code-inspection: AppointmentHubView not memo'd + per-render resolve line 600) + source-grep locks + build clean + full suite 14830 pass (1 isolated-pass flake, not mine).
- NOT done by me (honest gap → USER L1 post-deploy): real-browser end-to-end (live form-fill → card flips on screen no-refresh + bubble audible) + push delivery. Reasons: not deployed (prod=old code) + auth-gated dashboard + workstyle "ไม่ self-test UI".

## Next action
- USER: "deploy" → `vercel --prod` (frontend-only; no rules/index → no Probe-Deploy-Probe).
- USER L1 post-deploy: open นัดหมาย, customer fills a card-link form → card flips real-time + blue bubble + sound (no F5). Re-enable push on device → fill → expect mobile push.

## Outstanding user-triggered
- Deploy this fix. Re-enable push on device (heals stale tokens). Bug → /systematic-debugging + Rule P.
