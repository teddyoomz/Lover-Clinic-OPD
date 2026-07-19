---
updated_at: "2026-07-19 EOD+2 — AV210 push outage fixed + DEPLOYED + verified live (fresh tokens minted, zombies pruned)."
status: "master `a61ad87a` = prod LIVE (vercel-only; rules UNCHANGED). Push subsystem RESTORED: SW-path CSP fixed → self-heal works again — desktop + iPhone each minted a fresh token within minutes of deploy; 8 zombies pruned (audit push-legacy-token-prune-*); test push sent 2/2 success. Awaiting user confirm iPhone popup."
branch: "master"
last_commit: "a61ad87a — fix(push/AV210) + docs commit after"
tests: "AV210 bank 23/0 + full vitest 17,788/0 (after SY1 sync fix) + build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a61ad87a (deployed 2026-07-19 EOD+2)"
firestore_rules_version: "UNCHANGED → deploy was vercel-only"
---

# Active — 2026-07-19 EOD+2 — AV210 push outage: FIXED + DEPLOYED + LIVE-VERIFIED

## What happened
- Push dead fleet-wide + silent 07-07→07-19: WS4 CSP (06-10) lacked gstatic in script-src (latent — installed SWs don't re-evaluate) → AV207 scope-move (07-07) forced fresh registrations → FCM SW evaluation failed everywhere ("NetworkError" on iPhone = WebKit's phrasing). Old subscriptions stranded on handler-less sw.js swallowed every send as "success" → prune never fired, zero errors anywhere.
- Fix `a61ad87a`: per-path CSP for /firebase-messaging-sw.js (page CSP untouched — gstatic gadget risk) + cleanupLegacyRootPushSubscription() both mint sites + AV210 invariant bank + Rule M prune + test-send diag. V-entry + v-log archive entry landed.

## Post-deploy verification (done)
- curl: SW path = 1 CSP with gstatic ✓ no-cache ✓ · page CSP unchanged ✓ · ping 200.
- Real Chrome: FCM-scope SW active + NEW subscription; fresh desktop token minted by real self-heal ✓.
- **iPhone self-healed unprompted** (fresh token 18:33 BKK) — the enable-fail device now has a working token.
- Prune --apply: 8 zombies removed, audit doc emitted; final state fresh 2 / zombie 0.
- Test push sent 2/2 FCM success. Desktop display = OS-muted on the dev PC (page-level Notification also invisible — Windows notification settings, NOT app code). iPhone popup = awaiting user confirm.

## Next action
- **User L1**: confirm test-push popup appeared on iPhone ("🔔 ทดสอบแจ้งเตือน LoverClinic"). If yes → push subsystem fully closed. If no → check iPhone Settings > Notifications > LoverClinic PWA allowed; resend via `node scripts/diag-push-test-send.mjs --send`.
- Desktop toasts (optional): enable Windows notifications for Chrome / disable Focus Assist on the clinic PC.
- Retention cron first-night check tomorrow (`node scripts/diag-cron-first-night.mjs`) — logic pre-verified (159 scanned / 0 eligible).
- Rest of user L1 stack unchanged (wheel guard / VIP sort / AV209 course ops / buy modal / TFP retry / mobile).

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
