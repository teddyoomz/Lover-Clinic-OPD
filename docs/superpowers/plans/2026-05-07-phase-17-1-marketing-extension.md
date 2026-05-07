# Phase 17.1 Marketing Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the existing "Copy จากสาขาอื่น" cross-branch-import feature (Phase 17.1, V39 pattern) to the 3 marketing tabs (PromotionTab, CouponTab, VoucherTab).

**Architecture:** Extend the existing 7-adapter registry (`src/lib/crossBranchImportAdapters/`) with 3 new adapters (promotions, coupons, vouchers). The shared `CrossBranchImportButton` + `CrossBranchImportModal` + server endpoint `/api/admin/cross-branch-import` already accept any registered `entityType` via `getAdapter()` lookup — no new endpoint, modal, or button component. Just 3 adapter files + 3 registry entries + 3 tab JSX edits + 3 test files.

**Tech Stack:** ES module (Node 20+) for adapters, Vitest 1.x for tests, React 19 + Vite 8 + Tailwind 3.4 for UI tabs. Firebase web SDK for Firestore CRUD (already wired via `scopedDataLayer`). Server endpoint uses firebase-admin SDK.

**Spec:** `docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md`

---

## File Structure

### Files to CREATE (6 new files)

| Path | Responsibility | LOC |
|---|---|---|
| `src/lib/crossBranchImportAdapters/promotions.js` | `promotionsAdapter` — dedupKey by `promotion_name`, fkRefs to courses[] + products[], strips canonical `promotionId`, displayRow with status + price + period | ~55 |
| `src/lib/crossBranchImportAdapters/coupons.js` | `couponsAdapter` — dedupKey by `coupon_code`, no fkRefs, strips `couponId` + resets `branch_ids` to `[]`, displayRow with discount + max_qty + dates | ~50 |
| `src/lib/crossBranchImportAdapters/vouchers.js` | `vouchersAdapter` — dedupKey by `voucher_name:platform`, no fkRefs, strips `voucherId`, displayRow with sale_price + commission% + platform | ~45 |
| `tests/phase-17-1-marketing-extension.test.js` | M1-M6 test suites — adapter shape, branch_ids reset, FK refs, voucher discriminator, registry source-grep, UI integration source-grep | ~250 |
| `tests/phase-17-1-marketing-flow-simulate.test.js` | F1-F4 Rule I full-flow — endpoint stamp simulator, FK resolution, V40 backup-tier inclusion, V38 delete-equivalence | ~150 |
| (none — using existing `scripts/v41-test-cross-branch-import.mjs` extended) | — | — |

### Files to MODIFY (5 files)

| Path | Change | Lines |
|---|---|---|
| `src/lib/crossBranchImportAdapters/index.js` | Add 3 imports + 3 entries to `ADAPTERS` map | +6 |
| `src/components/backend/PromotionTab.jsx` | Add `CrossBranchImportButton` import + render block in `extraFilters` | +5 |
| `src/components/backend/CouponTab.jsx` | Same | +5 |
| `src/components/backend/VoucherTab.jsx` | Same | +5 |
| `tests/phase-17-1-cross-branch-import-adapters.test.js` | A1.1 count `7→10`, A1.2 ENTITY_TYPES array, A2-loop entityTypes array, canonical idField mapping for new types, V14 anti-regression loop, new entity-specific dedupKey/fkRefs tests | +30 |

### Files NOT touched (verified spec)
- `api/admin/cross-branch-import.js` — endpoint already supports any registered adapter
- `src/components/backend/CrossBranchImportButton.jsx` — already shipped, admin-gate intact
- `src/components/backend/CrossBranchImportModal.jsx` — already shipped, accepts any `adapter` prop
- `firestore.rules` — `be_promotions/be_coupons/be_vouchers` already allow read/write for clinic-staff
- `vercel.json` — endpoint already deployed

---

## Tasks

### Task 1: Create `promotionsAdapter`

**Files:**
- Create: `src/lib/crossBranchImportAdapters/promotions.js`

- [ ] **Step 1: Write the adapter file**

Write `src/lib/crossBranchImportAdapters/promotions.js`:

```javascript
// ─── Cross-branch import adapter — promotions ──────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_promotions`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: promotion_name (validated required by promotionValidation.js;
//           promotion_code is OPTIONAL so unsuitable as primary key).
// fkRefs:   strict-block via courses[].id → be_courses + products[].id →
//           be_products. Mirrors coursesAdapter pattern for items[].productId.
//           User must copy products + courses BEFORE promotions can be
//           imported (natural dependency order).
// canonicalIdField: promotionId (V39 stamping pattern).
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const promotionsAdapter = {
  entityType: 'promotions',
  collection: 'be_promotions',
  canonicalIdField: 'promotionId',
  dedupKey: (item) => String(item.promotion_name || ''),
  fkRefs: (item) => {
    const refs = [];
    const courseIds = Array.isArray(item.courses)
      ? item.courses.map(c => c && c.id ? String(c.id) : null).filter(Boolean)
      : [];
    if (courseIds.length) refs.push({ collection: 'be_courses', ids: courseIds });
    const productIds = Array.isArray(item.products)
      ? item.products.map(p => p && p.id ? String(p.id) : null).filter(Boolean)
      : [];
    if (productIds.length) refs.push({ collection: 'be_products', ids: productIds });
    return refs;
  },
  // Clone: strip promotionId (server generates fresh), stamp branchId=target,
  // preserve createdAt+createdBy from source, new updatedAt+updatedBy=now+admin.
  // Strips stray `id` per V39 lock (legacy ProClinic numeric id can shadow
  // docId in list spread — V38 silent-no-op delete bug).
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { id, promotionId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.promotion_name || '(ไม่มีชื่อ)',
    secondary: `${item.status || 'active'} • ${item.category_name || '-'} • ฿${Number(item.sale_price || 0).toLocaleString('th-TH')}`,
    tertiary: item.has_promotion_period && item.promotion_period_start
      ? `${item.promotion_period_start} → ${item.promotion_period_end || '?'}`
      : null,
  }),
};

