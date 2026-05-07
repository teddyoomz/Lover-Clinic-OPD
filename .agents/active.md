---
updated_at: "2026-05-07 EOD — V40 trial-fresh นครราชสีมา · V41 cross-branch-import marketing extension · V42 promo bundle qty fix"
status: "master=bf78779 · prod=c92f924 (V42 NOT yet deployed) · 269 V42+P17.1 tests pass · build clean"
branch: "master"
last_commit: "bf78779"
tests: 269
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = `bf78779` · prod = `c92f924` (V42 fix committed but **NOT deployed**)
- V42 promo qty migration applied: 6 entries fixed at LC-26000006 (admin-SDK Rule M, no deploy needed for data ops)
- 269/269 Phase 17.1 + V42 tests PASS · build clean

## What this session shipped
- **V40 trial-fresh นครราชสีมา**: backup → trial Make-Fresh → restore → bit-perfect verify → real Make-Fresh. 3,233 docs wiped, 3 backups in Storage. Commit `0420921`.
- **V41 cross-branch-import test**: verified 6 master-data tabs round-trip on real prod (products+courses, 3+3 imported+verified+cleaned). Commit `0420921` cycle.
- **Phase 17.1 marketing extension**: 3 new adapters (promotions/coupons/vouchers) + UI buttons + 222 tests. Commits `366726c` → `b37edd3` (LISTER fix) → `c92f924` (FK_C2E fix) → `d965eb1` (v41 e2e ext). Deployed.
- **V42 promo bundle qty fix**: 4 writer sites (TFP×3 + SaleTab) all dropped `sub.qty` (course-instance multiplier). Helper extracted (`computePromotionProductQty`, `buildPromotionSubCourseProducts`) + 46 new tests + migration script + 6 entries fixed at LC-26000006. Commit `bf78779`. **NOT YET DEPLOYED.**

Detail: `.agents/sessions/2026-05-07-v42-promo-qty-multiplier.md`

## Next action
**1) Deploy V42 (`vercel --prod`)** — user authorized "yes deploy" earlier this session for marketing extension; V42 is a follow-up critical-data fix + new helper export + 4 writer-site fixes. Per V18, deploy auth never rolls over → user must explicitly say "deploy" again.

**2) NEW bug reported at session-end (NOT investigated this session): "ไม่ตัดสต็อค" flag on course/promotion items is ignored at treatment-deduct time → stock still decrements on every branch + product.** User's image showed: course config has `ไม่ตัด` checkbox checked on PRP product, but treatment movement log shows AHL/Tube PRP/PRP all deducted (-1, -3, -1) with note "สต็อคติดลบ — ตัดเกินคงเหลืออีก N ครั้ง". Investigate first, then fix all branches/products. Expected files: `src/lib/backendClient.js` `_deductOneItem` + `deductStockForTreatment` paths; check whether the per-row `skipStockDeduction` flag survives via `customer.courses[i].skipStockDeduction` to deduct path. V36 V-entry has related context.

## Outstanding (user-triggered, none blocking unless deploy)
- 🚨 V42 needs `vercel --prod` to take effect for new promotion buys via UI
- 🚨 NEW: skipStockDeduction flag ignored at treatment time (image-2 showed -1/-3/-1 for all 3 products despite ไม่ตัด flag)
- H-bis ProClinic full strip (deferred)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass
