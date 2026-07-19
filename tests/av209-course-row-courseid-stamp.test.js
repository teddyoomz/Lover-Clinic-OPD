// AV209 follow-up (2026-07-19) — per-row courseId stamping at every course-row
// WRITER + the Rule M backfill decision helper.
//
// WHY: resolveCourseRowIndex resolves strongest via courseId, but the standard
// assignCourseToCustomer branches never stamped one → every legacy purchase row
// was identity-less. The irreducible AV209 tail (legacy row spliced + a
// same-name/product twin remains → identity search lands on the twin) is closed
// by (a) stamping unique per-ROW `crs-` ids on every new row (this file's
// execution locks) + (b) the one-shot prod backfill `crsbf-` (523 rows,
// scripts/av209-backfill-course-row-courseid.mjs — idempotent, audited).
//
// EXECUTION tests per V163 lesson: only the Firestore tx boundary is mocked;
// the real functions + real import graph run.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let _docData = null;
let _written = null;

vi.mock('firebase/firestore', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    runTransaction: async (_db, cb) => {
      const tx = {
        get: async () => ({ exists: () => _docData != null, data: () => _docData }),
        update: (_ref, payload) => { _written = payload; if (_docData) Object.assign(_docData, payload); },
        set: () => {},
      };
      return cb(tx);
    },
    setDoc: async () => {},
    serverTimestamp: () => 0,
  };
});

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

const CRS_RE = /^crs-\d+-\d+-[a-z0-9]+$/;

describe('AV209.stamp — assignCourseToCustomer stamps unique per-row crs- ids (EXECUTION)', () => {
  beforeEach(() => { _docData = { courses: [] }; _written = null; });

  it('E1 multi-product course → every row gets a UNIQUE crs- courseId', async () => {
    const { assignCourseToCustomer } = await import('../src/lib/backendClient.js');
    await assignCourseToCustomer('TEST-LC-AV209', {
      name: 'คอร์สทดสอบ AV209',
      price: 1000,
      products: [
        { name: 'Product A', qty: 5, unit: 'ครั้ง' },
        { name: 'Product B', qty: 3, unit: 'ครั้ง' },
      ],
    });
    const rows = _written.courses;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.courseId).toMatch(CRS_RE);
    expect(rows[0].courseId).not.toBe(rows[1].courseId);
  });

  it('E2 no-products branch → the fallback row gets a crs- courseId too', async () => {
    const { assignCourseToCustomer } = await import('../src/lib/backendClient.js');
    await assignCourseToCustomer('TEST-LC-AV209', { name: 'คอร์สไม่มีสินค้า', price: 500, products: [] });
    expect(_written.courses).toHaveLength(1);
    expect(_written.courses[0].courseId).toMatch(CRS_RE);
  });

  it('E3 pick-at-treatment placeholder keeps its pick- id (unchanged contract)', async () => {
    const { assignCourseToCustomer } = await import('../src/lib/backendClient.js');
    await assignCourseToCustomer('TEST-LC-AV209', {
      name: 'คอร์สเลือกสินค้า',
      courseType: 'เลือกสินค้าตามจริง',
      products: [{ name: 'Opt A', qty: 1 }, { name: 'Opt B', qty: 1 }],
    });
    expect(_written.courses).toHaveLength(1);
    expect(_written.courses[0].courseId).toMatch(/^pick-/);
    expect(_written.courses[0].needsPickSelection).toBe(true);
  });

  it('E4 resolvePickedCourseInCustomer → resolved siblings get FRESH unique crs- ids (pick- id survives only as pickedFromCourseId)', async () => {
    const { resolvePickedCourseInCustomer } = await import('../src/lib/backendClient.js');
    _docData = { courses: [{
      courseId: 'pick-123-abc', name: 'คอร์สเลือกสินค้า', product: '', qty: '',
      status: 'กำลังใช้งาน', needsPickSelection: true,
      availableProducts: [{ productId: '1', name: 'Opt A', qty: 1, unit: 'ครั้ง' }],
    }] };
    await resolvePickedCourseInCustomer('TEST-LC-AV209', 'pick-123-abc', [
      { productId: '1', name: 'Opt A', qty: 2, unit: 'ครั้ง' },
      { productId: '2', name: 'Opt B', qty: 1, unit: 'ครั้ง' },
    ]);
    const rows = _written.courses;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.courseId).toMatch(CRS_RE);
      expect(r.pickedFromCourseId).toBe('pick-123-abc');
    }
    expect(rows[0].courseId).not.toBe(rows[1].courseId);
  });

  it('E5 addPicksToResolvedGroup → appended entries NEVER inherit the template sibling id (post-backfill crsbf- template)', async () => {
    const { addPicksToResolvedGroup } = await import('../src/lib/backendClient.js');
    _docData = { courses: [{
      courseId: 'crsbf-999-0-deadbeef', name: 'คอร์สเลือกสินค้า', product: 'Opt A',
      qty: '2 / 2 ครั้ง', status: 'กำลังใช้งาน', pickedFromCourseId: 'pick-123-abc',
    }] };
    await addPicksToResolvedGroup('TEST-LC-AV209', 'pick-123-abc', [
      { productId: '3', name: 'Opt C', qty: 1, unit: 'ครั้ง' },
    ]);
    const rows = _written.courses;
    expect(rows).toHaveLength(2);
    const appended = rows[1];
    expect(appended.courseId).toMatch(CRS_RE);
    // The pre-fix `...baseTpl` spread would have copied crsbf-999-0-deadbeef
    // here → duplicate ids → ambiguous byId resolution.
    expect(appended.courseId).not.toBe(rows[0].courseId);
  });

  it('E6 backfilled + resolver round-trip: every row resolves to ITS OWN index byId (twins included)', async () => {
    const { resolveCourseRowIndex } = await import('../src/lib/courseExchange.js');
    const courses = [
      { courseId: 'crsbf-1-0-aa', name: 'ขลิบ', product: 'Stapple', qty: '1 / 1 ครั้ง', status: 'กำลังใช้งาน' },
      { courseId: 'crsbf-1-1-bb', name: 'ขลิบ', product: 'Stapple', qty: '1 / 1 ครั้ง', status: 'กำลังใช้งาน' }, // twin
      { courseId: 'crs-2-0-cc', name: 'PRP', product: 'PRP', qty: '5 / 6 ครั้ง', status: 'กำลังใช้งาน' },
    ];
    courses.forEach((c, i) => {
      expect(resolveCourseRowIndex(courses, { courseId: c.courseId })).toBe(i);
    });
  });
});