export default promotionsAdapter;
```

- [ ] **Step 2: Verify file syntax via build**

Run: `npm run build 2>&1 | tail -20`
Expected: build clean (no MISSING_EXPORT, no syntax error). The file exists but isn't imported anywhere yet, so build won't actually load it — but it confirms syntactic validity for next task.

- [ ] **Step 3: No commit yet** — wait for Tasks 2-3 to finish before committing the 3 adapters together.

---

### Task 2: Create `couponsAdapter`

**Files:**
- Create: `src/lib/crossBranchImportAdapters/coupons.js`

- [ ] **Step 1: Write the adapter file**

Write `src/lib/crossBranchImportAdapters/coupons.js`:

```javascript
// ─── Cross-branch import adapter — coupons ─────────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_coupons`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: coupon_code (REQUIRED + user-validated unique per
//           couponValidation.js; admins manually pick e.g. "SUMMER2026"
//           and would conflict with same code at target).
// fkRefs:   none — coupons are standalone. branch_ids[] is metadata
//           (list of branches the coupon applies to), NOT a FK reference.
// canonicalIdField: couponId.
// Special: clone resets branch_ids → [] per Q2 lock — fresh copy at target
//          applies to all branches by default; admin can edit to restrict.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const couponsAdapter = {
  entityType: 'coupons',
  collection: 'be_coupons',
  canonicalIdField: 'couponId',
  dedupKey: (item) => String(item.coupon_code || ''),
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    // Strip id + couponId + branch_ids (V41 Q2 lock — reset to []).
    const { id, couponId, branch_ids, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      branch_ids: [],
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => {
    const discountText = item.discount_type === 'baht'
      ? `฿${Number(item.discount || 0).toLocaleString('th-TH')}`
      : `${item.discount || 0}%`;
    return {
      primary: item.coupon_name || '(ไม่มีชื่อ)',
      secondary: `${item.coupon_code || '-'} • ${discountText} • max=${item.max_qty || 0}`,
      tertiary: item.start_date ? `${item.start_date} → ${item.end_date || '?'}` : null,
    };
  },
};

export default couponsAdapter;
```

- [ ] **Step 2: Verify file syntax**

Run: `node -e "import('./src/lib/crossBranchImportAdapters/coupons.js').then(m => console.log('ok:', m.default.entityType))" 2>&1`
Expected output: `ok: coupons`

- [ ] **Step 3: No commit yet**

---

### Task 3: Create `vouchersAdapter`

**Files:**
- Create: `src/lib/crossBranchImportAdapters/vouchers.js`

- [ ] **Step 1: Write the adapter file**

Write `src/lib/crossBranchImportAdapters/vouchers.js`:

```javascript
// ─── Cross-branch import adapter — vouchers ────────────────────────────────
// Phase 17.1 marketing extension (2026-05-07). Defines how `be_vouchers`
// items are dedup-checked, FK-validated, cloned, and rendered in the
// cross-branch import modal.
//
// dedupKey: voucher_name:platform — same name on different platforms
//           (HDmall, GoWabi, SkinX, Shopee, Tiktok) is legitimately
//           distinct (different commission rules, different sales channel).
//           Composite key avoids false-positive dedup.
// fkRefs:   none — vouchers are standalone (no embedded courses/products).
// canonicalIdField: voucherId.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

