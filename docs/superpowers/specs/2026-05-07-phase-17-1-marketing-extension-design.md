# Phase 17.1 Marketing Extension — Cross-Branch Import for Promotions / Coupons / Vouchers

**Status**: Approved (brainstorming 2026-05-07)
**Author**: Claude (with user)
**Related**: `2026-05-05-phase-17-1-cross-branch-master-data-import-design.md` (parent spec)

## Context

Phase 17.1 (commit shipped 2026-05-05) added a "Copy จากสาขาอื่น" admin button to 6 master-data tabs (products, courses, holidays, medical-instruments, product-units, product-groups, df-groups → 7 adapters total). The button uses a shared `CrossBranchImportModal` + per-entity adapter pattern (`src/lib/crossBranchImportAdapters/`) + a server endpoint (`api/admin/cross-branch-import.js`) to:

- Preview source-branch items grouped by status (importable / dup / fk-missing)
- User selects items via checkbox
- Server-side atomic batch write — N entity docs + 1 audit doc — with V39 `canonicalIdField` stamping (`productId === docId`, `courseId === docId`, etc.)

Phase 17.1's spec explicitly lists "NEW 3 marketing adapters: promotions, coupons, vouchers" as a follow-on sub-phase. This document is that spec.

The user verified the existing 7-adapter mechanism on real production data (V41 cross-branch-import test, 2026-05-07): copies from พระราม 3 → นครราชสีมา for products + courses succeeded with all 6 invariants passing per copied doc (branchId stamp, canonicalIdField === docId, scoped read at target, no leak to source, source-data preservation, edit/delete equivalence to native-created docs). Marketing entities now need the same guarantees.

## Goals

1. Add `promotionsAdapter`, `couponsAdapter`, `vouchersAdapter` to `src/lib/crossBranchImportAdapters/` registry (7 → 10).
2. Render `<CrossBranchImportButton>` in PromotionTab, CouponTab, VoucherTab (admin-only, hidden for non-admin via `useTabAccess.isAdmin`).
3. Verify post-copy invariants identical to Phase 17.1: `branchId === target`, `<canonical>Id === newDocId`, `data.id === newDocId`, scoped read includes the doc, no cross-branch leak, source business fields preserved, admin can edit + delete via standard UI handlers.
4. Tests: extend Phase 17.1 contract loop + new marketing-specific invariants + Rule I full-flow simulate.

## Non-goals

- No changes to firestore.rules (be_promotions/coupons/vouchers already allow read+write for clinic-staff).
- No changes to `vercel.json` (existing endpoint deploy works for any registered adapter).
- No new audit-invariant SKILL.md edits (AV18 V39 already covers `canonicalIdField` for all `ENTITY_TYPES` via the existing B7 source-grep loop).
- No master_data ↔ be_* migration changes (V39 already handled the migrate-button branchId stamp for marketing entities).
- No changes to existing `MarketingTabShell` or `PromotionFormModal`/`CouponFormModal`/`VoucherFormModal` validation logic.

## Architecture

```
                ┌─ promotionsAdapter ─┐
                │  coupons.adapter    │  registered in
src/lib/        │  vouchersAdapter    │─ ADAPTERS map
crossBranch     │                     │  ENTITY_TYPES = 10
ImportAdapters/ │  (each: ~40-60 LOC) │
                └─────────────────────┘
                          ▲
                          │ adapter.collection / dedupKey / fkRefs / clone / displayRow
                          │
PromotionTab.jsx ─→ <CrossBranchImportButton entityType="promotions">
CouponTab.jsx    ─→ <CrossBranchImportButton entityType="coupons">
VoucherTab.jsx   ─→ <CrossBranchImportButton entityType="vouchers">
                          ↓ user click
              CrossBranchImportModal (shared, no new component)
                          ↓ Import
              POST /api/admin/cross-branch-import
              (existing endpoint, no changes —
               getAdapter(entityType) lookup is generic)
                          ↓ atomic batch
              Firestore: be_promotions/{newId} + ... + be_admin_audit/{auditId}
```

