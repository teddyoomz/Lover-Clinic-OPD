---
updated_at: "2026-04-29 EOD (session 28) — Phase 15.7 family ship + superpowers Rule J"
status: "Production = c36888e LIVE (V15 #4). Master = 28308ad with 24 commits unpushed-to-prod."
current_focus: "Awaiting user 'deploy' auth for V15 #7 combined deploy (24 commits)"
branch: "master"
last_commit: "28308ad"
tests: 3312
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c36888e"
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `28308ad` · production = `c36888e` (V15 #4 LIVE) · 24 commits unpushed-to-prod
- **3312/3312** focused vitest pass · build clean · working tree clean
- Session arc: Phase 15.7 base → bis → ter → quater → quinquies → sexies → septies → octies → novies + Rule J + superpowers boot

## What this session shipped (2026-04-29 — session 28)
12 commits this session — see [`.agents/sessions/2026-04-29-session28-phase15.7-family.md`](.agents/sessions/2026-04-29-session28-phase15.7-family.md)
- Phase 15.7 base — cancel-modal trackStock copy + listDoctors V33 name composition + assistant picker scope + negative-stock allow-deduct + ติดลบ badge/filter
- Phase 15.7-bis — negative-repay flow (incoming positive must repay negatives FIFO oldest-first) + calendar collision badge mismatch fix
- Phase 15.7-ter — StockBalancePanel auto-picks default branch (Allergan-disappear)
- Phase 15.7-quater — treatment history real-time for self-created customers (id-first refresh) + V33 self-created vs cloned parity audit
- Phase 15.7-quinquies — calendar column width scales with roomCount (ไม่ระบุห้อง overflow)
- Phase 15.7-sexies — appointment modal delete button + clickable customer name
- Phase 15.7-septies — customer-name link opens NEW BROWSER TAB (grid + modal)
- Phase 15.7-octies — advisor dropdown sources from listAllSellers + location field locked to current branch
- Phase 15.7-novies — admin endpoint `cleanup-phantom-branch.js` to purge BR-1777095572005-ae97f911 phantom (firebase-admin SDK; client SDK blocked by audit-immutability rules)
- Rule J + 3-layer superpowers auto-trigger — using-superpowers as session boot · CLAUDE.md + 00-session-start.md updated · user-level CLAUDE.md trigger added

## Next action
**Awaiting user "deploy" authorization** for V15 #7 combined deploy. 24 commits will ship including Phase 15.7-novies admin endpoint (must be live before phantom branch cleanup can execute).

## Outstanding user-triggered actions
- V15 #7 combined deploy auth (per V18, doesn't roll over)
- After deploy: run `/api/admin/cleanup-phantom-branch` action:list → action:delete + confirm:true to nuke 49 phantom-branch docs + 2 staff updates
- After deploy: live QA — assistants picker · advisor dropdown · location lock · customer-name new-tab · appt delete button
- Carry-over: LineSettings creds · customer ID backfill · TEST-/E2E- prefix discipline
