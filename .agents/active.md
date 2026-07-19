---
updated_at: "2026-07-19 EOD+2 — AV210 push outage root-caused + fixed (CSP killed FCM SW) — LOCAL, awaiting deploy."
status: "master = prod `2610a1a6` + AV210 fix commits LOCAL (not deployed). Push has been silently dead fleet-wide 07-07→07-19; fix ready; deploy = vercel-only (rules UNCHANGED)."
branch: "master"
last_commit: "(AV210 fix — see git log)"
tests: "AV210 bank 23/0 + adjacent 112/0 + build clean + full vitest re-run this session (see SESSION_HANDOFF). Prior baseline 17,777/0."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2610a1a6 (pre-AV210 — push STILL BROKEN on prod until next deploy)"
firestore_rules_version: "UNCHANGED → deploy = vercel-only"
---

# Active — 2026-07-19 EOD+2 — AV210: fleet-wide silent push outage FIXED (local)

## State
- **User reported**: no push on mobile + iPhone can't enable push (`NetworkError`). `/systematic-debugging` found the full chain:
  WS4 CSP (06-10, `script-src` without gstatic) + AV207 scope-move (07-07, forced fresh SW evaluation) →
  FCM SW `importScripts(gstatic)` blocked → registration dead fleet-wide → zero tokens minted since 05-26;
  old subscriptions stranded on handler-less app-shell sw.js → FCM sends "succeed" but display NOTHING → prune never fires. 12 days silent.
- **Fix (local)**: vercel.json dedicated `/firebase-messaging-sw.js` CSP rule (script-src +gstatic; page CSP UNCHANGED — gadget risk) + `cleanupLegacyRootPushSubscription()` at both mint sites + Rule M prune script + test-send verifier + AV210 (both SKILL copies) + V-entry.

## Next action (ordered)
1. **User types "deploy"** → vercel-only (rules unchanged).
2. Post-deploy gate: `curl -I .../firebase-messaging-sw.js` (CSP has gstatic; page CSP unchanged) → reload app in Chrome → self-heal mints token → `node scripts/diag-push-test-send.mjs --send` → **noti must VISIBLY pop** (Rule Q L1) → `node scripts/prune-legacy-push-tokens.mjs --apply` (kills 8 zombies).
3. iPhone: user re-enables push in the PWA (airplane mode OFF first attempt) → test-send to phone.
4. Retention cron first-night audit doc check tomorrow (`node scripts/diag-cron-first-night.mjs`) — logic already dry-run-verified (159 scanned / 0 eligible).

## Outstanding user-triggered
- "deploy" for the AV210 push fix (prod push stays DEAD until deployed).
- User L1 stack (wheel guard เครื่องจริง / VIP sort / AV209 course ops / buy modal / TFP retry / mobile / push-after-fix).

## ⚠️ Landmine เดิม — `scripts/trim-session-handoff.mjs` BUGGY (ห้ามรัน; trim มือเท่านั้น)
