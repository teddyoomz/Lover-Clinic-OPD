# Phase 17.2-octies — `isCourseUsableInTreatment` shape-aware + cross-branch course-use tests

**Date**: 2026-05-05
**Status**: Design approved (brainstorming complete)
**Predecessor**: Phase 17.2-septies (`9046dcf`) — TFP reader field-name fix

## User report (verbatim, 2026-05-05)

> "นาย asdas dasd ยังมีคอร์สคงเหลืออยู่ แต่กดเข้าไปในหน้า TFP แล้วไม่เจอคอร์สที่เหลืออยู่ในช่องคอร์สเลย กดซื้อใหม่ก็ไม่มาโผล่ในช่องคอร์ส แถมไม่รู้ว่าตัดการรักษาได้จริงไหม ให้แก้ แล้วเขียนเทส ลองซื้อทุกประเภท แล้วตัดการรักษาทุกประเภทเลย ชักจะ error ไปกันใหญ่ละ"

User clarification on cross-branch contract:

> "คอร์สที่ติดตัวลูกค้าสามารถแสดงข้ามสาขา และตัดการรักษาข้ามสาขาได้นะ แต่ stock จะไปตัดของสาขานั้นๆแทน เช่น ซื้อ Allergan 100u ที่นครราชสีมา ลูกค้าจะสามารถไปตัดการรักษาที่พระราม 3 ได้ แต่ถ้าไปรักษาที่พระราม 3 จะตัดสต็อคสินค้า Allergan ที่พระราม 3 แทน ไม่เกี่ยวกับสต็อคของนครราชสีมา"

## Root cause (verified live via preview_eval against PROD Firestore)

