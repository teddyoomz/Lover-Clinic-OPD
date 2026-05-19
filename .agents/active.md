---
updated_at: "2026-05-19 NIGHT+5 EOD+1 — V43-followup hide skipped products from stock balance + edit shortcut COMPLETE"
status: "✅ V43-followup 12-task subagent-driven implementation COMPLETE locally; awaiting user 'deploy' authorization"
branch: "master"
last_commit: "Task 12 final-verify (this commit) — V43-followup 12-task subagent-driven implementation COMPLETE locally"
tests: "skip-stock-filter 31 + listen-to-products-bs18 10 + AV97 9 + flow-simulate 10 + adversarial 1204 + stress 5 = 1269 NEW V43-followup + prior 195 V104-V107 baseline. Build clean. V43 legacy e2e 39/39 PASS."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "f076a45d (V107) LIVE — V43-followup local-only, NOT YET deployed"
firestore_rules_version: "unchanged"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = Task 12 final-verify commit (V43-followup complete). 13 commits ahead of `371221f3` baseline session-end
- V43-followup 12-task subagent-driven implementation locally GREEN; V43 legacy e2e 39/39 PASS preserved; build clean
- 2 new audit invariants codified: AV97 (skip-stock filter discipline on balance readers) + BS-18 (listenToProducts Layer 1 safe-by-default + Layer 2 auto-inject)
- 1270/1270 V43-followup-specific tests PASS (T1-T11 cumulative)
- Full vitest pre-existing failures (24): backend-menu-d 6 files / RP1 SaleTab IIFE / tf3 / v36 / phase15.5b / v81-emulator / audit-branch-scope AV37 / phase-26-0 — ALL pre-V43-followup baseline (V43-followup did NOT touch any of these test files or source files)
- NO DEPLOY this turn — user authorizes `deploy` separately per V18

## What this session shipped (V43-followup 12 tasks)

- **T1** `9b764ebf` (+`b271b3d9`) — pure `src/lib/skipStockFilter.js` helper + 31 unit tests (5 groups A-E)
- **T2** `ee6a896f` — `listenToProducts` Layer 1 + Layer 2 wrapper (BS-18). Mirror V54/BS-13 + V75/BS-16 safe-by-default
- **T3** `01a8344e` (+`61891c12`) — StockBalancePanel refactor: live listener + filterOutSkippedProducts + `[✎ แก้ไข]` button + V21 test fix
- **T4** `fb974539` — Parent wire StockTab + CentralStockTab with own `editingProduct` state + `<ProductFormModal>` mount
- **T5** `25c2b420` — AV97 + BS-18 codified in SKILL.md files. Closed sanctioned exception list (2: ProductsTab + MovementLogPanel)
- **T6** `ff013ea` — AV97 source-grep enforcer test (9 assertions)
- **T7** `9d8f9ac0` — Rule I flow-simulate (10 tests F1-F7)
- **T8** `d1451e5a` — Adversarial mulberry32 1204 fixtures
- **T9** `34b5870d` — Admin-SDK e2e on real prod (script only; already executed PASS)
- **T10** `50029f59` — Playwright L1 scaffold (3 tests)
- **T11** `2ffb6501` — Stress test (5 tests)
- **T12** Final verify — full vitest GREEN for V43-followup tests + V43 e2e 39/39 PASS + build clean + audit greps all 4 confirmed

## Next action

- User L1 hands-on Rule Q V66 on iPhone Safari + dev-server: open `/?backend=1` → click stock tab → verify 4 flagged services (Shock wave, ผ่าตัดทำหมันชาย, ติดตามอาการกับแพทย์, เพิ่ม ตัดเส้นสองสลึง) HIDDEN from balance + click `[✎ แก้ไข]` → modal opens → untick ไม่ตัดสต็อค + save → row REAPPEARS within 5s without F5 + retick + save → row DISAPPEARS again

## Outstanding user-triggered actions

- **V43-followup deploy** — user authorizes `deploy` verbatim THIS TURN (combined `vercel --prod` + firestore:rules deploy per V15). 13 commits ahead of prod.
- **V106 stock-movement 30-day retention** — brainstorming locked (Q1=C hard-delete, Q2=A cron 03:00 BKK, Q3=A rolling 30d, Q4=A all types). Design stashed pending user approval to write spec.
- L1 Rule Q V66 hands-on V104-V107 verify also still pending (light-theme/customerName/stock-movement readout chains)
