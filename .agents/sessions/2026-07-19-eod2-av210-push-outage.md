# Checkpoint 2026-07-19 EOD+2 — AV210: fleet-wide silent push outage — root-caused, fixed, DEPLOYED, live-verified

> User: "ไม่มีการส่ง push มาที่มือถือ และในมือถือก็เปิด push ไม่ได้ เช็คและแก้มาด้วย อย่าให้เป็นอีก" (+iPhone screenshot NetworkError) → /systematic-debugging → fix → "deploy".
> master `fe40702f` (fix = `a61ad87a`) = prod LIVE (vercel-only; rules UNCHANGED). Full vitest **17,788/0** + AV210 bank 23/0 + build clean.

## Summary
Push had been silently dead fleet-wide 07-07→07-19. WS4's CSP (06-10) omitted gstatic from script-src — latent
because installed SWs never re-evaluate — until AV207's scope-move (07-07) forced fresh registrations: FCM SW
evaluation failed on every device ("NetworkError" on iOS = WebKit's importScripts-failure string; airplane mode
was a red herring). Old subscriptions stranded on the handler-less app-shell sw.js swallowed every send as FCM
"success" → the not-registered prune never fired → zero errors anywhere. Fixed, deployed, verified live.

## Current State
- **Root cause proven with live evidence**: user's real Chrome console showed `[push self-heal] failed: …
  ServiceWorker script evaluation failed`; prod headers showed script-src without gstatic; SW file unchanged
  since initial commit 03-23 (innocent); diag showed 8 tokens / newest 05-26 = zero mints post-07-07.
- **Fix `a61ad87a`**: vercel.json dedicated `/firebase-messaging-sw.js` headers rule AFTER global (later-wins)
  — `script-src 'self' https://www.gstatic.com` + no-cache; page CSP deliberately UNCHANGED (gstatic hosts
  CSP-bypass gadgets). + `cleanupLegacyRootPushSubscription()` at BOTH mint sites (enable + self-heal;
  self-heal dedup no longer early-returns past it). + AV210 invariant (both SKILL copies, byte-identical SY1).
- **Post-deploy verified live**: curl = 1 CSP on SW path with gstatic / page CSP unchanged / ping 200 · real
  Chrome: FCM-scope SW active + new subscription + fresh desktop token minted by the real self-heal ·
  **iPhone self-healed UNPROMPTED** (fresh token 18:33 BKK — the NetworkError device) · Rule M prune --apply
  removed all 8 zombies (audit `push-legacy-token-prune-1784460993106-dde1ac91`) → fresh 2 / zombie 0 ·
  test push sent **2/2 FCM success**.
- **Honest gaps**: iPhone visible popup = user-confirm pending. Dev-PC desktop toasts are OS-muted (proven:
  page-level `new Notification` also invisible — Windows notification settings for Chrome, NOT app code).
  Desktop zombie root-subscription clears on next shell update (its token already pruned server-side → inert).
- Full suite caught ONE real fail: my own SY1 byte-diff from a hand-rolled sync script → fixed by verbatim copy.

## Commits
```
a61ad87a fix(push/AV210): CSP killed FCM SW evaluation — per-path script-src allowlist + zombie cleanup
fe40702f docs(state): AV210 push fix DEPLOYED + live-verified
```

## Files Touched
vercel.json · src/pages/AdminDashboard.jsx · scripts/{prune-legacy-push-tokens,diag-push-test-send}.mjs NEW ·
tests/av210-push-csp-sw-consistency.test.js NEW · audit-anti-vibe-code SKILL.md ×2 (AV210) ·
.claude/rules/{00-session-start.md,v-log-archive.md} (V-entry) · .agents/active.md

## Decisions (1-line each)
- Per-path CSP over global gstatic (page script-src + gstatic = known CSP-bypass gadget vector; WS4 intent kept).
- Restore proven compat-SW architecture over rewriting a self-contained SW (delivery-path risk zero vs payload-shape risk).
- Zombie cleanup client-side at mint time (fleet self-healing) + Rule M prune as the belt for devices that never return.
- Cutoff 2026-07-19T08:00Z classifies pre-fix tokens; prune ran only AFTER deploy so devices could re-mint first.
- "FCM success ≠ displayed" encoded in the test-send diag output (Rule Q L1 reminder).
- Full lessons → v-log-archive.md "Push outage (AV210)".

## Next Todo
1. **User L1**: confirm test-push popup on iPhone ("🔔 ทดสอบแจ้งเตือน LoverClinic"); if absent → iPhone
   Settings > Notifications > LoverClinic, then re-run `node scripts/diag-push-test-send.mjs --send`.
2. Retention cron first night: `node scripts/diag-cron-first-night.mjs` (logic pre-verified: 159 scanned / 0 eligible).
3. Desktop toasts (optional): enable Windows notifications for Chrome on clinic PCs.
4. Standing user L1 stack (wheel guard / VIP sort / AV209 course ops / buy modal / TFP retry / mobile).

## Resume Prompt
Resume LoverClinic — 2026-07-19 EOD+2. AV210 push outage fixed + deployed (`a61ad87a`, prod = `fe40702f`).
Push subsystem restored: both devices re-minted, zombies pruned, test push 2/2. Full vitest 17,788/0.
Next: user confirms iPhone popup + retention-cron first-night check.
Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint.
