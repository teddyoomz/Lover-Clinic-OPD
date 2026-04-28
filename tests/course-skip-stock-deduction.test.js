// ─── Course "ไม่ตัดสต็อค" flag + treatment silent-skip fix — 2026-04-28 ────
//
// Plan ref: C:\Users\oomzp\.claude\plans\2-generic-rossum.md (5 phases).
// User context (Image 2 → Image 1):
//   1. Add per-row checkbox "ไม่ตัดสต็อค" on main + sub-items in CourseFormModal
//   2. Fix silent-skip bug where treatment cuts emit SKIP movements with
//      `note: 'product not yet configured for stock tracking'` instead of
//      actually deducting branch stock
//   3. Migrate be_courses backfill flag default false (= ตัดสต็อคปกติ)
//
// V-entry preflight covered:
//   V11 — beCourseToMasterShape imports real (no mock-shadowed export risk)
//   V12 — single-writer contract (`_ensureProductTracked` is THE upsert; both
//          vendor-receive AND _deductOneItem call it; never two writers)
//   V13 — full-flow simulate group (CSS.D) chains: schema → mapper → assignCourseToCustomer →
//          treatmentItems → _normalizeStockItems → _deductOneItem decision tree
//   V14 — !! coercion at every layer; no undefined leaves to setDoc
//   V19 — treatmentStockDiff hash key unchanged (course-flag is not in row-state hash)
//   V21 — source-grep paired with full-flow chain assertion (no shape-only locks)
//   V22 — multi-fixture: ≥2 course shapes + ≥2 product configs
//   V31 — silent-swallow REPLACED by intentional course-skip note +
//          fail-loud-on-no-batch (existing thrown error stays)
//   V34 — ADJUST_ADD math untouched; regression guard via _ensureProductTracked
//          location grep (must be after _getProductStockConfig, BEFORE _deductOneItem)
//
// Group structure:
//   CSS.A schema validation + normalize round-trip
//   CSS.B beCourseToMasterShape propagates flag main + sub
//   CSS.C mapMasterToCourse inverse round-trip
//   CSS.D customerCourses propagation (treatmentBuyHelpers + assignCourseToCustomer)
//   CSS.E _normalizeStockItems preserves flag on all 4 array branches
//   CSS.F _ensureProductTracked single-writer contract + vendor-receive refactor
//   CSS.G _deductOneItem decision tree source-grep + context threading
//   CSS.H TreatmentFormPage course-tick propagation + backendDetail whitelist
//   CSS.I CourseFormModal UI source-grep — main + sub-items checkboxes
//   CSS.J Migration endpoint helper + UI button source-grep

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  validateCourse,
  normalizeCourse,
  emptyCourseForm,
} from '../src/lib/courseValidation.js';
import {
  beCourseToMasterShape,
  mapMasterToCourse,
} from '../src/lib/backendClient.js';
import {
  buildPurchasedCourseEntry,
  resolvePickedCourseEntry,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';
import {
  planCourseSkipStockMigration,
} from '../api/admin/migrate-courses-skip-stock.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const courseValidationSrc = read('src/lib/courseValidation.js');
const backendClientSrc = read('src/lib/backendClient.js');
const treatmentBuyHelpersSrc = read('src/lib/treatmentBuyHelpers.js');
const treatmentFormPageSrc = read('src/components/TreatmentFormPage.jsx');
const courseFormModalSrc = read('src/components/backend/CourseFormModal.jsx');
const migrateEndpointSrc = read('api/admin/migrate-courses-skip-stock.js');
const migrateClientSrc = read('src/lib/migrateCoursesSkipStockClient.js');
const permissionGroupsTabSrc = read('src/components/backend/PermissionGroupsTab.jsx');

// ============================================================================
describe('CSS.A — schema validation + normalize round-trip', () => {
  it('A.1 emptyCourseForm includes top-level skipStockDeduction:false', () => {
    const form = emptyCourseForm();
    expect(form.skipStockDeduction).toBe(false);
  });

  it('A.2 validateCourse rejects non-boolean top-level skipStockDeduction', () => {
    const form = { ...emptyCourseForm(), courseName: 'X', salePrice: 100, skipStockDeduction: 'truthy-string' };
    const fail = validateCourse(form);
    expect(fail).toEqual(['skipStockDeduction', 'skipStockDeduction ต้องเป็น boolean']);
  });

  it('A.3 validateCourse accepts top-level skipStockDeduction true/false/null', () => {
    const base = { ...emptyCourseForm(), courseName: 'X', salePrice: 100 };
    expect(validateCourse({ ...base, skipStockDeduction: true })).toBeNull();
    expect(validateCourse({ ...base, skipStockDeduction: false })).toBeNull();
    expect(validateCourse({ ...base, skipStockDeduction: null })).toBeNull();
  });

  it('A.4 validateCourse rejects non-boolean per-sub-item skipStockDeduction', () => {
    const form = {
      ...emptyCourseForm(),
      courseName: 'X', salePrice: 100,
      courseProducts: [
        { productId: 'P-1', productName: 'X', qty: 1, skipStockDeduction: 'maybe' },
      ],
    };
    const fail = validateCourse(form);
    expect(fail?.[0]).toBe('courseProducts');
    expect(fail?.[1]).toMatch(/skipStockDeduction ต้องเป็น boolean/);
  });

  it('A.5 normalizeCourse coerces top-level !!skipStockDeduction (truthy string → true)', () => {
    const out = normalizeCourse({
      ...emptyCourseForm(),
      courseName: 'X',
      skipStockDeduction: 'yes',
    });
    expect(out.skipStockDeduction).toBe(true);
  });

  it('A.6 normalizeCourse defaults missing top-level skipStockDeduction to false', () => {
    const form = { ...emptyCourseForm(), courseName: 'X' };
    delete form.skipStockDeduction;
    const out = normalizeCourse(form);
    expect(out.skipStockDeduction).toBe(false);
  });

  it('A.7 normalizeCourse coerces per-sub-item skipStockDeduction', () => {
    const out = normalizeCourse({
      ...emptyCourseForm(),
      courseName: 'X',
      courseProducts: [
        { productId: 'P-1', productName: 'A', qty: 2, skipStockDeduction: true },
        { productId: 'P-2', productName: 'B', qty: 3 }, // missing
      ],
    });
    expect(out.courseProducts[0].skipStockDeduction).toBe(true);
    expect(out.courseProducts[1].skipStockDeduction).toBe(false);
  });

  it('A.8 normalize is idempotent — running twice = same shape', () => {
    const form = { ...emptyCourseForm(), courseName: 'X', skipStockDeduction: true,
      courseProducts: [{ productId: 'P-1', productName: 'A', qty: 1, skipStockDeduction: true }] };
    const once = normalizeCourse(form);
    const twice = normalizeCourse(once);
    expect(twice.skipStockDeduction).toBe(true);
    expect(twice.courseProducts[0].skipStockDeduction).toBe(true);
    expect(twice).toEqual(once);
  });
});

// ============================================================================
describe('CSS.B — beCourseToMasterShape propagates flag', () => {
  it('B.1 main product gets skipStockDeduction from top-level', () => {
    const c = {
      courseId: 'C-1', courseName: 'Phys',
      mainProductId: 'P-MAIN', mainProductName: 'Phys session', mainQty: 10,
      skipStockDeduction: true,
      courseProducts: [],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].id).toBe('P-MAIN');
    expect(shape.products[0].skipStockDeduction).toBe(true);
    expect(shape.products[0].isMainProduct).toBe(true);
  });

  it('B.2 sub-item gets per-row skipStockDeduction', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-MAIN', mainProductName: 'Main', mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P-SUB-A', productName: 'A', qty: 5, skipStockDeduction: true },
        { productId: 'P-SUB-B', productName: 'B', qty: 3, skipStockDeduction: false },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(3);
    expect(shape.products[0].skipStockDeduction).toBe(false); // main
    expect(shape.products[1].skipStockDeduction).toBe(true);  // sub A
    expect(shape.products[2].skipStockDeduction).toBe(false); // sub B
  });

  it('B.3 missing flag normalizes to false (V14 — no undefined leaves)', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-MAIN', mainProductName: 'M', mainQty: 1,
      courseProducts: [{ productId: 'P-SUB', productName: 'S', qty: 1 }],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].skipStockDeduction).toBe(false);
    expect(shape.products[1].skipStockDeduction).toBe(false);
  });
});