describe('AV209.stamp — source-grep locks', () => {
  it('SG1 both assignCourseToCustomer non-pick branches stamp crs-', () => {
    const start = SRC.indexOf('export async function assignCourseToCustomer(');
    const next = SRC.indexOf('\nexport async function ', start + 30);
    const body = SRC.slice(start, next);
    const stamps = body.match(/courseId: `crs-\$\{Date\.now\(\)\}/g) || [];
    expect(stamps.length).toBeGreaterThanOrEqual(2); // per-product + no-products
  });

  it('SG2 resolvePickedCourseInCustomer stamps crs- on resolved entries', () => {
    const start = SRC.indexOf('export async function resolvePickedCourseInCustomer(');
    const next = SRC.indexOf('\nexport async function ', start + 30);
    const body = SRC.slice(start, next);
    expect(body).toMatch(/courseId: `crs-\$\{Date\.now\(\)\}/);
  });

  it('SG3 addPicksToResolvedGroup strips the template courseId + stamps fresh', () => {
    const start = SRC.indexOf('export async function addPicksToResolvedGroup(');
    const next = SRC.indexOf('\nexport async function ', start + 30);
    const body = SRC.slice(start, next);
    expect(body).toContain('courseId: _stripCourseId');
    expect(body).toMatch(/courseId: `crs-\$\{Date\.now\(\)\}/);
  });
});

describe('AV209.stamp — backfill decision helper (Rule M script)', () => {
  it('D1 missing courseId → stamp', async () => {
    const { decideRowBackfill } = await import('../scripts/av209-backfill-course-row-courseid.mjs');
    expect(decideRowBackfill({ name: 'ขลิบ', product: 'Stapple' })).toBe('stamp');
  });

  it('D2 existing ids (pick-/exchange-/crs-/crsbf-) are NEVER overwritten', async () => {
    const { decideRowBackfill } = await import('../scripts/av209-backfill-course-row-courseid.mjs');
    for (const id of ['pick-1-a', 'exchange-1-a', 'crs-1-0-a', 'crsbf-1-0-a']) {
      expect(decideRowBackfill({ courseId: id })).toBe('skip-has-id');
    }
  });

  it('D3 empty-string / null courseId → stamp (identity-less)', async () => {
    const { decideRowBackfill } = await import('../scripts/av209-backfill-course-row-courseid.mjs');
    expect(decideRowBackfill({ courseId: '' })).toBe('stamp');
    expect(decideRowBackfill({ courseId: null })).toBe('stamp');
  });

  it('D4 non-object rows are skipped', async () => {
    const { decideRowBackfill } = await import('../scripts/av209-backfill-course-row-courseid.mjs');
    expect(decideRowBackfill(null)).toBe('skip-not-object');
    expect(decideRowBackfill('x')).toBe('skip-not-object');
  });
});
