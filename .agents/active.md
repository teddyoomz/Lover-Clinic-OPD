---
updated_at: "2026-04-27 (s18 EOD — Phase 15.1+15.2+15.3 + 5 bug fixes shipped, 9 commits, NOT deployed)"
status: "Production = 75bbc38 LIVE (V33.10). Master = 1066711 with 9 unpushed-to-prod commits ready for V15 combined deploy. Phase 15.4+15.5 + 7 user-reported items (pagination/batch/movements visibility/transfer-detail-roles/auto-unit/branch-access-filter) queued for next session."
current_focus: "User QA in dev → triage 7 outstanding items → deploy when ready"
branch: "master"
last_commit: "1066711"
tests: 1905
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "75bbc38"
firestore_rules_version: 18
storage_rules_version: 2
---

# Active Context

## State
- master = `1066711` · **1905/1905** focused vitest pass · build clean (BD 924 KB ≈ unchanged)
- Production = `75bbc38` LIVE (V33.10 baseline). **9 commits pending V15 combined deploy** (Phase 15.2 has firestore.rules update — needs Probe-Deploy-Probe + extended probe list 6→8 endpoints)
- Working tree clean

## What this session shipped (s18 — 2026-04-27)
9 commits across Phase 15 slices + 5 bug fixes ([detail](.agents/sessions/2026-04-27-session18-phase15-1-2-3-plus-fixes.md))
- Phase 15.1 `dba27ad` — read-only CentralStockTab + V20 multi-branch foundation (+46 tests)
- Phase 15.2 `a4307e3` — Central PO write flow + `_buildBatchFromOrderItem` Rule C1 helper (+86 tests; 1 new collection + counter)
- V22-bis `88a2174` — seller numeric-id leak fix (+33 tests; resolveSellerName helper)
- Phase 15.3 `e65d335` — Central adjustments sub-tab + AdjustForm scope-bug fix (+19 tests)
- Product-display `12d6081` — Phase 14.10-tris p.name regression sweep across 5 sites (+19 tests)
- OrderPanel-2bug `74985b8` — BRANCH_ID scope + smart unit dropdown auto-load (+25 tests)
- Branch-name `ece1868` — OrderDetailModal raw branchId → resolveBranchName helper (+20 tests)
- Actor tracking `1066711` — ActorPicker + ActorConfirmModal + 5 forms + 6 state-flips + MovementLogPanel ผู้ทำ column (+62 tests)
- Tests: 1595 → 1905 (+310 across the day)

## Next action
**User QA in dev + triage 7 outstanding items below**, then V15 combined deploy 9 pending commits. Phase 15.2 requires Probe-Deploy-Probe (Rule B) + extend probe list with `be_central_stock_orders` endpoints.

## Outstanding user-triggered actions (NOT auto-run)
- **User QA**: verify ActorPicker visible + force-pick works in all 5 stock create forms; verify "ผู้ทำ" column in MovementLogPanel
- **Decide deploy**: 9 commits pending; V15 combined (vercel + firestore rules + Probe-Deploy-Probe)
- **7 user-reported items queued for next session** (verbatim from EOD message):
  1. Pagination ทุก tab สต็อค+คลังกลาง — รายการล่าสุดอยู่บนสุด, max 20/หน้า
  2. ปรับสต็อคไม่ได้ — Batch/Lot dropdown เลือกไม่ได้ (likely legacy `branchId='main'` vs new `BR-XXX` mismatch)
  3. การโอนย้ายไม่แสดงใน Movement log ของ tab=stock (แสดงแต่ใน central-stock)
  4. การเบิกของไม่แสดงใน Movement log ของ tab=stock (เหมือนกัน)
  5. Modal รายละเอียดการโอนย้าย — ต้องแสดง ผู้สร้าง + ผู้ส่ง + ผู้รับ (3 actor roles)
  6. ทุก batch row ในทุก create form (ทั้ง stock + central) — แสดงหน่วยสินค้าอัตโนมัติเมื่อเลือก product (OrderPanel 74985b8 ทำแล้ว; ขยายไป Adjust/Transfer/Withdrawal/Central PO)
  7. ActorPicker dropdown — filter เฉพาะพนักงาน/ผู้ช่วยที่มีสิทธิ์เข้าถึงสาขานั้น (`staff.branchIds[]` + `doctor.branchIds[]` มีอยู่แล้วใน schema)
- Convention reminders carry-over: admin LineSettings creds + webhook URL paste · backfill customer IDs · TEST-/E2E- prefix helper (V33.10)