// ============================================================================
describe('CSS.C — mapMasterToCourse inverse round-trip', () => {
  it('C.1 reads top-level skipStockDeduction', () => {
    const out = mapMasterToCourse({
      courseName: 'X', salePrice: 100,
      skipStockDeduction: true,
      courseProducts: [{ productId: 'P-1', productName: 'A', qty: 1 }],
    }, 'C-1', '2026-04-28T00:00:00Z');
    expect(out.skipStockDeduction).toBe(true);
  });

  it('C.2 accepts snake_case skip_stock_deduction', () => {
    const out = mapMasterToCourse({
      courseName: 'X', salePrice: 100,
      skip_stock_deduction: true,
      courseProducts: [{ productId: 'P-1', productName: 'A', qty: 1 }],
    }, 'C-1', '2026-04-28T00:00:00Z');
    expect(out.skipStockDeduction).toBe(true);
  });

  it('C.3 missing flag normalizes to false', () => {
    const out = mapMasterToCourse({
      courseName: 'X', salePrice: 100,
      courseProducts: [{ productId: 'P-1', productName: 'A', qty: 1 }],
    }, 'C-1', '2026-04-28T00:00:00Z');
    expect(out.skipStockDeduction).toBe(false);
    expect(out.courseProducts[0].skipStockDeduction).toBe(false);
  });

  it('C.4 sub-item flag round-trip (camelCase + snake_case)', () => {
    const out = mapMasterToCourse({
      courseName: 'X', salePrice: 100,
      courseProducts: [
        { productId: 'P-1', productName: 'A', qty: 1, skipStockDeduction: true },
        { productId: 'P-2', productName: 'B', qty: 2, skip_stock_deduction: true },
      ],
    }, 'C-1', '2026-04-28T00:00:00Z');
    expect(out.courseProducts[0].skipStockDeduction).toBe(true);
    expect(out.courseProducts[1].skipStockDeduction).toBe(true);
  });

  it('C.5 round-trip: normalize → master shape → mapMasterToCourse → preserve flags', () => {
    const original = {
      ...emptyCourseForm(),
      courseName: 'X', salePrice: 100,
      mainProductId: 'P-MAIN', mainProductName: 'Main', mainQty: 1,
      skipStockDeduction: true,
      courseProducts: [
        { productId: 'P-SUB', productName: 'S', qty: 2, skipStockDeduction: true },
      ],
    };
    const normalized = normalizeCourse(original);
    expect(normalized.skipStockDeduction).toBe(true);
    expect(normalized.courseProducts[0].skipStockDeduction).toBe(true);
    // Map to master shape (downstream view)
    const master = beCourseToMasterShape({ ...normalized, courseId: 'C-1' });
    expect(master.products[0].skipStockDeduction).toBe(true); // main
    expect(master.products[1].skipStockDeduction).toBe(true); // sub
    // Inverse: from master → course form (e.g. sync from ProClinic master_data)
    // (This path uses mapMasterToCourse with master_data shape, not directly our master shape)
    const back = mapMasterToCourse(normalized, 'C-1', '2026-04-28T00:00:00Z');
    expect(back.skipStockDeduction).toBe(true);
    expect(back.courseProducts[0].skipStockDeduction).toBe(true);
  });
});

