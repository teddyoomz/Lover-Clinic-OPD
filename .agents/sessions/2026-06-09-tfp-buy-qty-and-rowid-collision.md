# 2026-06-09 EOD+1 — V162: TFP buy critical-path — qty-multiply divergence + per-purchase rowId/remove collision — COMMITTED, NOT deployed

## Summary
User-reported (ultracode, `/systematic-debugging`) two bugs on the buy/sale critical path:
1. **Bug #1 (qty)**: buy "IV Drip Chelation 1 ครั้ง" qty 3 → customer-course panel showed **1×** but the bill charged **3×** (10,500฿). Root: `buildPurchasedCourseEntry` products branch displayed `String(p.qty || item.qty)` (un-multiplied) while the sale charges `unitPrice × buyQty` AND `resolvePurchasedCourseForAssign` persists `p.qty × pQty` → **DISPLAY ≠ SALE ≠ PERSIST divergence**.
2. **Bug #2 (checkbox collision)**: buy the same course twice → ticking course-1's checkbox forced course-2's; deleting one purchase deleted both. Root: per-purchase identity (`rowId: purchased-${item.id}-row-${pid}`, `courseId: ...-${now}` but rowId had NO token) keyed off the MASTER `item.id` → COLLIDING rowIds in the `selectedCourseItems` Set + `removePurchasedItem`'s `courseId.startsWith(...master...)` matched both.

Investigation: 6-agent parallel workflow (Understand) + first-hand reads. **Rule Q caught Agent C's wrong "no collision" claim** (it confused courseId-with-`now` for item.id) — trusted the verified majority + my own reading.

## Fix (Rule P class-wide — course AND promo paths)
Unifying fix: a per-purchase **`purchaseUid`** threaded through every identity string + grouping key + remove-targeting, plus the display qty-multiply.
- `treatmentBuyHelpers.js` `buildPurchasedCourseEntry`: `uid` (opts.uid ?? now) in courseId + every rowId (`purchased-${id}-${uid}-row-${pid|idxN}`, `-row-self`); `buyQty = Math.max(1, item.qty)` multiplies sub-product remaining/total; stamps `purchaseUid`. Pick-at-treatment courseId → uid.
- `buildCustomerCourseGroups`: surfaces `purchaseUid`. `buildCustomerPromotionGroups`: buy-this-visit promos keyed `__addon__|${purchaseUid}` (+ `groupKey`/`purchaseUid`); existing promos keep `pid|`.
- `mapPromotionProductsToConsumables`: carries `purchaseUid`. `filterOutConsumablesForPromotion(c, pid, purchaseUid?)`: prefers purchaseUid (backward-compat 2-arg).
- `TreatmentFormPage.jsx`: `purchaseSeqRef` counter; `confirmBuyModal` mints `purchaseUid` per item → passes `{uid}` to helper + uses it in promo courseId/rowId; `removePurchasedItem` targets by `purchaseUid` (legacy master-prefix fallback); course+promo trash buttons pass purchaseUid; promo group render key → `group.groupKey`.

## Current State
- HEAD before this session: `10e2c266` (docs) on `b8351546` (4-fix). prod = `e56d2ac7`. **NOT deployed** (frontend-only, no firestore.rules → vercel-only when authorized; no Probe-Deploy-Probe).
- Verified: default vitest **16300/0** (16277 + 23 new) + build clean + extended `treatmentBuyHelpers` 54/54 + 8 affected runnable files 217/217 + **Rule Q L1 real-browser served-module** (display ×3 + `displayEqualsPersist:true` + distinct rowIds `…-uA-row-P` ≠ `…-uB-row-P` + checkboxIndependent + targeted-remove). All rowId/courseId consumers use `startsWith('purchased-'/'promo-')` → new uid-format compatible.

## Files Touched
Source: `src/lib/treatmentBuyHelpers.js` (buildPurchasedCourseEntry qty+uid+purchaseUid · buildCustomerCourseGroups · buildCustomerPromotionGroups · map/filter consumables) · `src/components/TreatmentFormPage.jsx` (purchaseSeqRef · confirmBuyModal mint+promo · removePurchasedItem target-by-uid · 2 trash buttons · promo group key)
Tests: NEW `tests/course-buy-qty-multiply-and-rowid-uniqueness.test.js` (23: A qty-multiply incl. display===persist · B rowId uniqueness/checkbox-independence · R targeted-remove · P promo parity · SG source-grep) + 4 V21 fixups in `tests/extended/treatmentBuyHelpers.test.js` (BPCE3/6 multiply, BPCE8/16 uid-rowId).
AV: audit-anti-vibe-code **AV190** (per-purchase uid + display===persist invariant).

## Decisions (1-line)
- Semantic = "1 card × N sessions" (matches the already-correct persist path), NOT N cards. Display fixed to match persist (persist was already correct, low-risk).
- Per-purchase `purchaseUid` from a counter ref (beats clock-resolution collisions); courseId+rowId both embed it. SaleTab already correct (qty×pQty, no in-session course-use UI) → no change needed.
- Promo path fixed for the SAME class (rowId/courseId uid + grouping-by-uid + targeted remove + consumables uid) per Rule P, even though user only reproduced regular courses.

## Known pre-existing (NOT this fix; flag)
- Extended suite (`npm run test:extended`) = 283/4699 fail across 46 RTL files — caused by **V50 (2026-05-08) deleting AppointmentTab/MasterDataTab/CloneTab.jsx** which those tests still import (167 load-error lines). Opt-in suite, not the tracked baseline. Spawned a task to clean the stale extended tests.

## Next Todo
- IDLE / await direction. If "deploy" → `vercel --prod` (frontend-only, no rules), then L1 hands-on: buy a course qty 3 → panel shows N× · buy same course twice → tick one (other stays) · delete one (other stays).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-09 EOD+1 (V162).
Read: CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: V162 committed+pushed (TFP buy qty-multiply + per-purchase rowId/remove collision, course+promo); default vitest 16300/0 + real-browser L1 green; NOT deployed.
Next: idle / await direction (deploy = vercel-only when authorized).
Rules: no deploy without "deploy" THIS turn (V18); Probe-Deploy-Probe on rules.
/session-start
