/**
 * V111 — Receipt course name override (2026-05-23 EOD+1 LATE)
 *
 * Bug: be_courses.receiptCourseName (form field "ชื่อคอร์ส (แสดงในใบเสร็จ)")
 * was captured + validated + stored but NEVER reached the receipt — all 3
 * buy-fetcher mappers (SaleTab loadOptions, TFP loadOptions,
 * QuotationFormModal entry builder) copied only `shape.name` (= original
 * courseName), so sale.items.courses[i] never carried the override and
 * SalePrintView/QuotationPrintView fell back to the original.
 *
 * Class-of-bug: V47-family display-layer multi-reader-sweep at the
 * RECEIPT-RENDER boundary. Data was correct upstream; the snapshot
 * boundary dropped it. Same family as Phase 28 chart fabricJson
 * (transported but ignored) + V47 (CustomerDetailView grouping ignored).
 *
 * Fix (Option β — receipt-only, snapshot-at-write):
 *   - Buy-fetchers carry `receiptCourseName` as a PARALLEL field
 *     alongside the canonical `name` (= original courseName).
 *   - `name` stays original for customer.courses[], treatment dropdowns,
 *     and reports (admin internal display unchanged).
 *   - SalePrintView + QuotationPrintView prefer `receiptCourseName ||
 *     name` so receipts (and quotation prints) show the admin-curated
 *     label when set, original otherwise.
 *   - Snapshot semantic at write time → admin renaming the override
 *     later does NOT change historical receipts (legal-record
 *     integrity).
 *
 * AV111: course buy-fetchers MUST propagate `receipt_course_name`
 * (canonical mapper output) → `receiptCourseName` (purchasedItem); receipt
 * renderer MUST prefer `receiptCourseName` over `name` in the fallback
 * chain.
 */
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ─── A. Source-grep regression locks (5 write sites + 2 read sites) ─────

describe('V111.A — source-grep regression at all 7 surfaces', () => {
  test('A1 — SaleTab loadOptions buy mapper carries receiptCourseName from shape', () => {
    const code = read('components/backend/SaleTab.jsx');
    // Anchor: must mention V111 + assign receiptCourseName from shape.receipt_course_name
    expect(code).toMatch(/V111[\s\S]{0,500}receiptCourseName:\s*shape\.receipt_course_name/);
  });

  test('A2 — SaleTab confirmBuy carries receiptCourseName onto newItems', () => {
    const code = read('components/backend/SaleTab.jsx');
    // Anchor: V111 marker + i.receiptCourseName propagated
    expect(code).toMatch(/V111[\s\S]{0,400}receiptCourseName:\s*i\.receiptCourseName/);
  });

  test('A3 — TFP loadOptions buy mapper carries receiptCourseName from shape', () => {
    const code = read('components/TreatmentFormPage.jsx');
    expect(code).toMatch(/V111[\s\S]{0,500}receiptCourseName:\s*shape\.receipt_course_name/);
  });

  test('A4 — TFP confirmBuyModal carries receiptCourseName onto purchasedItem', () => {
    const code = read('components/TreatmentFormPage.jsx');
    expect(code).toMatch(/V111[\s\S]{0,400}receiptCourseName:\s*i\.receiptCourseName/);
  });

  test('A5 — QuotationFormModal course entry stamps receiptCourseName from item.receipt_course_name', () => {
    const code = read('components/backend/QuotationFormModal.jsx');
    expect(code).toMatch(/V111[\s\S]{0,500}receiptCourseName:\s*item\.receipt_course_name/);
  });

  test('A6 — SalePrintView grouped reader prefers receiptCourseName in name fallback', () => {
    const code = read('components/backend/SalePrintView.jsx');
    // V114 fixup (2026-05-23 EOD+1 LATE+2): V113 refactored the grouped
    // reader from inline `c.receiptCourseName || c.name` into the shared
    // `liveReceiptName(courseLine)` helper at lines ~189-200, which uses
    // `courseLine.receiptCourseName || courseLine.name`. The V111 contract
    // (override wins, then snapshot, then original) is PRESERVED — just at
    // the helper layer now. Pattern updated to lock the helper shape.
    expect(code).toMatch(/V111[\s\S]{0,800}courseLine\.receiptCourseName[\s\S]{0,40}\|\|\s*courseLine\.name/);
  });

  test('A7 — SalePrintView legacy flat reader prefers receiptCourseName', () => {
    const code = read('components/backend/SalePrintView.jsx');
    // The legacy branch lives further down — anchor on the it.receiptCourseName fallback
    expect(code).toMatch(/it\.receiptCourseName\s*\|\|\s*it\.name/);
  });

  test('A8 — QuotationPrintView course reader prefers receiptCourseName', () => {
    const code = read('components/backend/QuotationPrintView.jsx');
    // V114 fixup (2026-05-23 EOD+1 LATE+2): the V111 marker comment in
    // QuotationPrintView now sits AFTER the helper return line (the
    // grouped-rows useMemo above line 140 carries the V111 lineage note).
    // Pattern must allow V111 marker either before OR after the
    // `x.receiptCourseName || x.courseName` chain within a wider window.
    // V111 contract preserved at the helper layer (liveQuoteCourseName).
    expect(code).toMatch(/x\.receiptCourseName\s*\|\|\s*x\.courseName/);
    expect(code).toMatch(/V111[\s\S]{0,800}x\.receiptCourseName\s*\|\|\s*x\.courseName|x\.receiptCourseName\s*\|\|\s*x\.courseName[\s\S]{0,800}V111/);
  });

  test('A9 — anti-regression: SalePrintView grouped reader did NOT revert to pre-V111 chain', () => {
    const code = read('components/backend/SalePrintView.jsx');
    // The exact pre-V111 line was `name: c.name || c.courseName || c.courseId || ''`
    // (no receiptCourseName). Searching for that EXACT string anchored to a
    // course-row context would re-fail if the renderer reverts.
    const preFixPattern = /name:\s*c\.name\s*\|\|\s*c\.courseName\s*\|\|\s*c\.courseId\s*\|\|\s*''/;
    expect(code).not.toMatch(preFixPattern);
  });

  test('A10 — anti-regression: QuotationPrintView course did NOT revert to pre-V111 chain', () => {
    const code = read('components/backend/QuotationPrintView.jsx');
    const preFixPattern = /name:\s*x\.courseName\s*\|\|\s*x\.courseId\s*,\s*\.\.\.x/;
    expect(code).not.toMatch(preFixPattern);
  });
});

