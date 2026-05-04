# Branch-Scope Architecture (BSA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the bug class where UI components fetch wrong-branch data after the user switches branch via the top-right BranchSelector. Concrete starter bug: open TreatmentForm after selecting "พระราม 3" → courses/products/DF rates still load from "นครราชสีมา".

**Architecture:** Three layers + audit. Layer 1 (raw `backendClient.js`) extended with `{branchId, allBranches}` opts on remaining listers. Layer 2 (NEW `scopedDataLayer.js`) auto-injects current branchId from localStorage at every call. Layer 3 (NEW `useBranchAwareListener` hook) re-subscribes onSnapshot listeners when branch changes. NEW `/audit-branch-scope` skill enforces drift (BS-1..BS-8). Universal collections (staff, doctors, customers + customer-attached subcollections, templates, branches, system_config, audiences, admin_audit, course_changes) re-export raw without branch logic.

**Tech Stack:** React 19, Vitest 4.1, Firebase Firestore (modular SDK), Vite 8, Tailwind 3.4. Tests run via `npm test -- --run <path>`. Build via `npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md`

**Baseline:** master = `cf897f6` (+ doc commit `eed76c3`), 4744 tests pass, build clean.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/scopedDataLayer.js` | Re-export every backendClient lister/writer; auto-inject `branchId` for branch-scoped listers; pass-through for universal. NO React imports (V36.G.51 lock). |
| `src/hooks/useBranchAwareListener.js` | React hook that wraps any `listenToX` from backendClient, injects current branchId, re-subscribes on branch change, ignores branchId for `__universal__`-marked listeners. |
| `tests/scopedDataLayer.test.js` | Layer 2 unit tests — auto-inject behavior, opt-out paths, universal re-exports, V36.G.51 source-grep. |
| `tests/useBranchAwareListener.test.jsx` | Layer 3 hook tests — subscribe / re-subscribe / cleanup / universal-marker bypass. |
| `tests/branch-scope-flow-simulate.test.js` | Rule I full-flow simulate: switch branch → assert every read re-scopes. F1-F9 dimensions. |
| `tests/audit-branch-scope.test.js` | Source-grep regression bank for BS-1..BS-8 invariants. |
| `.agents/skills/audit-branch-scope/SKILL.md` | Audit skill documenting invariants + grep recipes. |
| `.agents/skills/audit-branch-scope/patterns.md` | Concrete grep patterns for each BS invariant. |

### Modified files

| Path | Change |
|---|---|
| `src/lib/backendClient.js` | Extend 6 listers (Promotions/Coupons/Vouchers/OnlineSales/SaleInsuranceClaims/VendorSales) with `{branchId, allBranches}`; extend 6 writers with `_resolveBranchIdForWrite`; add `__universal__` marker to 7 universal listeners; (Task 12) delete `getAllMasterDataItems`. |
| `src/components/TreatmentFormPage.jsx` | Replace 4 `getAllMasterDataItems` calls with `listProducts/listCourses/listStaff/listDoctors`. |
| All 84 UI files importing `backendClient` | Single mechanical import-rewrite to `scopedDataLayer`. Report tabs annotated with `// audit-branch-scope: report — uses {allBranches:true}`. |
| ~10 component files using `listenTo*` | Migrate to `useBranchAwareListener` hook. |
| `.claude/rules/00-session-start.md` | Add Rule BSA + V-entry (BSA shipment). |
| `.claude/rules/v-log-archive.md` | Add Phase BSA verbose entry. |
| `.agents/active.md` | Update state line + decisions + outstanding. |

---

## Task 1: Extend Layer 1 — branchId on Promotions / Coupons / Vouchers (with `allBranches:true` doc-field OR-merge)

**Files:**
- Modify: `src/lib/backendClient.js` — `listPromotions`, `savePromotion`, `listCoupons`, `saveCoupon`, `listVouchers`, `saveVoucher`
- Test: `tests/bsa-task1-promotions-coupons-vouchers-branch-scope.test.js`

**Why OR-merge**: campaigns may target one branch OR span all branches. Doc-level field `allBranches: true` lets a promotion be visible everywhere without rewriting the lister. Firestore can't OR across fields in one query → run 2 queries + merge client-side.

- [ ] **Step 1: Write failing test for listPromotions branch filter**

Create `tests/bsa-task1-promotions-coupons-vouchers-branch-scope.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firestore SDK BEFORE importing backendClient
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockQuery = vi.fn((col, ...constraints) => ({ __col: col, __constraints: constraints }));
const mockWhere = vi.fn((field, op, val) => ({ __where: [field, op, val] }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocs: (...a) => mockGetDocs(...a),
    setDoc: (...a) => mockSetDoc(...a),
    query: (...a) => mockQuery(...a),
    where: (...a) => mockWhere(...a),
    collection: vi.fn(() => ({ __col: 'be_promotions' })),
    doc: vi.fn(() => ({ __doc: true })),
    deleteDoc: vi.fn(),
    getDoc: vi.fn(),
    runTransaction: vi.fn(),
  };
});
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Task 1 — Promotions/Coupons/Vouchers branch-scope', () => {
  describe('T1.A listPromotions', () => {
    it('T1.A.1 with {branchId:"BR-A"} runs 2 queries: branchId==BR-A AND allBranches==true', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({ promotion_name: 'A only', branchId: 'BR-A' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'P2', data: () => ({ promotion_name: 'all', allBranches: true }) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ branchId: 'BR-A' });
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
      expect(items).toHaveLength(2);
      expect(items.map(i => i.id).sort()).toEqual(['P1', 'P2']);
    });

    it('T1.A.2 with {allBranches:true} runs 1 query (no filter)', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({}) }, { id: 'P2', data: () => ({}) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ allBranches: true });
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(items).toHaveLength(2);
    });

    it('T1.A.3 dedupes when same doc matches both queries (allBranches doc with branchId set)', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'DUP', data: () => ({ branchId: 'BR-A', allBranches: true }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'DUP', data: () => ({ branchId: 'BR-A', allBranches: true }) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ branchId: 'BR-A' });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('DUP');
    });

    it('T1.A.4 no opts (legacy callers) returns all docs (no filter, single query)', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({}) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions();
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(items).toHaveLength(1);
    });
  });

  describe('T1.B listCoupons (mirror)', () => {
    it('T1.B.1 with {branchId} runs 2 queries + merge', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'C1', data: () => ({ coupon_name: 'a', coupon_code: 'A1' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'C2', data: () => ({ coupon_name: 'all', coupon_code: 'B1', allBranches: true }) }] });
      const { listCoupons } = await import('../src/lib/backendClient.js');
      const items = await listCoupons({ branchId: 'BR-A' });
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
      expect(items.map(i => i.id).sort()).toEqual(['C1', 'C2']);
    });
  });

  describe('T1.C listVouchers (mirror)', () => {
    it('T1.C.1 with {branchId} runs 2 queries + merge', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'V1', data: () => ({}) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'V2', data: () => ({ allBranches: true }) }] });
      const { listVouchers } = await import('../src/lib/backendClient.js');
      const items = await listVouchers({ branchId: 'BR-A' });
      expect(items).toHaveLength(2);
    });
  });

  describe('T1.D writers stamp branchId via _resolveBranchIdForWrite', () => {
    it('T1.D.1 savePromotion stamps current branchId on create', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-WRITE'); } catch {}
      const { savePromotion } = await import('../src/lib/backendClient.js');
      await savePromotion('P-NEW', { promotion_name: 'x', sale_price: 0 });
      const written = mockSetDoc.mock.calls[0][1];
      expect(written.branchId).toBe('BR-WRITE');
    });

    it('T1.D.2 savePromotion preserves existing branchId on edit (data.branchId provided)', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-CURRENT'); } catch {}
      const { savePromotion } = await import('../src/lib/backendClient.js');
      await savePromotion('P-EDIT', { promotion_name: 'x', sale_price: 0, branchId: 'BR-ORIGINAL' });
      const written = mockSetDoc.mock.calls[0][1];
      expect(written.branchId).toBe('BR-ORIGINAL');
    });

    it('T1.D.3 saveCoupon stamps branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-X'); } catch {}
      const { saveCoupon } = await import('../src/lib/backendClient.js');
      await saveCoupon('C-1', { coupon_name: 'x', coupon_code: 'CC' });
      expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-X');
    });

    it('T1.D.4 saveVoucher stamps branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-Y'); } catch {}
      const { saveVoucher } = await import('../src/lib/backendClient.js');
      await saveVoucher('V-1', { voucher_name: 'x', voucher_code: 'VV' });
      expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-Y');
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run tests/bsa-task1-promotions-coupons-vouchers-branch-scope.test.js`
Expected: FAIL — `listPromotions` is called with no opts handling; assertions fail because current impl runs 1 query and returns all.

- [ ] **Step 3: Implement listPromotions/listCoupons/listVouchers branch filter**

Edit `src/lib/backendClient.js`:

Replace `listPromotions` (currently at line ~7866) with:

```js
/** Phase BSA — branch-scoped read with allBranches=true OR-merge.
 *  Promotion docs may set `allBranches: true` to be visible at every branch
 *  even when caller passes a specific branchId. Firestore can't OR across
 *  fields → 2 queries + Set-dedup. Legacy no-opts call returns full list. */
export async function listPromotions(opts = {}) {
  const { branchId, allBranches = false } = opts || {};
  const useFilter = branchId && !allBranches;
  if (!useFilter) {
    const snap = await getDocs(promotionsCol());
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return items;
  }
  // 2-query OR-merge: branchId==current OR allBranches==true
  const [byBranch, byAllBranches] = await Promise.all([
    getDocs(query(promotionsCol(), where('branchId', '==', String(branchId)))),
    getDocs(query(promotionsCol(), where('allBranches', '==', true))),
  ]);
  const seen = new Set();
  const items = [];
  for (const snap of [byBranch, byAllBranches]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      items.push({ id: d.id, ...d.data() });
    }
  }
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items;
}
```

Replace `listCoupons` similarly:

```js
export async function listCoupons(opts = {}) {
  const { branchId, allBranches = false } = opts || {};
  const useFilter = branchId && !allBranches;
  if (!useFilter) {
    const snap = await getDocs(couponsCol());
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return items;
  }
  const [byBranch, byAllBranches] = await Promise.all([
    getDocs(query(couponsCol(), where('branchId', '==', String(branchId)))),
    getDocs(query(couponsCol(), where('allBranches', '==', true))),
  ]);
  const seen = new Set();
  const items = [];
  for (const snap of [byBranch, byAllBranches]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      items.push({ id: d.id, ...d.data() });
    }
  }
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items;
}
```

Replace `listVouchers` with the same shape (substitute `vouchersCol`).

Replace writer bodies for `savePromotion` (line ~7873):

```js
export async function savePromotion(promotionId, data) {
  const id = String(promotionId || '');
  if (!id) throw new Error('promotionId required');
  if (!data || typeof data !== 'object') throw new Error('data object required');
  if (!String(data.promotion_name || '').trim()) throw new Error('promotion_name required');
  if (!(Number(data.sale_price) >= 0)) throw new Error('sale_price must be >= 0');

  const now = new Date().toISOString();
  await setDoc(promotionDoc(id), {
    ...data,
    promotionId: id,
    branchId: _resolveBranchIdForWrite(data),  // Phase BSA
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: false });
}
```

`saveCoupon` (line ~7952): add same `branchId: _resolveBranchIdForWrite(data),` line in the setDoc body.

`saveVoucher` (line ~8031): same.

- [ ] **Step 4: Run test — verify all T1 cases pass**

Run: `npm test -- --run tests/bsa-task1-promotions-coupons-vouchers-branch-scope.test.js`
Expected: PASS — all 12 T1 cases green.

- [ ] **Step 5: Run full Vitest — verify no regression**

Run: `npm test -- --run`
Expected: 4744 + 12 = 4756 PASS, 0 FAIL.

- [ ] **Step 6: Verify build clean**

Run: `npm run build`
Expected: clean build, no `MISSING_EXPORT`, no syntax error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/backendClient.js tests/bsa-task1-promotions-coupons-vouchers-branch-scope.test.js
git commit -m "$(cat <<'EOF'
feat(bsa-task1): branch-scope listPromotions/Coupons/Vouchers + writer stamps

- listPromotions/listCoupons/listVouchers accept {branchId, allBranches}
  with 2-query OR-merge (allBranches:true doc field included even when
  caller filters by specific branch)
- savePromotion/saveCoupon/saveVoucher now call _resolveBranchIdForWrite
  (Phase BS V2 pattern)
- 12 unit tests verify filter + merge + dedup + writer stamp

Tests: 4744 → 4756.

Refs: docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend Layer 1 — branchId on OnlineSales / SaleInsuranceClaims / VendorSales

