# Session 2026-05-20 EOD+5 — V106 Stock-Movement Retention (shipped + DEPLOYED)

## Summary

Brainstorm→spec→plan→executing-plans inline (T1-T7). Daily cron archives `be_stock_movements` older than 90 days to permanent Storage JSON then hard-deletes them — controls Firestore cost while preserving the MOPH audit trail. Shipped, tested (13800/0 + Rule Q L2 7/0 on real prod), and DEPLOYED.

## Current State

- master = origin = prod = `864ef9fd` (clean, pushed, DEPLOYED 2026-05-20).
- Full vitest **13800 pass / 0 fail / 0 skip** (+44 V106); build clean 2.68s.
- Deployed: Vercel aliased canonical `https://lover-clinic-app.vercel.app` (root 200) + `firebase deploy --only storage` (storage.rules released). Probe-Deploy-Probe 4/4 IDENTICAL 403 pre+post; cron no-auth → 401.
- Cron live: `30 20 * * *` (03:30 BKK). First backlog drain = next scheduled fire (post-deploy L3).

## Decisions (1-line each)

- Q1 archive→Storage then hard-delete (V81/AV64 pattern); balance snapshot dropped = YAGNI (be_stock_batches authoritative — corrected old brainstorm).
- Q2 90-day window · Q3 daily 03:30 BKK + monthly-file archive · Q4 all movement types · Q5 cron-only (no CLI/UI).
- Sub-1 MovementLogPanel 90d info line · Sub-2 explicit storage.rules admin-only archive match.
- AV99 invariant: be_stock_movements deletion MUST be archive-gated; cron = only deleter; normalized-ISO age gate (mixed Timestamp/ISO guard).

## Commits (this session, oldest first)

```
47c14fa4 docs(V106): spec + plan (brainstorm→writing-plans)
064a27ce feat(V106): pure helper + unit tests (T1)
30a729b9 feat(V106): cron endpoint archive-before-delete (T2)
e57728cc feat(V106): wire vercel.json + storage.rules + MovementLog notice (T3)
ebb34f8a feat(V106): AV99 invariant + source-grep enforcer (T4)
0db14d79 test(V106): Rule I flow-simulate (T5)
6d0d86b4 test(V106): Rule Q L2 admin-SDK e2e on real prod (T6)
864ef9fd docs(V106): session state (T7)
```

## Files Touched (names only)

NEW src: `src/lib/stockMovementRetentionCore.js`.
NEW api: `api/cron/stock-movement-retention.js`.
MOD: `vercel.json` (4th cron + maxDuration 300) · `storage.rules` (admin-only stock-movements-archive) · `src/components/backend/MovementLogPanel.jsx` (90d notice) · `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV99).
NEW tests: `tests/v106-stock-movement-retention-core.test.js` (24) · `tests/v106-av99-archive-before-delete.test.js` (13) · `tests/v106-stock-movement-retention-flow-simulate.test.js` (7).
NEW script: `scripts/e2e-stock-movement-retention.mjs` (Rule Q L2).
Spec/plan: `docs/superpowers/specs|plans/2026-05-20-stock-movement-retention.{design.html,html}`.

## Lessons

- **`firebase deploy --only storage:rules` FAILS in CLI 15.x** — "Could not find rules for the following storage targets: rules". Storage has no `:rules` sub-target (only named multi-bucket targets). Use `--only storage`. Combined form = `firebase deploy --only firestore:rules,storage` (NOT `...,storage:rules`). Rule B / 02-workflow notation should be corrected.
- **Balance is be_stock_batches-authoritative, not movement-replay** — re-grounding via Explore corrected the stale brainstorm; deleting movements never threatens balance, so no "balance snapshot" needed.
- **Mixed createdAt-type hazard** — a stray Timestamp-typed createdAt sorts before every string in Firestore type-ordering, so `where createdAt < <iso>` always matches it; the in-memory normalized-ISO re-gate prevents wrong deletion. (V105-followup `_v105NormalizeCreatedAt` ported into the helper.)
- **Special chars don't round-trip through file writes** — NFC/NFD/NUL test fixtures must use explicit `\u` escapes, not literal characters.

## Next Todo

1. **L1 hands-on** (real screen): V106 MovementLog 90d notice + prior calendar-density + Recall enhancements.
2. **V106 cron L3**: observe 03:30 BKK scheduled run (or curl with CRON_SECRET to trigger the first backlog drain now).
3. Optional: correct Rule B / 02-workflow `storage:rules` → `storage` notation.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-20 EOD+5.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=864ef9fd, prod=864ef9fd)
3. .agents/active.md (13800 pass / 0 fail)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-20-v106-stock-movement-retention.md

Status: master=864ef9fd, 13800 pass / 0 fail, prod=864ef9fd LIVE (V106 deployed)
Next: idle — L1 hands-on OR observe/trigger V106 cron first drain OR next feature
Outstanding (user-triggered): L1 hands-on (calendar-density + Recall + V106 notice) · V106 cron L3 (03:30 BKK or curl+CRON_SECRET)
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (storage = `--only storage`); Rule Q V66 L1/L2 before "verified"; design→Visual Companion from question stage; plans=HTML mockup+flow
/session-start
```