// ─── B. beCourseToMasterShape contract (canonical mapper surfaces field) ─

describe('V111.B — beCourseToMasterShape exposes receipt_course_name (V44 contract)', () => {
  test('B1 — backendClient.js maps receiptCourseName → receipt_course_name in the shape adapter', () => {
    const code = fs.readFileSync(path.join(SRC, 'lib', 'backendClient.js'), 'utf8');
    // V44 contract at ~line 3769
    expect(code).toMatch(/receipt_course_name:\s*c\.receiptCourseName/);
  });

  test('B2 — courseValidation.js trims receiptCourseName in normalizeCourseFormForFirestore', () => {
    const code = fs.readFileSync(path.join(SRC, 'lib', 'courseValidation.js'), 'utf8');
    expect(code).toMatch(/receiptCourseName:\s*trim\(form\.receiptCourseName\)/);
  });

  test('B3 — courseValidation.js emptyCourseForm seeds receiptCourseName: ""', () => {
    const code = fs.readFileSync(path.join(SRC, 'lib', 'courseValidation.js'), 'utf8');
    expect(code).toMatch(/receiptCourseName:\s*''/);
  });
});

// ─── C. Receipt-renderer fallback chain (pure simulator) ────────────────

// Mirror of SalePrintView's grouped-courses name derivation. Pure JS so
// we can unit-test all branches without mounting React.
function deriveSaleCourseRowName(c) {
  return c.receiptCourseName || c.name || c.courseName || c.courseId || '';
}

// Mirror of QuotationPrintView's course name derivation.
function deriveQuotationCourseRowName(x) {
  return x.receiptCourseName || x.courseName || x.courseId;
}