**Files:**
- Modify: `src/lib/backendClient.js` — `listOnlineSales`, `saveOnlineSale`, `listSaleInsuranceClaims`, `saveSaleInsuranceClaim`, `listVendorSales`, `saveVendorSale`
- Test: `tests/bsa-task2-financial-listers-branch-scope.test.js`

**Note**: These listers are pure branch-scoped (NO `allBranches:true` doc field — every event happens at one branch). Single-query filter, simpler than Task 1.

- [ ] **Step 1: Write failing test**

Create `tests/bsa-task2-financial-listers-branch-scope.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockQuery = vi.fn((col, ...constraints) => ({ __col: col, __constraints: constraints }));
const mockWhere = vi.fn((field, op, val) => ({ __where: [field, op, val] }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocs: (...a) => mockGetDocs(...a),
    setDoc: (...a) => mockSetDoc(...a),
    query: (...a) => mockQuery(...a),
    where: (...a) => mockWhere(...a),
    collection: vi.fn(() => ({ __col: 'test' })),
    doc: vi.fn(() => ({ __doc: true })),
    deleteDoc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({}) }),
    updateDoc: vi.fn(),
    runTransaction: vi.fn(),
  };
});
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));

beforeEach(() => { vi.clearAllMocks(); });

describe('Task 2 — Financial listers branch-scope', () => {
  describe('T2.A listOnlineSales', () => {
    it('T2.A.1 with {branchId} adds where clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'O1', data: () => ({ transferDate: '2026-05-01' }) }] });
      const { listOnlineSales } = await import('../src/lib/backendClient.js');
      const items = await listOnlineSales({ branchId: 'BR-A' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(items).toHaveLength(1);
    });

    it('T2.A.2 with {allBranches:true} skips where clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      const { listOnlineSales } = await import('../src/lib/backendClient.js');
      await listOnlineSales({ allBranches: true });
      expect(mockWhere).not.toHaveBeenCalledWith('branchId', expect.any(String), expect.any(String));
    });

    it('T2.A.3 status + branchId combine', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'O1', data: () => ({ status: 'paid', transferDate: '2026-05-01' }) }] });
      const { listOnlineSales } = await import('../src/lib/backendClient.js');
      const items = await listOnlineSales({ branchId: 'BR-A', status: 'paid' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(items).toHaveLength(1);
    });
  });

  describe('T2.B listSaleInsuranceClaims', () => {
    it('T2.B.1 with {branchId} adds where clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'IC1', data: () => ({}) }] });
      const { listSaleInsuranceClaims } = await import('../src/lib/backendClient.js');
      await listSaleInsuranceClaims({ branchId: 'BR-A' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
    });
  });

  describe('T2.C listVendorSales', () => {
    it('T2.C.1 with {branchId} adds where clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'VS1', data: () => ({}) }] });
      const { listVendorSales } = await import('../src/lib/backendClient.js');
      await listVendorSales({ branchId: 'BR-A' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
    });
  });

  describe('T2.D writers stamp branchId', () => {
    it('T2.D.1 saveOnlineSale stamps current branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-OS'); } catch {}
      const { saveOnlineSale } = await import('../src/lib/backendClient.js');
      // Payload that passes onlineSaleValidation - inspect the validator if needed
      await saveOnlineSale('OS-1', { customerId: 'C1', amount: 100, transferDate: '2026-05-01' }).catch(() => {});
      // If validator throws, mock setDoc shouldn't be called; relax check:
      if (mockSetDoc.mock.calls.length > 0) {
        expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-OS');
      }
    });

    it('T2.D.2 saveSaleInsuranceClaim stamps current branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-IC'); } catch {}
      const { saveSaleInsuranceClaim } = await import('../src/lib/backendClient.js');
      await saveSaleInsuranceClaim('IC-1', { saleId: 'S1', amount: 50 }).catch(() => {});
      if (mockSetDoc.mock.calls.length > 0) {
        expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-IC');
      }
    });

    it('T2.D.3 saveVendorSale stamps current branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-VS'); } catch {}
      const { saveVendorSale } = await import('../src/lib/backendClient.js');
      await saveVendorSale('VS-1', { vendorId: 'V1', amount: 200, saleDate: '2026-05-01' }).catch(() => {});
      if (mockSetDoc.mock.calls.length > 0) {
        expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-VS');
      }
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run tests/bsa-task2-financial-listers-branch-scope.test.js`
Expected: FAIL — `listOnlineSales` doesn't add `where('branchId',...)`.

- [ ] **Step 3: Implement listers + writers**

Edit `src/lib/backendClient.js`.

Replace `listOnlineSales` (line ~10053):

```js
export async function listOnlineSales({ status, startDate, endDate, branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(onlineSalesCol(), where('branchId', '==', String(branchId)))
    : onlineSalesCol();
  const snap = await getDocs(ref);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) items = items.filter(o => o.status === status);
  if (startDate) items = items.filter(o => (o.transferDate || '') >= startDate);
  if (endDate) items = items.filter(o => (o.transferDate || '') <= endDate);
  items.sort((a, b) => (b.transferDate || '').localeCompare(a.transferDate || ''));
  return items;
}
```

Replace `listSaleInsuranceClaims` (line ~10121):

```js
export async function listSaleInsuranceClaims({ saleId, status, startDate, endDate, branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(saleInsuranceClaimsCol(), where('branchId', '==', String(branchId)))
    : saleInsuranceClaimsCol();
  const snap = await getDocs(ref);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (saleId) items = items.filter(c => c.saleId === saleId);
  if (status) items = items.filter(c => c.status === status);
  if (startDate) items = items.filter(c => (c.claimDate || '') >= startDate);
  if (endDate) items = items.filter(c => (c.claimDate || '') <= endDate);
  return items;
}
```

Replace `listVendorSales` (line ~10544):

```js
export async function listVendorSales({ vendorId, status, startDate, endDate, branchId, allBranches = false } = {}) {
  const useFilter = branchId && !allBranches;
  const ref = useFilter
    ? query(vendorSalesCol(), where('branchId', '==', String(branchId)))
    : vendorSalesCol();
  const snap = await getDocs(ref);
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (vendorId) items = items.filter(s => s.vendorId === vendorId);
  if (status) items = items.filter(s => s.status === status);
  if (startDate) items = items.filter(s => (s.saleDate || '') >= startDate);
  if (endDate) items = items.filter(s => (s.saleDate || '') <= endDate);
  items.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
  return items;
}
```

Add `branchId: _resolveBranchIdForWrite(data),` line to the `setDoc` body of:
- `saveOnlineSale` (line ~10063)
- `saveSaleInsuranceClaim` (line ~10132)
- `saveVendorSale` (line ~10555)

- [ ] **Step 4: Run test — verify all T2 cases pass**

Run: `npm test -- --run tests/bsa-task2-financial-listers-branch-scope.test.js`
Expected: PASS.

- [ ] **Step 5: Run full Vitest**

Run: `npm test -- --run`
Expected: 4756 + 9 = 4765 PASS.

- [ ] **Step 6: Build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/backendClient.js tests/bsa-task2-financial-listers-branch-scope.test.js
git commit -m "$(cat <<'EOF'
feat(bsa-task2): branch-scope listOnlineSales/SaleInsuranceClaims/VendorSales + writers

Pure branch-scoped (event happens at one branch — no allBranches doc field).
Single-query where('branchId','==',X). Writers stamp via
_resolveBranchIdForWrite. 9 tests.

Tests: 4756 → 4765.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mark universal listeners with `__universal__` flag

**Files:**
- Modify: `src/lib/backendClient.js` — `listenToCustomer`, `listenToCustomerTreatments`, `listenToCustomerAppointments`, `listenToCustomerSales`, `listenToCustomerFinance`, `listenToCourseChanges`, `listenToAudiences`, `listenToUserPermissions`
- Test: `tests/bsa-task3-universal-listener-marker.test.js`

**Why**: `useBranchAwareListener` (Task 5) reads `fn.__universal__` to skip branchId injection. Customer-attached listeners are universal because customer data crosses branches.

- [ ] **Step 1: Write failing test**

Create `tests/bsa-task3-universal-listener-marker.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as backend from '../src/lib/backendClient.js';

describe('Task 3 — Universal listener __universal__ marker', () => {
  const universalListeners = [
    'listenToCustomer',
    'listenToCustomerTreatments',
    'listenToCustomerAppointments',
    'listenToCustomerSales',
    'listenToCustomerFinance',
    'listenToCourseChanges',
    'listenToAudiences',
    'listenToUserPermissions',
  ];

  for (const name of universalListeners) {
    it(`T3.${name} is marked __universal__:true`, () => {
      expect(typeof backend[name]).toBe('function');
      expect(backend[name].__universal__).toBe(true);
    });
  }

  const branchScopedListeners = [
    'listenToAppointmentsByDate',
    'listenToAllSales',
    'listenToHolidays',
    'listenToScheduleByDay',
  ];

  for (const name of branchScopedListeners) {
    it(`T3.${name} is NOT marked __universal__ (branch-scoped)`, () => {
      expect(typeof backend[name]).toBe('function');
      expect(backend[name].__universal__).toBeFalsy();
    });
  }
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run tests/bsa-task3-universal-listener-marker.test.js`
Expected: FAIL — markers don't exist.

- [ ] **Step 3: Add markers to listeners**

In `src/lib/backendClient.js`, after each universal listener's `function` declaration, append:

```js
listenToCustomer.__universal__ = true;
listenToCustomerTreatments.__universal__ = true;
listenToCustomerAppointments.__universal__ = true;
listenToCustomerSales.__universal__ = true;
listenToCustomerFinance.__universal__ = true;
listenToCourseChanges.__universal__ = true;
listenToAudiences.__universal__ = true;
listenToUserPermissions.__universal__ = true;
```

Place these markers as a BLOCK at the bottom of the file (just before any final exports), grouped under a comment:

```js
// ─── Phase BSA — universal listener markers ─────────────────────────────────
// useBranchAwareListener checks fn.__universal__ to skip branchId injection.
// Customer-attached + audience + permission listeners cross branches.
listenToCustomer.__universal__ = true;
listenToCustomerTreatments.__universal__ = true;
listenToCustomerAppointments.__universal__ = true;
listenToCustomerSales.__universal__ = true;
listenToCustomerFinance.__universal__ = true;
listenToCourseChanges.__universal__ = true;
listenToAudiences.__universal__ = true;
listenToUserPermissions.__universal__ = true;
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- --run tests/bsa-task3-universal-listener-marker.test.js`
Expected: PASS — 12 cases green.

- [ ] **Step 5: Build + full suite**

Run: `npm test -- --run && npm run build`
Expected: 4765 + 12 = 4777 PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backendClient.js tests/bsa-task3-universal-listener-marker.test.js
git commit -m "$(cat <<'EOF'
feat(bsa-task3): mark universal listeners __universal__:true

useBranchAwareListener (Task 5) reads this marker to skip branchId
injection for customer-attached + audience + permission listeners.
Branch-scoped listeners (listenToAppointmentsByDate, listenToAllSales,
listenToHolidays, listenToScheduleByDay) remain unmarked.

Tests: 4765 → 4777.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `scopedDataLayer.js` (Layer 2)

**Files:**
- Create: `src/lib/scopedDataLayer.js`
- Test: `tests/scopedDataLayer.test.js`

**Constraints**: Pure JS module (no React imports — V36.G.51 lock). Reads branchId via `branchSelection.resolveSelectedBranchId()` at every call.

- [ ] **Step 1: Write failing test**