The adapter contract (per Phase 17.1):
- `entityType: string` — registry key
- `collection: string` — Firestore collection name (be_*)
- `canonicalIdField: string` — V39 stamp field (`promotionId` etc.)
- `dedupKey: (item) => string` — what counts as duplicate at target
- `fkRefs: (item) => Array<{collection, ids}>` — refs that must resolve at target via dedupKey-based remap
- `clone: (item, targetBranchId, adminUid) => clonedDoc` — strips canonical fields, stamps target branchId + audit fields
- `displayRow: (item) => {primary, secondary, tertiary}` — preview-table row shape

## Adapter specifications

### promotionsAdapter (`src/lib/crossBranchImportAdapters/promotions.js`)

```js
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

Key choices (per brainstorming Q1, Q3):
- **dedupKey by name only** (not name+code) because `promotion_code` is OPTIONAL per `promotionValidation.js` empty-form. `promotion_name` is required.
- **fkRefs strict-block**: courses[] AND products[] embedded refs must resolve at target via dedupKey-remap. Mirrors `coursesAdapter.fkRefs` for items[].productId. User must copy products + courses before promotions can be copied (natural workflow).

### couponsAdapter (`src/lib/crossBranchImportAdapters/coupons.js`)

```js
export const couponsAdapter = {
  entityType: 'coupons',
  collection: 'be_coupons',
  canonicalIdField: 'couponId',
  dedupKey: (item) => String(item.coupon_code || ''),
  fkRefs: () => [],   // standalone — branch_ids[] is metadata, not FK
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { id, couponId, branch_ids, ...rest } = item;   // strip branch_ids
    return {
      ...rest,
      branchId: String(targetBranchId),
      branch_ids: [],   // V41 Q2 lock — reset to empty (defaults to all-branches)
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

Key choices:
- **dedupKey by `coupon_code`** because the validation requires it AND admins manually input unique codes (e.g. "SUMMER2026"). Two coupons with identical codes at the target would be a real conflict.
- **No FK refs**: standalone entity; `branch_ids[]` is a metadata array of branch IDs the coupon applies to, not a reference to other entities. (Branches are universal; no cross-branch FK semantics.)
- **`branch_ids` strip + reset**: per Q2 lock, the new coupon at target starts with `branch_ids: []` (= applies to all branches by default). Admin can edit later if they want to restrict to specific branches.

### vouchersAdapter (`src/lib/crossBranchImportAdapters/vouchers.js`)

```js
export const vouchersAdapter = {
  entityType: 'vouchers',
  collection: 'be_vouchers',
  canonicalIdField: 'voucherId',
  dedupKey: (item) => `${item.voucher_name || ''}:${item.platform || ''}`,
  fkRefs: () => [],   // standalone
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

Key choices:
- **dedupKey by `voucher_name:platform`** because vouchers can legitimately exist with the same name on different platforms (e.g. a "ลดราคา 1000฿" voucher on HDmall vs GoWabi are distinct items per platform's commission rules). Composite key avoids false-positive dedup.
- **No FK refs**: vouchers are standalone (commission_percent + sale_price + platform — no embedded courses/products array).

### Adapter registry update (`src/lib/crossBranchImportAdapters/index.js`)

```js
import productsAdapter from './products.js';
import productGroupsAdapter from './product-groups.js';
import productUnitsAdapter from './product-units.js';
import medicalInstrumentsAdapter from './medical-instruments.js';
import holidaysAdapter from './holidays.js';
import coursesAdapter from './courses.js';
import dfGroupsAdapter from './df-groups.js';
import promotionsAdapter from './promotions.js';   // NEW
import couponsAdapter from './coupons.js';         // NEW
import vouchersAdapter from './vouchers.js';       // NEW

export const ADAPTERS = {
  'products': productsAdapter,
  'product-groups': productGroupsAdapter,
  'product-units': productUnitsAdapter,
  'medical-instruments': medicalInstrumentsAdapter,
  'holidays': holidaysAdapter,
  'courses': coursesAdapter,
  'df-groups': dfGroupsAdapter,
  'promotions': promotionsAdapter,                  // NEW
  'coupons': couponsAdapter,                        // NEW
  'vouchers': vouchersAdapter,                      // NEW
};

export const ENTITY_TYPES = Object.keys(ADAPTERS);   // length: 7 → 10
// getAdapter / isKnownEntityType — no changes needed
```

## UI integration

### Tab edits

Each of the 3 marketing tabs needs ~5 LOC: 1 import + 1 button render block. Insert at the top of the tab content area, near `<MarketingTabShell>` opening or its first child container.

```jsx
// PromotionTab.jsx
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
// ... existing code ...
return (
  <MarketingTabShell ...>
    <div className="flex justify-end mb-2">
      <CrossBranchImportButton
        entityType="promotions"
        isDark={isDark}
        onImported={reload}
      />
    </div>
    {/* ... existing list/form ... */}
  </MarketingTabShell>
);

// CouponTab.jsx — same pattern, entityType="coupons"
// VoucherTab.jsx — same pattern, entityType="vouchers"
```

The `CrossBranchImportButton` (already shipped Phase 17.1) handles:
- Admin-only gate via `useTabAccess.isAdmin` → returns `null` for non-admin (button invisible)
- Opens shared `CrossBranchImportModal` on click
- Modal handles branch picker, preview table, dedup display, FK resolution display, import call, result panel

No new components. No new modal. No CSS changes. Existing `BranchSelector` integration is intact.

### Permission gate

Marketing tabs already have permission gates (`useHasPermission('promotion_management')` etc.). The Copy button is gated independently by `useTabAccess.isAdmin` (admin claim only — broader than per-tab management permission). This matches Phase 17.1 pattern: admins can copy across branches even if they don't have edit-access on a specific tab.

## Tests

### 1. Extend `tests/phase-17-1-cross-branch-import-adapters.test.js`

- Update **A1** registry contract suite:
  - Bump expected adapter count: `7 → 10`
  - Update `ENTITY_TYPES` array assertion to include `'promotions'`, `'coupons'`, `'vouchers'`
- The **A2** contract loop iterates `ENTITY_TYPES`; **automatically extends** to 10 adapters once registry update lands. No per-adapter loop body changes.
- Add **6 new entity-specific tests** (after the existing products/courses/etc. blocks):
  - `promotions.dedupKey({promotion_name: 'X'})` returns `'X'`
  - `promotions.fkRefs({courses:[{id:'C'}], products:[{id:'P'}]})` returns 2 ref groups
  - `promotions.fkRefs({})` returns `[]` (no refs when arrays absent)
  - `coupons.dedupKey({coupon_code: 'SUMMER'})` returns `'SUMMER'`
  - `coupons.clone({branch_ids: ['x']}, ...).branch_ids` deepEquals `[]` (Q2 lock anti-regression)
  - `vouchers.dedupKey({voucher_name: 'V', platform: 'HDmall'})` returns `'V:HDmall'`

### 2. NEW `tests/phase-17-1-marketing-extension.test.js` (~50 tests)

- **M1** (15 tests, 5 per adapter): adapter shape conformance — V39 contract (canonicalIdField present + 6 required keys + clone strips canonical + displayRow returns object with primary/secondary/tertiary)
- **M2** (8 tests): coupon `branch_ids` reset Q2 lock — null / empty / single / multi / preserves other fields / multiple-call idempotency / undefined input / no-key-when-source-lacks
- **M3** (6 tests): promotion FK refs — courses-only / products-only / both / neither / mixed-with-non-id / non-array inputs
- **M4** (6 tests): voucher dedupKey discriminator — same-name-different-platform produces different keys / null platform / empty platform / Thai chars / both fields missing
- **M5** (10 tests): source-grep regression guards — registry has 10 entries, ENTITY_TYPES contains the 3 new strings, each adapter file exports default + named, `index.js` imports all 3 with correct names
- **M6** (5 tests): UI integration source-grep — PromotionTab/CouponTab/VoucherTab each import `CrossBranchImportButton`, pass correct `entityType` literal, render inside MarketingTabShell

### 3. NEW `tests/phase-17-1-marketing-flow-simulate.test.js` (Rule I — ~10 tests)

Per Rule I (`.claude/rules/00-session-start.md`), every sub-phase that touches a user-visible flow must have a flow-simulate test chaining EVERY step.

- **F1** (3 tests): full chain — source doc → adapter.clone() → simulate endpoint stamp → verify final shape (branchId === target, canonicalIdField === newId, data.id === newId, branch_ids === [] for coupons)
- **F2** (3 tests): promotion FK resolution simulator — adapter.fkRefs returns refs in shape that endpoint's resolveFkAdapter expects; missingFKs detection works when target lacks dedupKey-matching FK targets
- **F3** (2 tests): V40 backup/restore round-trip — verify be_promotions/be_coupons/be_vouchers are in T1_COLLECTIONS in `branchBackupCore.js` (already are; lock against accidental removal)
- **F4** (2 tests): delete equivalence (V38 lock) — copied promotion's docId === promotionId; copied coupon's docId === couponId; copied voucher's docId === voucherId; handleDelete `p.<canonical>Id || p.id` resolves to docId in all cases

### Test discipline

- **Targeted run** per Rule N — new test files + the existing `phase-17-1-cross-branch-import-adapters.test.js`. NOT full suite during dev. Full suite at end-of-batch before commit.
- No new audit invariant skills needed — V39 AV18 already covers ENTITY_TYPES universally.
- Existing `tests/phase-24-0-vicies-novies-decies-migrate-button-coverage.test.js` B7 suite loops over ENTITY_TYPES — automatic extension.

## Verification

### Unit
```bash
npx vitest run tests/phase-17-1-cross-branch-import-adapters.test.js \
                tests/phase-17-1-marketing-extension.test.js \
                tests/phase-17-1-marketing-flow-simulate.test.js
# Expected: ~140 tests GREEN (existing extended + 60 new)
```

### Build
```bash
npm run build
# Expected: clean (no MISSING_EXPORT regressions; new adapter file imports resolve)
```

### Live E2E (admin-SDK script, mirrors V41 test pattern)

Extend `scripts/v41-test-cross-branch-import.mjs` ORDER list to include `'promotions'`, `'coupons'`, `'vouchers'`. Run dry-run first then `--apply`:

```bash
node scripts/v41-test-cross-branch-import.mjs --branch-source=BR-1777885958735-38afbdeb --branch-target=BR-1777873556815-26df6480
node scripts/v41-test-cross-branch-import.mjs ... --apply
```

For each marketing entity, the test verifies (mirrors V41's existing checks for products/courses):
1. branchId === target (นครราชสีมา)
2. canonicalIdField === newDocId (`promotionId`/`couponId`/`voucherId`)
3. `data.id === newDocId`
4. scopedRead(target) includes newDocId
5. scopedRead(source) EXCLUDES newDocId (no leak)
6. known business field preserved (promotion_name / coupon_code / voucher_name)
7. admin SDK edit works (modify a marker field, verify persist)
8. admin SDK delete works (verify gone)
9. **NEW for coupons**: `branch_ids === []` after copy (V41 Q2 lock)
10. **NEW for vouchers**: same-name-different-platform doesn't false-dedup
11. **NEW for promotions**: FK-blocking works when target lacks referenced courses/products (skippedFK populated correctly)

If source (พระราม 3) has no marketing entities populated, the "auto-import" tests for those entities skip (same as units/instruments/holidays/groups in the original V41 test). Manually-added TEST-V41-MARKETING-* fixtures can backfill if desired (but not required for adapter shape verification).

### UI smoke (user-driven)

After deploy or local dev server, user opens PromotionTab/CouponTab/VoucherTab as admin. Expected:
- Sees "Copy จากสาขาอื่น" button at top-right
- Click → modal opens with branch picker
- Pick a non-current branch → preview table loads with rows colored by status
- Select 1-2 rows + click Import → success banner with audit ID
- Reload → new rows appear in main list with target branchId stamped
- Edit a copied promo/coupon/voucher → save works
- Delete → row disappears from list

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Adapter contract drift between client preview + server batch (e.g. dedupKey computed differently) | Single source of truth: both sides import from `src/lib/crossBranchImportAdapters/` registry. Endpoint already does `getAdapter(entityType)` lookup. New adapters obey the same contract. |
| FK refs for promotions block ALL imports if products/courses haven't been copied first | This is intentional (Q1 lock — strict-block per V39 pattern). Modal preview shows skippedFK rows in red with tooltip explaining what's missing. Workflow educates admin to copy in dependency order. |
| Coupon `branch_ids` reset surprises admin (they expected source's array preserved) | Documented in displayRow tooltip + result-panel summary: "Copied coupons reset `branch_ids` to apply to all branches by default. Edit to restrict." |
| Voucher dedupKey collision when same-name-same-platform on source + target | Standard dedup behavior — modal displays as "duplicate" + skips. Admin can rename source voucher first if they want to copy a variant. |
| New adapter introduces MISSING_EXPORT at build time | Pre-commit `npm run build` per Rule 02. Phase 17.1 adapter contract test A1 catches missing registry entries; M5 source-grep tests catch import name typos. |
| User clicks Copy on PromotionTab when source has 0 promotions | Modal shows empty preview table with "ไม่มีรายการ" message. Same UX as existing tabs. |

## Out of scope

- Onboarding admin training material (separate concern)
- Bulk export of all 10 entity types in one click (could be a future Phase 17.2 — out of scope here)
- Cross-branch sync (auto-replicate changes between branches) — different feature; this is one-shot copy, not sync
- Copy from `master_data/*` (that's the existing migrate buttons in MasterDataTab, not cross-branch)
- Promotion/coupon/voucher field-level diff or merge UI for resolving conflicts (intentional: dedupKey-skip is the conflict resolution; admin manually resolves by editing afterwards)

## Implementation order (for the writing-plans skill)

1. Add 3 adapter files (promotions.js, coupons.js, vouchers.js)
2. Update registry index.js (add 3 imports + 3 entries)
3. Update PromotionTab.jsx + CouponTab.jsx + VoucherTab.jsx (5-line button render each)
4. Extend `tests/phase-17-1-cross-branch-import-adapters.test.js` (registry count + 6 entity-specific tests)
5. Add `tests/phase-17-1-marketing-extension.test.js` (~50 tests)
6. Add `tests/phase-17-1-marketing-flow-simulate.test.js` (~10 tests)
7. Optionally: extend `scripts/v41-test-cross-branch-import.mjs` ORDER + add the marketing-specific assertions (live admin-SDK e2e). User decides whether to run e2e against prod or skip (pre-existing tests are sufficient for shape verification).
8. Verify via `npm run build` + `npx vitest run tests/phase-17-1-* tests/phase-24-0-vicies-novies-decies-*` (targeted)
9. Commit + push (no deploy per `feedback_local_only_no_deploy` — endpoint already deployed)

## Authorization compliance

- ✅ Rule J HARD-GATE: brainstorming skill invoked + 3 design Q&As locked + spec written before any code
- ✅ Rule I full-flow simulate: F1-F4 in marketing-flow-simulate.test.js
- ✅ Rule N targeted-test-only: extension is small + scoped; full suite at end-of-batch
- ✅ V39 canonicalIdField pattern: stamped per-adapter
- ✅ V38 spread-order lock: list functions already use `{...d.data(), id: d.id}` (existing be_promotions/coupons/vouchers listers in backendClient.js)
- ✅ AV18 (V39 audit) extends automatically via ENTITY_TYPES loop
- ✅ feedback_no_real_action_in_preview_eval: live e2e via admin-SDK script (TEST-prefixed fixtures if needed), no UI clicks against prod
- ✅ feedback_local_only_no_deploy: no Vercel deploys (endpoint already deployed)
- ✅ Rule M not directly invoked (this is feature work, not data ops)

## Final-state guarantees (mirrors Task 1 V41 test results)

After this phase ships:

1. **Admin user UX**: identical "Copy จากสาขาอื่น" button on all 9 tabs that have it (6 master-data + 3 marketing)
2. **Copied data shape**: V39 invariants apply per copy
3. **Edit/delete equivalence**: copied promotion/coupon/voucher behaves identically to natively-created — same handlers, same scopedDataLayer routes, same Firestore rules, same V38 list-spread, same V39 canonicalIdField stamp
4. **No source data corruption**: source branch unchanged after any number of cross-branch copies
5. **Audit trail**: every cross-branch import creates a `be_admin_audit/cross-branch-import-{ts}-{uuid}` doc with `entityType`, `sourceBranchId`, `targetBranchId`, `imported[]`, `skippedDup[]`, `skippedFK[]`, `adminUid`, `adminEmail`
6. **Future-data guarantee**: any newly-created promotion/coupon/voucher at the target branch (after copy) has the same shape as copied ones (saveX handlers stamp canonicalIdField identically). User's "ทั้งที่มีในปัจจุบันและที่จะสร้างในอนาคต" requirement is satisfied via the unified shape contract.
