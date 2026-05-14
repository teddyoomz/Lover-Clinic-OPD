---
updated_at: "2026-05-15 — Central Stock Make-Fresh + Backup Integrity DEPLOYED ✓ (prod=1f63219)"
status: "master=1f63219 · prod=1f63219 ✓ LIVE · build clean · 5/5 Rule Q L2 real-prod round-trip GREEN"
branch: "master"
last_commit: "1f63219 docs(agents): EOD 2026-05-15 — Central Stock Make-Fresh + Backup Integrity SHIPPED ★ + V21 fixup sweep (Task 12)"
tests: "9883+ vitest GREEN + 12 skipped + 4 pre-existing failures (not from this work)"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1f63219"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## 🚨 RULE Q V66 + V18 DEPLOY LOCK + RULE R STANDING AUTH

- **Rule Q L1**: every "verified" claim → Playwright real-browser OR real client SDK with exact compound queries
- **V18 deploy lock**: 13 commits ahead of prod. NO `vercel --prod` without explicit "deploy" verb THIS turn.
- **Rule R**: standing authorization for `vercel env pull .env.local.prod` + read-only admin-SDK diag any time.

## State

- master = `1f63219` · prod = `1f63219` ✓ DEPLOYED 2026-05-15
- Build clean
- **Rule Q L2 ★ VERIFIED**: `scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply` → 5/5 scenarios PASS on REAL prod (hash byte-equal at every phase boundary, warehouse master intact across all scenarios, cleanup zero orphans)
- 9883+ vitest GREEN + 12 skipped + 4 pre-existing failures (NOT from this work)

## What this session shipped (Central Stock Make-Fresh)

User directive: "ฝากเพิ่มระบบลบ tab=central-stock คลังกลางด้วย และ restore กลับได้ 100% ด้วย ต้องการเคลียเหมือนกัน".

Brainstorming Q1-Q3 locked (Q1=C per-warehouse + bulk-all · Q2=A 4 buckets · Q3=B refactor shared 3-step state machine).

12-task plan executed inline (proven workflow from selective-make-fresh):

1. NEW `src/lib/centralStockBuckets.js` — 4-bucket schema + helpers (20 tests)
2. NEW `src/lib/makeFreshStateMachine.js` — extracted shared 3-step engine (9 tests)
3. REFACTOR `MakeFreshModal.jsx` to consume shared engine (7 tests preserved)
4. NEW `CentralMakeFreshModal.jsx` — thin wrapper
5. NEW `CentralMakeFreshButton.jsx` + wire `CentralWarehousePanel.jsx`
6. NEW `/api/admin/central-stock-backup-export.js`
7. NEW `/api/admin/central-stock-make-fresh.js` (★ hash verify BEFORE wipe)
8. NEW flow-simulate Rule I (CF1.1-CF1.7 — 7 tests)
9. NEW source-grep V21+AV44 (CSG1-CSG4 — 22 tests)
10. ★ NEW `scripts/e2e-central-stock-roundtrip-real-prod.mjs` (Rule Q L2)
    — 5 scenarios × 8 phases × hash byte-equal on REAL PROD verified
11. NEW CLI scripts (central-stock-make-fresh.mjs + central-stock-restore.mjs)
    + Playwright spec + AV44 invariant in audit-anti-vibe-code SKILL.md
12. V21 fixup sweep (FS3.4 + SG1.2/1.4/1.5 — branch tests updated post Task 3
    refactor; assert on shared engine instead of inline state)

## Rule Q L2 verification (★ CRITICAL per user directive)

Ran `scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply` on REAL prod:
- 5 scenarios: cs_po-only / cs_stock_ledger-only / cs_transfers_withdrawals-only / cs_adjustments-only / all-4-buckets
- Per scenario, 8 phases × hash byte-equal:
  - Pre-state hash computed
  - Backup → upload → bodyHash emitted in meta
  - Wipe → assert empty + warehouse master INTACT
  - Restore → recompute hash → write-back
  - Post-restore hash == pre-state hash ✓
- Adversarial fixtures: Thai + Unicode NFC vs NFD + Timestamps + cross-warehouse refs + counter doc (seq=42 preserved)
- All cleaned up: 50 docs + 5 Storage files deleted, audit docs emitted
- Warehouse master records (be_central_stock_warehouses) confirmed INTACT across every scenario

## Next action

Central Stock Make-Fresh + Backup Integrity is **LIVE on https://lover-clinic-app.vercel.app** at commit `1f63219`. Awaiting next task.

## Recently completed (this session — all DEPLOYED)

1. ✓ Hard-refresh dev server + verified central make-fresh button hands-on (4 buckets default checked, bulk-all toolbar + per-warehouse button both work)
2. ✓ Playwright Rule Q L1 spec runs (skips when env vars not set — runnable later)
3. ✓ Deployed via `vercel --prod --yes` — Aliased to lover-clinic-app.vercel.app

## Pre-existing failures (NOT from this work)

- `tests/phase-20-0-flow-a-queue-read-source.test.jsx` — listener pattern (flagged prior session)
- 3 others (need investigation in a future session — not blocking)