export const vouchersAdapter = {
  entityType: 'vouchers',
  collection: 'be_vouchers',
  canonicalIdField: 'voucherId',
  dedupKey: (item) => `${item.voucher_name || ''}:${item.platform || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { id, voucherId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.voucher_name || '(ไม่มีชื่อ)',
    secondary: `฿${Number(item.sale_price || 0).toLocaleString('th-TH')} • comm ${item.commission_percent || 0}% • ${item.platform || '-'}`,
    tertiary: item.has_period && item.period_start
      ? `${item.period_start} → ${item.period_end || '?'}`
      : null,
  }),
};

export default vouchersAdapter;
```

- [ ] **Step 2: Verify file syntax**

Run: `node -e "import('./src/lib/crossBranchImportAdapters/vouchers.js').then(m => console.log('ok:', m.default.entityType))" 2>&1`
Expected output: `ok: vouchers`

- [ ] **Step 3: No commit yet**

---

### Task 4: Update adapter registry

**Files:**
- Modify: `src/lib/crossBranchImportAdapters/index.js`

- [ ] **Step 1: Read current registry to confirm shape**

Run: `cat src/lib/crossBranchImportAdapters/index.js`
Expected: 7 import statements + ADAPTERS object with 7 entries.

- [ ] **Step 2: Add 3 new imports**

Edit `src/lib/crossBranchImportAdapters/index.js`. Replace the existing block:

```javascript
import productsAdapter from './products.js';
import productGroupsAdapter from './product-groups.js';
import productUnitsAdapter from './product-units.js';
import medicalInstrumentsAdapter from './medical-instruments.js';
import holidaysAdapter from './holidays.js';
import coursesAdapter from './courses.js';
import dfGroupsAdapter from './df-groups.js';
```

with:

```javascript
import productsAdapter from './products.js';
import productGroupsAdapter from './product-groups.js';
import productUnitsAdapter from './product-units.js';
import medicalInstrumentsAdapter from './medical-instruments.js';
import holidaysAdapter from './holidays.js';
import coursesAdapter from './courses.js';
import dfGroupsAdapter from './df-groups.js';
import promotionsAdapter from './promotions.js';
import couponsAdapter from './coupons.js';
import vouchersAdapter from './vouchers.js';
```

- [ ] **Step 3: Add 3 entries to ADAPTERS map**

Replace:

```javascript
export const ADAPTERS = {
  'products': productsAdapter,
  'product-groups': productGroupsAdapter,
  'product-units': productUnitsAdapter,
  'medical-instruments': medicalInstrumentsAdapter,
  'holidays': holidaysAdapter,
  'courses': coursesAdapter,
  'df-groups': dfGroupsAdapter,
};
```

with:

```javascript
export const ADAPTERS = {
  'products': productsAdapter,
  'product-groups': productGroupsAdapter,
  'product-units': productUnitsAdapter,
  'medical-instruments': medicalInstrumentsAdapter,
  'holidays': holidaysAdapter,
  'courses': coursesAdapter,
  'df-groups': dfGroupsAdapter,
  'promotions': promotionsAdapter,
  'coupons': couponsAdapter,
  'vouchers': vouchersAdapter,
};
```

`ENTITY_TYPES = Object.keys(ADAPTERS)` auto-extends — no other changes.

- [ ] **Step 4: Verify registry size**

Run: `node -e "import('./src/lib/crossBranchImportAdapters/index.js').then(m => console.log('count:', Object.keys(m.ADAPTERS).length, 'types:', m.ENTITY_TYPES))" 2>&1`
Expected output:
```
count: 10 types: [
  'products',          'product-groups',
  'product-units',     'medical-instruments',
  'holidays',          'courses',
  'df-groups',         'promotions',
  'coupons',           'vouchers'
]
```

- [ ] **Step 5: No commit yet** — Task 5 will run all tests then we commit the adapter+registry+tests batch.

---

### Task 5: Extend Phase 17.1 contract test bank

**Files:**
- Modify: `tests/phase-17-1-cross-branch-import-adapters.test.js`

- [ ] **Step 1: Update A1.1 count + A1.2 ENTITY_TYPES array**

Edit `tests/phase-17-1-cross-branch-import-adapters.test.js`. Replace:

```javascript
  it('A1.1 ADAPTERS has 7 entries', () => {
    expect(Object.keys(ADAPTERS).length).toBe(7);
  });
  it('A1.2 ENTITY_TYPES contains all 7 known types', () => {
    expect(ENTITY_TYPES.sort()).toEqual(['courses', 'df-groups', 'holidays', 'medical-instruments', 'product-groups', 'product-units', 'products'].sort());
  });
```

with:

```javascript
  it('A1.1 ADAPTERS has 10 entries (Phase 17.1 marketing extension)', () => {
    expect(Object.keys(ADAPTERS).length).toBe(10);
  });
  it('A1.2 ENTITY_TYPES contains all 10 known types', () => {
    expect(ENTITY_TYPES.sort()).toEqual([
      'coupons', 'courses', 'df-groups', 'holidays', 'medical-instruments',
      'product-groups', 'product-units', 'products', 'promotions', 'vouchers',
    ].sort());
  });
```

- [ ] **Step 2: Update A2 contract loop entityTypes array**

Replace:

```javascript
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
```

with:

```javascript
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups', 'promotions', 'coupons', 'vouchers']) {
```

- [ ] **Step 3: Add canonical idField mapping for new types**

Find the `clone strips id field` test block (around line 61-73). Replace its `idField` ternary chain:

```javascript
        const idField = adapter.collection === 'be_products' ? 'productId'
          : adapter.collection === 'be_product_groups' ? 'groupId'
          : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
          : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
          : adapter.collection === 'be_holidays' ? 'holidayId'
          : adapter.collection === 'be_courses' ? 'courseId'
          : adapter.collection === 'be_df_groups' ? 'dfGroupId'
          : 'id';
```

with:

```javascript
        const idField = adapter.collection === 'be_products' ? 'productId'
          : adapter.collection === 'be_product_groups' ? 'groupId'
          : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
          : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
          : adapter.collection === 'be_holidays' ? 'holidayId'
          : adapter.collection === 'be_courses' ? 'courseId'
          : adapter.collection === 'be_df_groups' ? 'dfGroupId'
          : adapter.collection === 'be_promotions' ? 'promotionId'
          : adapter.collection === 'be_coupons' ? 'couponId'
          : adapter.collection === 'be_vouchers' ? 'voucherId'
          : 'id';
```

- [ ] **Step 4: Update sourceItem fixture in clone-strips-id test**

Find the fixture line:

```javascript
        const sourceItem = { [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', branchId: 'BR-source' };
```

Replace with:

```javascript
        const sourceItem = { [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall', branchId: 'BR-source' };
```

- [ ] **Step 5: Update sourceItem fixtures in 3 other clone tests**

Replace this fixture (used in `clone stamps target branchId`):

```javascript
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X', courseName: 'X' }, 'BR-target', 'admin-uid');
```

with:

```javascript
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall' }, 'BR-target', 'admin-uid');
```

Same for `clone preserves createdAt + createdBy`:

```javascript
        const cloned = adapter.clone(
          { name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall', createdAt: '2026-01-01T00:00:00Z', createdBy: 'src-admin' },
          'BR-target',
          'tgt-admin'
        );
```

Same for `clone sets new updatedAt + updatedBy`:

```javascript
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall' }, 'BR-target', 'tgt-admin');
```

And `displayRow returns object with primary`:

```javascript
        const row = adapter.displayRow({ name: 'X', productName: 'X', productType: 'ยา', courseName: 'X', promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall' });
```

- [ ] **Step 6: Update V14 anti-regression loop entityTypes array**

Find at the bottom of the file:

```javascript
describe('Phase 17.1 — V14 anti-regression (no undefined leaves in clone output)', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
```

Replace with:

```javascript
describe('Phase 17.1 — V14 anti-regression (no undefined leaves in clone output)', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups', 'promotions', 'coupons', 'vouchers']) {
```

And the fixture inside that loop:

```javascript
      const cloned = getAdapter(entityType).clone(
        { name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', holidayType: 'specific', items: [], products: [], promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall' },
        'BR-target',
        'admin-uid'
      );
```

- [ ] **Step 7: Add entity-specific tests for new adapters**

After the existing `A2.holidays dedupKey includes holidayType` test (the last one in the entity-specific describe block), add:

```javascript
  it('A2.promotions dedupKey is promotion_name', () => {
    expect(getAdapter('promotions').dedupKey({ promotion_name: 'Summer Sale' })).toBe('Summer Sale');
  });

  it('A2.promotions fkRefs collects courses[].id + products[].id', () => {
    const refs = getAdapter('promotions').fkRefs({
      courses: [{ id: 'C-1' }, { id: 'C-2' }],
      products: [{ id: 'P-1' }],
    });
    expect(refs.length).toBe(2);
    expect(refs.find(r => r.collection === 'be_courses').ids).toEqual(['C-1', 'C-2']);
    expect(refs.find(r => r.collection === 'be_products').ids).toEqual(['P-1']);
  });

  it('A2.promotions fkRefs returns empty when no courses/products', () => {
    expect(getAdapter('promotions').fkRefs({})).toEqual([]);
  });

  it('A2.coupons dedupKey is coupon_code', () => {
    expect(getAdapter('coupons').dedupKey({ coupon_code: 'SUMMER2026' })).toBe('SUMMER2026');
  });

  it('A2.coupons clone resets branch_ids to []', () => {
    const cloned = getAdapter('coupons').clone(
      { coupon_code: 'X', coupon_name: 'X', branch_ids: ['28', '29', '30'] },
      'BR-target',
      'admin-uid'
    );
    expect(cloned.branch_ids).toEqual([]);
  });

  it('A2.coupons fkRefs returns empty (standalone)', () => {
    expect(getAdapter('coupons').fkRefs({})).toEqual([]);
  });

  it('A2.vouchers dedupKey is voucher_name:platform', () => {
    expect(getAdapter('vouchers').dedupKey({ voucher_name: 'Promo', platform: 'HDmall' })).toBe('Promo:HDmall');
    expect(getAdapter('vouchers').dedupKey({ voucher_name: 'Promo', platform: 'GoWabi' })).toBe('Promo:GoWabi');
  });

  it('A2.vouchers fkRefs returns empty (standalone)', () => {
    expect(getAdapter('vouchers').fkRefs({})).toEqual([]);
  });
```

- [ ] **Step 8: Run the test file**

Run: `npx vitest run tests/phase-17-1-cross-branch-import-adapters.test.js`
Expected: ALL pass (the existing 7 adapters' tests + new 10 adapters' contract loop + 3 new entity-specific tests).

If FAIL: re-check Tasks 1-4 syntax. The most common failures are:
- adapter file has typo in dedupKey → A2 entity-specific test fails
- registry index.js missed an entry → A1.1 count fails
- adapter.canonicalIdField missing → V14 walk hits undefined

- [ ] **Step 9: No commit yet** — wait for Tasks 6-7 (new test files) before commit batch.

---

### Task 6: Create marketing-extension test file

**Files:**
- Create: `tests/phase-17-1-marketing-extension.test.js`

- [ ] **Step 1: Write the file**

Write `tests/phase-17-1-marketing-extension.test.js`:

```javascript
// ─── Phase 17.1 marketing extension — adapter-specific invariants ──────────
// V41 marketing-extension lock tests. Run alongside
// phase-17-1-cross-branch-import-adapters.test.js (which has the generic
// contract loop). This file has the adversarial + source-grep + UI
// integration locks specific to the 3 marketing entities.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADAPTERS, ENTITY_TYPES, getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

const MARKETING_TYPES = ['promotions', 'coupons', 'vouchers'];
const REQUIRED_KEYS = ['entityType', 'collection', 'canonicalIdField', 'dedupKey', 'fkRefs', 'clone', 'displayRow'];

describe('M1 — adapter shape conformance (V39 contract per marketing entity)', () => {
  for (const t of MARKETING_TYPES) {
    describe(t, () => {
      const adapter = getAdapter(t);

      it(`M1.${t}.1 exports all required keys including canonicalIdField`, () => {
        for (const k of REQUIRED_KEYS) {
          expect(adapter[k], `missing key ${k}`).toBeDefined();
        }
      });

      it(`M1.${t}.2 canonicalIdField is the expected entity field`, () => {
        const expected = { promotions: 'promotionId', coupons: 'couponId', vouchers: 'voucherId' }[t];
        expect(adapter.canonicalIdField).toBe(expected);
      });

      it(`M1.${t}.3 collection matches be_<entity> pattern`, () => {
        const expected = { promotions: 'be_promotions', coupons: 'be_coupons', vouchers: 'be_vouchers' }[t];
        expect(adapter.collection).toBe(expected);
      });

      it(`M1.${t}.4 clone strips canonicalIdField`, () => {
        const idField = adapter.canonicalIdField;
        const sourceItem = {
          [idField]: 'SRC-CANON',
          promotion_name: 'X', coupon_code: 'X', voucher_name: 'X', platform: 'HDmall',
        };
        const cloned = adapter.clone(sourceItem, 'BR-target', 'admin-uid');
        // Note: V39 endpoint will re-stamp canonicalIdField after clone, but
        // the adapter clone itself should NOT carry source's canonical value.
        expect(cloned[idField]).toBeUndefined();
      });

      it(`M1.${t}.5 displayRow returns object with primary/secondary/tertiary`, () => {
        const row = adapter.displayRow({
          promotion_name: 'X', coupon_name: 'X', voucher_name: 'X',
          coupon_code: 'X', platform: 'HDmall',
        });
        expect(row).toHaveProperty('primary');
        expect(row).toHaveProperty('secondary');
        // tertiary may be null for items without dates
      });
    });
  }
});

describe('M2 — coupons branch_ids reset (Q2 lock)', () => {
  const adapter = getAdapter('coupons');

  it('M2.1 null branch_ids → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: null }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.2 empty array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: [] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.3 single-entry array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: ['28'] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.4 multi-entry array → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X', branch_ids: ['28', '29', '30'] }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.5 preserves other fields when stripping branch_ids', () => {
    const cloned = adapter.clone({
      coupon_code: 'SUMMER',
      coupon_name: 'Summer 2026',
      discount: 10,
      discount_type: 'percent',
      max_qty: 100,
      branch_ids: ['28', '29'],
    }, 'BR-T', 'admin');
    expect(cloned.coupon_code).toBe('SUMMER');
    expect(cloned.coupon_name).toBe('Summer 2026');
    expect(cloned.discount).toBe(10);
    expect(cloned.discount_type).toBe('percent');
    expect(cloned.max_qty).toBe(100);
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.6 idempotent — calling clone twice resets branch_ids each time', () => {
    const a = adapter.clone({ coupon_code: 'X', branch_ids: ['28'] }, 'BR-A', 'admin');
    const b = adapter.clone({ ...a, branch_ids: ['29'] }, 'BR-B', 'admin');
    expect(b.branch_ids).toEqual([]);
  });

  it('M2.7 undefined branch_ids → []', () => {
    const cloned = adapter.clone({ coupon_code: 'X' }, 'BR-T', 'a');
    expect(cloned.branch_ids).toEqual([]);
  });

  it('M2.8 source had no branch_ids key — output has empty array', () => {
    const cloned = adapter.clone({ coupon_code: 'X', coupon_name: 'Y' }, 'BR-T', 'a');
    expect('branch_ids' in cloned).toBe(true);
    expect(cloned.branch_ids).toEqual([]);
  });
});

describe('M3 — promotions FK refs', () => {
  const adapter = getAdapter('promotions');

  it('M3.1 courses-only — single ref group for courses', () => {
    const refs = adapter.fkRefs({ courses: [{ id: 'C-1' }] });
    expect(refs.length).toBe(1);
    expect(refs[0].collection).toBe('be_courses');
    expect(refs[0].ids).toEqual(['C-1']);
  });

  it('M3.2 products-only — single ref group for products', () => {
    const refs = adapter.fkRefs({ products: [{ id: 'P-1' }] });
    expect(refs.length).toBe(1);
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1']);
  });

  it('M3.3 both arrays — two ref groups', () => {
    const refs = adapter.fkRefs({ courses: [{ id: 'C-1' }], products: [{ id: 'P-1' }] });
    expect(refs.length).toBe(2);
  });

  it('M3.4 neither array — empty refs', () => {
    expect(adapter.fkRefs({})).toEqual([]);
  });

  it('M3.5 mixed valid + null id entries — only valid ids collected', () => {
    const refs = adapter.fkRefs({
      courses: [{ id: 'C-1' }, { id: null }, {}, { id: 'C-2' }],
      products: [{ id: '' }, { id: 'P-1' }],
    });
    expect(refs.find(r => r.collection === 'be_courses').ids).toEqual(['C-1', 'C-2']);
    expect(refs.find(r => r.collection === 'be_products').ids).toEqual(['P-1']);
  });

  it('M3.6 non-array inputs (defensive)', () => {
    expect(() => adapter.fkRefs({ courses: 'not-array' })).not.toThrow();
    expect(adapter.fkRefs({ courses: 'not-array' })).toEqual([]);
  });
});

describe('M4 — vouchers dedupKey discriminator (platform-aware)', () => {
  const adapter = getAdapter('vouchers');

  it('M4.1 same name different platforms → different keys', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: 'HDmall' }))
      .not.toBe(adapter.dedupKey({ voucher_name: 'Promo', platform: 'GoWabi' }));
  });

  it('M4.2 null platform yields name:', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: null })).toBe('Promo:');
  });

  it('M4.3 empty platform yields name:', () => {
    expect(adapter.dedupKey({ voucher_name: 'Promo', platform: '' })).toBe('Promo:');
  });

  it('M4.4 Thai chars preserved in voucher_name', () => {
    expect(adapter.dedupKey({ voucher_name: 'โปรโมชั่น A', platform: 'HDmall' }))
      .toBe('โปรโมชั่น A:HDmall');
  });

  it('M4.5 both fields missing → ":"', () => {
    expect(adapter.dedupKey({})).toBe(':');
  });

  it('M4.6 deterministic — same input twice yields same key', () => {
    const item = { voucher_name: 'X', platform: 'HDmall' };
    expect(adapter.dedupKey(item)).toBe(adapter.dedupKey(item));
  });
});

describe('M5 — registry source-grep regression', () => {
  it('M5.1 ADAPTERS has exactly 10 entries', () => {
    expect(Object.keys(ADAPTERS).length).toBe(10);
  });

  it('M5.2 ENTITY_TYPES contains all 3 marketing types', () => {
    for (const t of MARKETING_TYPES) {
      expect(ENTITY_TYPES).toContain(t);
    }
  });

  it('M5.3 index.js imports all 3 marketing adapters', () => {
    const src = readFileSync('src/lib/crossBranchImportAdapters/index.js', 'utf-8');
    expect(src).toMatch(/import promotionsAdapter from '\.\/promotions\.js';/);
    expect(src).toMatch(/import couponsAdapter from '\.\/coupons\.js';/);
    expect(src).toMatch(/import vouchersAdapter from '\.\/vouchers\.js';/);
  });

  it('M5.4 ADAPTERS map registers 3 marketing entries', () => {
    const src = readFileSync('src/lib/crossBranchImportAdapters/index.js', 'utf-8');
    expect(src).toMatch(/'promotions':\s*promotionsAdapter/);
    expect(src).toMatch(/'coupons':\s*couponsAdapter/);
    expect(src).toMatch(/'vouchers':\s*vouchersAdapter/);
  });

  it('M5.5 each marketing adapter file exists and exports default', () => {
    for (const t of MARKETING_TYPES) {
      const adapter = getAdapter(t);
      expect(adapter).toBeDefined();
      expect(typeof adapter.clone).toBe('function');
    }
  });

  it('M5.6 each marketing adapter strips its own canonicalIdField', () => {
    for (const t of MARKETING_TYPES) {
      const adapter = getAdapter(t);
      const idField = adapter.canonicalIdField;
      const cloned = adapter.clone({ [idField]: 'SRC' }, 'BR-T', 'a');
      expect(cloned[idField], `${t} should strip ${idField}`).toBeUndefined();
    }
  });

  it('M5.7 each marketing clone stamps target branchId', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({}, 'BR-TARGET', 'a');
      expect(cloned.branchId).toBe('BR-TARGET');
    }
  });

  it('M5.8 each marketing clone preserves createdAt + createdBy from source', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone(
        { createdAt: '2026-01-01T00:00:00Z', createdBy: 'src-admin' },
        'BR-T', 'tgt-admin'
      );
      expect(cloned.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(cloned.createdBy).toBe('src-admin');
    }
  });

  it('M5.9 each marketing clone sets new updatedBy', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({}, 'BR-T', 'tgt-admin');
      expect(cloned.updatedBy).toBe('tgt-admin');
    }
  });

  it('M5.10 each marketing clone strips stray `id` field (V39 lock)', () => {
    for (const t of MARKETING_TYPES) {
      const cloned = getAdapter(t).clone({ id: 'STRAY-1' }, 'BR-T', 'a');
      expect(cloned.id, `${t} should strip stray id`).toBeUndefined();
    }
  });
});

describe('M6 — UI integration source-grep (PromotionTab/CouponTab/VoucherTab)', () => {
  it('M6.1 PromotionTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/PromotionTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']promotions["']/);
  });

  it('M6.2 CouponTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/CouponTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']coupons["']/);
  });

  it('M6.3 VoucherTab imports CrossBranchImportButton', () => {
    const src = readFileSync('src/components/backend/VoucherTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+CrossBranchImportButton\s+from/);
    expect(src).toMatch(/<CrossBranchImportButton[\s\S]*?entityType=["']vouchers["']/);
  });

  it('M6.4 each tab passes onImported={reload}', () => {
    for (const file of ['PromotionTab.jsx', 'CouponTab.jsx', 'VoucherTab.jsx']) {
      const src = readFileSync(`src/components/backend/${file}`, 'utf-8');
      expect(src).toMatch(/onImported=\{reload\}/);
    }
  });

  it('M6.5 each tab passes isDark={isDark}', () => {
    for (const file of ['PromotionTab.jsx', 'CouponTab.jsx', 'VoucherTab.jsx']) {
      const src = readFileSync(`src/components/backend/${file}`, 'utf-8');
      expect(src).toMatch(/isDark=\{isDark\}/);
    }
  });
});
```

- [ ] **Step 2: Run the new test file**

Run: `npx vitest run tests/phase-17-1-marketing-extension.test.js`
Expected: M1, M2, M3, M4, M5 pass. **M6 will FAIL** because tabs aren't wired yet (Tasks 8-10).

- [ ] **Step 3: No commit yet**

---

### Task 7: Create marketing-flow-simulate test file

**Files:**
- Create: `tests/phase-17-1-marketing-flow-simulate.test.js`

- [ ] **Step 1: Write the file**

Write `tests/phase-17-1-marketing-flow-simulate.test.js`:

```javascript
// ─── Phase 17.1 marketing extension — Rule I full-flow simulate ────────────
// Per .claude/rules/00-session-start.md Rule I (full-flow simulate at sub-
// phase end), every sub-phase touching a user-visible flow must chain EVERY
// step. This file mirrors the v41-test-cross-branch-import.mjs pattern in
// pure JS (no Firestore writes) for the 3 marketing adapters.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

const SOURCE = 'BR-source-test';
const TARGET = 'BR-target-test';

/**
 * Mirror api/admin/cross-branch-import.js post-clone stamp logic:
 *   cloned.id = newId;
 *   if (adapter.canonicalIdField) cloned[canonicalIdField] = newId;
 */
function simulateEndpointStamp(adapter, sourceItem, newId) {
  const cloned = adapter.clone(sourceItem, TARGET, 'admin-uid');
  cloned.id = newId;
  if (adapter.canonicalIdField) cloned[adapter.canonicalIdField] = newId;
  return cloned;
}

describe('F1 — full chain: source → clone → endpoint stamp → final shape', () => {
  it('F1.1 promotions: branchId=target, promotionId=newId, id=newId', () => {
    const source = {
      id: 'SRC-PROMO-1',
      promotionId: 'SRC-PROMO-1',
      promotion_name: 'Summer Sale',
      sale_price: 1000,
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('promotions'), source, 'PROMOTIONS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.promotionId).toBe('PROMOTIONS_T_NEW1');
    expect(final.id).toBe('PROMOTIONS_T_NEW1');
    expect(final.promotion_name).toBe('Summer Sale');  // preserved
    expect(final.sale_price).toBe(1000);                // preserved
  });

  it('F1.2 coupons: branchId=target, couponId=newId, id=newId, branch_ids=[]', () => {
    const source = {
      id: 'SRC-COUP-1',
      couponId: 'SRC-COUP-1',
      coupon_code: 'SUMMER2026',
      coupon_name: 'Summer 2026',
      discount: 15,
      discount_type: 'percent',
      branch_ids: ['28', '29'],
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('coupons'), source, 'COUPONS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.couponId).toBe('COUPONS_T_NEW1');
    expect(final.id).toBe('COUPONS_T_NEW1');
    expect(final.coupon_code).toBe('SUMMER2026');
    expect(final.discount).toBe(15);
    expect(final.branch_ids).toEqual([]);  // V41 Q2 lock
  });

  it('F1.3 vouchers: branchId=target, voucherId=newId, id=newId', () => {
    const source = {
      id: 'SRC-VOU-1',
      voucherId: 'SRC-VOU-1',
      voucher_name: 'Promo HDmall',
      sale_price: 500,
      commission_percent: 30,
      platform: 'HDmall',
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('vouchers'), source, 'VOUCHERS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.voucherId).toBe('VOUCHERS_T_NEW1');
    expect(final.id).toBe('VOUCHERS_T_NEW1');
    expect(final.voucher_name).toBe('Promo HDmall');
    expect(final.platform).toBe('HDmall');
  });
});

describe('F2 — promotion FK resolution simulator', () => {
  const adapter = getAdapter('promotions');

  it('F2.1 fkRefs returns shape that matches endpoint resolveFkAdapter expectation', () => {
    const refs = adapter.fkRefs({
      courses: [{ id: 'C-1' }, { id: 'C-2' }],
      products: [{ id: 'P-1' }],
    });
    // Endpoint expects: [{ collection: 'be_*', ids: [...] }, ...]
    for (const ref of refs) {
      expect(ref).toHaveProperty('collection');
      expect(ref).toHaveProperty('ids');
      expect(Array.isArray(ref.ids)).toBe(true);
      expect(ref.collection).toMatch(/^be_/);
    }
  });

  it('F2.2 missingFKs detection — when target lacks the dedupKey-matching FK, ref appears in missingFKs', () => {
    // Simulate endpoint's classifier:
    //   for each FK ref, look up sourceFkLookup[col][refId] → dedupKey
    //   check if fkTargetIdSets[col].has(dedupKey)
    //   if not, push to missingFKs
    const promo = { courses: [{ id: 'C-source-1' }], products: [{ id: 'P-source-1' }] };
    const sourceFkLookup = {
      'be_courses': { 'C-source-1': 'CourseA' },
      'be_products': { 'P-source-1': 'ProductA' },
    };
    const fkTargetIdSets = {
      'be_courses': new Set(['CourseB']),  // CourseA NOT at target
      'be_products': new Set(['ProductA']),  // ProductA AT target
    };
    const refs = adapter.fkRefs(promo);
    const missingFKs = [];
    for (const ref of refs) {
      for (const refId of ref.ids) {
        const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
        if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
          missingFKs.push({ collection: ref.collection, sourceId: refId });
        }
      }
    }
    expect(missingFKs.length).toBe(1);
    expect(missingFKs[0].collection).toBe('be_courses');
    expect(missingFKs[0].sourceId).toBe('C-source-1');
  });

  it('F2.3 all-FK-present → empty missingFKs', () => {
    const promo = { courses: [{ id: 'C-1' }], products: [{ id: 'P-1' }] };
    const sourceFkLookup = {
      'be_courses': { 'C-1': 'CA' },
      'be_products': { 'P-1': 'PA' },
    };
    const fkTargetIdSets = {
      'be_courses': new Set(['CA']),
      'be_products': new Set(['PA']),
    };
    const refs = adapter.fkRefs(promo);
    const missingFKs = [];
    for (const ref of refs) {
      for (const refId of ref.ids) {
        const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
        if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
          missingFKs.push({ collection: ref.collection, sourceId: refId });
        }
      }
    }
    expect(missingFKs).toEqual([]);
  });
});

describe('F3 — V40 backup-tier inclusion (anti-regression)', () => {
  it('F3.1 be_promotions in T1_COLLECTIONS', () => {
    const src = readFileSync('src/lib/branchBackupCore.js', 'utf-8');
    // T1_COLLECTIONS literal block — be_promotions should appear in it
    expect(src).toMatch(/'be_promotions',/);
  });

  it('F3.2 be_coupons + be_vouchers in T1_COLLECTIONS', () => {
    const src = readFileSync('src/lib/branchBackupCore.js', 'utf-8');
    expect(src).toMatch(/'be_coupons',/);
    expect(src).toMatch(/'be_vouchers',/);
  });
});

describe('F4 — V38 delete equivalence (canonicalIdField === docId)', () => {
  it('F4.1 promotion handleDelete `p.promotionId || p.id` resolves to docId', () => {
    const adapter = getAdapter('promotions');
    const sourceItem = { promotionId: 'SRC', promotion_name: 'X' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'PROMOTIONS_T_NEW');
    // handleDelete pattern: const id = p.promotionId || p.id;
    const resolvedId = final.promotionId || final.id;
    expect(resolvedId).toBe('PROMOTIONS_T_NEW');
  });

  it('F4.2 coupon handleDelete `c.couponId || c.id` resolves to docId', () => {
    const adapter = getAdapter('coupons');
    const sourceItem = { couponId: 'SRC', coupon_code: 'X' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'COUPONS_T_NEW');
    const resolvedId = final.couponId || final.id;
    expect(resolvedId).toBe('COUPONS_T_NEW');
  });

  it('F4.3 voucher handleDelete `v.voucherId || v.id` resolves to docId', () => {
    const adapter = getAdapter('vouchers');
    const sourceItem = { voucherId: 'SRC', voucher_name: 'X', platform: 'HDmall' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'VOUCHERS_T_NEW');
    const resolvedId = final.voucherId || final.id;
    expect(resolvedId).toBe('VOUCHERS_T_NEW');
  });
});
```

- [ ] **Step 2: Run the new flow-simulate file**

Run: `npx vitest run tests/phase-17-1-marketing-flow-simulate.test.js`
Expected: ALL pass (F1.1-F4.3).

- [ ] **Step 3: No commit yet**

---

### Task 8: Wire CrossBranchImportButton into PromotionTab

**Files:**
- Modify: `src/components/backend/PromotionTab.jsx`

- [ ] **Step 1: Add import**

In `src/components/backend/PromotionTab.jsx`, find this import block (around line 8-15):

```javascript
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Tag, Calendar, Loader2 } from 'lucide-react';
import { listPromotions, deletePromotion } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import PromotionFormModal from './PromotionFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';
```

Add this line after the `MarketingTabShell` import:

```javascript
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
```

- [ ] **Step 2: Render the button in `extraFilters`**

Find the `extraFilters` JSX block (around line 106-120). Replace:

```javascript
  const extraFilters = (
    <>
      <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">หมวดหมู่ทั้งหมด</option>
        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        <option value="active">ใช้งาน</option>
        <option value="suspended">พักใช้งาน</option>
      </select>
    </>
  );
```

with:

```javascript
  const extraFilters = (
    <>
      <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">หมวดหมู่ทั้งหมด</option>
        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        <option value="active">ใช้งาน</option>
        <option value="suspended">พักใช้งาน</option>
      </select>
      <CrossBranchImportButton
        entityType="promotions"
        isDark={isDark}
        onImported={() => reload()}
      />
    </>
  );
```

- [ ] **Step 3: Verify M6.1 + M6.4 + M6.5 source-grep regression tests pass**

Run: `npx vitest run tests/phase-17-1-marketing-extension.test.js -t "M6.1"`
Expected: PASS (PromotionTab imports CrossBranchImportButton + entityType="promotions")

- [ ] **Step 4: No commit yet**

---

### Task 9: Wire CrossBranchImportButton into CouponTab

**Files:**
- Modify: `src/components/backend/CouponTab.jsx`

- [ ] **Step 1: Add import**

In `src/components/backend/CouponTab.jsx`, find this import block:

```javascript
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Ticket, Calendar, Loader2 } from 'lucide-react';
import { listCoupons, deleteCoupon } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import CouponFormModal from './CouponFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';
import { thaiTodayISO } from '../../utils.js';
```

Add this line after the `MarketingTabShell` import:

```javascript
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
```

- [ ] **Step 2: Render the button in `extraFilters`**

Find:

```javascript
  const extraFilters = (
    <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">ประเภททั้งหมด</option>
      <option value="percent">% ส่วนลด</option>
      <option value="baht">บาท</option>
    </select>
  );
```

Replace with:

```javascript
  const extraFilters = (
    <>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">ประเภททั้งหมด</option>
        <option value="percent">% ส่วนลด</option>
        <option value="baht">บาท</option>
      </select>
      <CrossBranchImportButton
        entityType="coupons"
        isDark={isDark}
        onImported={() => reload()}
      />
    </>
  );
```

(Note: the original `extraFilters` was a single `<select>`. Wrap in a fragment to add the button next to it.)

- [ ] **Step 3: Verify M6.2 + M6.4 + M6.5 source-grep regression tests pass**

Run: `npx vitest run tests/phase-17-1-marketing-extension.test.js -t "M6.2"`
Expected: PASS

- [ ] **Step 4: No commit yet**

---

### Task 10: Wire CrossBranchImportButton into VoucherTab

**Files:**
- Modify: `src/components/backend/VoucherTab.jsx`

- [ ] **Step 1: Add import**

In `src/components/backend/VoucherTab.jsx`, find:

```javascript
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Gift, Calendar, Loader2 } from 'lucide-react';
import { listVouchers, deleteVoucher } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import VoucherFormModal from './VoucherFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { VOUCHER_PLATFORMS } from '../../lib/voucherValidation.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';
```

Add this line after the `MarketingTabShell` import:

```javascript
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
```

- [ ] **Step 2: Render the button in `extraFilters`**

Find:

```javascript
  const extraFilters = (
    <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
      <option value="">Platform ทั้งหมด</option>
      {VOUCHER_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
```

Replace with:

```javascript
  const extraFilters = (
    <>
      <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
        <option value="">Platform ทั้งหมด</option>
        {VOUCHER_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <CrossBranchImportButton
        entityType="vouchers"
        isDark={isDark}
        onImported={() => reload()}
      />
    </>
  );
```

- [ ] **Step 3: Verify M6.3 + M6.4 + M6.5 source-grep regression tests pass**

Run: `npx vitest run tests/phase-17-1-marketing-extension.test.js -t "M6.3"`
Expected: PASS

- [ ] **Step 4: No commit yet**

---

### Task 11: Final verification + commit

**Files:**
- (verify only — no edits)

- [ ] **Step 1: Run all 3 phase-17-1 test files**

Run:
```bash
npx vitest run tests/phase-17-1-cross-branch-import-adapters.test.js tests/phase-17-1-marketing-extension.test.js tests/phase-17-1-marketing-flow-simulate.test.js
```

Expected: ALL pass. Approximately:
- `phase-17-1-cross-branch-import-adapters.test.js`: ~110 tests (existing 7 adapters × 13 contract tests + 3 new adapters × 13 + 14 entity-specific including new + 10 V14 anti-regression)
- `phase-17-1-marketing-extension.test.js`: ~50 tests (M1×15 + M2×8 + M3×6 + M4×6 + M5×10 + M6×5)
- `phase-17-1-marketing-flow-simulate.test.js`: ~10 tests (F1×3 + F2×3 + F3×2 + F4×3)

Total target: ~170 tests pass.

- [ ] **Step 2: Run V39 audit B7 source-grep test (auto-extends via ENTITY_TYPES loop)**

Run: `npx vitest run tests/phase-24-0-vicies-novies-decies-migrate-button-coverage.test.js`
Expected: PASS (this test loops over `ENTITY_TYPES`; auto-extends to 10 adapters).

- [ ] **Step 3: Build verification**

Run: `npm run build 2>&1 | tail -20`
Expected: clean build (no MISSING_EXPORT, no syntax error). Bundle should mention CrossBranchImportButton lazy-loaded into 3 marketing tab chunks (negligible size — button + modal share existing chunks).

- [ ] **Step 4: Stage all changes**

Run:
```bash
git add src/lib/crossBranchImportAdapters/promotions.js \
        src/lib/crossBranchImportAdapters/coupons.js \
        src/lib/crossBranchImportAdapters/vouchers.js \
        src/lib/crossBranchImportAdapters/index.js \
        src/components/backend/PromotionTab.jsx \
        src/components/backend/CouponTab.jsx \
        src/components/backend/VoucherTab.jsx \
        tests/phase-17-1-cross-branch-import-adapters.test.js \
        tests/phase-17-1-marketing-extension.test.js \
        tests/phase-17-1-marketing-flow-simulate.test.js \
        docs/superpowers/plans/2026-05-07-phase-17-1-marketing-extension.md
```

Run: `git status --short`
Expected: 8 modified + 5 added (3 adapters + 2 new test files; plan was added separately).

- [ ] **Step 5: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat(phase-17-1): cross-branch-import adapters for promo/coupon/voucher (3 marketing tabs)

Extends Phase 17.1 V39 cross-branch-import to the 3 marketing backend tabs.
Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md
Plan: docs/superpowers/plans/2026-05-07-phase-17-1-marketing-extension.md

Brainstorming locked 3 design decisions:
  Q1 (FK strategy for promotions) → block via fkRefs (strict, mirrors courses)
  Q2 (branch_ids on coupon copy) → reset to [] (defaults all-branches)
  Q3 (dedup keys) → natural identifiers per entity:
    promotions: promotion_name
    coupons:    coupon_code
    vouchers:   voucher_name:platform

Files:
  NEW src/lib/crossBranchImportAdapters/promotions.js  (V39 canonical=promotionId,
                                                        FK to courses[]+products[])
  NEW src/lib/crossBranchImportAdapters/coupons.js     (V39 canonical=couponId,
                                                        Q2 branch_ids reset)
  NEW src/lib/crossBranchImportAdapters/vouchers.js    (V39 canonical=voucherId,
                                                        platform-discriminator dedup)
  MOD src/lib/crossBranchImportAdapters/index.js       (registry 7→10)
  MOD src/components/backend/PromotionTab.jsx          (CrossBranchImportButton)
  MOD src/components/backend/CouponTab.jsx             (same)
  MOD src/components/backend/VoucherTab.jsx            (same)
  MOD tests/phase-17-1-cross-branch-import-adapters.test.js
                                                        (count 7→10, 3 entity-specific tests)
  NEW tests/phase-17-1-marketing-extension.test.js     (M1-M6, ~50 tests)
  NEW tests/phase-17-1-marketing-flow-simulate.test.js (Rule I F1-F4, ~10 tests)

No new endpoint, no new modal, no firestore.rules / vercel.json / storage.rules
changes. Endpoint /api/admin/cross-branch-import accepts any registered
adapter via getAdapter(entityType) lookup — registry update is sufficient.

Test coverage:
  ~170 tests across 3 files all PASS targeted run
  V39 AV18 audit + V40 backup-tier inclusion + V38 delete-equivalence covered
  Rule I full-flow simulate satisfied (F1-F4)
  Build clean

Authorization compliance:
  ✓ Rule J HARD-GATE: brainstorming skill invoked + 3 design Q&As locked +
    spec + user-reviewed before code
  ✓ Rule N targeted-test-only: extension is small + scoped
  ✓ feedback_local_only_no_deploy: no Vercel deploys (endpoint pre-deployed)
  ✓ feedback_no_real_action_in_preview_eval: scripts only (Task-1 V41 test
    proved mechanism on real prod for products+courses)

Final-state guarantees mirror V41 test results: V39 canonicalIdField stamp,
V38 list-spread lock, scoped read at target, no leak to source, source-data
preservation, edit/delete equivalence to native-created docs. Future-created
docs follow the same shape contract via existing saveX handlers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push**

Run: `git push origin master`
Expected: `ok master`

- [ ] **Step 7: Post-commit smoke test (manual UI verification — user-driven)**

After commit + push, the user can manually verify in the browser:

1. Open backend → PromotionTab as admin user
2. Sees "Copy จากสาขาอื่น" button next to status filter (purple-tinted)
3. Click → modal opens with branch picker
4. Pick `พระราม 3` (or another branch with promotions data)
5. Preview table loads — rows colored green (importable) / grey (dup) / red (FK-missing)
6. Select 1-2 rows → click Import
7. Success banner with audit ID
8. Reload PromotionTab → new rows appear with นครราชสีมา branchId
9. Edit a copied promo → save works → field persists
10. Delete a copied promo → row disappears

Repeat for CouponTab + VoucherTab. (Vouchers are the simplest — standalone.)

If any step fails, the script `scripts/v41-test-cross-branch-import.mjs` (already shipped) can be extended to verify via admin SDK against real prod (mirrors UI flow). User decides whether to extend the script or stop at UI smoke test.

---

## Self-Review

### 1. Spec coverage

Each spec section has at least one task implementing it:
- ✅ Architecture overview → Tasks 4 (registry), 8/9/10 (UI tabs)
- ✅ promotionsAdapter spec → Task 1
- ✅ couponsAdapter spec → Task 2
- ✅ vouchersAdapter spec → Task 3
- ✅ Adapter registry update → Task 4
- ✅ UI integration in 3 tabs → Tasks 8, 9, 10
- ✅ Phase 17.1 contract test extension → Task 5
- ✅ marketing-extension test bank (M1-M6) → Task 6
- ✅ marketing-flow-simulate (Rule I F1-F4) → Task 7
- ✅ V40 backup-tier preservation → F3 test in Task 7
- ✅ V38 delete equivalence → F4 test in Task 7
- ✅ V39 AV18 auto-extension → Task 11 step 2
- ✅ Final verification + commit → Task 11

### 2. Placeholder scan

No "TBD", "TODO", "implement later", or vague language found in any task. Every code block contains the exact code to write.

### 3. Type / signature consistency

- `canonicalIdField`: `'promotionId'` / `'couponId'` / `'voucherId'` consistent across spec, plan tasks, test fixtures, audit grep
- `entityType` strings: `'promotions'` / `'coupons'` / `'vouchers'` consistent across all references
- Collection names: `be_promotions` / `be_coupons` / `be_vouchers` consistent
- Adapter shape: 7 keys (`entityType`, `collection`, `canonicalIdField`, `dedupKey`, `fkRefs`, `clone`, `displayRow`) — required everywhere
- Test fixture sample item field names match adapter dedupKey expectations: `promotion_name`, `coupon_code`, `voucher_name`, `platform`
- Q2 lock: `branch_ids: []` on cloned coupons — consistent in spec + Task 2 adapter code + Task 5 entity-specific test + Task 6 M2 suite + Task 7 F1.2 simulate

No drift detected. Plan is internally consistent.
