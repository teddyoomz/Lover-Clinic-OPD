---
updated_at: "2026-07-23 — AV215: Firestore ca9/b815 INTERNAL ASSERTION → AV214 wedge ladder + lazy-chunk de-noise (SHIPPED local, NOT deployed)"
status: "master 2e343c89 = prod LIVE (unchanged). AV215 fix landed LOCAL (6 files), Rule Q L1-verified in a real browser. full vitest 18,206 pass / 2 pre-existing non-AV215 reds (sticker flake — passes isolated · v50 F1.12 active.md-marker from the 07-21 session-end rewrite → this file restores the marker). NOT deployed (V18)."
branch: master
last_commit: "2e343c89 (AV215 UNCOMMITTED — awaiting user commit / deploy)"
tests: "full 18,206 pass · firestore-assertion-recovery 21/0 · siblings 229/0 · build clean. 2 pre-existing reds (1 flake, 1 stale-marker) — 0 NEW from AV215."
production_url: https://lover-clinic-app.vercel.app
production_commit: "2e343c89 — deployed 2026-07-21 (AV215 NOT yet deployed)"
firestore_rules_version: "2026-07-20 NIGHT — UNCHANGED (AV215 is frontend-only → deploy = vercel-only, no Probe-Deploy-Probe)"
---

# Active — 2026-07-23

## State
- master `2e343c89` = prod LIVE (unchanged) · **AV215 fix = LOCAL, uncommitted, NOT deployed**
- Trigger: infra-health LINE alert 07-23 07:30 🟡 (7 client errors) → `/systematic-debugging`

## AV215 — Firestore ca9/b815 INTERNAL ASSERTION → AV214 wedge ladder + lazy-chunk de-noise
- **Root** (confirmed firebase-js-sdk#9267, OPEN, upstream): `disableNetwork/enableNetwork` churn (our `firestoreReconnect`) + `persistentMultipleTabManager` — both documented triggers. The 7 errors = 4 lazy-chunk churn (benign, self-heal) + 3 fs-stream (2 assertion + 1 `missing stream token`); already recovered (`errorCount24h:0`).
- **Fix (6 files)**: `isFirestoreInternalAssertion` (clientErrorCore) → beacon handler slot → `onFirestoreAssertion` (wedgeEscalation, firebase-free) → the AV214 ladder. Recurrence-after-reload → memory-cache boot **removes `persistentMultipleTabManager` = a trigger gone**; NO new auto-reload (AV214 invariant). AppErrorBoundary stamps `noteWedgeReload`. lazyRetry chunk-fail → `telemetry` (de-noise — stops crying wolf every deploy).
- **Verified**: 21/0 new test + 229/0 siblings + build clean + **Rule Q L1 real browser** (ca9 → escalate `conn-wedge` 24h; benign / `missing stream token` / first-occurrence → NO escalate) + AV215 both SKILL copies (SY1) + `scripts/diag-client-errors.mjs` (Rule R tool).
- **Honest gap**: SDK ca9 race non-deterministic → cannot repro in-browser; real "rate drops / de-noise works" = POST-DEPLOY prod telemetry.

## Next action
- await user: **"deploy"** (vercel-only; frontend; rules UNCHANGED → no Probe-Deploy-Probe) OR commit / continue

## Outstanding user-triggered (carried)
1. AV215 commit + deploy (vercel-only) when ready
2. 📱 iPhone L1 (carried) · healthchecks.io `HEALTHCHECK_PING_URL` · LINE/FB secrets rotate · weekly `offsite-backup-pull.mjs` · picker ผูกเจ้าของ + ทดสอบแจ้งเตือน · laptop 10 ปี

## ⚠️ 2 pre-existing suite reds (NOT AV215)
- `staffchat-sticker-objecturl-leak` — flake (PASS isolated; jsdom createObjectURL parallel timing)
- `v50-phase3 F1.12` — asserts active.md has a `/V\d+|Phase/` marker; the 07-21 session-end rewrite dropped it. This file restores the marker (AV215).
