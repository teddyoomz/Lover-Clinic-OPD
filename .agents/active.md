---
updated_at: "2026-05-26 EOD+7 — Real-time intake notif on นัดหมาย cards (AV137) SHIPPED LOCAL"
status: "DEPLOYED 2026-05-26 EOD+7 — realtime-intake-notif (frontend) + push_config firestore-rule fix (AV138) BOTH LIVE on prod. master=f1a2110b. push_config Probe-Deploy-Probe GREEN (staff-write 403→200)."
branch: "master"
last_commit: "f1a2110b fix(push): add missing push_config firestore rule (AV138) — DEPLOYED, Probe-Deploy-Probe green"
tests: "full suite 14830 pass + 1 isolated-pass flake (phase15.5b global.fetch-leak, 51/0 isolated, NOT mine) · build clean · appt-realtime bank 13/0 · push-rule bank 4/0"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f1a2110b LIVE — realtime-notif (frontend, vercel) + push_config rule (firebase firestore:rules) both deployed 2026-05-26 EOD+7"
firestore_rules_version: "CHANGED + DEPLOYED 2026-05-26 EOD+7 — added match /push_config/{docId} allow isClinicStaff (AV138). Probe-Deploy-Probe GREEN: push_config staff-write 403→200, anon 403, public-read 200 (no regression)."
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

## Push fix (AV138, EOD+7 follow-up) — DEPLOYED
- /systematic-debugging on "เปิด push → Missing or insufficient permissions": root cause = `push_config/{tokens,settings}` (client reads/writes via enablePushNotifications + the new self-heal) had NO `match /push_config` block in firestore.rules (git -S confirms never existed; older broad allow dropped in per-collection refactor ~c0d0ffc) → default-deny. The earlier push diag READ via admin-SDK (bypasses rules) → masked it (V66 admin-vs-client blind spot).
- Fix: `firestore.rules` `match /push_config/{docId} { allow read, write: if isClinicStaff(); }` (covers tokens+settings; Cloud Function admin-SDK unaffected). DEPLOYED `firebase deploy --only firestore:rules`; Probe-Deploy-Probe GREEN (Rule Q L2 real client auth: staff-write 403→200, anon 403, public-read 200). AV138 (class-of-bug: every client-accessed collection MUST have a rule; push_config was the SOLE missing instance) + `tests/firestore-rules-push-config.test.js` (4/0) + `scripts/probe-push-config-rule.mjs` (Rule B probe tool). Commit f1a2110b.

## Next action
- DONE 2026-05-26 EOD+7 — deployed realtime-notif (vercel --prod) + push_config rule (firebase firestore:rules, Probe-Deploy-Probe green). prod = f1a2110b LIVE.
- USER L1 (now on prod): (a) open นัดหมาย, customer fills a card-link form → card flips real-time + blue bubble + sound (no F5); (b) RE-ENABLE push on device → should now SUCCEED (no more "Missing or insufficient permissions") → fill a form → expect mobile push.

## Outstanding user-triggered
- USER L1: re-enable push on device (rule now allows it) + confirm card/bubble. Bug → /systematic-debugging + Rule P.
- (optional) add push_config to the Rule B probe list in 01-iron-clad.md (left untouched — has your uncommitted Rule S edits; probe tool ready at scripts/probe-push-config-rule.mjs).
