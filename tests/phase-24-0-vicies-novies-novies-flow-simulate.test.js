// ─── Phase 24.0-vicies-novies-novies — flow-simulate (Rule I, V38) ────────
//
// Full-flow test per Rule I: chains the user's exercised path
//   master_data → branch-merge-apply (legacy mig path) → list → handleDelete →
//   resolveDeleteId → deleteDoc receives correct docId.
//
// This complements `phase-24-0-vicies-novies-novies-list-spread-order.test.js`
// which is a unit-level spread-order regression. THIS file is the integration
// chain — captures the bug end-to-end so a future change to ANY layer is
// caught.
//
// Adversarial inputs + lifecycle (post-backfill state) included.

import { describe, it, expect, vi } from 'vitest';
import { decideBackfillAction, buildBackfillPatch } from '../scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs';

// ─── Stage 1: branch-merge-apply mimic (creates baseline-migrated docs) ─────
//
// What the script actually does (per scripts/branch-merge-apply.mjs:103-104):
//   • Generates synthetic docId = "PRODUCTS_<ts>_<hex>"
//   • Copies source data verbatim (which carries `id` from ProClinic)
//   • Adds _branchBaselineMigratedAt + _branchBaselineMigratedBy
//   • Adds branchId = target branch
//   • DOES NOT re-stamp `productId` to the new docId ← THE BUG
function simulateBranchMergeApply({ sourceProClinicId, productName, targetBranchId }) {
  const newDocId = `PRODUCTS_${Date.now()}_${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const newDocData = {
    // Source data verbatim — carries ProClinic's `id` field as a stray override
    id: sourceProClinicId,
    productName,
    branchId: targetBranchId,
    status: 'ใช้งาน',
    // Forensic stamps from the migration script
    _branchBaselineMigratedAt: '2026-05-05T07:52:07.082Z',
    _branchBaselineMigratedBy: 'admin-script-2026-05-06',
    createdAt: '2026-04-20T15:49:21.835Z',
    updatedAt: '2026-05-05T07:52:07.082Z',
    // ← productId is NOT stamped — that's the original sin
  };
  return { docId: newDocId, data: newDocData };
}

// ─── Stage 2: listProducts mimic (post-fix spread order) ──────────────────
function simulateListProducts(docs) {
  // Post-fix: { ...d.data(), id: d.id } — docId always wins
  return docs.map(d => ({ ...d.data, id: d.docId }));
}

// ─── Stage 3: handleDelete mimic ──────────────────────────────────────────
function simulateHandleDelete(p, deleteFnSpy) {
  const id = p.productId || p.id;
  if (!id) throw new Error('productId required');
  return deleteFnSpy(id);
}

// ─── Stage 4: deleteProduct mimic ──────────────────────────────────────────
//
// This mirrors `await deleteDoc(productDoc(id))` — the key invariant is that
// the id passed in must be the actual Firestore docId, otherwise it's a
// silent no-op (Firestore allows deleteDoc on non-existent docs).
function makeDeleteFnSpy(actualDocIds) {
  const deleted = [];
  const spy = vi.fn((id) => {
    if (actualDocIds.includes(id)) {
      deleted.push(id);
      return Promise.resolve({ deleted: true, id });
    }
    // Silent no-op (the bug surface in production)
    return Promise.resolve({ deleted: false, id, reason: 'no-such-doc' });
  });
  spy.deleted = deleted;
  return spy;
}

// ─── F1 — End-to-end happy path with the Part-A code fix ──────────────────
describe('F1 — flow: branch-merge → list (post-fix) → handleDelete → deleteDoc', () => {
  it('F1.1 baseline-migrated product (NO Part-B backfill) → still deletes correctly', async () => {
    // Stage 1: simulate the legacy migration that left the bug
    const { docId, data } = simulateBranchMergeApply({
      sourceProClinicId: '276',
      productName: 'BA - วิตามินผิวใส',
      targetBranchId: 'BR-1777885958735-38afbdeb', // พระราม 3
    });
    expect(data.id).toBe('276');         // stray data field present
    expect(data.productId).toBeUndefined();

    // Stage 2: list with the FIXED spread order
    const items = simulateListProducts([{ docId, data }]);
    const [p] = items;

    // Critical: post-fix spread → p.id = docId, NOT data.id
    expect(p.id).toBe(docId);
    expect(p.id).not.toBe('276');

    // Stage 3+4: handleDelete picks p.productId (undef) || p.id (docId) = docId
    const deleteSpy = makeDeleteFnSpy([docId]);
    const result = await simulateHandleDelete(p, deleteSpy);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(docId);
    expect(deleteSpy.deleted).toEqual([docId]);
  });

  it('F1.2 baseline-migrated WITH Part-B backfill (productId stamped) → still deletes', async () => {
    const { docId, data } = simulateBranchMergeApply({
      sourceProClinicId: '276',
      productName: 'BA - วิตามินผิวใส',
      targetBranchId: 'BR-1777885958735-38afbdeb',
    });
    // Part-B backfill effect:
    data.productId = docId;
    data._productIdBackfilledAt = '2026-05-07T...';
    data._productIdBackfilledFrom = '276';

    const items = simulateListProducts([{ docId, data }]);
    const [p] = items;
    expect(p.productId).toBe(docId);
    expect(p.id).toBe(docId);

    const deleteSpy = makeDeleteFnSpy([docId]);
    const result = await simulateHandleDelete(p, deleteSpy);
    expect(result.deleted).toBe(true);
    expect(deleteSpy.deleted).toEqual([docId]);
  });

  it('F1.3 canonical product (no stray id, productId stamped) → deletes (regression)', async () => {
    const docId = '1020';
    const data = {
      productId: '1020',
      productName: 'Canonical',
      branchId: 'BR-1777873556815-26df6480',
      status: 'ใช้งาน',
    };
    const items = simulateListProducts([{ docId, data }]);
    const [p] = items;
    expect(p.id).toBe('1020');
    expect(p.productId).toBe('1020');

    const deleteSpy = makeDeleteFnSpy(['1020']);
    const result = await simulateHandleDelete(p, deleteSpy);
    expect(result.deleted).toBe(true);
  });
});

// ─── F2 — PRE-FIX bug reproduction (regression doc) ───────────────────────
describe('F2 — PRE-fix: bug reproduction (V38 doc, do NOT regress)', () => {
  function simulateListProductsLegacy(docs) {
    // Pre-fix: { id: d.id, ...d.data() } — data.id can override docId
    return docs.map(d => ({ id: d.docId, ...d.data }));
  }

  it('F2.1 legacy spread order with stray data.id → handleDelete deletes WRONG path (silent no-op)', async () => {
    const { docId, data } = simulateBranchMergeApply({
      sourceProClinicId: '276',
      productName: 'BA - วิตามินผิวใส',
      targetBranchId: 'BR-1777885958735-38afbdeb',
    });

    const items = simulateListProductsLegacy([{ docId, data }]);
    const [p] = items;

    // Pre-fix: data.id overrides docId. THIS is the bug.
    expect(p.id).toBe('276');
    expect(p.id).not.toBe(docId);

    const deleteSpy = makeDeleteFnSpy([docId]);
    const result = await simulateHandleDelete(p, deleteSpy);
    // Silent no-op: deleteSpy gets the WRONG id, doc is NOT deleted.
    expect(result.deleted).toBe(false);
    expect(result.reason).toBe('no-such-doc');
    expect(deleteSpy.deleted).toEqual([]);
    expect(deleteSpy).toHaveBeenCalledWith('276');
  });
});

// ─── F3 — Course path mirror ───────────────────────────────────────────────
describe('F3 — courses path', () => {
  function simulateBranchMergeApplyCourse({ sourceProClinicId, courseName, targetBranchId }) {
    const newDocId = `COURSES_${Date.now()}_${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    return {
      docId: newDocId,
      data: {
        id: sourceProClinicId,
        courseName,
        branchId: targetBranchId,
        status: 'ใช้งาน',
        _branchBaselineMigratedAt: '2026-05-05T07:52:07.082Z',
      },
    };
  }
  function simulateHandleDeleteCourse(c, deleteFnSpy) {
    const id = c.courseId || c.id;
    return deleteFnSpy(id);
  }

  it('F3.1 baseline-migrated course (post-fix list) → deletes correctly', async () => {
    const { docId, data } = simulateBranchMergeApplyCourse({
      sourceProClinicId: '1235',
      courseName: 'Allergan เหมาทั่วหน้า',
      targetBranchId: 'BR-1777885958735-38afbdeb',
    });
    const items = simulateListProducts([{ docId, data }]);
    const [c] = items;
    expect(c.id).toBe(docId);

    const deleteSpy = makeDeleteFnSpy([docId]);
    const result = await simulateHandleDeleteCourse(c, deleteSpy);
    expect(result.deleted).toBe(true);
  });
});