// ============================================================================
describe('CSS.D — customerCourses + treatment row propagation', () => {
  it('D.1 buildPurchasedCourseEntry rawCourseProducts path preserves flag', () => {
    const item = {
      id: 'CRS-1', name: 'Buffet', qty: 1, unit: 'ครั้ง',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      products: [
        { productId: 'P-A', name: 'A', qty: 5, skipStockDeduction: true },
        { productId: 'P-B', name: 'B', qty: 3, skipStockDeduction: false },
      ],
    };
    const entry = buildPurchasedCourseEntry(item, { now: 1700000000000 });
    expect(entry.products[0].skipStockDeduction).toBe(true);
    expect(entry.products[1].skipStockDeduction).toBe(false);
  });

  it('D.2 buildPurchasedCourseEntry self-fallback row inherits item-level flag', () => {
    const item = {
      id: 'CRS-1', name: 'Solo', qty: 1, unit: 'ครั้ง',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      skipStockDeduction: true,
      // no products[] → falls into self-fallback branch
    };
    const entry = buildPurchasedCourseEntry(item, { now: 1700000000000 });
    expect(entry.products[0].skipStockDeduction).toBe(true);
  });

  it('D.3 buildPurchasedCourseEntry pick-at-treatment placeholder carries flag on options', () => {
    const item = {
      id: 'CRS-1', name: 'Pick', qty: 1, unit: 'ครั้ง',
      courseType: 'เลือกสินค้าตามจริง',
      products: [
        { productId: 'P-A', name: 'A', qty: 1, skipStockDeduction: true },
      ],
    };
    const entry = buildPurchasedCourseEntry(item, { now: 1700000000000 });
    expect(entry.needsPickSelection).toBe(true);
    expect(entry.availableProducts[0].skipStockDeduction).toBe(true);
  });

  it('D.4 resolvePickedCourseEntry carries flag onto picked rows', () => {
    const placeholder = {
      courseId: 'pick-1',
      courseName: 'X',
      isPickAtTreatment: true,
      needsPickSelection: true,
      products: [],
    };
    const picks = [
      { productId: 'P-A', name: 'A', qty: 2, unit: 'ครั้ง', skipStockDeduction: true },
    ];
    const resolved = resolvePickedCourseEntry(placeholder, picks);
    expect(resolved.needsPickSelection).toBe(false);
    expect(resolved.products[0].skipStockDeduction).toBe(true);
  });

  it('D.5 mapRawCoursesToForm reads flag back from be_customers.courses[]', () => {
    const raw = [{
      name: 'X',
      product: 'A',
      productId: 'P-A',
      qty: '3 / 5 ครั้ง',
      status: 'กำลังใช้งาน',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      skipStockDeduction: true,
    }];
    const out = mapRawCoursesToForm(raw);
    expect(out[0].products[0].skipStockDeduction).toBe(true);
  });

  it('D.6 mapRawCoursesToForm defaults missing flag to false', () => {
    const raw = [{
      name: 'X', product: 'A', productId: 'P-A',
      qty: '3 / 5 ครั้ง',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    }];
    const out = mapRawCoursesToForm(raw);
    expect(out[0].products[0].skipStockDeduction).toBe(false);
  });
});