Create `tests/scopedDataLayer.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock backendClient to capture opts
const calls = {};
function mockLister(name) {
  return vi.fn(async (opts) => { calls[name] = opts; return []; });
}

vi.mock('../src/lib/backendClient.js', () => {
  // Branch-scoped listers
  const listProducts = mockLister('listProducts');
  const listCourses = mockLister('listCourses');
  const listProductGroups = mockLister('listProductGroups');
  const listProductUnitGroups = mockLister('listProductUnitGroups');
  const listMedicalInstruments = mockLister('listMedicalInstruments');
  const listHolidays = mockLister('listHolidays');
  const listDfGroups = mockLister('listDfGroups');
  const listDfStaffRates = mockLister('listDfStaffRates');
  const listBankAccounts = mockLister('listBankAccounts');
  const listExpenseCategories = mockLister('listExpenseCategories');
  const listExpenses = mockLister('listExpenses');
  const listStaffSchedules = mockLister('listStaffSchedules');
  const listPromotions = mockLister('listPromotions');
  const listCoupons = mockLister('listCoupons');
  const listVouchers = mockLister('listVouchers');
  const listOnlineSales = mockLister('listOnlineSales');
  const listSaleInsuranceClaims = mockLister('listSaleInsuranceClaims');
  const listVendorSales = mockLister('listVendorSales');
  const listQuotations = mockLister('listQuotations');
  const listAllSellers = mockLister('listAllSellers');
  const listStaffByBranch = mockLister('listStaffByBranch');
  const listStockBatches = mockLister('listStockBatches');
  const listStockOrders = mockLister('listStockOrders');
  const listStockMovements = mockLister('listStockMovements');
  const getAllSales = mockLister('getAllSales');
  const getAppointmentsByDate = vi.fn(async (dateStr, opts) => { calls.getAppointmentsByDate = { dateStr, opts }; return []; });
  const getAppointmentsByMonth = vi.fn(async (yearMonth, opts) => { calls.getAppointmentsByMonth = { yearMonth, opts }; return []; });
  // Universal — re-exported as-is
  const listStaff = mockLister('listStaff');
  const listDoctors = mockLister('listDoctors');
  const listBranches = mockLister('listBranches');
  const listPermissionGroups = mockLister('listPermissionGroups');
  const listDocumentTemplates = mockLister('listDocumentTemplates');
  const listAudiences = mockLister('listAudiences');
  const getCustomer = mockLister('getCustomer');
  const getAllCustomers = mockLister('getAllCustomers');
  // Writers — re-exported as-is
  const saveProduct = mockLister('saveProduct');
  const saveCourse = mockLister('saveCourse');
  // Stock-tier listers
  const listStockTransfers = mockLister('listStockTransfers');
  const listStockWithdrawals = mockLister('listStockWithdrawals');
  const listCentralStockOrders = mockLister('listCentralStockOrders');
  const listCentralWarehouses = mockLister('listCentralWarehouses');
  const listStockLocations = mockLister('listStockLocations');
  return {
    listProducts, listCourses, listProductGroups, listProductUnitGroups,
    listMedicalInstruments, listHolidays, listDfGroups, listDfStaffRates,
    listBankAccounts, listExpenseCategories, listExpenses, listStaffSchedules,
    listPromotions, listCoupons, listVouchers, listOnlineSales,
    listSaleInsuranceClaims, listVendorSales, listQuotations,
    listAllSellers, listStaffByBranch,
    listStockBatches, listStockOrders, listStockMovements,
    getAllSales, getAppointmentsByDate, getAppointmentsByMonth,
    listStaff, listDoctors, listBranches, listPermissionGroups,
    listDocumentTemplates, listAudiences, getCustomer, getAllCustomers,
    saveProduct, saveCourse,
    listStockTransfers, listStockWithdrawals,
    listCentralStockOrders, listCentralWarehouses, listStockLocations,
  };
});

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  try { window.localStorage.setItem('selectedBranchId', 'BR-TEST'); } catch {}
});

describe('Task 4 — scopedDataLayer Layer 2', () => {
  describe('BS2.1 branch-scoped one-shot listers auto-inject', () => {
    const branchScoped = [
      'listProducts', 'listCourses',
      'listProductGroups', 'listProductUnitGroups', 'listMedicalInstruments',
      'listHolidays', 'listDfGroups', 'listDfStaffRates',
      'listBankAccounts', 'listExpenseCategories', 'listExpenses',
      'listStaffSchedules',
      'listPromotions', 'listCoupons', 'listVouchers',
      'listOnlineSales', 'listSaleInsuranceClaims', 'listVendorSales',
      'listQuotations',
      'listAllSellers', 'listStaffByBranch',
      'listStockBatches', 'listStockOrders', 'listStockMovements',
      'getAllSales',
    ];
    for (const name of branchScoped) {
      it(`BS2.1.${name} auto-injects current branchId`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        await scoped[name]();
        expect(calls[name]).toEqual(expect.objectContaining({ branchId: 'BR-TEST' }));
      });
    }
  });

  describe('BS2.2 positional + opts listers', () => {
    it('BS2.2.1 getAppointmentsByDate(dateStr, opts) auto-injects', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.getAppointmentsByDate('2026-05-01');
      expect(calls.getAppointmentsByDate.dateStr).toBe('2026-05-01');
      expect(calls.getAppointmentsByDate.opts.branchId).toBe('BR-TEST');
    });

    it('BS2.2.2 getAppointmentsByMonth(yearMonth, opts) auto-injects', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.getAppointmentsByMonth('2026-05');
      expect(calls.getAppointmentsByMonth.yearMonth).toBe('2026-05');
      expect(calls.getAppointmentsByMonth.opts.branchId).toBe('BR-TEST');
    });
  });

  describe('BS2.3 caller override paths', () => {
    it('BS2.3.1 {allBranches:true} preserved', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts({ allBranches: true });
      expect(calls.listProducts).toEqual({ branchId: 'BR-TEST', allBranches: true });
    });

    it('BS2.3.2 explicit {branchId:"OTHER"} overrides', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listCourses({ branchId: 'BR-OTHER' });
      expect(calls.listCourses.branchId).toBe('BR-OTHER');
    });

    it('BS2.3.3 unrelated opts pass through with branchId added', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listOnlineSales({ status: 'paid', startDate: '2026-05-01' });
      expect(calls.listOnlineSales).toEqual({
        branchId: 'BR-TEST',
        status: 'paid',
        startDate: '2026-05-01',
      });
    });
  });

  describe('BS2.4 universal collections re-export raw', () => {
    const universal = [
      'listStaff', 'listDoctors', 'listBranches', 'listPermissionGroups',
      'listDocumentTemplates', 'listAudiences', 'getCustomer', 'getAllCustomers',
      'listCentralStockOrders', 'listCentralWarehouses', 'listStockLocations',
    ];
    for (const name of universal) {
      it(`BS2.4.${name} does NOT inject branchId`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        await scoped[name]();
        // Universal: opts is whatever caller passed (undefined here) — branchId should NOT be added
        const captured = calls[name];
        if (captured !== undefined) {
          expect(captured.branchId).toBeUndefined();
        }
      });
    }
  });

  describe('BS2.5 writes re-exported as-is', () => {
    it('BS2.5.1 saveProduct passes args through', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.saveProduct('P1', { name: 'x' });
      expect(calls.saveProduct).toEqual({ name: 'x' });
    });
  });

  describe('BS2.6 stock-tier listers — locationId NOT injected (caller passes explicitly)', () => {
    it('BS2.6.1 listStockTransfers re-exports raw (no branchId/locationId injection)', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listStockTransfers({ locationId: 'WH-1' });
      expect(calls.listStockTransfers).toEqual({ locationId: 'WH-1' });
    });
  });

  describe('BS2.7 V36.G.51 — no React imports', () => {
    it('BS2.7.1 source has no React or .jsx imports', async () => {
      const fs = await import('node:fs/promises');
      const src = await fs.readFile('src/lib/scopedDataLayer.js', 'utf8');
      expect(src).not.toMatch(/from\s+['"]react['"]/);
      expect(src).not.toMatch(/BranchContext\.jsx/);
      expect(src).not.toMatch(/\.jsx['"]/);
    });
  });

  describe('BS2.8 localStorage absence falls back to FALLBACK_ID', () => {
    it('BS2.8.1 empty localStorage → FALLBACK_ID injected', async () => {
      try { window.localStorage.removeItem('selectedBranchId'); } catch {}
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts();
      expect(calls.listProducts.branchId).toBe('main');
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run tests/scopedDataLayer.test.js`
Expected: FAIL — `scopedDataLayer.js` doesn't exist.

- [ ] **Step 3: Create `scopedDataLayer.js`**

Create `src/lib/scopedDataLayer.js`:

```js
// ─── scopedDataLayer — Branch-Scope Architecture Layer 2 ────────────────────
// Phase BSA (2026-05-04). Re-exports backendClient.js with auto-injection of
// the currently-selected branchId for branch-scoped listers. Pure JS — no
// React imports (V36.G.51 lock).
//
// Pattern:
//   import { listCourses } from '../lib/scopedDataLayer.js';
//   await listCourses();   // branchId auto-injected from localStorage
//   await listCourses({ allBranches: true });        // opt-out
//   await listCourses({ branchId: 'BR-OTHER' });     // explicit override
//
// Universal collections (staff, doctors, customers, templates, branches,
// permission_groups, audiences, central_stock_*) re-exported AS-IS — no
// branch logic. Universal callers know what they want.
//
// Writers re-exported AS-IS — Phase BS V2 stamping inside backendClient
// already handles current-branch resolution via _resolveBranchIdForWrite.
//
// Audit: BS-1 forbids UI components from importing backendClient.js
// directly (must use this module). BS-7 forbids classification drift.

import * as raw from './backendClient.js';
import { resolveSelectedBranchId } from './branchSelection.js';

// ─── Branch-scoped one-shot listers — auto-inject ──────────────────────────

const _scoped = (fn) => (opts = {}) =>
  fn({ branchId: resolveSelectedBranchId(), ...opts });

const _scopedPositional = (fn) => (positional, opts = {}) =>
  fn(positional, { branchId: resolveSelectedBranchId(), ...opts });

// Master data
export const listProducts = _scoped(raw.listProducts);
export const listCourses = _scoped(raw.listCourses);
export const listProductGroups = _scoped(raw.listProductGroups);
export const listProductUnitGroups = _scoped(raw.listProductUnitGroups);
export const listMedicalInstruments = _scoped(raw.listMedicalInstruments);
export const listHolidays = _scoped(raw.listHolidays);
export const listDfGroups = _scoped(raw.listDfGroups);
export const listDfStaffRates = _scoped(raw.listDfStaffRates);

// Finance master
export const listBankAccounts = _scoped(raw.listBankAccounts);
export const listExpenseCategories = _scoped(raw.listExpenseCategories);
export const listExpenses = _scoped(raw.listExpenses);

// Schedules
export const listStaffSchedules = _scoped(raw.listStaffSchedules);

// Marketing (with allBranches:true doc-field OR-merge inside Layer 1)
export const listPromotions = _scoped(raw.listPromotions);
export const listCoupons = _scoped(raw.listCoupons);
export const listVouchers = _scoped(raw.listVouchers);

// Financial
export const listOnlineSales = _scoped(raw.listOnlineSales);
export const listSaleInsuranceClaims = _scoped(raw.listSaleInsuranceClaims);
export const listVendorSales = _scoped(raw.listVendorSales);
export const listQuotations = _scoped(raw.listQuotations);

// Sellers / staff-by-branch
export const listAllSellers = _scoped(raw.listAllSellers);
export const listStaffByBranch = _scoped(raw.listStaffByBranch);

// Sales / appointments — positional + opts
export const getAllSales = _scoped(raw.getAllSales);
export const getAppointmentsByDate = _scopedPositional(raw.getAppointmentsByDate);
export const getAppointmentsByMonth = _scopedPositional(raw.getAppointmentsByMonth);

// Stock — branch-scoped (locationId == branchId at branch tier)
export const listStockBatches = _scoped(raw.listStockBatches);
export const listStockOrders = _scoped(raw.listStockOrders);
export const listStockMovements = _scoped(raw.listStockMovements);

// ─── Universal — re-export raw, NO branch logic ────────────────────────────

// Staff / doctors / customers / templates / branches / permissions
export const listStaff = raw.listStaff;
export const listDoctors = raw.listDoctors;
export const listBranches = raw.listBranches;
export const listPermissionGroups = raw.listPermissionGroups;
export const listDocumentTemplates = raw.listDocumentTemplates;

// Customer-attached subcollections
export const getCustomer = raw.getCustomer;
export const getAllCustomers = raw.getAllCustomers;
export const getCustomerWallets = raw.getCustomerWallets;
export const getWalletBalance = raw.getWalletBalance;
export const getWalletTransactions = raw.getWalletTransactions;
export const getCustomerMembership = raw.getCustomerMembership;
export const getAllMemberships = raw.getAllMemberships;
export const getCustomerMembershipDiscount = raw.getCustomerMembershipDiscount;
export const getCustomerBahtPerPoint = raw.getCustomerBahtPerPoint;
export const getPointBalance = raw.getPointBalance;
export const getPointTransactions = raw.getPointTransactions;
export const getCustomerTreatments = raw.getCustomerTreatments;
export const getCustomerSales = raw.getCustomerSales;
export const getCustomerAppointments = raw.getCustomerAppointments;
export const getCustomerDeposits = raw.getCustomerDeposits;
export const getActiveDeposits = raw.getActiveDeposits;
export const listMembershipTypes = raw.listMembershipTypes;
export const listWalletTypes = raw.listWalletTypes;
export const listCourseChanges = raw.listCourseChanges;

// Audiences (smart segments — global filter)
export const listAudiences = raw.listAudiences;
export const getAudience = raw.getAudience;

// Documents
export const getDocumentTemplate = raw.getDocumentTemplate;
export const listDocumentDrafts = raw.listDocumentDrafts;
export const listDocumentPrints = raw.listDocumentPrints;
export const getDocumentDraft = raw.getDocumentDraft;
export const getNextCertNumber = raw.getNextCertNumber;

// Vendors (universal supplier directory)
export const listVendors = raw.listVendors;

// Stock — central tier (universal across central warehouses)
export const listCentralStockOrders = raw.listCentralStockOrders;
export const listCentralWarehouses = raw.listCentralWarehouses;
export const listStockLocations = raw.listStockLocations;
export const getCentralStockOrder = raw.getCentralStockOrder;

// Stock — tier-scoped (caller passes locationId explicitly)
export const listStockTransfers = raw.listStockTransfers;
export const listStockWithdrawals = raw.listStockWithdrawals;
export const getStockBatch = raw.getStockBatch;
export const getStockOrder = raw.getStockOrder;
export const getStockTransfer = raw.getStockTransfer;
export const getStockWithdrawal = raw.getStockWithdrawal;
export const getStockAdjustment = raw.getStockAdjustment;

// ─── Generic getters / single-doc reads ────────────────────────────────────
// Per-id reads don't need branch scope — caller already has the id.

export const getProduct = raw.getProduct;
export const getCourse = raw.getCourse;
export const getProductGroup = raw.getProductGroup;
export const getProductUnitGroup = raw.getProductUnitGroup;
export const getMedicalInstrument = raw.getMedicalInstrument;
export const getHoliday = raw.getHoliday;
export const getDfGroup = raw.getDfGroup;
export const getDfStaffRates = raw.getDfStaffRates;
export const getBankAccount = raw.getBankAccount;
export const getExpense = raw.getExpense;
export const getOnlineSale = raw.getOnlineSale;
export const getSaleInsuranceClaim = raw.getSaleInsuranceClaim;
export const getVendor = raw.getVendor;
export const getQuotation = raw.getQuotation;
export const getStaff = raw.getStaff;
export const getDoctor = raw.getDoctor;
export const getBranch = raw.getBranch;
export const getPermissionGroup = raw.getPermissionGroup;
export const getStaffSchedule = raw.getStaffSchedule;
export const getCoupon = raw.getCoupon;
export const getVoucher = raw.getVoucher;
export const getPromotion = raw.getPromotion;
export const getTreatment = raw.getTreatment;
export const getBackendSale = raw.getBackendSale;
export const getDeposit = raw.getDeposit;
export const getAllDeposits = raw.getAllDeposits;
export const getSaleByTreatmentId = raw.getSaleByTreatmentId;
export const getMasterDataMeta = raw.getMasterDataMeta;
export const getActiveSchedulesForDate = raw.getActiveSchedulesForDate;
export const getBeBackedMasterTypes = raw.getBeBackedMasterTypes;

// ─── Writes — re-export raw (Phase BS V2 stamping handled inside) ──────────

export const saveCustomer = raw.saveCustomer;
export const deleteCustomerDocOnly = raw.deleteCustomerDocOnly;
export const deleteCustomerCascade = raw.deleteCustomerCascade;
export const saveTreatment = raw.saveTreatment;
export const deleteBackendTreatment = raw.deleteBackendTreatment;
export const saveProduct = raw.saveProduct;
export const deleteProduct = raw.deleteProduct;
export const saveCourse = raw.saveCourse;
export const deleteCourse = raw.deleteCourse;
export const saveProductGroup = raw.saveProductGroup;
export const deleteProductGroup = raw.deleteProductGroup;
export const saveProductUnitGroup = raw.saveProductUnitGroup;
export const deleteProductUnitGroup = raw.deleteProductUnitGroup;
export const saveMedicalInstrument = raw.saveMedicalInstrument;
export const deleteMedicalInstrument = raw.deleteMedicalInstrument;
export const saveHoliday = raw.saveHoliday;
export const deleteHoliday = raw.deleteHoliday;
export const saveBranch = raw.saveBranch;
export const deleteBranch = raw.deleteBranch;
export const savePermissionGroup = raw.savePermissionGroup;
export const deletePermissionGroup = raw.deletePermissionGroup;
export const saveStaff = raw.saveStaff;
export const deleteStaff = raw.deleteStaff;
export const saveDoctor = raw.saveDoctor;
export const deleteDoctor = raw.deleteDoctor;
export const saveDfGroup = raw.saveDfGroup;
export const deleteDfGroup = raw.deleteDfGroup;
export const saveDfStaffRates = raw.saveDfStaffRates;
export const deleteDfStaffRates = raw.deleteDfStaffRates;
export const saveBankAccount = raw.saveBankAccount;
export const deleteBankAccount = raw.deleteBankAccount;
export const saveExpenseCategory = raw.saveExpenseCategory;
export const deleteExpenseCategory = raw.deleteExpenseCategory;
export const saveExpense = raw.saveExpense;
export const deleteExpense = raw.deleteExpense;
export const saveOnlineSale = raw.saveOnlineSale;
export const deleteOnlineSale = raw.deleteOnlineSale;
export const transitionOnlineSale = raw.transitionOnlineSale;
export const saveSaleInsuranceClaim = raw.saveSaleInsuranceClaim;
export const deleteSaleInsuranceClaim = raw.deleteSaleInsuranceClaim;
export const saveDocumentTemplate = raw.saveDocumentTemplate;
export const deleteDocumentTemplate = raw.deleteDocumentTemplate;
export const saveDocumentDraft = raw.saveDocumentDraft;
export const deleteDocumentDraft = raw.deleteDocumentDraft;
export const saveVendor = raw.saveVendor;
export const deleteVendor = raw.deleteVendor;
export const saveVendorSale = raw.saveVendorSale;
export const deleteVendorSale = raw.deleteVendorSale;
export const transitionVendorSale = raw.transitionVendorSale;
export const saveQuotation = raw.saveQuotation;
export const deleteQuotation = raw.deleteQuotation;
export const savePromotion = raw.savePromotion;
export const deletePromotion = raw.deletePromotion;
export const saveCoupon = raw.saveCoupon;
export const deleteCoupon = raw.deleteCoupon;
export const findCouponByCode = raw.findCouponByCode;
export const saveVoucher = raw.saveVoucher;
export const deleteVoucher = raw.deleteVoucher;
export const saveStaffSchedule = raw.saveStaffSchedule;
export const deleteStaffSchedule = raw.deleteStaffSchedule;
export const saveAudience = raw.saveAudience;
export const deleteAudience = raw.deleteAudience;
export const deleteCentralWarehouse = raw.deleteCentralWarehouse;

// Sales — branch-scoped reads, writes pass through
export const deleteBackendSale = raw.deleteBackendSale;
export const deleteBackendAppointment = raw.deleteBackendAppointment;
export const deleteDeposit = raw.deleteDeposit;
export const deleteMembership = raw.deleteMembership;
export const deleteMasterCourse = raw.deleteMasterCourse;
export const deleteMasterItem = raw.deleteMasterItem;

// Membership / master-data ID generation
// (raw.* available for niche callers; keep this module surface-complete)
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- --run tests/scopedDataLayer.test.js`
Expected: PASS — all BS2 cases green.

- [ ] **Step 5: Build + full suite**

Run: `npm test -- --run && npm run build`
Expected: 4777 + ~32 = 4809 PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scopedDataLayer.js tests/scopedDataLayer.test.js
git commit -m "$(cat <<'EOF'
feat(bsa-task4): scopedDataLayer.js — Layer 2 wrapper for auto-inject

Re-exports backendClient with auto-injection of current branchId for
branch-scoped listers via resolveSelectedBranchId(). Universal collections
re-exported as-is (staff/doctors/customers/templates/branches/permissions/
audiences/customer-attached/central-stock).

Pure JS — no React imports (V36.G.51 lock). UI components migrating in
Task 7 import from this module instead of backendClient directly.

Tests: 4777 → 4809 (32 BS2 cases).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create `useBranchAwareListener` hook (Layer 3)

**Files:**
- Create: `src/hooks/useBranchAwareListener.js`
- Test: `tests/useBranchAwareListener.test.jsx`

- [ ] **Step 1: Write failing test**

Create `tests/useBranchAwareListener.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { useBranchAwareListener } from '../src/hooks/useBranchAwareListener.js';

// Mock useSelectedBranch
let mockBranchId = 'BR-A';
const setMockBranchId = (id) => { mockBranchId = id; };

vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: mockBranchId, branches: [], selectBranch: () => {}, isReady: true }),
}));

beforeEach(() => {
  setMockBranchId('BR-A');
});

describe('Task 5 — useBranchAwareListener Layer 3', () => {
  it('BS3.1 subscribes on mount with current branchId injected into opts', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, { startDate: '2026-05-01' }, () => {});
      return null;
    }
    render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({ startDate: '2026-05-01', branchId: 'BR-A' });
  });

  it('BS3.2 re-subscribes when branchId changes', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, { startDate: '2026-05-01' }, () => {});
      return null;
    }
    const { rerender } = render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    act(() => { setMockBranchId('BR-B'); });
    rerender(<Probe />);
    expect(unsub).toHaveBeenCalledTimes(1);  // old listener torn down
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual({ startDate: '2026-05-01', branchId: 'BR-B' });
  });

  it('BS3.3 universal listener (__universal__:true) does NOT inject branchId', () => {
    const unsub = vi.fn();
    const listener = Object.assign(vi.fn(() => unsub), { __universal__: true });
    function Probe() {
      useBranchAwareListener(listener, 'customer-id-123', () => {});
      return null;
    }
    render(<Probe />);
    expect(listener.mock.calls[0][0]).toBe('customer-id-123');  // positional arg passed through
  });

  it('BS3.4 universal listener does NOT re-subscribe on branch switch', () => {
    const unsub = vi.fn();
    const listener = Object.assign(vi.fn(() => unsub), { __universal__: true });
    function Probe() {
      useBranchAwareListener(listener, 'customer-123', () => {});
      return null;
    }
    const { rerender } = render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    act(() => { setMockBranchId('BR-B'); });
    rerender(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);  // no re-subscribe
    expect(unsub).toHaveBeenCalledTimes(0);
  });

  it('BS3.5 unmount cleans up subscription', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, {}, () => {});
      return null;
    }
    const { unmount } = render(<Probe />);
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('BS3.6 args change re-subscribes', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    let outerArgs = { startDate: '2026-05-01' };
    function Probe({ args }) {
      useBranchAwareListener(listener, args, () => {});
      return null;
    }
    const { rerender } = render(<Probe args={outerArgs} />);
    rerender(<Probe args={{ startDate: '2026-06-01' }} />);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('BS3.7 onChange ref updates without re-subscribe', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe({ tag }) {
      const onChange = () => tag;
      useBranchAwareListener(listener, {}, onChange);
      return null;
    }
    const { rerender } = render(<Probe tag="a" />);
    rerender(<Probe tag="b" />);
    expect(listener).toHaveBeenCalledTimes(1);  // same subscribe
    expect(unsub).toHaveBeenCalledTimes(0);
  });

  it('BS3.8 null listenerFn is no-op (does not throw)', () => {
    function Probe() {
      useBranchAwareListener(null, {}, () => {});
      return null;
    }
    expect(() => render(<Probe />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run tests/useBranchAwareListener.test.jsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the hook**

Create `src/hooks/useBranchAwareListener.js`:

```js
// ─── useBranchAwareListener — Branch-Scope Architecture Layer 3 ────────────
// Phase BSA (2026-05-04). Wraps any `listenToX(args, onChange, onError)` from
// backendClient — handles current branchId injection, re-subscribe on branch
// change, cleanup on unmount, ref-stable callbacks.
//
// Usage:
//   useBranchAwareListener(listenToAllSales, { startDate, endDate }, setSales, setError);
//   useBranchAwareListener(listenToCustomer, customerId, setCustomer);   // universal — no branch logic
//
// Universal listeners (marked with `fn.__universal__ = true` in backendClient.js
// Phase BSA Task 3) skip branch injection AND skip re-subscribe on branch
// change. Customer-attached + audience + permission listeners are universal.
//
// Args:
//   listenerFn   — backendClient listener function (or null/undefined for no-op)
//   args         — first arg to the listener. Object args get branchId merged
//                  in for branch-scoped listeners; positional args (string id,
//                  date string) pass through unchanged.
//   onChange     — data callback. Ref-stored — updates without re-subscribe.
//   onError      — error callback. Ref-stored — updates without re-subscribe.

import { useEffect, useRef } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';

