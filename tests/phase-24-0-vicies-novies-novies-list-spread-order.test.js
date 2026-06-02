// ─── Phase 24.0-vicies-novies-novies — list spread-order V12 fix (V38) ────
//
// Bug 2026-05-07: handleDelete silent no-op for พระราม 3 catalog (5 products
// + 2 courses) because data has stray `id` field that overrode `doc.id` in
// the spread `{id: d.id, ...d.data()}`. handleDelete fell back to wrong path.
//
// Fix: swap spread order in listProducts + listCourses to
// `{...d.data(), id: d.id}` so docId always wins. Plus Rule M data backfill
// stamps productId/courseId = docId on the 7 affected docs.
//
// This test locks the spread order + the resolution invariant.
//
// V12 multi-reader-sweep: pattern `{id: d.id, ...d.data()}` is risky any time
// data MAY contain `id` field. Audit AV17 enforces the safer order across
// listers in backendClient.js.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideBackfillAction, buildBackfillPatch } from '../scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const BACKEND_CLIENT_PATH = path.join(ROOT, 'src', 'lib', 'backendClient.js');
const PRODUCTS_TAB_PATH = path.join(ROOT, 'src', 'components', 'backend', 'ProductsTab.jsx');
const COURSES_TAB_PATH = path.join(ROOT, 'src', 'components', 'backend', 'CoursesTab.jsx');

function read(p) { return fs.readFileSync(p, 'utf-8'); }

// ─── Pure simulator mirroring listProducts/listCourses spread + sort logic ──
//
// Mirror of post-fix spread order; if backendClient.js drifts, source-grep
// regression below catches it. This simulator lets us chain the bug scenario
// through to handleDelete without booting the SDK.
function simulateListWithSpreadOrder(docs, postFix = true) {
  return docs.map(d => postFix
    ? ({ ...d.data(), id: d.id })  // ← FIX: docId always wins
    : ({ id: d.id, ...d.data() })  // ← BUG: data.id can override docId
  );
}

// Mirror of handleDelete id-resolution logic from ProductsTab/CoursesTab.
function resolveDeleteIdProduct(p) { return p.productId || p.id; }
function resolveDeleteIdCourse(c) { return c.courseId || c.id; }

// Fixture mimicking the actual production data shape from the diag run.
function makeBaselineMigratedProduct({ docId, strayId, productId }) {
  // Mirror of `data()` return — what's stored in Firestore.
  const stored = {
    productName: 'Test Product',
    branchId: 'BR-TEST-1',
    status: 'ใช้งาน',
    // ← Synthetic branch-merge migration left `id` data field with a stray
    //   ProClinic numeric ID (e.g. "276") that has no Firestore counterpart.
    id: strayId,
    _branchBaselineMigratedAt: '2026-05-05T07:52:07.082Z',
    _branchBaselineMigratedBy: 'admin-script-2026-05-06',
    createdAt: '2026-04-20T15:49:21.835Z',
    updatedAt: '2026-05-05T07:52:07.082Z',
  };
  if (productId !== undefined) stored.productId = productId;
  return { id: docId, data: () => stored };
}

function makeCanonicalProduct({ docId }) {
  return {
    id: docId,
    data: () => ({
      productId: docId,
      productName: 'Canonical Product',
      branchId: 'BR-TEST-1',
      status: 'ใช้งาน',
      createdAt: '2026-04-20T15:49:21.835Z',
      updatedAt: '2026-05-05T07:52:07.082Z',
    }),
  };
}

function makeBaselineMigratedCourse({ docId, strayId, courseId }) {
  const stored = {
    courseName: 'Test Course',
    branchId: 'BR-TEST-1',
    status: 'ใช้งาน',
    id: strayId,
    _branchBaselineMigratedAt: '2026-05-05T07:52:07.082Z',
  };
  if (courseId !== undefined) stored.courseId = courseId;
  return { id: docId, data: () => stored };
}

