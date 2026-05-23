---
updated_at: "2026-05-23 EOD+1 LATE+9 — V118+V119+V120+V121 LOCAL stack ready for deploy"
status: "V115+V116+V116-followup LIVE on prod @ 3612d8ae. V117 + V118 + V119 + V120 + V121 SHIPPED local @ 00410f93 — awaiting deploy authorization."
branch: "master"
last_commit: "feat(notifications): V121 — Card-flow tab bubbles + V120-gap close + AV118 ext"
tests: "Full vitest 14480/14480 GREEN · V121 self 27/27 · V118+V120+V119 sibling 71/71 · AV60 0/527 drift · build clean 3.09s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3612d8ae (V115+V116+V116-followup LIVE) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (V118+V119+V120+V121 all client-only)"
---

# Active Context

## State
- **5 V-features SHIPPED LOCAL** on master @ `00410f93` — all client-only (no rules/index/Cloud Run change, no Probe-Deploy-Probe needed).
- **Combined deploy ready**: V117 (lightbox portal) · V118 (card OPD lifecycle row) · V119 (useCallback import + AV60 permanent gate) · V120 (card-flow hides from Clinic queue) · V121 (card-flow tab bubbles + V120-gap close).
- **Prod unchanged** at `3612d8ae` (V115+V116 LIVE).

## What this session shipped
- **V118** — 5-state OPD lifecycle row on Card (🔗 link · 🟢 view · 🔴 save) + AV118 invariant. Detail: `.agents/sessions/2026-05-23-eod-v118-to-v121.md`.
- **V119 P0** — fixed black-screen ReferenceError caused by V118's missing useCallback import; AV60 scanner promoted to PERMANENT vitest gate (no more opt-in).
- **V120** — `provisionOpdLinkForBookingPair({hideFromQueue:true})` opt-in flag; V118 Card flow passes true → sessions never appear in Clinic queue.
- **V121** — purple #a855f7 bubble on นัดหมาย tab + sub-pills + mobile dock when card-flow customer fills form. Q1=B locked (bubble persists until save). Closes V120 latent gap (3 queue filters now exclude card-flow regardless of patientData).
- Full vitest 14480/14480 GREEN · AV60 0/527 drift · 9 commits on master ahead of prod.

## Next action
1. **User authorizes deploy** → `vercel --prod` (combined V117+V118+V119+V120+V121 OK — all client-only).
2. **Rule Q L1 hands-on post-deploy** — iPhone + desktop scenarios per V118+V121 spec acceptance criteria.

## Outstanding user-triggered actions
- Combined V117+V118+V119+V120+V121 deploy authorization (when ready).
- Post-deploy iPhone L1 hands-on (V117 lightbox · V118 card flow end-to-end · V121 bubble flow).

## Notes
- V18 deploy auth never carries forward — every "deploy" verb is per-turn.
- V119 added a permanent vitest gate (`tests/v119-av60-hook-import-drift-permanent-gate.test.js`) — V80/V119-class hook drift now caught at every test run.
- Visual Companion sessions auto-clean (server stops after 30 min idle).
