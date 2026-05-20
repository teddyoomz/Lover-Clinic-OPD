---
updated_at: "2026-05-20 — V43-followup hide-skipped-products-from-stock-balance + Edit shortcut SHIPPED + DEPLOYED"
status: "✅ V43-followup LIVE on prod (deploy lover-clinic-g81qa6hk4 aliased canonical) · 6/6 probes IDENTICAL · awaiting user L1 hands-on"
branch: "master"
last_commit: "0511be1e docs(V43-followup): wiki update + spec/plan/diag artifacts post-deploy"
tests: "V43-followup 1270/1270 GREEN (filter 31 + BS-18 10 + AV97 9 + flow-sim 10 + adversarial 1204 + stress 5 + 1) · V43 legacy e2e 39/39 · full vitest 13508 PASS / 24 pre-existing FAIL (unrelated) / 25 skip · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE — deploy lover-clinic-g81qa6hk4 aliased canonical 2026-05-20"
firestore_rules_version: "unchanged (idempotent — V43-followup touched no rules)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = `0511be1e` (clean tree, all pushed). 15 commits this session.
- V43-followup DEPLOYED via combined V15 (Vercel + Firebase rules idempotent). 6/6 Probe-Deploy-Probe IDENTICAL pre+post. 30 chat_conversations test-probe-* cleaned.
- graphify refreshed (7378 nodes / 13351 edges / 787 communities, AST-only). LLM wiki +2 pages + index/log.

## What this session shipped

- **V43-followup** (12-task subagent-driven) — hide products flagged `skipStockDeduction:true` from Stock Balance table (per-branch + central + future) + `[✎ แก้ไข]` shortcut button → ProductFormModal → live update via onSnapshot. Full detail: `.agents/sessions/2026-05-20-v43-followup-hide-from-balance.md`
- NEW `src/lib/skipStockFilter.js` (Rule O single-source) + `listenToProducts` Layer 1/2 (BS-18) + StockBalancePanel refactor + StockTab/CentralStockTab parent wire
- NEW AV97 + BS-18 audit invariants codified + enforced
- 7-tier prof-grade test bank (~1270 assertions) — L1 Playwright + L2 admin-SDK e2e on real prod (Rule Q V66)
- Also: verified V43 deduction-layer toggle works (Rule Q L2 spec `tests/e2e/v43-skip-stock-deduction-toggle.spec.js` 2/2) + 2 Rule R diag scripts

## Next action

- Idle — awaiting user L1 hands-on Rule Q V66 verification on `https://lover-clinic-app.vercel.app/?backend=1`

## Outstanding user-triggered actions

- **L1 hands-on** (Rule Q V66): stock tab → 4 services (Shock wave / ผ่าตัดทำหมันชาย / ติดตามอาการกับแพทย์ / เพิ่ม ตัดเส้นสองสลึง) HIDDEN + `[✎ แก้ไข]` toggle round-trip live without F5
- **24 pre-existing test failures** (backend-menu-d / phase-26 / v36 / rp1-iife / Java-emulator) — separate cleanup batch when desired; unrelated to V43-followup
- **V106 stock-movement 30-day retention** — brainstorming locked (Q1=C hard-delete / Q2=A cron 03:00 BKK / Q3=A rolling 30d / Q4=A all types), spec NOT written, awaiting "ship V106"
