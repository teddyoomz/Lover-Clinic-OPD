---
updated_at: "2026-06-02 EOD+1 — V144 stock-page batch DEPLOYED + verified (filter + real-time 0-lot auto-clear + in-place modals + balance follows global selector)."
status: "DEPLOYED + L2-verified on real prod. No open bugs on tested paths."
branch: "master"
last_commit: "0599af2e (V144 docs) · code 2b1a8f11 · session-end checkpoint follows."
tests: "Full suite 15777/0 (this session). V144 L2 e2e 10/0 on REAL prod (post-deploy). NOT re-run at session-end (per directive)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2b1a8f11 — frontend via vercel --prod (V144 UI: หมด filter + in-place adjust/order modals + balance follows top BranchSelector) + firestore:rules (be_stock_batches delete narrowed to remaining==0). Probe-Deploy-Probe 6/6 pre+post."
firestore_rules_version: "DEPLOYED 2026-06-02 — be_stock_batches delete: if false → isClinicStaff() && resource.data.qty.remaining==0 (V144/AV172, probe #16). Rule B pre+post 6/6 + cleanup."
---

# Active — 2026-06-02 EOD+1

## State
- **V144 stock-page batch DEPLOYED + verified LIVE** (frontend `vercel --prod` + `firestore:rules` via Probe-Deploy-Probe).
- 4 user issues this session, all done + deployed:
  1. **"หมด (คงเหลือ 0)" filter** in ยอดคงเหลือ (was missing) — live-verified.
  2. **Real-time 0-lot auto-clear** — `_clearRedundantZeroLotsForProducts` post-commit at 7 stock-mutation entry points (cron 03:45 stays backstop). Rule narrowed to allow client delete of remaining==0 lots only. **L2 e2e 10/0 on real prod.**
  3. **In-place adjust/order modals** — ปรับ/เพิ่ม open `StockActionModal` on the balance page (no bounce); forms reused; AV78 close. Live-verified both.
  4. **Balance follows top BranchSelector** — per-panel "สถานที่" dropdown removed; locationId derived. Live-verified static + dynamic (นครราชสีมา 94 ↔ พระราม 3 5).
- **Rule M applied**: 14 lingering redundant 0-lots deleted on prod (audit `v143-quater-...37330cf4`); idempotent re-check 0 remaining, 30 placeholders kept.

## What shipped (detail → V-log V144 + wiki stock-realtime page)
- `_clearRedundantZeroLotsForProducts` (backendClient) + 7 entry-point wirings + 2 AV172-exempt (create*Transfer/Withdrawal pending-doc).
- StockActionModal (NEW, DRY) hosting exported AdjustCreateForm/OrderCreateForm.
- StockBalancePanel: "หมด" filter + derived locationId (dropdown/auto-pick removed).
- firestore.rules narrow delete + Rule B probe #16. AV172 (real-time lot-clear) + AV173 (in-place modal + follow-selector).
- tests: v144-realtime-lot-clear (41) + v144-stock-ux (23) + 15 V21 lock-in fixups.

## Next action
- Idle — await user direction. Tested paths clean.

## Outstanding (optional, user-triggered)
- **CentralStockTab same-class deferred**: its balance ปรับ/เพิ่ม still navigate (different tab + CentralStockOrderPanel + warehouse-scoped). Flagged (test CB1). Offer to convert to in-place modals if wanted.
- Prior-session V-log entries (sales/EOD+5/+6) still unwritten (carryover).
