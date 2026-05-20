---
updated_at: "2026-05-20 EOD+2 — test baseline cleanup: 24 pre-existing fails + 26 skips → 0/0 (test-side; 1 behavior-identical SaleTab IIFE hoist) — LOCAL"
status: "✅ Baseline spotless (13681 pass / 0 fail / 0 skip / build clean) · pushed to origin · awaiting user 'deploy'"
branch: "master"
last_commit: "bfed2c61 test(baseline): clear 24 pre-existing failures + 26 skips → 0 fail / 0 skip"
tests: "13681 pass / 0 fail / 0 skip · build clean (was 13657 pass / 24 fail / 26 skip)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE (V43-followup) — NOTHING from EOD/EOD+1/EOD+2 deployed yet"
firestore_rules_version: "unchanged (UI/test/config only — no rules/data ops)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = `bfed2c61` (clean, pushed). Prod still `0511be1e` — full session-cluster (EOD/EOD+1/EOD+2) queued for ONE combined deploy.
- This turn = test-baseline cleanup ONLY (16 files: 14 test + vite.config + 1 behavior-identical SaleTab IIFE hoist). No app flow/logic/wiring/rules/data change. passed count unchanged (13681) → zero regression.
- Done via /systematic-debugging: each fail/skip root-caused + classified before touching.

## What this session shipped (all LOCAL, awaiting deploy)

- **24 pre-existing fails → 0**: G2 handleSubmit regex options→submitOpts (V104) · G4 v36 deductStockForSale extractor strips comments (3 real calls pass branchId) · G1 backend-menu-d bloom open-by-default precondition (isSpecificEntityContext V90/V91 + FS3-bis screen-vs-portal + S3 re-open guard, 17 tests) · G3 SaleTab V105 name-cell IIFE hoisted out of JSX (RP1, output-identical) · G5 v81-emulator opt-in gate.
- **26 skips → 0**: deleted 19 `.skip` tombstones (removed-feature tests; relocated coverage verified) + excluded 7 v81-emulator tests from default run (preserved as real Rule Q backup gate; run via `RUN_V81_EMULATOR=1 npm test`).
- No checkpoint file (test cleanup, not a feature/phase/V-entry). Detail in SESSION_HANDOFF EOD+2 block.

## Next action

- Idle — await user "deploy" (combined `vercel --prod`; rules unchanged) + L1 hands-on for prior EOD/EOD+1 UI work.

## Outstanding user-triggered actions

- **Deploy** all queued work (EOD sub-tabs + Menu-D fixes + EOD+2 baseline cleanup) — one combined `vercel --prod` (V18: explicit "deploy" this turn).
- **L1 hands-on** (prior EOD/EOD+1): dup-header gone · recall modal centered/no-flicker (backend + Frontend นัดหมาย→Recall) · sub-tab pills (tab=sales + tab=finance&subtab=deposit).
- **V106 stock-movement 30-day retention** — brainstorm locked, spec NOT written.
- Optional: log V-entry for V104 stale-test cleanup + skip-tombstone removal (user can request).