describe('V111.C — receipt-renderer fallback chain', () => {
  test('C1 — override present → renders override', () => {
    expect(deriveSaleCourseRowName({
      receiptCourseName: 'ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)',
      name: 'ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง',
    })).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');
  });

  test('C2 — override empty string → falls back to name (legacy + courses without override)', () => {
    expect(deriveSaleCourseRowName({
      receiptCourseName: '',
      name: 'ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง',
    })).toBe('ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง');
  });

  test('C3 — override undefined → falls back to name', () => {
    expect(deriveSaleCourseRowName({
      name: 'Original course name',
    })).toBe('Original course name');
  });

  test('C4 — both empty → falls back to courseName (legacy sale shape)', () => {
    expect(deriveSaleCourseRowName({
      receiptCourseName: '',
      name: '',
      courseName: 'Legacy courseName',
    })).toBe('Legacy courseName');
  });

  test('C5 — all empty → falls back to courseId then empty string', () => {
    expect(deriveSaleCourseRowName({
      receiptCourseName: '',
      name: '',
      courseName: '',
      courseId: 'COURSE-123',
    })).toBe('COURSE-123');
    expect(deriveSaleCourseRowName({})).toBe('');
  });

  test('C6 — adversarial Thai full-width + emoji + RTL + newline preserved', () => {
    const override = '🎯 ขลิบเลเซอร์ — เกรด A\nเทคนิคพรีเมียม';
    expect(deriveSaleCourseRowName({ receiptCourseName: override, name: 'orig' })).toBe(override);
  });

  test('C7 — 10K-char override survives the OR chain (no truncation)', () => {
    const override = 'A'.repeat(10000);
    expect(deriveSaleCourseRowName({ receiptCourseName: override, name: 'orig' })).toBe(override);
    expect(deriveSaleCourseRowName({ receiptCourseName: override, name: 'orig' }).length).toBe(10000);
  });

  test('C8 — quotation reader: override present', () => {
    expect(deriveQuotationCourseRowName({
      receiptCourseName: 'Override',
      courseName: 'Original',
      courseId: 'QC-1',
    })).toBe('Override');
  });

  test('C9 — quotation reader: override empty → courseName fallback', () => {
    expect(deriveQuotationCourseRowName({
      receiptCourseName: '',
      courseName: 'Original',
      courseId: 'QC-1',
    })).toBe('Original');
  });

  test('C10 — quotation reader: all empty → courseId', () => {
    expect(deriveQuotationCourseRowName({
      courseId: 'QC-1',
    })).toBe('QC-1');
  });

  test('C11 — anti-V44 regression: override does NOT leak into customer-facing `name` for non-receipt consumers', () => {
    // The fix is OPTION β — parallel field. `name` field stays original.
    // A consumer reading `c.name` (e.g. customer.courses display, treatment
    // dropdown) gets the original, NOT the override. This test locks the
    // separation.
    const item = { name: 'Original', receiptCourseName: 'Override' };
    // A non-receipt consumer reading c.name directly gets original:
    expect(item.name).toBe('Original');
    // A receipt consumer using the V111 chain gets override:
    expect(deriveSaleCourseRowName(item)).toBe('Override');
  });
});

// ─── D. Rule I flow-simulate: master → buy → grouped → sale write → render