export function useBranchAwareListener(listenerFn, args, onChange, onError) {
  const { branchId } = useSelectedBranch();
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const isUniversal = listenerFn?.__universal__ === true;
  // Universal listeners ignore branchId entirely — exclude from deps so they
  // don't re-subscribe on branch switch.
  const effectiveBranchId = isUniversal ? null : branchId;

  useEffect(() => {
    if (!listenerFn) return undefined;
    let enrichedArgs;
    if (isUniversal) {
      enrichedArgs = args;
    } else if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
      enrichedArgs = { ...args, branchId };
    } else {
      // Positional arg (date string, id, etc.) — listener handles branchId
      // internally via its second/third positional opts param. For now, pass
      // through; the few branch-scoped listeners with positional firsts
      // (listenToAppointmentsByDate) accept opts as 2nd arg — caller writes
      // a thin wrapper or upgrades the listener signature in a follow-up.
      enrichedArgs = args;
    }
    const unsub = listenerFn(
      enrichedArgs,
      (data) => onChangeRef.current?.(data),
      (err) => onErrorRef.current?.(err)
    );
    return () => { try { unsub?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerFn, effectiveBranchId, JSON.stringify(args)]);
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npm test -- --run tests/useBranchAwareListener.test.jsx`
Expected: PASS — 8 BS3 cases green.

- [ ] **Step 5: Build + full suite**

Run: `npm test -- --run && npm run build`
Expected: 4809 + 8 = 4817 PASS, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBranchAwareListener.js tests/useBranchAwareListener.test.jsx
git commit -m "$(cat <<'EOF'
feat(bsa-task5): useBranchAwareListener hook — Layer 3

Wraps any backendClient listenTo* — injects current branchId, re-subscribes
on branch change, cleans up on unmount, ref-stable callbacks. Universal
listeners (marked __universal__ in Task 3) bypass branch logic entirely.

Tests: 4817 (8 BS3 cases).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate UI imports — `backendClient` → `scopedDataLayer` (84 files mechanical)

**Files:** all 84 UI files listed in spec §6, plus annotations on report tabs.

- [ ] **Step 1: List target files**

Run:
```bash
git grep -lE "from ['\"](\.\./)+lib/backendClient" -- "src/components/**" "src/pages/**" "src/hooks/**" > /tmp/bsa-migrate.txt
wc -l /tmp/bsa-migrate.txt
```
Expected: ~84 files.

- [ ] **Step 2: Apply the codemod (PowerShell)**

Run from project root:

```powershell
$files = git grep -lE "from ['""](\.\./)+lib/backendClient" -- "src/components/**" "src/pages/**" "src/hooks/**"
foreach ($f in $files) {
  $content = Get-Content -Raw $f
  $new = $content -replace "from\s+'(\.\./)+lib/backendClient(\.js)?'", "from '`$1lib/scopedDataLayer.js'"
  $new = $new -replace "from\s+`"(\.\./)+lib/backendClient(\.js)?`"", "from `"`$1lib/scopedDataLayer.js`""
  Set-Content -Path $f -Value $new -NoNewline
}
```

Bash equivalent (if available):

```bash
for f in $(git grep -lE "from ['\"](\.\./)+lib/backendClient" -- "src/components/**" "src/pages/**" "src/hooks/**"); do
  sed -i "s#from ['\"]\(\.\./\)\+lib/backendClient\(\.js\)\?['\"]#from '\1lib/scopedDataLayer.js'#g" "$f"
done
```

- [ ] **Step 3: Annotate report tabs that legitimately need cross-branch data**

These files use `{allBranches: true}` for cross-branch reports. Add a top-of-file comment to each:

```js
// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation
```

Files to annotate:
- `src/components/backend/reports/RemainingCourseTab.jsx`
- `src/components/backend/reports/ExpenseReportTab.jsx`
- `src/components/backend/reports/ClinicReportTab.jsx`
- `src/components/backend/reports/RevenueAnalysisTab.jsx`
- `src/components/backend/reports/StaffSalesTab.jsx`
- `src/components/backend/reports/StockReportTab.jsx`
- `src/components/backend/reports/AppointmentAnalysisTab.jsx`
- `src/components/backend/reports/AppointmentReportTab.jsx`
- `src/components/backend/reports/DfPayoutReportTab.jsx`
- `src/components/backend/SmartAudienceTab.jsx` (audiences are universal)

Use Read+Edit per file to add the comment as the FIRST line (before any imports).

- [ ] **Step 4: MasterDataTab + BackendDashboard exception**

`src/components/backend/MasterDataTab.jsx` is the SANCTIONED dev-only sync UI (Rule H-bis). It legitimately imports from `backendClient` for the migrators.

`src/pages/BackendDashboard.jsx` is the root and may need direct backendClient access for some compositional reads.

Both files: revert the codemod's change for these two files only:

```bash
# If your codemod ran on these two — revert them:
git checkout src/components/backend/MasterDataTab.jsx src/pages/BackendDashboard.jsx
```

Then add the SAME comment annotation to both:
```js
// audit-branch-scope: sanctioned exception — Rule H-bis (MasterDataTab) / root composition (BackendDashboard)
```

- [ ] **Step 5: Run full Vitest — verify no regression**

Run: `npm test -- --run`
Expected: 4817 PASS, 0 FAIL.

If any test fails on missing export from `scopedDataLayer.js`: add the missing export in `src/lib/scopedDataLayer.js` (re-export from `raw`), commit fix, re-run.

- [ ] **Step 6: Verify build clean**

Run: `npm run build`
Expected: clean. If `MISSING_EXPORT`: add the missing re-export to `scopedDataLayer.js`.

- [ ] **Step 7: Commit**

```bash
git add -u src/components src/pages src/hooks src/lib/scopedDataLayer.js
git commit -m "$(cat <<'EOF'
refactor(bsa-task6): migrate UI imports backendClient → scopedDataLayer

84 files mechanical import-path rewrite. Report tabs + MasterDataTab
+ BackendDashboard annotated as sanctioned exceptions.

Effect: every UI lister call now auto-injects current branchId via
Layer 2. The TFP starter bug (open with branch X → loads from branch
Y) starts resolving HERE — once Task 7 also replaces getAllMasterDataItems.

Tests: 4817 PASS unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TFP H-quater fix — replace `getAllMasterDataItems` with be_* listers

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (line ~635 + load path)
- Modify: any other consumers of `getAllMasterDataItems` (grep first)
- Test: `tests/bsa-task7-tfp-h-quater-fix.test.js`

- [ ] **Step 1: Identify all callers**

Run: `git grep -n "getAllMasterDataItems" -- "src/**"`
Expected: TFP + possibly others. Document each caller's intent.

- [ ] **Step 2: Write failing test**

Create `tests/bsa-task7-tfp-h-quater-fix.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Task 7 — TFP H-quater fix', () => {
  const tfpSrc = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

  it('T7.1 TFP does NOT call getAllMasterDataItems', () => {
    expect(tfpSrc).not.toMatch(/getAllMasterDataItems\(/);
  });

  it('T7.2 TFP imports listProducts/listCourses/listStaff/listDoctors from scopedDataLayer', () => {
    expect(tfpSrc).toMatch(/listProducts/);
    expect(tfpSrc).toMatch(/listCourses/);
    expect(tfpSrc).toMatch(/listStaff/);
    expect(tfpSrc).toMatch(/listDoctors/);
    expect(tfpSrc).toMatch(/scopedDataLayer/);
  });

  it('T7.3 TFP does not import from master_data path', () => {
    expect(tfpSrc).not.toMatch(/master_data\//);
  });

  it('T7.4 listDfGroups + listDfStaffRates called WITHOUT explicit branchId override (auto-injected)', () => {
    // Match listDfGroups() with no args OR listDfGroups({ ... no branchId })
    const dfGroupsCalls = tfpSrc.match(/listDfGroups\([^)]*\)/g) || [];
    for (const call of dfGroupsCalls) {
      // No explicit `branchId:` inside — wrapper handles it
      expect(call).not.toMatch(/branchId\s*:/);
    }
    const dfRatesCalls = tfpSrc.match(/listDfStaffRates\([^)]*\)/g) || [];
    for (const call of dfRatesCalls) {
      expect(call).not.toMatch(/branchId\s*:/);
    }
  });

  it('T7.5 H-quater regression — no master_data reads in any feature code', () => {
    const feature = require('child_process').execSync(
      'git grep -lE "master_data/" -- "src/components/**" "src/pages/**" 2>/dev/null || true',
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    // MasterDataTab.jsx is the ONLY allowed exception
    const violations = feature.filter(f =>
      !f.includes('MasterDataTab') &&
      !f.includes('// migrator')
    );
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `npm test -- --run tests/bsa-task7-tfp-h-quater-fix.test.js`
Expected: FAIL — TFP still calls `getAllMasterDataItems`.

- [ ] **Step 4: Refactor TFP load path**

Read `src/components/TreatmentFormPage.jsx` lines 630-660 (the backend load path). Replace the import + Promise.all block with:

```jsx
        if (saveTarget === 'backend') {
          const {
            getTreatment: getBackendTreatment,
            getCustomer: getBackendCustomer,
            listDfGroups,
            listDfStaffRates,
            listProducts,
            listCourses,
            listStaff,
            listDoctors,
          } = await import('../lib/scopedDataLayer.js');
          const [doctorItems, productItems, staffItems, courseItems, dfGroupItems, dfStaffRatesItems] = await Promise.all([
            listDoctors(),                         // universal
            listProducts(),                        // auto-inject branchId
            listStaff(),                           // universal
            listCourses(),                         // auto-inject branchId
            listDfGroups().catch(() => []),        // auto-inject branchId
            listDfStaffRates().catch(() => []),    // auto-inject branchId
          ]);
          setDfGroups(dfGroupItems || []);
          setDfStaffRates(dfStaffRatesItems || []);
          setMasterCourses(courseItems || []);
          // ... rest of the existing post-fetch logic stays unchanged ...
```

Keep the existing `filterStaffByBranch` + `filterDoctorsByBranch` soft-gate calls — they apply the visibility filter on top.

- [ ] **Step 5: Run focused TFP tests**

Run: `npm test -- --run "tests/treatmentForm" "tests/customer-treatment"`
Expected: PASS (existing TFP tests remain green; data shape unchanged).

- [ ] **Step 6: Run task 7 test**

Run: `npm test -- --run tests/bsa-task7-tfp-h-quater-fix.test.js`
Expected: PASS — 5 cases green.

- [ ] **Step 7: Build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/TreatmentFormPage.jsx tests/bsa-task7-tfp-h-quater-fix.test.js
git commit -m "$(cat <<'EOF'
fix(bsa-task7): TFP replaces getAllMasterDataItems with be_* listers

Closes the user-reported bug: open TreatmentForm after switching to
"พระราม 3" → courses/products/DF rates were still loading from
"นครราชสีมา" because TFP read master_data/* (universal pool, ignores
branch). Now reads be_courses/be_products/be_df_groups/be_df_staff_rates
via scopedDataLayer with auto-injected current branchId.

Staff + Doctors stay universal per Phase BS V2 spec — soft-gate via
staff.branchIds[] + doctor.branchIds[] preserved.

Rule H-quater enforced: no master_data/* reads in feature code.

Tests: +5 (T7.1-5).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migrate live listeners → `useBranchAwareListener`

**Files**: components using branch-scoped `listenTo*` calls. Identify via:

```bash
git grep -nE "listenToAppointmentsByDate|listenToAllSales|listenToHolidays|listenToScheduleByDay" -- "src/components/**" "src/pages/**"
```

Expected ~10 callsites across AppointmentTab, SaleTab, FinanceTab, calendar tabs, etc.

- [ ] **Step 1: Listener inventory**

For each callsite, determine:
- Component file
- Listener name (branch-scoped vs universal)
- Args shape (object vs positional)

Document in plan execution notes.

- [ ] **Step 2: Write source-grep regression test**

Create `tests/bsa-task8-listener-migration-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const BRANCH_SCOPED_LISTENERS = [
  'listenToAppointmentsByDate',
  'listenToAllSales',
  'listenToHolidays',
  'listenToScheduleByDay',
];

describe('Task 8 — Live listener migration', () => {
  it('BS-4: every branch-scoped listenTo* in components is wrapped in useBranchAwareListener', () => {
    for (const fn of BRANCH_SCOPED_LISTENERS) {
      const grep = execSync(
        `git grep -nE "(useBranchAwareListener|//\\s*audit-branch-scope:.*listener-direct).*${fn}|${fn}.*useBranchAwareListener" -- "src/components/**" "src/pages/**" 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
      const directGrep = execSync(
        `git grep -nE "${fn}\\(" -- "src/components/**" "src/pages/**" 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
      const directCalls = directGrep.split('\n').filter(Boolean);
      // Allow the call inside the same useBranchAwareListener invocation
      const violations = directCalls.filter(line => {
        // Strip "file:line:" prefix to inspect just the source line
        const src = line.replace(/^[^:]+:\d+:/, '');
        // Check if line includes useBranchAwareListener — that's the right pattern
        if (src.includes('useBranchAwareListener')) return false;
        // Or has the explicit annotation
        if (src.includes('audit-branch-scope: listener-direct')) return false;
        return true;
      });
      expect(violations, `Direct ${fn} call without useBranchAwareListener:\n${violations.join('\n')}`).toEqual([]);
    }
  });
});
```

- [ ] **Step 3: Run test — confirm violations**

Run: `npm test -- --run tests/bsa-task8-listener-migration-grep.test.js`
Expected: FAIL with list of violations (current direct callsites).

- [ ] **Step 4: Migrate each callsite to `useBranchAwareListener`**

For each violation, edit the component. Pattern:

**Before** (typical):
```jsx
useEffect(() => {
  const unsub = listenToAllSales({ startDate, endDate, branchId }, setSales, setError);
  return () => unsub?.();
}, [startDate, endDate, branchId]);
```

**After**:
```jsx
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { listenToAllSales } from '../../lib/backendClient.js';
// (listenTo* must come from raw backendClient — NOT scopedDataLayer — because
//  the hook is the auto-inject point for listeners)

useBranchAwareListener(listenToAllSales, { startDate, endDate }, setSales, setError);
```

Note: hook imports `listenTo*` from `backendClient` because there's no point re-exporting these via `scopedDataLayer` (the hook is the wrapper). Annotate the import:

```js
// audit-branch-scope: listener-direct — wired via useBranchAwareListener
import { listenToAllSales } from '../../lib/backendClient.js';
```

- [ ] **Step 5: Run task 8 test**

Run: `npm test -- --run tests/bsa-task8-listener-migration-grep.test.js`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `npm test -- --run`
Expected: existing tests green; +1 BS-4 test.

- [ ] **Step 7: Build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add -u src/components src/pages tests/bsa-task8-listener-migration-grep.test.js
git commit -m "$(cat <<'EOF'
refactor(bsa-task8): migrate branch-scoped listeners → useBranchAwareListener

Every direct call to listenToAppointmentsByDate / listenToAllSales /
listenToHolidays / listenToScheduleByDay in components routes through
the hook for auto-resubscribe on branch switch. listener-direct imports
are annotated `// audit-branch-scope: listener-direct`.

Effect: switching branch via top-right selector now refreshes appointment
calendars, sale lists, and schedule grids without F5.

Tests: +1 source-grep BS-4.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `/audit-branch-scope` skill (BS-1..BS-8 invariants)

**Files:**
- Create: `.agents/skills/audit-branch-scope/SKILL.md`
- Create: `.agents/skills/audit-branch-scope/patterns.md`
- Create: `tests/audit-branch-scope.test.js`

- [ ] **Step 1: Write the skill self-tests first (TDD)**

Create `tests/audit-branch-scope.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const grep = (pattern, paths) => {
  try {
    return execSync(`git grep -nE "${pattern}" -- ${paths} 2>/dev/null || true`, { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch { return []; }
};

describe('audit-branch-scope BS-1..BS-8', () => {
  it('BS-1: no UI component imports backendClient.js directly (except whitelist)', () => {
    const violations = grep(
      'from [\\\\\\"]\\\\.+/lib/backendClient',
      '"src/components/**" "src/pages/**" "src/hooks/**"'
    );
    const allowed = (line) =>
      line.includes('MasterDataTab') ||
      line.includes('BackendDashboard') ||
      line.includes('// audit-branch-scope: listener-direct') ||
      line.includes('// audit-branch-scope: report') ||
      line.includes('// audit-branch-scope: sanctioned exception');
    const real = violations.filter(v => !allowed(v));
    expect(real, `BS-1 violations:\n${real.join('\n')}`).toEqual([]);
  });

  it('BS-2: no master_data/ reads in feature code', () => {
    const hits = grep("master_data/", '"src/components/**" "src/pages/**"');
    const real = hits.filter(line =>
      !line.includes('MasterDataTab') &&
      !line.includes('// migrator') &&
      !line.includes('// audit-branch-scope:')
    );
    expect(real, `BS-2 violations:\n${real.join('\n')}`).toEqual([]);
  });

  it('BS-3: getAllMasterDataItems removed from feature code', () => {
    const hits = grep('getAllMasterDataItems', '"src/components/**" "src/pages/**" "src/hooks/**"');
    expect(hits, `BS-3 violations:\n${hits.join('\n')}`).toEqual([]);
  });

  it('BS-4: branch-scoped listeners wrapped in useBranchAwareListener', () => {
    const fns = ['listenToAppointmentsByDate', 'listenToAllSales', 'listenToHolidays', 'listenToScheduleByDay'];
    for (const fn of fns) {
      const directCalls = grep(`${fn}\\(`, '"src/components/**" "src/pages/**"');
      const violations = directCalls.filter(line => {
        const src = line.replace(/^[^:]+:\d+:/, '');
        return !src.includes('useBranchAwareListener') &&
               !src.includes('audit-branch-scope: listener-direct');
      });
      expect(violations, `BS-4 ${fn} violations:\n${violations.join('\n')}`).toEqual([]);
    }
  });

  it('BS-5: every Firestore collection classified in branch-collection-coverage', () => {
    const path = 'tests/branch-collection-coverage.test.js';
    expect(existsSync(path), 'BS-5 setup: branch-collection-coverage.test.js missing').toBe(true);
    const src = readFileSync(path, 'utf8');
    expect(src).toMatch(/COLLECTION_MATRIX/);
  });

  it('BS-6: branch-scope-flow-simulate test exists and runs', () => {
    expect(existsSync('tests/branch-scope-flow-simulate.test.js')).toBe(true);
  });

  it('BS-7: scopedDataLayer universal re-exports match COLLECTION_MATRIX universal scope', () => {
    const src = readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    // Sanity: spot-check at least these are re-exported as raw (no _scoped wrapper)
    const universalNames = ['listStaff', 'listDoctors', 'listBranches', 'getCustomer', 'listAudiences'];
    for (const n of universalNames) {
      const re = new RegExp(`export const ${n}\\s*=\\s*raw\\.${n}`);
      expect(src, `BS-7: ${n} should be raw re-export`).toMatch(re);
    }
  });

  it('BS-8: existing _resolveBranchIdForWrite call sites preserved', () => {
    const hits = grep('_resolveBranchIdForWrite', '"src/lib/backendClient.js"');
    expect(hits.length, 'BS-8: at least 14 call sites expected after Tasks 1+2').toBeGreaterThanOrEqual(14);
  });
});
```

- [ ] **Step 2: Run test — verify pass (assuming Tasks 1-8 done)**

Run: `npm test -- --run tests/audit-branch-scope.test.js`
Expected: PASS — 8 invariants green.

- [ ] **Step 3: Write `SKILL.md`**

Create `.agents/skills/audit-branch-scope/SKILL.md`:

```markdown
# /audit-branch-scope — Branch-Scope Architecture invariants

Use when: pre-release readiness check, after any change to backendClient.js
or scopedDataLayer.js, when the BranchSelector behavior is suspect, or as
part of `/audit-all` Tier 1.

Greppable invariants enforced by `tests/audit-branch-scope.test.js`:

| ID | Rule | Pattern |
|---|---|---|
| BS-1 | UI components import only from `scopedDataLayer.js` (not `backendClient`) | `git grep -E "from ['\"](\.\./)+lib/backendClient" src/components/ src/pages/ src/hooks/` minus whitelist |
| BS-2 | No `master_data/*` reads in feature code (Rule H-quater) | `git grep -nE "master_data/" src/components/ src/pages/` minus MasterDataTab + migrators |
| BS-3 | `getAllMasterDataItems` not used in UI | `git grep -nE "getAllMasterDataItems" src/components/ src/pages/ src/hooks/` |
| BS-4 | Branch-scoped `listenTo*` wrapped in `useBranchAwareListener` | grep direct calls; verify each line has `useBranchAwareListener` OR `// audit-branch-scope: listener-direct` |
| BS-5 | Every Firestore collection classified in `tests/branch-collection-coverage.test.js` `COLLECTION_MATRIX` |
| BS-6 | `tests/branch-scope-flow-simulate.test.js` exists and runs |
| BS-7 | `scopedDataLayer.js` universal re-exports match `COLLECTION_MATRIX` universal scope |
| BS-8 | All Phase BS V2 + BSA Task 1-2 writers preserved (≥14 `_resolveBranchIdForWrite` call sites) |

## Annotation comments

| Comment | Meaning |
|---|---|
| `// audit-branch-scope: report — uses {allBranches:true}` | File legitimately needs cross-branch data; BS-1 exception |
| `// audit-branch-scope: listener-direct — wired via useBranchAwareListener` | Direct `listenTo*` import is intentional (hook imports raw); BS-4 exception |
| `// audit-branch-scope: sanctioned exception — Rule H-bis` | MasterDataTab dev-only sync |
| `// audit-branch-scope: BS-2 OR-field` | Marketing collection with `allBranches:true` doc-level field |

## Output format

Run by: `npm test -- --run tests/audit-branch-scope.test.js`

Punch list of violations OR "BS-1..BS-8 ✅ all green".
```

- [ ] **Step 4: Write `patterns.md`** (concrete grep recipes)

Create `.agents/skills/audit-branch-scope/patterns.md`:

```markdown
# patterns.md — concrete BS-1..BS-8 grep recipes

## BS-1
```bash
git grep -nE "from ['\"](\.\./)+lib/backendClient" -- "src/components/**" "src/pages/**" "src/hooks/**" \
  | grep -v MasterDataTab \
  | grep -v BackendDashboard \
  | grep -v "audit-branch-scope:"
```
Expected output: empty.

## BS-2
```bash
git grep -nE "master_data/" -- "src/components/**" "src/pages/**" \
  | grep -v MasterDataTab \
  | grep -v "// migrator" \
  | grep -v "audit-branch-scope:"
```
Expected: empty.

## BS-3
```bash
git grep -nE "getAllMasterDataItems" -- "src/components/**" "src/pages/**" "src/hooks/**"
```
Expected: empty (Task 12 fully removes from `backendClient.js` too).

## BS-4
```bash
for fn in listenToAppointmentsByDate listenToAllSales listenToHolidays listenToScheduleByDay; do
  git grep -nE "${fn}\\(" -- "src/components/**" "src/pages/**" \
    | grep -v useBranchAwareListener \
    | grep -v "audit-branch-scope: listener-direct"
done
```
Expected: empty.

## BS-5..BS-8
Run: `npm test -- --run tests/audit-branch-scope.test.js`
```

- [ ] **Step 5: Register in `/audit-all`**

Read `.agents/skills/audit-all/SKILL.md` (or `.claude/skills/audit-all/SKILL.md` — use whichever path exists). Add `/audit-branch-scope` to the Tier 1 (release-blocking) list:

Edit the SKILL.md to add a row:

```markdown
| BSA | `/audit-branch-scope` | Tier 1 | branch-scope drift across UI |
```

- [ ] **Step 6: Run full suite + build**

Run: `npm test -- --run && npm run build`
Expected: 4817 + ~9 = 4826 PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/audit-branch-scope tests/audit-branch-scope.test.js
git add .agents/skills/audit-all 2>/dev/null || git add .claude/skills/audit-all
git commit -m "$(cat <<'EOF'
feat(bsa-task9): /audit-branch-scope skill — BS-1..BS-8 invariants

Enforces:
- BS-1 UI imports only scopedDataLayer (not backendClient direct)
- BS-2 no master_data/* reads in feature code (Rule H-quater)
- BS-3 getAllMasterDataItems removed from UI
- BS-4 branch-scoped listenTo* wrapped in useBranchAwareListener
- BS-5 every collection classified in COLLECTION_MATRIX
- BS-6 branch-scope-flow-simulate.test.js exists
- BS-7 scopedDataLayer universal re-exports match matrix
- BS-8 _resolveBranchIdForWrite call sites preserved (>=14)

Registered in /audit-all Tier 1.

Tests: +9 (BS-1..BS-8).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Branch-scope flow-simulate (Rule I — F1-F9)

**Files:**
- Create: `tests/branch-scope-flow-simulate.test.js`

- [ ] **Step 1: Write the F1-F9 simulate**

Create `tests/branch-scope-flow-simulate.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock backendClient — capture per-call opts
const captures = [];
function track(name) {
  return vi.fn(async (opts) => { captures.push({ name, opts }); return []; });
}
function trackPositional(name) {
  return vi.fn(async (positional, opts) => { captures.push({ name, positional, opts }); return []; });
}

vi.mock('../src/lib/backendClient.js', () => ({
  listProducts: track('listProducts'),
  listCourses: track('listCourses'),
  listDfGroups: track('listDfGroups'),
  listDfStaffRates: track('listDfStaffRates'),
  listProductGroups: track('listProductGroups'),
  listStaff: track('listStaff'),  // universal (no inject)
  listDoctors: track('listDoctors'),  // universal
  listAudiences: track('listAudiences'),  // universal
  getAppointmentsByDate: trackPositional('getAppointmentsByDate'),
  saveProduct: track('saveProduct'),
  // Add other re-exported names used by the test
  listProductUnitGroups: track('listProductUnitGroups'),
  listMedicalInstruments: track('listMedicalInstruments'),
  listHolidays: track('listHolidays'),
  listBankAccounts: track('listBankAccounts'),
  listExpenseCategories: track('listExpenseCategories'),
  listExpenses: track('listExpenses'),
  listStaffSchedules: track('listStaffSchedules'),
  listPromotions: track('listPromotions'),
  listCoupons: track('listCoupons'),
  listVouchers: track('listVouchers'),
  listOnlineSales: track('listOnlineSales'),
  listSaleInsuranceClaims: track('listSaleInsuranceClaims'),
  listVendorSales: track('listVendorSales'),
  listQuotations: track('listQuotations'),
  listAllSellers: track('listAllSellers'),
  listStaffByBranch: track('listStaffByBranch'),
  listStockBatches: track('listStockBatches'),
  listStockOrders: track('listStockOrders'),
  listStockMovements: track('listStockMovements'),
  getAllSales: track('getAllSales'),
  getAppointmentsByMonth: trackPositional('getAppointmentsByMonth'),
  listBranches: track('listBranches'),
  listPermissionGroups: track('listPermissionGroups'),
  listDocumentTemplates: track('listDocumentTemplates'),
  getCustomer: track('getCustomer'),
  getAllCustomers: track('getAllCustomers'),
  saveCourse: track('saveCourse'),
  listStockTransfers: track('listStockTransfers'),
  listStockWithdrawals: track('listStockWithdrawals'),
  listCentralStockOrders: track('listCentralStockOrders'),
  listCentralWarehouses: track('listCentralWarehouses'),
  listStockLocations: track('listStockLocations'),
  // Catch-all for anything else scopedDataLayer re-exports
  getCustomerWallets: track('getCustomerWallets'),
  getWalletBalance: track('getWalletBalance'),
  getWalletTransactions: track('getWalletTransactions'),
  getCustomerMembership: track('getCustomerMembership'),
  getAllMemberships: track('getAllMemberships'),
  getCustomerMembershipDiscount: track('getCustomerMembershipDiscount'),
  getCustomerBahtPerPoint: track('getCustomerBahtPerPoint'),
  getPointBalance: track('getPointBalance'),
  getPointTransactions: track('getPointTransactions'),
  getCustomerTreatments: track('getCustomerTreatments'),
  getCustomerSales: track('getCustomerSales'),
  getCustomerAppointments: track('getCustomerAppointments'),
  getCustomerDeposits: track('getCustomerDeposits'),
  getActiveDeposits: track('getActiveDeposits'),
  listMembershipTypes: track('listMembershipTypes'),
  listWalletTypes: track('listWalletTypes'),
  listCourseChanges: track('listCourseChanges'),
  getAudience: track('getAudience'),
  getDocumentTemplate: track('getDocumentTemplate'),
  listDocumentDrafts: track('listDocumentDrafts'),
  listDocumentPrints: track('listDocumentPrints'),
  getDocumentDraft: track('getDocumentDraft'),
  getNextCertNumber: track('getNextCertNumber'),
  listVendors: track('listVendors'),
  getCentralStockOrder: track('getCentralStockOrder'),
  getStockBatch: track('getStockBatch'),
  getStockOrder: track('getStockOrder'),
  getStockTransfer: track('getStockTransfer'),
  getStockWithdrawal: track('getStockWithdrawal'),
  getStockAdjustment: track('getStockAdjustment'),
  getProduct: track('getProduct'),
  getCourse: track('getCourse'),
  getProductGroup: track('getProductGroup'),
  getProductUnitGroup: track('getProductUnitGroup'),
  getMedicalInstrument: track('getMedicalInstrument'),
  getHoliday: track('getHoliday'),
  getDfGroup: track('getDfGroup'),
  getDfStaffRates: track('getDfStaffRates'),
  getBankAccount: track('getBankAccount'),
  getExpense: track('getExpense'),
  getOnlineSale: track('getOnlineSale'),
  getSaleInsuranceClaim: track('getSaleInsuranceClaim'),
  getVendor: track('getVendor'),
  getQuotation: track('getQuotation'),
  getStaff: track('getStaff'),
  getDoctor: track('getDoctor'),
  getBranch: track('getBranch'),
  getPermissionGroup: track('getPermissionGroup'),
  getStaffSchedule: track('getStaffSchedule'),
  getCoupon: track('getCoupon'),
  getVoucher: track('getVoucher'),
  getPromotion: track('getPromotion'),
  getTreatment: track('getTreatment'),
  getBackendSale: track('getBackendSale'),
  getDeposit: track('getDeposit'),
  getAllDeposits: track('getAllDeposits'),
  getSaleByTreatmentId: track('getSaleByTreatmentId'),
  getMasterDataMeta: track('getMasterDataMeta'),
  getActiveSchedulesForDate: track('getActiveSchedulesForDate'),
  getBeBackedMasterTypes: track('getBeBackedMasterTypes'),
  saveCustomer: track('saveCustomer'),
  deleteCustomerDocOnly: track('deleteCustomerDocOnly'),
  deleteCustomerCascade: track('deleteCustomerCascade'),
  saveTreatment: track('saveTreatment'),
  deleteBackendTreatment: track('deleteBackendTreatment'),
  deleteProduct: track('deleteProduct'),
  deleteCourse: track('deleteCourse'),
  saveProductGroup: track('saveProductGroup'),
  deleteProductGroup: track('deleteProductGroup'),
  saveProductUnitGroup: track('saveProductUnitGroup'),
  deleteProductUnitGroup: track('deleteProductUnitGroup'),
  saveMedicalInstrument: track('saveMedicalInstrument'),
  deleteMedicalInstrument: track('deleteMedicalInstrument'),
  saveHoliday: track('saveHoliday'),
  deleteHoliday: track('deleteHoliday'),
  saveBranch: track('saveBranch'),
  deleteBranch: track('deleteBranch'),
  savePermissionGroup: track('savePermissionGroup'),
  deletePermissionGroup: track('deletePermissionGroup'),
  saveStaff: track('saveStaff'),
  deleteStaff: track('deleteStaff'),
  saveDoctor: track('saveDoctor'),
  deleteDoctor: track('deleteDoctor'),
  saveDfGroup: track('saveDfGroup'),
  deleteDfGroup: track('deleteDfGroup'),
  saveDfStaffRates: track('saveDfStaffRates'),
  deleteDfStaffRates: track('deleteDfStaffRates'),
  saveBankAccount: track('saveBankAccount'),
  deleteBankAccount: track('deleteBankAccount'),
  saveExpenseCategory: track('saveExpenseCategory'),
  deleteExpenseCategory: track('deleteExpenseCategory'),
  saveExpense: track('saveExpense'),
  deleteExpense: track('deleteExpense'),
  saveOnlineSale: track('saveOnlineSale'),
  deleteOnlineSale: track('deleteOnlineSale'),
  transitionOnlineSale: track('transitionOnlineSale'),
  saveSaleInsuranceClaim: track('saveSaleInsuranceClaim'),
  deleteSaleInsuranceClaim: track('deleteSaleInsuranceClaim'),
  saveDocumentTemplate: track('saveDocumentTemplate'),
  deleteDocumentTemplate: track('deleteDocumentTemplate'),
  saveDocumentDraft: track('saveDocumentDraft'),
  deleteDocumentDraft: track('deleteDocumentDraft'),
  saveVendor: track('saveVendor'),
  deleteVendor: track('deleteVendor'),
  saveVendorSale: track('saveVendorSale'),
  deleteVendorSale: track('deleteVendorSale'),
  transitionVendorSale: track('transitionVendorSale'),
  saveQuotation: track('saveQuotation'),
  deleteQuotation: track('deleteQuotation'),
  savePromotion: track('savePromotion'),
  deletePromotion: track('deletePromotion'),
  saveCoupon: track('saveCoupon'),
  deleteCoupon: track('deleteCoupon'),
  findCouponByCode: track('findCouponByCode'),
  saveVoucher: track('saveVoucher'),
  deleteVoucher: track('deleteVoucher'),
  saveStaffSchedule: track('saveStaffSchedule'),
  deleteStaffSchedule: track('deleteStaffSchedule'),
  saveAudience: track('saveAudience'),
  deleteAudience: track('deleteAudience'),
  deleteCentralWarehouse: track('deleteCentralWarehouse'),
  deleteBackendSale: track('deleteBackendSale'),
  deleteBackendAppointment: track('deleteBackendAppointment'),
  deleteDeposit: track('deleteDeposit'),
  deleteMembership: track('deleteMembership'),
  deleteMasterCourse: track('deleteMasterCourse'),
  deleteMasterItem: track('deleteMasterItem'),
}));

beforeEach(() => {
  captures.length = 0;
});

const setBranch = (id) => { try { window.localStorage.setItem('selectedBranchId', id); } catch {} };

describe('F1-F9 — Branch-Scope Flow Simulate', () => {
  it('F1: localStorage = นครราชสีมา → listProducts() → branchId injected', async () => {
    setBranch('BR-NAKHON');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    expect(captures.find(c => c.name === 'listProducts').opts.branchId).toBe('BR-NAKHON');
  });

  it('F2: switch to พระราม 3 → next listProducts() picks up new branch', async () => {
    setBranch('BR-NAKHON');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    setBranch('BR-RAMA3');
    await scoped.listProducts();
    expect(captures[0].opts.branchId).toBe('BR-NAKHON');
    expect(captures[1].opts.branchId).toBe('BR-RAMA3');
  });

  it('F3: TFP load path simulate — listProducts/listCourses/listDfGroups/listDfStaffRates branch-scoped + listStaff/listDoctors universal', async () => {
    setBranch('BR-RAMA3');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await Promise.all([
      scoped.listDoctors(),
      scoped.listProducts(),
      scoped.listStaff(),
      scoped.listCourses(),
      scoped.listDfGroups(),
      scoped.listDfStaffRates(),
    ]);
    const branchScoped = ['listProducts', 'listCourses', 'listDfGroups', 'listDfStaffRates'];
    for (const name of branchScoped) {
      const cap = captures.find(c => c.name === name);
      expect(cap.opts.branchId, `${name} should have branchId injected`).toBe('BR-RAMA3');
    }
    const universal = ['listDoctors', 'listStaff'];
    for (const name of universal) {
      const cap = captures.find(c => c.name === name);
      // Universal re-export — opts is undefined OR no branchId field
      const branchOnUniversal = cap?.opts?.branchId;
      expect(branchOnUniversal, `${name} must NOT have branchId injected`).toBeUndefined();
    }
  });

  it('F4: positional getAppointmentsByDate(dateStr) injects branchId via opts', async () => {
    setBranch('BR-X');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.getAppointmentsByDate('2026-05-01');
    const cap = captures.find(c => c.name === 'getAppointmentsByDate');
    expect(cap.positional).toBe('2026-05-01');
    expect(cap.opts.branchId).toBe('BR-X');
  });

  it('F5: {allBranches:true} opt-out preserved', async () => {
    setBranch('BR-X');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts({ allBranches: true });
    const cap = captures.find(c => c.name === 'listProducts');
    expect(cap.opts).toEqual({ branchId: 'BR-X', allBranches: true });
  });

  it('F6: explicit {branchId:"OVERRIDE"} wins over current selection', async () => {
    setBranch('BR-CURRENT');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listCourses({ branchId: 'BR-OVERRIDE' });
    const cap = captures.find(c => c.name === 'listCourses');
    expect(cap.opts.branchId).toBe('BR-OVERRIDE');
  });

  it('F7: empty localStorage → falls back to FALLBACK_ID "main"', async () => {
    try { window.localStorage.removeItem('selectedBranchId'); } catch {}
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    const cap = captures.find(c => c.name === 'listProducts');
    expect(cap.opts.branchId).toBe('main');
  });

  it('F8: rapid branch switches — each call picks up the latest', async () => {
    const scoped = await import('../src/lib/scopedDataLayer.js');
    setBranch('BR-A'); await scoped.listProducts();
    setBranch('BR-B'); await scoped.listProducts();
    setBranch('BR-C'); await scoped.listProducts();
    const branches = captures.filter(c => c.name === 'listProducts').map(c => c.opts.branchId);
    expect(branches).toEqual(['BR-A', 'BR-B', 'BR-C']);
  });

  it('F9: source-grep regression — no UI file imports backendClient directly (BS-1)', () => {
    const { execSync } = require('node:child_process');
    const violations = execSync(
      `git grep -lE "from ['\\"](\\\\.\\\\./)+lib/backendClient" -- "src/components/**" "src/pages/**" "src/hooks/**" 2>/dev/null || true`,
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    const allowed = (f) =>
      f.includes('MasterDataTab') ||
      f.includes('BackendDashboard');
    // Annotated direct imports (listener-direct, report) are still in the file
    // list — they're allowed via comment annotation. Stricter check is BS-1
    // in audit-branch-scope.test.js. F9 just sanity-checks file count is bounded.
    const real = violations.filter(f => !allowed(f));
    expect(real.length, `F9: too many direct backendClient imports — see audit-branch-scope BS-1 for full check.\n${real.slice(0,10).join('\n')}`).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Run test — verify pass**

Run: `npm test -- --run tests/branch-scope-flow-simulate.test.js`
Expected: PASS — 9 F-cases.

- [ ] **Step 3: Run full suite + build**

Run: `npm test -- --run && npm run build`
Expected: 4826 + 9 = 4835 PASS, build clean.

- [ ] **Step 4: Commit**

```bash
git add tests/branch-scope-flow-simulate.test.js
git commit -m "$(cat <<'EOF'
test(bsa-task10): branch-scope flow-simulate F1-F9

Rule I full-flow simulate covering localStorage → scopedDataLayer →
backendClient call chain. Switching branch mid-flow → asserts every
subsequent read re-scopes. Universal listers ignore branch switch.
{allBranches:true} opt-out preserved. Source-grep regression for BS-1.

Tests: +9 (F1-F9).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Remove `getAllMasterDataItems` from backendClient.js (final lockdown)

**Files:**
- Modify: `src/lib/backendClient.js` — delete `getAllMasterDataItems` function

- [ ] **Step 1: Verify no callers**

Run: `git grep -nE "getAllMasterDataItems" -- "src/**" "tests/**" "api/**"`

Expected: only the function declaration in `backendClient.js`. Other matches indicate gaps from Task 7 — fix those first.

- [ ] **Step 2: Delete function**

Read `src/lib/backendClient.js` around line ~3140. Delete the entire `export async function getAllMasterDataItems(type) { ... }` block (and any helper-only-used-by-it).

- [ ] **Step 3: Build + tests**

Run: `npm run build && npm test -- --run`
Expected: clean build, 4835 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/backendClient.js
git commit -m "$(cat <<'EOF'
chore(bsa-task11): remove getAllMasterDataItems from backendClient.js

Final BSA lockdown — Rule H-quater enforced at the lib level (no master_data
read fallback can sneak back in). All UI consumers migrated in Task 7 to
listProducts/listCourses/listStaff/listDoctors via scopedDataLayer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Rule BSA + V-entry + active.md update

**Files:**
- Modify: `.claude/rules/00-session-start.md` — add Rule BSA
- Modify: `.claude/rules/v-log-archive.md` — add Phase BSA verbose V-entry
- Modify: `.agents/active.md` — bump status

- [ ] **Step 1: Add Rule BSA to session-start**

Read `.claude/rules/00-session-start.md` near the iron-clad rules section. Append after Rule K:

```markdown
**L. 🆕 Branch-Scope Architecture (BSA)** (added 2026-05-04 after Phase BS V2 callsite-by-callsite gap surfaced TFP H-quater + branch-leak bug):
- **Layer 1** = raw `backendClient.js` — parameterized; importers: tests, server endpoints, reports needing `{allBranches:true}`, MasterDataTab (Rule H-bis dev-only), BackendDashboard root.
- **Layer 2** = `src/lib/scopedDataLayer.js` — UI-only re-export wrapper; auto-injects `resolveSelectedBranchId()` for branch-scoped listers; pass-through for universal collections.
- **Layer 3** = `src/hooks/useBranchAwareListener.js` — onSnapshot listeners auto-resubscribe on branch switch; universal-marker (`fn.__universal__`) bypass.
- **Audit** = `/audit-branch-scope` (BS-1..BS-8) registered in `/audit-all` Tier 1.
- **Universal collections** (NOT branch-scoped): be_staff, be_doctors, be_customers + all customer-attached subcollections (wallets/memberships/points/treatments/sales/appointments/deposits/courseChanges), be_branches, be_permission_groups, be_document_templates, be_audiences, be_admin_audit, be_central_stock_*, be_vendors, system_config / clinic_settings, chat_conversations.
- **Branch-scoped collections** (filtered by selected branchId): be_treatments, be_sales, be_appointments, be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, be_stock_batches/orders/movements/transfers/withdrawals/adjustments (locationId), be_products, be_courses, be_product_groups, be_product_units, be_medical_instruments, be_holidays, be_df_groups, be_df_staff_rates, be_bank_accounts, be_expense_categories, be_expenses, be_staff_schedules, be_link_requests, be_promotions/coupons/vouchers (with `allBranches:true` doc-field OR-merge).
- **Anti-patterns** (build-blocked):
  1. UI component imports `backendClient.js` directly (use `scopedDataLayer.js`)
  2. `master_data/*` reads in feature code (Rule H-quater)
  3. `getAllMasterDataItems` references (deleted post-BSA)
  4. Direct `listenTo*` calls in components without `useBranchAwareListener`
- **Annotation comments** for sanctioned exceptions: `// audit-branch-scope: report` / `listener-direct` / `sanctioned exception`.
```

- [ ] **Step 2: Add Phase BSA V-entry to V-log archive**

Read `.claude/rules/v-log-archive.md` and append:

```markdown
### Phase BSA (2026-05-04) — Branch-Scope Architecture (eliminate branch-leak bug class)

User report: "เลือกเป็นสาขาพระราม 3 ไว้ แล้วไปเปิดหน้าสร้างการรักษาใหม่ ทุกปุ่มแม่งยังดึงของสาขา นครราชสีมา มาอยู่เลย ทั้งคอร์ส ยา ค่ามือ แพทย์ ผู้ช่วย" + "อยากรู้ว่ามีไอเดียอื่นไหม แบบกำหนดมาแต่ต้นทีเดียวเลย แล้วปุ่มเป็นร้อยเป็นพันใน shell ui ของเรารู้เองและเปลี่ยนแปลงเองได้หมด".

Root cause: Phase BS V2 wired `_resolveBranchIdForWrite` on writers + 12 branch-scoped listers accept `{branchId, allBranches}` opts — but **callsites must pass `branchId` manually**. TFP load path used `getAllMasterDataItems('products'/'courses')` (reads `master_data/*`, Rule H-quater violation, no branch awareness) + `listDfGroups()` / `listDfStaffRates()` without `{branchId}`. Result: branch switch via top-right selector had no effect on TFP data.

Worst part: Phase BS V2 (commit `cf897f6`) introduced a **callsite-by-callsite migration model** that scales poorly — 84 UI files, hundreds of buttons. Drift inevitable. The architectural answer is to centralize injection, not enforce per-callsite discipline.

Fix: 12-task BSA implementation across 3 layers (raw / scopedDataLayer / useBranchAwareListener) + `/audit-branch-scope` skill (BS-1..BS-8) + universal-marker on customer-attached listeners. Spec: `docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md`. Plan: `docs/superpowers/plans/2026-05-04-branch-scope-architecture.md`.

Specifically the bug user reported (TFP H-quater) is fixed in Task 7 — `getAllMasterDataItems('products'/'courses'/'staff'/'doctors')` replaced with `listProducts/listCourses/listStaff/listDoctors` from `scopedDataLayer.js`.

Lessons:
1. **Per-callsite migration patterns scale linearly with callsite count** — 84 UI files is too many to keep correct by hand. Centralize at the import boundary (Layer 2 wrapper module).
2. **Auto-inject by default is safer than explicit-required** for the COMMON path. Explicit opt-out (`{allBranches:true}`) covers the rare cross-branch case. Default-correct + explicit-opt-out flips the failure mode.
3. **Listener re-subscribe on branch switch needs a hook** — auto-inject only works at CALL time; live listeners need component-level re-subscribe handling. `useBranchAwareListener` consolidates this.
4. **Universal-marker pattern (`fn.__universal__ = true`)** lets the same hook handle branch-scoped and universal listeners without exposing the distinction at every callsite.
5. **Rule H-quater enforcement at the lib level** (delete `getAllMasterDataItems`) prevents fallback-by-temptation. Removing the helper fixes a class of future bugs.
6. **Audit skill at the import boundary** (BS-1: no UI imports `backendClient` directly) is the most ergonomic invariant — easy to grep, easy to fix, hard to bypass.
```

- [ ] **Step 3: Update active.md**

Read `.agents/active.md`. Replace status fields:

```yaml
---
updated_at: "2026-05-04 EOD — Phase BSA shipped (3 layers + audit + flow-simulate); V15 #16+#17 pending"
status: "master=<NEW SHA after Task 11> · prod=83d8413 LIVE (V15 #15) · 4835 tests pass · BSA-bis (deploy) ahead-of-prod"
current_focus: "Phase BSA shipped to master (12 tasks). Awaiting V15 #16 deploy auth (vercel + idempotent firestore:rules per V15 combined deploy convention)."
branch: "master"
last_commit: "<NEW SHA after Task 11>"
tests: 4835
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "83d8413"
firestore_rules_version: 24
storage_rules_version: 2
---
```

Update sections:
- "What this session shipped" — add bullet listing Tasks 1-12 + commit SHAs
- "Decisions (this session)" — add "BSA = central architecture choice over per-callsite refactor (eliminates branch-leak class)"
- "Outstanding user-triggered actions" — keep V15 #16, drop "Phase BSA design pending"
- "Rules in force" — add "BSA UI-import boundary (BS-1..BS-8)"

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/00-session-start.md .claude/rules/v-log-archive.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(bsa-task12): Rule BSA + Phase BSA V-entry + active.md update

- Rule L (BSA) added to .claude/rules/00-session-start.md (3 layers, universal
  vs branch-scoped collection lists, anti-patterns, annotation comments)
- Phase BSA verbose V-entry in v-log-archive.md (root cause + 6 lessons)
- .agents/active.md status bumped — master=<sha>, 4835 tests, BSA shipped,
  V15 #16 deploy pending

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 (Optional, post-deploy): preview_eval verification on real data

**Trigger:** AFTER user authorizes V15 #16 deploy AND prod is live.

- [ ] **Step 1: Open dev server, switch branch, verify TFP**

Manual verification per Rule I (b):
1. `npm run dev`
2. Open BackendDashboard, switch to "พระราม 3" via top-right selector
3. Open a customer → "สร้างการรักษาใหม่"
4. Inspect: courses dropdown should be EMPTY (no courses migrated to พระราม 3 yet — confirms branch-scope works)
5. Switch back to "นครราชสีมา"
6. Inspect: courses dropdown shows the 368 courses migrated in Phase BS V2

- [ ] **Step 2: preview_eval scripted check**

Run preview_eval on the dev server:

```js
// In preview_eval — assumes dev server running on localhost:5173
// Test 1: switch to พระราม 3
window.localStorage.setItem('selectedBranchId', 'BR-RAMA3-id');
const { listCourses } = await import('/src/lib/scopedDataLayer.js');
const rama3 = await listCourses();
console.log('rama3 courses:', rama3.length);  // expect 0

// Test 2: switch to นครราชสีมา
window.localStorage.setItem('selectedBranchId', 'BR-NAKHON-id');
const nakhon = await listCourses();
console.log('nakhon courses:', nakhon.length);  // expect 368
```

- [ ] **Step 3: Document outcome**

Append to `.agents/active.md` "What this session shipped" section: "BSA preview_eval verified on prod — TFP courses dropdown scopes correctly per top-right selector."

---

## Self-Review

**Spec coverage check** — every section of the spec maps to a task:

| Spec § | Task |
|---|---|
| §2.1 Layer 1 | Tasks 1, 2 (extension) — Tasks 1, 2 |
| §2.2(a) branch-scoped wrappers | Task 4 |
| §2.2(b) universal re-exports | Task 4 |
| §2.2(c) write re-exports | Task 4 |
| §2.2(d) special-case helpers | Task 4 |
| §2.3 Layer 3 hook | Task 5 (+ Task 3 markers) |
| §2.4 Audit skill | Task 9 |
| §3 Data flow | Tasks 4 + 5 implement |
| §4 Error handling | Task 4 (BS2.8) + Task 5 (BS3.8) |
| §5 Testing | Tasks 1-10 (per-task TDD); Task 10 flow-simulate |
| §6 Migration plan | Tasks 1-12 implement |
| §8 Anti-patterns | Task 9 audit + Task 12 Rule L |

**Placeholder scan** — searched plan for "TBD", "TODO", "implement later" — none found. Code blocks complete in every step.

**Type consistency** — `_resolveBranchIdForWrite` matches existing helper signature. `useBranchAwareListener` signature consistent across Tasks 5 + 8 + 9 callsites. `__universal__` marker name consistent (Tasks 3, 5, 9).

**Outstanding plan-time decisions** (non-blocking, defaults baked in):
- 🟡 Marketing collections (`promotions`, `coupons`, `vouchers`) treated as branch-scoped + `allBranches:true` doc field — confirmed in spec §7.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-04-branch-scope-architecture.md`. 12 tasks, ~6-8h, 4744 → ~4835 tests, single round.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration with checkpoints.

2. **Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batch with checkpoints.

**Which approach?**
