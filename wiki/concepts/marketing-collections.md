---
title: Marketing collections (be_promotions / be_coupons / be_vouchers)
type: concept
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [marketing, firestore, branch-scoped, phase-9, allBranches-OR-merge]
source-count: 0
---

# Marketing collections — `be_promotions` / `be_coupons` / `be_vouchers`

> Three Firestore collections shipped Phase 9 (2026-04-19) that hold OUR marketing data — promotion campaigns, discount coupons, prepaid vouchers. All three are branch-scoped with `allBranches:true` doc-field OR-merge for global campaigns. Backend-only (no ProClinic write-back per Rule E).

## Collections

| Collection | Purpose | Tab | List shape |
|---|---|---|---|
| `be_promotions` | Promotion campaigns (discount %/amount/free-product applied to checkout) | [PromotionTab](../entities/promotion-tab.md) | grouped: `{promotion_name, promotion_code, items:{courses,products}, ...}` |
| `be_coupons` | Discount coupons (single-use code redemption) | [CouponTab](../entities/coupon-tab.md) | flat: `{coupon_name, coupon_code, discount_type, ...}` |
| `be_vouchers` | Prepaid vouchers (gift-card-like units) | [VoucherTab](../entities/voucher-tab.md) | flat: `{voucher_name, voucher_code, balance, ...}` |

## Branch-scope semantics

All three collections follow the [BSA](branch-scope-architecture.md) "marketing OR-merge" pattern at Layer 1 ([backendClient.js](../entities/scoped-data-layer.md)):

```js
// Pseudocode — actual impl uses _listWithBranchOrMerge helper
async function listPromotions({ branchId, allBranches = false } = {}) {
  if (allBranches) return getDocs(promotionsCol());

  // OR-merge: fetch BOTH the branch-scoped docs AND the docs marked allBranches=true.
  const [branchDocs, globalDocs] = await Promise.all([
    getDocs(query(promotionsCol(), where('branchId', '==', branchId))),
    getDocs(query(promotionsCol(), where('allBranches', '==', true))),
  ]);
  return dedupById(branchDocs.concat(globalDocs));
}
```

This means a promotion can be scoped to a specific branch (`branchId='BR-A'`, `allBranches=false`) or global (`allBranches=true`, branchId set but ignored). Customers at any branch see global promotions; only branch-A customers see branch-A-scoped promotions.

The OR-merge happens AT READ TIME — it's a 2-query fetch + dedup, not a Firestore composite query (Firestore doesn't support OR on different fields without explicit `or()` syntax not yet adopted here).

## Phase 17.0 lock

These three collections are exactly the 3 [PromotionTab](../entities/promotion-tab.md) / [CouponTab](../entities/coupon-tab.md) / [VoucherTab](../entities/voucher-tab.md) the [Branch-switch refresh discipline](branch-switch-refresh-discipline.md) (BS-9) closed in Phase 17.0. Pre-Phase-17.0, the tabs had `useCallback(reload, [])` empty deps → branch switch silently failed. Post-Phase-17.0, all three subscribe to [BranchContext](../entities/branch-context.md) + include `selectedBranchId` in deps → branch switch triggers re-fetch.

## Writer side — `_resolveBranchIdForWrite`

[backendClient.js](../entities/scoped-data-layer.md) writers (`savePromotion`, `saveCoupon`, `saveVoucher`) stamp `branchId` via the shared `_resolveBranchIdForWrite(data)` helper, which respects (in order): explicit `data.branchId` → current selected branch from `resolveSelectedBranchId()` → fall-through error. This is part of [BSA](branch-scope-architecture.md) Layer 1 writer-stamping protocol established Phase BS V2.

If `data.allBranches === true`, the `branchId` field is still stamped (for back-compat) but the read-time OR-merge ensures the doc shows up cross-branch.

## Audit trail

All three collections inherit standard Firestore staff-only rules from `firestore.rules` (read+write require `isClinicStaff()` claim). No anon access. No webhook write path.

## Sale + treatment integration

- [SaleTab](../entities/promotion-tab.md) (TODO: SaleTab entity page not yet in wiki) calls `listPromotions()` at checkout to populate the promotion picker. Marketing tab CRUD reflects in Sale picker on next mount.
- [TreatmentFormPage](../entities/treatment-form-page.md) reads promotions for course-discount preview (line ~1446 — `listPromotions, listCourses, listProducts`).
- Coupons are validated via `findCouponByCode` (single-doc lookup) at checkout time; vouchers similarly via balance read.

## Cross-references

- Concept: [Branch-Scope Architecture](branch-scope-architecture.md)
- Concept: [Branch-switch refresh discipline (BS-9)](branch-switch-refresh-discipline.md)
- Concept: [Iron-clad rules](iron-clad-rules.md) (Rule E backend = Firestore only)
- Entities: [PromotionTab](../entities/promotion-tab.md), [CouponTab](../entities/coupon-tab.md), [VoucherTab](../entities/voucher-tab.md)

## History

- 2026-04-19 — Phase 9 ships marketing tabs + collections. V2 anti-example documents the original `pc_*` write-back violation later reverted.
- 2026-05-04 — Phase BSA Task 1 adds `{branchId, allBranches}` opts + OR-merge helper.
- 2026-05-04 — Phase BSA leak-sweep-2 baselines 18 promotions + 17 coupons + 9 vouchers to นครราชสีมา.
- 2026-05-05 — Wiki backfill page created. Phase 17.0 closes BS-9 branch-switch refresh gap on the 3 marketing tabs.