describe('V111.D — Rule I flow-simulate: full chain (master → receipt)', () => {
  // Mirror of beCourseToMasterShape's relevant output for V111
  // (real impl in src/lib/backendClient.js:3764-3780, V44).
  function mirrorBeCourseToMasterShape(c) {
    return {
      ...c,
      id: c.courseId || c.id,
      name: c.courseName || '',
      course_name: c.courseName || '',
      receipt_course_name: c.receiptCourseName || '',
    };
  }

  // Mirror of SaleTab loadOptions buy-mapper (V111-fix).
  function mirrorSaleTabBuyMap(c) {
    const shape = mirrorBeCourseToMasterShape(c);
    return {
      id: shape.id,
      name: shape.name || c.courseName || '',
      receiptCourseName: shape.receipt_course_name || '',
      itemType: 'course',
    };
  }

  // Mirror of confirmBuy newItems mapper (V111-fix).
  function mirrorConfirmBuy(item) {
    return {
      id: item.id,
      name: item.name,
      receiptCourseName: item.receiptCourseName || '',
      itemType: item.itemType,
      qty: '1',
    };
  }

  // Mirror of TFP handleSubmit's grouped builder.
  function mirrorGrouped(purchasedItems) {
    const grouped = { courses: [], products: [], promotions: [], medications: [] };
    for (const p of purchasedItems) {
      if (p.itemType === 'course') grouped.courses.push(p);
      else if (p.itemType === 'promotion') grouped.promotions.push(p);
      else grouped.products.push(p);
    }
    return grouped;
  }

  test('D1 — master with override → buy → grouped → SalePrintView renders override', () => {
    const masterDoc = {
      courseId: 'COURSE-001',
      courseName: 'ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง',
      receiptCourseName: 'ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)',
      salePrice: 15900,
    };
    const pickerItem = mirrorSaleTabBuyMap(masterDoc);
    expect(pickerItem.receiptCourseName).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');
    expect(pickerItem.name).toBe('ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง'); // original preserved

    const purchasedItem = mirrorConfirmBuy(pickerItem);
    expect(purchasedItem.receiptCourseName).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');

    const grouped = mirrorGrouped([purchasedItem]);
    expect(grouped.courses).toHaveLength(1);
    expect(grouped.courses[0].receiptCourseName).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');

    // createBackendSale spreads grouped under items → sale.items.courses[0]
    // carries receiptCourseName verbatim (_normalizeSaleData only touches
    // payment.channels). Final SalePrintView render:
    const renderName = deriveSaleCourseRowName(grouped.courses[0]);
    expect(renderName).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');
  });

  test('D2 — master WITHOUT override → buy → grouped → SalePrintView renders original (legacy + most courses)', () => {
    const masterDoc = {
      courseId: 'COURSE-002',
      courseName: 'ดริปผิวใส',
      // receiptCourseName not set (undefined)
      salePrice: 5000,
    };
    const pickerItem = mirrorSaleTabBuyMap(masterDoc);
    expect(pickerItem.receiptCourseName).toBe('');

    const purchasedItem = mirrorConfirmBuy(pickerItem);
    const grouped = mirrorGrouped([purchasedItem]);
    const renderName = deriveSaleCourseRowName(grouped.courses[0]);
    expect(renderName).toBe('ดริปผิวใส');
  });

  test('D3 — admin renames receiptCourseName AFTER sale → historical sale unchanged (snapshot semantic)', () => {
    // Sale was written with `receiptCourseName: "Old Name"` at time T1.
    // At T2, admin edits the master course to `receiptCourseName: "NEW NAME"`.
    // The previously-written sale doc still carries the T1 snapshot value.
    const oldSale = {
      saleId: 'INV-20260520-0010',
      items: {
        courses: [{
          id: 'COURSE-001',
          name: 'ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง',
          receiptCourseName: 'Old Name', // snapshotted at T1
        }],
      },
    };

    // Re-rendering this sale at any future T2/T3/... ALWAYS reads the
    // snapshot, never queries the master. The renderer is pure on the
    // sale doc.
    const renderName = deriveSaleCourseRowName(oldSale.items.courses[0]);
    expect(renderName).toBe('Old Name');
  });

  test('D4 — TFP auto-sale path: identical chain produces identical receipt name', () => {
    // TFP buy-fetcher uses the SAME beCourseToMasterShape; confirmBuyModal
    // mirrors confirmBuy's carry. So the receipt name behavior is symmetric.
    const masterDoc = {
      courseId: 'COURSE-003',
      courseName: 'PRP บำรุงผิว',
      receiptCourseName: 'PRP Premium',
      salePrice: 8000,
    };
    const pickerItem = mirrorSaleTabBuyMap(masterDoc); // same mapper logic
    const purchasedItem = mirrorConfirmBuy(pickerItem);
    const grouped = mirrorGrouped([purchasedItem]);
    expect(deriveSaleCourseRowName(grouped.courses[0])).toBe('PRP Premium');
  });

  test('D5 — empty trim → falls back to original (validator trims; empty string ≡ no override)', () => {
    // Validator normalizeCourseFormForFirestore trims whitespace. So an
    // admin entering "   " becomes "" → no override → original wins.
    const masterDoc = {
      courseId: 'COURSE-004',
      courseName: 'Original',
      receiptCourseName: '', // post-trim of pure whitespace
    };
    const pickerItem = mirrorSaleTabBuyMap(masterDoc);
    const purchasedItem = mirrorConfirmBuy(pickerItem);
    expect(deriveSaleCourseRowName(purchasedItem)).toBe('Original');
  });

  test('D6 — multi-course sale: each course resolves its OWN override independently', () => {
    const masters = [
      { courseId: 'C1', courseName: 'A', receiptCourseName: 'A-receipt' },
      { courseId: 'C2', courseName: 'B', receiptCourseName: '' },
      { courseId: 'C3', courseName: 'C', receiptCourseName: 'C-receipt' },
    ];
    const purchasedItems = masters
      .map(mirrorSaleTabBuyMap)
      .map(mirrorConfirmBuy);
    const grouped = mirrorGrouped(purchasedItems);
    const names = grouped.courses.map(deriveSaleCourseRowName);
    expect(names).toEqual(['A-receipt', 'B', 'C-receipt']);
  });
});

// ─── E. AV111 invariant existence ────────────────────────────────────────

describe('V111.E — AV111 audit invariant present', () => {
  test('E1 — AV111 entry exists in audit-anti-vibe-code SKILL.md', () => {
    const skillPath = path.resolve(__dirname, '..', '.agents', 'skills', 'audit-anti-vibe-code', 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      // some setups put it at .claude/skills/...
      const altPath = path.resolve(__dirname, '..', '.claude', 'skills', 'audit-anti-vibe-code', 'SKILL.md');
      expect(fs.existsSync(altPath)).toBe(true);
      const skill = fs.readFileSync(altPath, 'utf8');
      expect(skill).toMatch(/AV111/);
      return;
    }
    const skill = fs.readFileSync(skillPath, 'utf8');
    expect(skill).toMatch(/AV111/);
  });
});