// ─── S1 — listProducts spread order regression guard ────────────────────────
describe('S1 — listProducts spread order (V38)', () => {
  it('S1.1 source has post-fix spread `{ ...d.data(), id: d.id }` in listProducts', () => {
    const src = read(BACKEND_CLIENT_PATH);
    // Post-fix pattern present
    expect(src).toMatch(/listProducts[\s\S]*?snap\.docs\.map\(d =>\s*\(\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}\)\)/);
  });

  it('S1.2 listProducts does NOT carry the legacy `{ id: d.id, ...d.data() }` order', () => {
    const src = read(BACKEND_CLIENT_PATH);
    const listProductsBlock = src.match(/export async function listProducts[\s\S]*?\n\}\s*\n/)?.[0] || '';
    expect(listProductsBlock).not.toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)/);
    // Sanity: listProducts block was found
    expect(listProductsBlock.length).toBeGreaterThan(0);
  });

  it('S1.3 carries V38 marker comment for institutional memory', () => {
    const src = read(BACKEND_CLIENT_PATH);
    expect(src).toMatch(/Phase 24\.0-vicies-novies-novies \(V38, 2026-05-07\)/);
  });
});

// ─── S2 — listCourses spread order regression guard ─────────────────────────
describe('S2 — listCourses spread order (V38)', () => {
  it('S2.1 source has post-fix spread in listCourses', () => {
    const src = read(BACKEND_CLIENT_PATH);
    expect(src).toMatch(/listCourses[\s\S]*?snap\.docs\.map\(d =>\s*\(\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}\)\)/);
  });

  it('S2.2 listCourses does NOT carry the legacy spread order', () => {
    const src = read(BACKEND_CLIENT_PATH);
    const listCoursesBlock = src.match(/export async function listCourses[\s\S]*?\n\}\s*\n/)?.[0] || '';
    expect(listCoursesBlock).not.toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)/);
    expect(listCoursesBlock.length).toBeGreaterThan(0);
  });
});

// ─── S3 — pure simulator: post-fix spread always returns docId on `.id` ────
describe('S3 — post-fix spread order: docId always wins', () => {
  it('S3.1 baseline-migrated product (data.id set) → p.id === docId', () => {
    const fixture = makeBaselineMigratedProduct({
      docId: 'PRODUCTS_1777967527082_64A50F46',
      strayId: '276', // legacy ProClinic numeric ID overriding docId
      // productId field absent → triggers the bug pre-fix
    });
    const items = simulateListWithSpreadOrder([fixture], /* postFix */ true);
    expect(items[0].id).toBe('PRODUCTS_1777967527082_64A50F46');
    // The stray data.id is NO LONGER present after spread (it's overwritten)
    expect(items[0].id).not.toBe('276');
  });

  it('S3.2 canonical product (data.productId set, no stray id) → p.id === docId', () => {
    const fixture = makeCanonicalProduct({ docId: '1020' });
    const items = simulateListWithSpreadOrder([fixture], /* postFix */ true);
    expect(items[0].id).toBe('1020');
    expect(items[0].productId).toBe('1020');
  });

  it('S3.3 PRE-fix simulator demonstrates the bug (regression doc — V38)', () => {
    const fixture = makeBaselineMigratedProduct({
      docId: 'PRODUCTS_TEST',
      strayId: 'WRONG-ID',
    });
    const items = simulateListWithSpreadOrder([fixture], /* postFix */ false);
    // PRE-fix: stray data.id wins over docId — this is the bug.
    expect(items[0].id).toBe('WRONG-ID');
    expect(items[0].id).not.toBe('PRODUCTS_TEST');
  });
});