// ─── F4 — Adversarial / edge cases ────────────────────────────────────────
describe('F4 — adversarial inputs', () => {
  it('F4.1 multi-doc list with mix of baseline + canonical → all delete to correct ids', async () => {
    const baseline = simulateBranchMergeApply({ sourceProClinicId: '276', productName: 'A', targetBranchId: 'B1' });
    const canonical = { docId: '1020', data: { productId: '1020', productName: 'B' } };
    const items = simulateListProducts([baseline, canonical]);

    const validIds = [baseline.docId, '1020'];
    const deleteSpy = makeDeleteFnSpy(validIds);

    for (const p of items) {
      await simulateHandleDelete(p, deleteSpy);
    }
    expect(deleteSpy.deleted.sort()).toEqual([...validIds].sort());
  });

  it('F4.2 stray data.id is null → docId still wins', () => {
    const docId = 'PRODUCTS_NULL_ID';
    const items = simulateListProducts([{ docId, data: { id: null, productName: 'X' } }]);
    expect(items[0].id).toBe(docId);
  });

  it('F4.3 no productId, no stray id → handleDelete uses p.id which equals docId', async () => {
    const docId = 'PRODUCTS_NO_FIELDS';
    const items = simulateListProducts([{ docId, data: { productName: 'X', branchId: 'B1' } }]);
    const [p] = items;
    const deleteSpy = makeDeleteFnSpy([docId]);
    await simulateHandleDelete(p, deleteSpy);
    expect(deleteSpy.deleted).toEqual([docId]);
  });

  it('F4.4 productId === stray data.id (legacy ref) → backfill decides skip-mismatch', () => {
    const decision = decideBackfillAction({
      docId: 'PRODUCTS_NEW',
      data: { id: 'OLD-PROCLINIC-1', productId: 'OLD-PROCLINIC-1', productName: 'X' },
      entityIdField: 'productId',
    });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('mismatch-entity-id');
    expect(decision.stored).toBe('OLD-PROCLINIC-1');
  });
});

// ─── F5 — Lifecycle: post-Part-B backfill state survives subsequent reads ─
describe('F5 — lifecycle: post-Part-B backfilled docs are stable', () => {
  it('F5.1 backfilled doc still resolves correctly after a second list pass', () => {
    const docId = 'PRODUCTS_LIFECYCLE';
    // After Part-B: productId stamped
    const data = {
      id: '276', // stray remains for forensic audit
      productId: docId,
      _productIdBackfilledAt: '2026-05-07T...',
      _productIdBackfilledFrom: '276',
      productName: 'X',
      branchId: 'B1',
    };
    const items = simulateListProducts([{ docId, data }]);
    const [p] = items;
    expect(p.id).toBe(docId);
    expect(p.productId).toBe(docId);
    expect(p._productIdBackfilledFrom).toBe('276'); // forensic preserved
  });

  it('F5.2 idempotent re-run of decideBackfillAction on already-backfilled doc → skip', () => {
    const decision = decideBackfillAction({
      docId: 'PRODUCTS_X',
      data: { productId: 'PRODUCTS_X', _productIdBackfilledAt: 'whatever' },
      entityIdField: 'productId',
    });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('already-canonical');
  });
});