`isCourseUsableInTreatment(c)` at [src/lib/treatmentBuyHelpers.js:714](../../../src/lib/treatmentBuyHelpers.js#L714) reads the FLAT-shape `c.qty` string (e.g. `"8 / 10 ครั้ง"`) and parses remaining/total. But the call site in [src/components/TreatmentFormPage.jsx:1982](../../../src/components/TreatmentFormPage.jsx#L1982) passes the GROUPED-shape output of `mapRawCoursesToForm`, which has `c.products[]` with per-product `remaining` and **no top-level `c.qty`**. Result: `qtyStr === ''` → `if (!qtyStr) return false` → ALL standard qty-tracked grouped courses rejected. Special types (เหมาตามจริง / บุฟเฟต์ / pick-at-treatment) survive because of their boolean flags checked first.

For asdas dasd (LC-26000001 at นครราชสีมา) — 15 raw entries → mapRawCoursesToForm produces 3 grouped courses (IV Drip 8/10, NSS 89/100, Vit C 26/30 remaining) → `isCourseUsableInTreatment` rejects all 3 → `customerCourseGroups.length === 0` → courses panel renders empty.

Phase 16.7-quinquies-ter (2026-04-29) introduced this filter assuming flat shape; the call site was already grouped — V12 shape-mismatch.

## Cross-branch contract (already architecturally supported)

| Layer | Behavior | Status |
|---|---|---|
| `getBackendCustomer(customerId)` | Reads customer doc — NO branch filter | ✓ universal |
| `mapRawCoursesToForm` | Maps full customer.courses[] regardless of branch | ✓ universal |
| `deductCourseItems` | Updates customer.courses[].qty (the customer wallet) | ✓ universal |
| `deductStockForTreatment({branchId})` | Stock batches at current treatment branch | ✓ branch-scoped |
| `_deductOneItem` name-fallback | Phase 17.2-sexies (`73771d9`): if productId doesn't resolve at current branch → `_resolveProductIdByName(name, branchId)` finds matching product at current branch by name | ✓ branch-scoped, threaded |

So the contract is in place. This phase fixes the visibility bug + locks the contract via tests.

## Fix

`src/lib/treatmentBuyHelpers.js` — extend `isCourseUsableInTreatment` to accept GROUPED shape:

```js
export function isCourseUsableInTreatment(c) {
  if (!c || typeof c !== 'object') return false;
  const courseType = String(c.courseType || '');
  const qtyStr = typeof c.qty === 'string' ? c.qty : '';
  // Special types — boolean flags + courseType marker (existing path)
  if (c.isRealQty || courseType === 'เหมาตามจริง' || qtyStr === 'เหมาตามจริง') return true;
  if (c.isBuffet || courseType === 'บุฟเฟต์' || qtyStr === 'บุฟเฟต์') return true;
  if (c.isPickAtTreatment || c.needsPickSelection) return true;

  // Phase 17.2-octies (2026-05-05) — GROUPED shape support. mapRawCoursesToForm
  // produces { products: [{ remaining, total, ... }] } without a top-level
  // qty string. Sum across products: any product with remaining > 0 keeps
  // the course usable. Empty products array falls through to flat-shape parse.
  if (Array.isArray(c.products) && c.products.length > 0) {
    return c.products.some(p => {
      const rem = parseFloat(String(p && p.remaining != null ? p.remaining : '').replace(/,/g, ''));
      return Number.isFinite(rem) && rem > 0;
    });
  }

  // Flat shape (legacy / direct customer.courses[] entry)
  if (!qtyStr) return false;
  const m = qtyStr.match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
  if (!m) return false;
  const remaining = parseFloat(m[1].replace(/,/g, ''));
  const total = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(remaining) || !Number.isFinite(total)) return false;
  return remaining > 0 && total > 0;
}
```

Backward-compatible: flat-shape path unchanged. Empty products array falls through to flat parse (preserves edge case where caller passes `c.products = []` with a valid `c.qty`).

## Test bank — 4 NEW files

### `tests/phase-17-2-octies-course-usable-shape-aware.test.js`
32 unit cases. 4 course types × 2 shapes × 4 qty states (full / partial / depleted / zero-total).
Includes asdas dasd repro: `{ courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ remaining: '8', total: '10' }] }` → true.

### `tests/phase-17-2-octies-course-pipeline-flow-simulate.test.js`
Rule I full-flow simulate. Per type, build raw customer.courses[] → mapRawCoursesToForm → isCourseUsableInTreatment → buildCustomerCourseGroups. Assert non-empty groups for partial courses, empty for depleted, special types preserved regardless.

### `tests/phase-17-2-octies-buy-deduct-roundtrip.test.js`
Same-branch buy → assign → render → deduct round-trip per type. Asserts customer.courses[] post-deduct shows reduced qty.remaining; matching deduction produces correct movement type.

### `tests/phase-17-2-octies-cross-branch-course-use.test.js` (CB-bank)
- **CB1** customer at A with course productId from A → TFP at B sees course visible (mapRawCoursesToForm + isCourseUsableInTreatment branch-blind)
- **CB2** select course-product → submit at B → `deductStockForTreatment` called with `{branchId: B}`
- **CB3** A's stock unchanged · B's stock reduced
- **CB4** name-fallback: A's productId not at B → `_resolveProductIdByName(name, B)` resolves B's matching product
- **CB5** customer.courses[].remaining decremented universally
- **CB6** adversarial: name not at B → fail-loud (Phase 15.7 / V36 contract preserved)
- **CB7** source-grep: TFP `deductStockForTreatment` callers pass `branchId: SELECTED_BRANCH_ID` (current treatment branch, NOT customer.branchId)

## Files touched

- MOD `src/lib/treatmentBuyHelpers.js` — `isCourseUsableInTreatment` shape-aware (~10 LOC)
- NEW 4 test files (~750 LOC total)

## Verification

1. `npm test -- --run` → 5234 + ~95 new tests
2. Live preview_eval (read-only): for asdas dasd, post-fix `customerCourseGroups.length >= 1` (was 0)
3. `npm run build` → clean

## Out of scope (deferred)

- "Buy new in TFP doesn't appear in course slot" — verify post-fix. Likely same root cause (buildPurchasedCourseEntry adds entries to `options.customerCourses` which then runs through the same `isCourseUsableInTreatment` filter — fix should resolve this too)
- TFP downstream consumers post Phase 17.2-septies (treatmentItems / billing field-name reads) — separate audit
- Render audit for `customerCourseGroups` aggregation — verify same `linkedSaleId` IV Drip entries collapse to ONE group