// ─── S4 — handleDelete id-resolution chain (the user-visible bug surface) ──
describe('S4 — handleDelete resolveDeleteId (V38)', () => {
  it('S4.1 baseline-migrated product, post-fix list → resolves to docId', () => {
    const fixture = makeBaselineMigratedProduct({
      docId: 'PRODUCTS_1777967527082_64A50F46',
      strayId: '276',
    });
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(resolveDeleteIdProduct(p)).toBe('PRODUCTS_1777967527082_64A50F46');
  });

  it('S4.2 canonical product → resolveDeleteId picks productId === docId (parity)', () => {
    const fixture = makeCanonicalProduct({ docId: '1020' });
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(resolveDeleteIdProduct(p)).toBe('1020');
  });

  it('S4.3 PRE-fix list + missing productId → resolves to WRONG id (regression doc)', () => {
    const fixture = makeBaselineMigratedProduct({ docId: 'PRODUCTS_TEST', strayId: 'WRONG-ID' });
    const [p] = simulateListWithSpreadOrder([fixture], false);
    // Reproduces the bug: handleDelete sends the WRONG id to deleteDoc.
    expect(resolveDeleteIdProduct(p)).toBe('WRONG-ID');
  });

  it('S4.4 baseline-migrated course resolves to docId (mirror of S4.1)', () => {
    const fixture = makeBaselineMigratedCourse({
      docId: 'COURSES_1777967563065_6DF545FE',
      strayId: '1235',
    });
    const [c] = simulateListWithSpreadOrder([fixture], true);
    expect(resolveDeleteIdCourse(c)).toBe('COURSES_1777967563065_6DF545FE');
  });

  it('S4.5 baseline-migrated course with backfilled courseId → resolves to docId via courseId', () => {
    // Post-Part-B state: courseId stamped to docId
    const fixture = makeBaselineMigratedCourse({
      docId: 'COURSES_1777967563065_6DF545FE',
      strayId: '1235',
      courseId: 'COURSES_1777967563065_6DF545FE',
    });
    const [c] = simulateListWithSpreadOrder([fixture], true);
    expect(resolveDeleteIdCourse(c)).toBe('COURSES_1777967563065_6DF545FE');
    expect(c.courseId).toBe('COURSES_1777967563065_6DF545FE');
  });
});

// ─── S5 — adversarial inputs ────────────────────────────────────────────────
describe('S5 — adversarial spread inputs', () => {
  it('S5.1 data.id is null → docId still wins (post-fix)', () => {
    const fixture = { id: 'DOC-1', data: () => ({ id: null, productName: 'X' }) };
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(p.id).toBe('DOC-1');
  });

  it('S5.2 data.id is empty string → docId still wins', () => {
    const fixture = { id: 'DOC-2', data: () => ({ id: '', productName: 'X' }) };
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(p.id).toBe('DOC-2');
  });

  it('S5.3 data.id is number → docId (string) still wins', () => {
    const fixture = { id: 'DOC-3', data: () => ({ id: 999, productName: 'X' }) };
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(p.id).toBe('DOC-3');
  });

  it('S5.4 data has no `id` field → docId always set (pre-fix would also work here)', () => {
    const fixture = { id: 'DOC-4', data: () => ({ productName: 'X' }) };
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(p.id).toBe('DOC-4');
    const [pPre] = simulateListWithSpreadOrder([fixture], false);
    expect(pPre.id).toBe('DOC-4');
  });

  it('S5.5 docId with Thai chars survives spread (Thai-locale safety)', () => {
    const fixture = { id: 'PRODUCT-ไทย-001', data: () => ({ id: 'override', productName: 'X' }) };
    const [p] = simulateListWithSpreadOrder([fixture], true);
    expect(p.id).toBe('PRODUCT-ไทย-001');
  });
});