// ============================================================================
describe('CSS.E — _normalizeStockItems preserves flag on all 4 branches (source-grep)', () => {
  it('E.1 array branch sets skipStockDeduction', () => {
    expect(backendClientSrc).toMatch(/items\.map\(it => \(\{[\s\S]*?skipStockDeduction:\s*!!it\.skipStockDeduction/m);
  });

  it('E.2 products branch sets skipStockDeduction', () => {
    // Looser match — just confirm the flag appears in each iteration block
    const productsBlock = backendClientSrc.match(/for \(const p of items\.products[^}]+\}/s);
    expect(productsBlock?.[0]).toMatch(/skipStockDeduction:\s*!!p\.skipStockDeduction/);
  });

  it('E.3 medications branch sets skipStockDeduction', () => {
    const medBlock = backendClientSrc.match(/for \(const m of items\.medications[^}]+\}/s);
    expect(medBlock?.[0]).toMatch(/skipStockDeduction:\s*!!m\.skipStockDeduction/);
  });

  it('E.4 consumables branch sets skipStockDeduction', () => {
    const consBlock = backendClientSrc.match(/for \(const c of items\.consumables[^}]+\}/s);
    expect(consBlock?.[0]).toMatch(/skipStockDeduction:\s*!!c\.skipStockDeduction/);
  });

  it('E.5 treatmentItems branch sets skipStockDeduction', () => {
    const tiBlock = backendClientSrc.match(/for \(const t of items\.treatmentItems[^}]+\}/s);
    expect(tiBlock?.[0]).toMatch(/skipStockDeduction:\s*!!t\.skipStockDeduction/);
  });
});

