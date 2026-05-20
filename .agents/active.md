---
updated_at: "2026-05-20 EOD+5 — V106 stock-movement retention SHIPPED + DEPLOYED"
status: "✅ V106 deployed (storage.rules + Vercel cron); 13800 pass/0 fail; prod LIVE"
branch: "master"
last_commit: "864ef9fd docs(V106): session state (T7)"
tests: "13800 pass / 0 fail / 0 skip · build clean (2.68s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "864ef9fd LIVE — full EOD..EOD+5 cluster DEPLOYED 2026-05-20"
firestore_rules_version: "unchanged"
storage_rules_version: "DEPLOYED 2026-05-20 (V106 stock-movements-archive admin-only)"
---

# Active Context

## State

- master = origin = prod = `864ef9fd` (clean, pushed, DEPLOYED). Vercel aliased canonical; storage.rules released.
- V106 stock-movement retention LIVE: daily cron `30 20 * * *` (03:30 BKK) archives `be_stock_movements` >90d to Storage then hard-deletes. First backlog drain = next scheduled fire.
- Checkpoint: `.agents/sessions/2026-05-20-v106-stock-movement-retention.md`.

## What this session shipped (DEPLOYED)

- **V106 Stock-Movement Retention** (brainstorm→spec→plan→executing-plans inline, T1-T7, 8 commits): pure helper + cron (archive-before-delete, AV99) + vercel.json 4th cron + storage.rules admin-only archive + MovementLogPanel 90d notice. Decisions: archive→delete · 90d · daily 03:30 BKK + monthly-file · all types · cron-only. Balance untouched (be_stock_batches authoritative — corrected old brainstorm's YAGNI "snapshot").
- Tests +44 (24 core + 13 AV99 + 7 Rule I) → 13800/0. **Rule Q L2 PASS 7/0 on real prod**. AV99 codified.
- **Deployed**: Vercel (canonical alias, root 200) + `firebase deploy --only storage` (⚠ CLI 15.x: `--only storage`, NOT `storage:rules` — sub-target rejected). Probe-Deploy-Probe 4/4 IDENTICAL 403 pre+post. Cron no-auth → 401.

## Next action

- idle. Optional: observe the cron's first 03:30 BKK scheduled run, or trigger now via curl with CRON_SECRET (drains real >90d backlog). Else next feature.

## Outstanding user-triggered actions

- **L1 hands-on** (real screen): calendar-density (span=1 18px · tap→popover · resize<lg→agenda · dark+light) + Recall enhancements + V106 MovementLog 90d notice.
- **V106 cron L3**: confirm 03:30 BKK scheduled run fires + drains backlog (mechanism already L2-verified). Trigger early via curl + CRON_SECRET if desired.
