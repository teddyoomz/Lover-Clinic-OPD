# 2026-04-28 (sessions 22+23 EOD) — Central tab wiring + tier-scoped product filter

## Summary

User reported 4 + 1 issues across two messages on the s21 V15 #2 deploy.
s22 wired StockBalancePanel buttons + added detail modal/inline summary;
s23 fixed the deeper UX bug — AdjustCreateForm dropdown now shows ONLY
products with stock at the current tier. **2275/2275 tests pass · 2
commits unpushed**.

## Current State

- master = `93c71d6` · 2275/2275 vitest green · build clean
- Production = `e46eda2` LIVE (V15 #2). Master 2 commits ahead (s22 + s23).
- Awaiting V15 #3 combined deploy authorization.
- Working tree clean.

## Commits (this session)

```
93c71d6 fix(stock): s23 — tier-scoped product filter in AdjustCreateForm
25ed70a fix(stock): post-deploy s22 — central tab wiring + Order detail UX
```

## User reports (verbatim) → fixes

| # | User words | Commit | Lane |
|---|---|---|---|
| 1 | "ระบบปรับ stock ของ tab คลังกลาง มันมั่ว ดึง stock สาขามา ปรับสาขาแทน" | `25ed70a` + `93c71d6` | (s22) wire button; (s23) tier-scoped product filter — root cause |
| 2 | "ปุ่ม + ในหน้า ยอดคงเหลือ ของ tab คลังกลาง กดไม่ได้" | `25ed70a` | Wired onAddStockForProduct → setOrderPrefill + setSubTab('orders') |
| 3 | "ใน tab คลังกลาง การนำเข้าจาก Vendor กดเข้าไปดูรายละเอียด + แสดงสินค้าคร่าวๆ" | `25ed70a` | NEW CentralOrderDetailModal + clickable rows + inline summary |
| 4 | "ใน tab stock ก็เช่นกัน ตรงรายการ Orders" | `25ed70a` | Inline summary in OrderPanel rows |
| 5 | (with screenshot) "ดึงสินค้าจากคลังสาขามาให้เลือก ไม่ใช่สินค้าในคลังกลาง" | `93c71d6` | TIER-SCOPED PRODUCT FILTER — pre-load batches at tier, filter dropdown |
| Q3 | "Vendor มาจากไหน?" | (no code) | be_vendors via VendorSalesTab (Phase 14.3) |

## Files Touched

NEW:
- src/lib/orderItemsSummary.js
- src/components/backend/CentralOrderDetailModal.jsx
- tests/phase15.4-s22-central-tab-wiring-flow-simulate.test.jsx (+39)
- tests/phase15.4-s23-tier-scoped-product-filter.test.jsx (+22)

MODIFIED:
- src/components/backend/CentralStockTab.jsx — adjustPrefill/orderPrefill state + handlers + props pass-through
- src/components/backend/CentralStockOrderPanel.jsx — prefillProduct prop + items[0] init + row click + ดู button + inline summary + CentralOrderDetailModal render
- src/components/backend/StockAdjustPanel.jsx — availableProductIds Set state + tier-scoped product filter + empty-state CTA + loading state
- src/components/backend/OrderPanel.jsx — inline product summary in items count cell

## Decisions (1-line each)

1. **s22 vs s23 split**: s22 fixed wiring (no-op buttons); s23 fixed the deeper UX bug (dropdown showing wrong-tier products). Rolled forward in 2 commits because user reported them in 2 separate messages.
2. **Tier-scoped product filter via batch pre-load** (s23): one extra `listStockBatches({branchId})` query at form mount; derive Set of productIds; useMemo filter. Same logic for branch + central.
3. **Loading + empty state UX**: `availableProductIds = null` while loading → dropdown disabled + "กำลังโหลดสินค้าในคลังนี้..."; empty Set → "⚠ ยังไม่มีสินค้าในคลังนี้ — สร้าง Order นำเข้าก่อน".
4. **Same legacy-main gate**: pre-load uses `includeLegacyMain: isBranchTier` so default branch sees legacy 'main' batches but central tier doesn't (preserves bug 4 fix).
5. **CentralOrderDetailModal as new file** (mirror of OrderDetailModal pattern, read-only): no edit functionality for now — mutations stay through receive/cancel buttons in list. Total 9 data-testids for preview_eval.
6. **orderItemsSummary helper extracted to shared lib** (Rule of 3 pre-emptive): used in 2 panels now, will likely be reused. Pure function, V14-locked.

## Next Todo

**Awaiting user "deploy" authorization** for V15 #3 combined deploy:
- Vercel + firestore:rules in parallel
- Probe-Deploy-Probe (Rule B): pre 6 positive + 4 negative; post same; cleanup; HTTP smoke
- Rules version unchanged but Probe still mandatory per Rule B

After deploy, live QA:
- Central adjust: dropdown shows ONLY products in คลังกลาง
- Empty central → CTA visible
- Balance "ปรับ"/"+" buttons → navigate correctly
- Both Vendor PO panels: row-click + inline summary working

Deferred to Phase 15.5+: ActorPicker branchIds[] filter; Phase 15.4 central→branch dispatch flow; Phase 15.5 withdrawal approval admin endpoint.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-28 s22+s23 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=93c71d6, prod=e46eda2 — 2 commits unpushed)
3. .agents/active.md (2275 tests pass; s22+s23 NOT deployed)
4. .claude/rules/00-session-start.md
5. .agents/sessions/2026-04-28-session22-23-central-tab-wiring-and-tier-filter.md

Status: master=93c71d6, 2275/2275 tests pass, prod=e46eda2 LIVE.
2 commits ready: s22 (central tab wiring + Order detail UX) + s23
(tier-scoped product filter in AdjustCreateForm).

Next: Live QA OR V15 #3 combined deploy when authorized.

/session-start
```