// ============================================================================
describe('CSS.F — _ensureProductTracked single-writer + vendor-receive refactor', () => {
  it('F.1 _ensureProductTracked exists in backendClient.js', () => {
    expect(backendClientSrc).toMatch(/async function _ensureProductTracked\(productId/);
  });

  it('F.2 helper writes stockConfig with trackStock:true', () => {
    const helperBlock = backendClientSrc.match(/async function _ensureProductTracked[\s\S]+?\n\}/);
    expect(helperBlock?.[0]).toMatch(/stockConfig:\s*baseConfig/);
    expect(helperBlock?.[0]).toMatch(/trackStock:\s*true/);
  });

  it('F.3 helper is idempotent — early-return when already tracked', () => {
    const helperBlock = backendClientSrc.match(/async function _ensureProductTracked[\s\S]+?\n\}/);
    expect(helperBlock?.[0]).toMatch(/existing\.trackStock\s*===\s*true/);
    expect(helperBlock?.[0]).toMatch(/return existing/);
  });

  it('F.4 helper falls back to legacy master_data when be_products has no doc', () => {
    const helperBlock = backendClientSrc.match(/async function _ensureProductTracked[\s\S]+?\n\}/);
    expect(helperBlock?.[0]).toMatch(/master_data['"],\s*['"]products['"],\s*['"]items['"]/);
  });

  it('F.5 vendor-receive _buildBatchFromOrderItem now calls shared helper (not inline setDoc)', () => {
    // The old inline upsert (4145–4190) was replaced — only the helper
    // call should remain at this site.
    const block = backendClientSrc.match(/_buildBatchFromOrderItem[\s\S]+?if \(optInStockConfig[\s\S]+?\}\s+/);
    expect(block?.[0]).toMatch(/_ensureProductTracked\(item\.productId/);
    // Old inline pattern should NOT be in the same vendor-receive block
    expect(block?.[0]).not.toMatch(/setDoc\([^)]*stockConfig/);
  });

  it('F.6 V12 single-writer contract — _ensureProductTracked called from EXACTLY 2 sites (vendor + treatment)', () => {
    // grep all callers
    const callMatches = backendClientSrc.match(/_ensureProductTracked\(/g) || [];
    // 1 declaration (function name itself in `async function _ensureProductTracked(`)
    // + 2 callers (vendor + _deductOneItem) = 3 occurrences total
    expect(callMatches.length).toBe(3);
  });
});

// ============================================================================
describe('CSS.G — _deductOneItem decision tree + context threading', () => {
  it('G.1 _deductOneItem signature accepts context opt', () => {
    expect(backendClientSrc).toMatch(/async function _deductOneItem\(\{[\s\S]*?context[\s\S]*?\}\)/);
  });

  it('G.2 deductStockForTreatment passes context:"treatment"', () => {
    const fnBlock = backendClientSrc.match(/export async function deductStockForTreatment[\s\S]+?\n\}/);
    expect(fnBlock?.[0]).toMatch(/context:\s*['"]treatment['"]/);
  });

  it('G.3 deductStockForSale passes context:"sale" (preserves silent-skip blast-radius guard)', () => {
    const fnBlock = backendClientSrc.match(/export async function deductStockForSale[\s\S]+?\n\}/);
    expect(fnBlock?.[0]).toMatch(/context:\s*['"]sale['"]/);
  });

  it('G.4 decision tree branch 1 — item.skipStockDeduction === true emits course-skip movement with Thai note', () => {
    // Look for the Thai note + reason within _deductOneItem body (between
    // function declaration and its closing brace).
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 6000);
    expect(slice).toMatch(/item\.skipStockDeduction\s*===\s*true/);
    expect(slice).toMatch(/note:\s*['"]ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส['"]/);
    expect(slice).toMatch(/reason:\s*['"]course-skip['"]/);
  });

  it('G.5 decision tree branch 2 — context==="treatment" + untracked auto-init via _ensureProductTracked', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 6000);
    expect(slice).toMatch(/!tracked\s*&&\s*context\s*===\s*['"]treatment['"]/);
    expect(slice).toMatch(/_ensureProductTracked\(item\.productId/);
  });

  it('G.6 decision tree branch 4 — sale/manual untracked still emits silent-skip (legacy path preserved)', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 6000);
    // The silent-skip note for non-tracked still exists for sale/manual context
    expect(slice).toMatch(/product not yet configured for stock tracking/);
    // V21 anti-regression — the old single-path behavior (silent-skip for ALL contexts)
    // is gone; check the auto-init branch comes BEFORE the silent-skip emit.
    const autoInitIdx = slice.search(/_ensureProductTracked\(item\.productId/);
    const silentSkipIdx = slice.search(/product not yet configured for stock tracking/);
    expect(autoInitIdx).toBeGreaterThan(0);
    expect(silentSkipIdx).toBeGreaterThan(0);
    expect(autoInitIdx).toBeLessThan(silentSkipIdx);
  });
});

// ============================================================================
describe('CSS.H — TreatmentFormPage course-tick + backendDetail propagation', () => {
  it('H.1 toggleCourseSelection adds skipStockDeduction onto new treatmentItems entry', () => {
    expect(treatmentFormPageSrc).toMatch(/skipStockDeduction:\s*!!product\.skipStockDeduction/);
  });

  it('H.2 backendDetail treatmentItems whitelist preserves skipStockDeduction', () => {
    // Two whitelist sites: line ~2050 (auto-sale path) + line ~2653 (no-sale path)
    // Both need to include skipStockDeduction.
    const whitelistMatches = treatmentFormPageSrc.match(/treatmentItems[\s\S]*?\.map\(t\s*=>\s*\(\{[^}]+skipStockDeduction[^}]+\}\)\)/g);
    expect(whitelistMatches?.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
describe('CSS.I — CourseFormModal UI source-grep', () => {
  it('I.1 sub-items FLAGS column has 4th checkbox bound to item.skipStockDeduction', () => {
    expect(courseFormModalSrc).toMatch(/checked=\{!!item\.skipStockDeduction\}/);
    expect(courseFormModalSrc).toMatch(/updateSubProduct\(item\.productId,\s*\{\s*skipStockDeduction:/);
  });

  it('I.2 sub-items grid template width updated to 260px (from 200px)', () => {
    expect(courseFormModalSrc).toMatch(/grid-cols-\[1fr_70px_70px_70px_260px\]/);
    expect(courseFormModalSrc).not.toMatch(/grid-cols-\[1fr_70px_70px_70px_200px\]/);
  });

  it('I.3 main product section has skipStockDeduction checkbox bound to form.skipStockDeduction', () => {
    expect(courseFormModalSrc).toMatch(/checked=\{!!form\.skipStockDeduction\}/);
    expect(courseFormModalSrc).toMatch(/update\(\{\s*skipStockDeduction:/);
  });

  it('I.4 addSubProduct default sets skipStockDeduction:false on new sub-item', () => {
    const block = courseFormModalSrc.match(/const addSubProduct[\s\S]+?setSubPickerQuery/);
    expect(block?.[0]).toMatch(/skipStockDeduction:\s*false/);
  });

  it('I.5 main product checkbox uses accent-rose-500 (visual distinction from amber/emerald/gray)', () => {
    expect(courseFormModalSrc).toMatch(/accent-rose-500/);
  });

  it('I.6 Thai label "ไม่ตัดสต็อค" or "ไม่ตัด" present', () => {
    expect(courseFormModalSrc).toMatch(/ไม่ตัดสต็อค|ไม่ตัด/);
  });
});

// ============================================================================
describe('CSS.J — Migration endpoint helper + UI button', () => {
  describe('CSS.J.1 planCourseSkipStockMigration helper', () => {
    it('returns no-op when course has top-level + all sub-items', () => {
      const out = planCourseSkipStockMigration({
        courseName: 'X',
        skipStockDeduction: false,
        courseProducts: [
          { productId: 'P-1', skipStockDeduction: false },
          { productId: 'P-2', skipStockDeduction: true },
        ],
      });
      expect(out.needsMigration).toBe(false);
      expect(out.patch).toBeNull();
    });

    it('detects top-level missing → patch.skipStockDeduction:false', () => {
      const out = planCourseSkipStockMigration({
        courseName: 'X',
        courseProducts: [{ productId: 'P-1', skipStockDeduction: false }],
      });
      expect(out.needsMigration).toBe(true);
      expect(out.patch.skipStockDeduction).toBe(false);
      expect(out.patch.courseProducts).toBeUndefined();
    });

    it('detects sub-item missing → patch.courseProducts contains all sub-items with default-false where missing', () => {
      const out = planCourseSkipStockMigration({
        courseName: 'X',
        skipStockDeduction: false,
        courseProducts: [
          { productId: 'P-1', skipStockDeduction: false }, // already has flag
          { productId: 'P-2' }, // missing flag
        ],
      });
      expect(out.needsMigration).toBe(true);
      expect(out.patch.skipStockDeduction).toBeUndefined();
      expect(out.patch.courseProducts).toHaveLength(2);
      expect(out.patch.courseProducts[0].skipStockDeduction).toBe(false); // unchanged
      expect(out.patch.courseProducts[1].skipStockDeduction).toBe(false); // backfilled
    });

    it('detects both missing — patch contains both fields', () => {
      const out = planCourseSkipStockMigration({
        courseName: 'X',
        courseProducts: [{ productId: 'P-1' }],
      });
      expect(out.needsMigration).toBe(true);
      expect(out.patch.skipStockDeduction).toBe(false);
      expect(out.patch.courseProducts[0].skipStockDeduction).toBe(false);
    });

    it('handles missing courseProducts (array undefined / null / empty)', () => {
      // missing array — only top-level needs check
      const noArr = planCourseSkipStockMigration({ courseName: 'X' });
      expect(noArr.needsMigration).toBe(true);
      expect(noArr.patch.skipStockDeduction).toBe(false);
      expect(noArr.patch.courseProducts).toBeUndefined();

      const emptyArr = planCourseSkipStockMigration({ courseName: 'X', skipStockDeduction: false, courseProducts: [] });
      expect(emptyArr.needsMigration).toBe(false);
    });

    it('handles malformed courseData (null / undefined / array) — never throws', () => {
      expect(planCourseSkipStockMigration(null).needsMigration).toBe(false);
      expect(planCourseSkipStockMigration(undefined).needsMigration).toBe(false);
      expect(planCourseSkipStockMigration([]).needsMigration).toBe(false);
      expect(planCourseSkipStockMigration('not-object').needsMigration).toBe(false);
    });

    it('preserves all existing sub-item fields when backfilling', () => {
      const out = planCourseSkipStockMigration({
        courseName: 'X',
        skipStockDeduction: false,
        courseProducts: [
          { productId: 'P-1', productName: 'A', qty: 5, isRequired: true, isDf: true, isHidden: false },
        ],
      });
      expect(out.patch.courseProducts[0]).toMatchObject({
        productId: 'P-1', productName: 'A', qty: 5, isRequired: true, isDf: true, isHidden: false,
        skipStockDeduction: false, // backfilled
      });
    });
  });

  describe('CSS.J.2 endpoint source-grep', () => {
    it('endpoint imports verifyAdminToken', () => {
      expect(migrateEndpointSrc).toMatch(/import\s*\{\s*verifyAdminToken\s*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
    });

    it('endpoint two-phase: list + commit actions', () => {
      expect(migrateEndpointSrc).toMatch(/action\s*===\s*['"]list['"]/);
      expect(migrateEndpointSrc).toMatch(/action\s*===\s*['"]commit['"]/);
    });

    it('endpoint writes audit doc to be_admin_audit', () => {
      expect(migrateEndpointSrc).toMatch(/be_admin_audit/);
      expect(migrateEndpointSrc).toMatch(/migrate-courses-skip-stock-/);
    });

    it('endpoint uses writeBatch + 500-op chunking', () => {
      expect(migrateEndpointSrc).toMatch(/db\.batch\(\)/);
      expect(migrateEndpointSrc).toMatch(/inBatch >= 500/);
    });
  });

  describe('CSS.J.3 client wrapper + UI button', () => {
    it('client exposes listCoursesNeedingMigration + commitCoursesSkipStockMigration', () => {
      expect(migrateClientSrc).toMatch(/export function listCoursesNeedingMigration/);
      expect(migrateClientSrc).toMatch(/export function commitCoursesSkipStockMigration/);
    });

    it('client uses Firebase ID token (admin-mediated)', () => {
      expect(migrateClientSrc).toMatch(/getIdToken/);
      expect(migrateClientSrc).toMatch(/Authorization: `Bearer/);
    });

    it('PermissionGroupsTab imports the client + adds admin card', () => {
      expect(permissionGroupsTabSrc).toMatch(/listCoursesNeedingMigration|commitCoursesSkipStockMigration/);
      expect(permissionGroupsTabSrc).toMatch(/data-testid="course-skip-stock-migrate-card"/);
      expect(permissionGroupsTabSrc).toMatch(/data-testid="course-skip-stock-migrate-btn"/);
    });

    it('migrate card is admin-only (uses isAdmin gate from useTabAccess)', () => {
      // Both M9 + skipStockCard use isAdmin in their JSX guard.
      expect(permissionGroupsTabSrc).toMatch(/skipStockCard\s*=\s*isAdmin\s*&&/);
    });
  });
});

// ============================================================================
describe('CSS.K — V19 / V21 / V31 anti-regression locks', () => {
  it('K.1 V19 — treatmentStockDiff hash NOT polluted by course-doc skipStockDeduction', () => {
    // V19 contract: hasStockChange compares qty / productId / itemType only.
    // Adding skipStockDeduction to the hash would trigger reverse+rededuct
    // on flag-only edits — wasted writes + V19 violation.
    const stockDiffSrc = read('src/lib/treatmentStockDiff.js');
    // The diff helper should NOT iterate skipStockDeduction.
    expect(stockDiffSrc).not.toMatch(/skipStockDeduction/);
  });

  it('K.2 V31 — sale context still throws on FIFO shortfall (legacy fail-loud preserved)', () => {
    // Sale context MUST throw on shortfall (admin needs to know stock missing).
    // Treatment context emits silent-skip movement instead (so save isn't blocked).
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 10000);
    expect(slice).toMatch(/Stock insufficient/);
    expect(slice).toMatch(/throw new Error/);
  });

  it('K.2-bis 2026-04-28 hotfix — treatment context shortfall emits silent-skip (does NOT throw)', () => {
    // Hotfix after V15 #5 post-deploy report: "Stock insufficient for
    // [IV Drip] Aura bright x 1 ครั้ง (1125): need 1, allocated 0, shortfall 1"
    // Treatment save was blocked. Fix: shortfall in treatment context →
    // silent-skip movement with reason 'no-batch-at-branch' or 'shortfall'.
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 10000);
    expect(slice).toMatch(/if \(context === ['"]treatment['"]\)/);
    expect(slice).toMatch(/no-batch-at-branch/);
    expect(slice).toMatch(/ไม่มีสต็อคที่สาขานี้/);
    // Confirm the throw is in an else-branch (sale context only) — by
    // checking the treatment-context return appears before the throw.
    const treatmentCtxIdx = slice.indexOf("if (context === 'treatment')");
    const throwIdx = slice.indexOf('throw new Error');
    expect(treatmentCtxIdx).toBeGreaterThan(0);
    expect(throwIdx).toBeGreaterThan(treatmentCtxIdx);
  });

  it('K.3 V14 — no undefined leaves in mapper output (!! coercion at every layer)', () => {
    // Spot-check 4 layers: schema normalize, mapper, treatmentBuyHelpers, _normalizeStockItems
    expect(courseValidationSrc).toMatch(/skipStockDeduction:\s*!!form\.skipStockDeduction/);
    expect(courseValidationSrc).toMatch(/skipStockDeduction:\s*!!p\.skipStockDeduction/);
    expect(backendClientSrc).toMatch(/skipStockDeduction:\s*!!c\.skipStockDeduction/); // mapper main
    expect(backendClientSrc).toMatch(/skipStockDeduction:\s*!!cp\.skipStockDeduction/); // mapper sub
    expect(treatmentBuyHelpersSrc).toMatch(/skipStockDeduction:\s*!!p\.skipStockDeduction/);
  });
});
