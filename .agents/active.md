---
updated_at: "2026-05-20 EOD+5 — V106 stock-movement retention shipped (cron archive→delete, AV99)"
status: "✅ V106 shipped (13800 pass/0 fail/build clean); pushed; awaiting deploy + L1 cron observe"
branch: "master"
last_commit: "6d0d86b4 test(V106): Rule Q L2 admin-SDK e2e on real prod (T6)"
tests: "13800 pass / 0 fail / 0 skip · build clean (2.68s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE — EOD..EOD+5 cluster NOT deployed yet"
firestore_rules_version: "unchanged (V106 = storage.rules only — admin-only archive match)"
storage_rules_version: "MODIFIED (V106 stock-movements-archive admin-only) — deploy pending"
---

# Active Context

## State

- master = origin = `6d0d86b4` (clean, pushed). Prod still `0511be1e` — full EOD..EOD+5 cluster queued for ONE combined deploy.
- V106 stock-movement retention fully implemented (7 commits T1-T7 + spec/plan, inline via executing-plans).
- Spec: `docs/superpowers/specs/2026-05-20-stock-movement-retention-design.html` · Plan: `docs/superpowers/plans/2026-05-20-stock-movement-retention.html`.

## What this session shipped (all LOCAL, awaiting deploy)

- **V106 Stock-Movement Retention** — daily cron archives `be_stock_movements` >90d to permanent Storage JSON then hard-deletes (controls Firestore cost; preserves MOPH audit). Decisions: Q1 archive→delete · Q2 90d · Q3 daily 03:30 BKK + monthly-file · Q4 all types · Q5 cron-only · +info-line +storage.rules.
  - T1 `src/lib/stockMovementRetentionCore.js` (pure: cutoff/path/group/mergeArchive-dedup/normalizeCreatedAtForCompare) + 24 unit/adversarial.
  - T2 `api/cron/stock-movement-retention.js` (CRON_SECRET + admin-SDK + single-field createdAt query + in-memory ISO re-gate + archive-before-delete + audit doc + ≤2000/run incremental drain). Idempotent; no lock needed.
  - T3 vercel.json 4th cron `30 20 * * *` + maxDuration 300 · storage.rules admin-only `stock-movements-archive/` · MovementLogPanel 90-day notice (data-testid=movement-retention-info).
  - T4 AV99 (archive-before-delete; cron = only deleter; normalized-ISO gate) + 13 source-grep enforcers.
  - T5 Rule I flow-simulate (7: archive/delete/idempotent/drain/balance/ordering/cutoff-boundary).
  - T6 **Rule Q L2 admin-SDK e2e on REAL prod** — branch-isolated TEST fixtures: 2 archived+deleted, recent preserved, archive shape, mergeArchive idempotent, cleanup zero orphans. **PASS 7/0**.
- Full vitest 13756→**13800** (+44); build clean 2.68s. Balance untouched by design (be_stock_batches authoritative). No firestore.rules change.

## Next action

- **Deploy** combined `vercel --prod` (all EOD..EOD+5) + `firebase deploy --only storage:rules` (Probe-Deploy-Probe: NEW probe anon write `stock-movements-archive/` → 403) when user says "deploy" (V18). The cron's first backlog drain runs over the days after deploy.

## Outstanding user-triggered actions

- **Deploy** all queued work (sub-tabs + Menu-D fixes + baseline + Recall + calendar-density + **V106**) — one combined `vercel --prod` + `firebase deploy --only storage:rules`.
- **L1 hands-on**: calendar-density (span=1 18px · tap→popover · resize<lg→agenda · dark+light · names/HN non-red) + Recall enhancements. **V106 cron**: post-deploy observe the scheduled run (or curl with CRON_SECRET) — the retention MECHANISM is L2-verified on real prod; the live HTTP-cron firing is the final L3 confirmation.