// ─── S6 — backfill script pure-helper coverage ──────────────────────────────
describe('S6 — backfill script decideBackfillAction', () => {
  it('S6.1 missing entityId → backfill', () => {
    const r = decideBackfillAction({
      docId: 'PRODUCTS_X',
      data: { id: '276', productName: 'A' },
      entityIdField: 'productId',
    });
    expect(r.action).toBe('backfill');
  });

  it('S6.2 entityId === docId → skip already-canonical', () => {
    const r = decideBackfillAction({
      docId: '1020',
      data: { productId: '1020', productName: 'A' },
      entityIdField: 'productId',
    });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('already-canonical');
  });

  it('S6.3 entityId !== docId → skip mismatch (NOT auto-touched)', () => {
    const r = decideBackfillAction({
      docId: 'PRODUCTS_NEW',
      data: { productId: 'OLD-ID', productName: 'A' },
      entityIdField: 'productId',
    });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('mismatch-entity-id');
    expect(r.stored).toBe('OLD-ID');
  });

  it('S6.4 empty-string entityId → backfill (treated as missing)', () => {
    const r = decideBackfillAction({
      docId: 'PRODUCTS_X',
      data: { productId: '', id: '276' },
      entityIdField: 'productId',
    });
    expect(r.action).toBe('backfill');
  });

  it('S6.5 invalid docId → skip', () => {
    const r = decideBackfillAction({ docId: '', data: { productName: 'A' }, entityIdField: 'productId' });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('invalid-docid');
  });

  it('S6.6 invalid data → skip', () => {
    const r = decideBackfillAction({ docId: 'X', data: null, entityIdField: 'productId' });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('invalid-data');
  });

  it('S6.7 buildBackfillPatch carries entityId + forensic fields', () => {
    const patch = buildBackfillPatch({
      docId: 'PRODUCTS_TEST',
      entityIdField: 'productId',
      forensicAtField: '_productIdBackfilledAt',
      forensicFromField: '_productIdBackfilledFrom',
      priorIdField: '276',
    });
    expect(patch.productId).toBe('PRODUCTS_TEST');
    expect(patch._productIdBackfilledAt).toBeDefined(); // FieldValue.serverTimestamp() sentinel
    expect(patch._productIdBackfilledFrom).toBe('276');
  });

  it('S6.8 buildBackfillPatch tolerates undefined priorIdField', () => {
    const patch = buildBackfillPatch({
      docId: 'PRODUCTS_TEST',
      entityIdField: 'productId',
      forensicAtField: '_productIdBackfilledAt',
      forensicFromField: '_productIdBackfilledFrom',
      priorIdField: undefined,
    });
    expect(patch._productIdBackfilledFrom).toBeNull();
  });
});

// ─── S7 — handleDelete UI source-grep regression guard ──────────────────────
describe('S7 — UI handleDelete contract (ProductsTab + CoursesTab)', () => {
  it('S7.1 ProductsTab handleDelete uses `p.productId || p.id` resolution', () => {
    const src = read(PRODUCTS_TAB_PATH);
    // Allow flexibility in variable name (p / product / etc.)
    expect(src).toMatch(/const\s+id\s*=\s*\w+\.productId\s*\|\|\s*\w+\.id\s*;/);
  });

  it('S7.2 CoursesTab handleDelete uses `c.courseId || c.id` resolution', () => {
    const src = read(COURSES_TAB_PATH);
    expect(src).toMatch(/const\s+id\s*=\s*\w+\.courseId\s*\|\|\s*\w+\.id\s*;/);
  });

  it('S7.3 ProductsTab routes delete through productDeleteClient cascade (V146/AV176 — was: bare deleteProduct from scopedDataLayer)', () => {
    // V146 (2026-06-02) — orphan-stock debug fix. ProductsTab delete moved from
    // the bare scopedDataLayer `deleteProduct` (doc-only, left orphan stock
    // batches + course refs) to the Guard+cascade `deleteProductWithCascade` /
    // `previewProductDelete` in productDeleteClient.js. The bare deleteProduct
    // import is now FORBIDDEN in the Products tab (AV176).
    const src = read(PRODUCTS_TAB_PATH);
    expect(src).toMatch(/import\s*\{[^}]*deleteProductWithCascade[^}]*\}\s*from\s*['"][^'"]*productDeleteClient/);
    expect(src).not.toMatch(/import\s*\{[^}]*\bdeleteProduct\b[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/);
  });

  it('S7.4 CoursesTab imports deleteCourse from scopedDataLayer', () => {
    const src = read(COURSES_TAB_PATH);
    expect(src).toMatch(/import\s*\{[^}]*deleteCourse[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/);
  });
});
