// ─── V47 — CustomerDetailView course grouping (display parity with TFP) ───
//
// User report: "ตรงข้อมูลเห็น 2 คอร์ส กดเข้าไปใน TFP เห็นคอร์สเดียว คืออะไร??
// ต้องเชื่อตรงไหน?"
//
// Image evidence: course "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" with main + sub
// (Stapple no 22). Customer Detail View renders 2 cards (one per per-product
// entry, each with FULL ฿13,900 value — misleading). TFP renders 1 grouped
// card with 2 nested product rows.
//
// Root cause: be_customers.courses[] stores 1 entry PER PRODUCT (post V44/V45
// canonical mapper design). TFP groups via buildCustomerCourseGroups (form-
// shape input). Customer Detail View read raw customer.courses[] without
// grouping → splits 1 logical course into N visual cards.
//
// V47 fix: NEW groupCustomerCoursesForDetailView(rawCourses) helper —
// pure-JS grouping that mirrors buildCustomerCourseGroups but operates on
// raw be_customers.courses[] shape. CustomerDetailView.jsx adopts the helper
// → 1 group card per purchase event, N nested CourseItemBars per group.
//
// Class-of-bug: same V12 multi-reader-sweep pattern as V44/V45 — but at the
// reader-side rendering layer that wasn't audited when grouping was first
// introduced for TFP (Phase 12.2b).
//
// Test groups:
//  V47.A — groupCustomerCoursesForDetailView pure helper (15+ cases)
//  V47.B — Group key parity with buildCustomerCourseGroups (form-shape sibling)
//  V47.C — Pick-at-treatment placeholder isolation
//  V47.D — Modals receive correct originalIndex
//  V47.E — CustomerDetailView source-grep wires
//  V47.F — Cross-branch consistency (helper is branch-blind)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  groupCustomerCoursesForDetailView,
  buildCustomerCourseGroups,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const cdvSrc = read('src/components/backend/CustomerDetailView.jsx');
const helpersSrc = read('src/lib/treatmentBuyHelpers.js');

// ════════════════════════════════════════════════════════════════════════════
describe('V47.A — groupCustomerCoursesForDetailView pure helper', () => {
  it('A.1 USER REPORT REPRO: 2 entries from 1 course buy → 1 group with 2 entries', () => {
    const raw = [
      {
        name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
        product: 'ขลิบไร้เลือด',
        productId: 'P-MAIN',
        qty: '1 / 1 ครั้ง',
        value: '13900 บาท',
        status: 'กำลังใช้งาน',
        expiry: '',
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        linkedSaleId: 'INV-001',
        linkedTreatmentId: 'BT-001',
        parentName: '',
      },
      {
        name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
        product: 'Stapple no 22',
        productId: 'P-STAPPLE',
        qty: '1 / 1 ครั้ง',
        value: '13900 บาท',  // same value duplicated (canonical post-V47 design)
        status: 'กำลังใช้งาน',
        expiry: '',
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        linkedSaleId: 'INV-001',
        linkedTreatmentId: 'BT-001',
        parentName: '',
      },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(1); // ← V47 invariant: 2 entries → 1 group
    expect(groups[0].name).toBe('ขลิบไร้เลือด (เบอร์22) 1 ครั้ง');
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries[0].originalIndex).toBe(0);
    expect(groups[0].entries[1].originalIndex).toBe(1);
    expect(groups[0].entries[0].course.product).toBe('ขลิบไร้เลือด');
    expect(groups[0].entries[1].course.product).toBe('Stapple no 22');
    // First-entry-wins for course-level metadata
    expect(groups[0].value).toBe('13900 บาท');
  });

  it('A.2 different courses → separate groups', () => {
    const raw = [
      { name: 'Course A', product: 'P1', linkedSaleId: 'S1', linkedTreatmentId: 'T1' },
      { name: 'Course B', product: 'P2', linkedSaleId: 'S2', linkedTreatmentId: 'T2' },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('Course A');
    expect(groups[1].name).toBe('Course B');
  });

  it('A.3 same name but different linkedSaleId → separate groups (different purchases)', () => {
    const raw = [
      { name: 'Course X', product: 'P1', linkedSaleId: 'S1', linkedTreatmentId: 'T1' },
      { name: 'Course X', product: 'P1', linkedSaleId: 'S2', linkedTreatmentId: 'T2' }, // different purchase
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(2);
  });

  it('A.4 same name + same linkedSaleId/Treatment → SAME group (one purchase, multi-product)', () => {
    const raw = [
      { name: 'C', product: 'P1', linkedSaleId: 'S', linkedTreatmentId: 'T' },
      { name: 'C', product: 'P2', linkedSaleId: 'S', linkedTreatmentId: 'T' },
      { name: 'C', product: 'P3', linkedSaleId: 'S', linkedTreatmentId: 'T' },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });

  it('A.5 isAddon courses keyed by courseId (buy-this-visit)', () => {
    const raw = [
      { name: 'C', product: 'P1', isAddon: true, courseId: 'addon-1' },
      { name: 'C', product: 'P2', isAddon: true, courseId: 'addon-1' }, // same buy event
      { name: 'C', product: 'P3', isAddon: true, courseId: 'addon-2' }, // different buy
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].entries).toHaveLength(1);
  });

  it('A.6 pick-at-treatment placeholders are own group (not merged)', () => {
    const raw = [
      { name: 'PickCourse', needsPickSelection: true, availableProducts: [{ name: 'A' }, { name: 'B' }] },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(1);
    expect(groups[0].needsPickSelection).toBe(true);
    expect(groups[0].availableProducts).toHaveLength(2);
  });

  it('A.7 handles null/empty/non-array input', () => {
    expect(groupCustomerCoursesForDetailView(null)).toEqual([]);
    expect(groupCustomerCoursesForDetailView(undefined)).toEqual([]);
    expect(groupCustomerCoursesForDetailView([])).toEqual([]);
    expect(groupCustomerCoursesForDetailView('string')).toEqual([]);
    expect(groupCustomerCoursesForDetailView(42)).toEqual([]);
  });

  it('A.8 entry.originalIndex preserved for modals (add qty / exchange / share)', () => {
    const raw = [
      { name: 'A', product: 'P1' },
      { name: 'B', product: 'P2' }, // different group
      { name: 'A', product: 'P3' }, // re-merges with [0] but NOT same group (diff link fields = empty defaults)
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    // Find entry by product
    const allEntries = groups.flatMap(g => g.entries);
    expect(allEntries).toHaveLength(3);
    expect(allEntries.find(e => e.course.product === 'P1').originalIndex).toBe(0);
    expect(allEntries.find(e => e.course.product === 'P2').originalIndex).toBe(1);
    expect(allEntries.find(e => e.course.product === 'P3').originalIndex).toBe(2);
  });

  it('A.9 buffet course detected via courseType', () => {
    const raw = [{ name: 'Buf', product: 'P', courseType: 'บุฟเฟต์' }];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups[0].isBuffet).toBe(true);
  });

  it('A.10 fill-later (เหมาตามจริง) detected via courseType', () => {
    const raw = [{ name: 'F', product: 'P', courseType: 'เหมาตามจริง' }];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups[0].isRealQty).toBe(true);
  });

  it('A.11 pure helper — does NOT mutate input', () => {
    const raw = [{ name: 'X', product: 'P' }];
    const before = JSON.stringify(raw);
    groupCustomerCoursesForDetailView(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('A.12 idempotent — same input → equivalent output', () => {
    const raw = [
      { name: 'C', product: 'P1', linkedSaleId: 'S' },
      { name: 'C', product: 'P2', linkedSaleId: 'S' },
    ];
    const o1 = groupCustomerCoursesForDetailView(raw);
    const o2 = groupCustomerCoursesForDetailView(raw);
    expect(JSON.stringify(o1)).toBe(JSON.stringify(o2));
  });

  it('A.13 first-entry-wins for course-level metadata (value/expiry/status)', () => {
    // NOTE: name + linkedSaleId + linkedTreatmentId + parentName ALL form the
    // group key. To test first-entry-wins behavior, those must MATCH between
    // entries (same purchase event). Only NON-key metadata (value/expiry/
    // status) can vary — and the helper picks first.
    const raw = [
      { name: 'X', product: 'P1', value: '5000 บาท', expiry: '2026-12-31', status: 'กำลังใช้งาน',
        parentName: 'โปรโมชัน A', linkedSaleId: 'S' },
      { name: 'X', product: 'P2', value: 'WRONG', expiry: 'WRONG', status: 'WRONG',
        parentName: 'โปรโมชัน A', linkedSaleId: 'S' }, // same group key, varying metadata
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups).toHaveLength(1);
    expect(groups[0].value).toBe('5000 บาท'); // first-entry wins
    expect(groups[0].expiry).toBe('2026-12-31');
    expect(groups[0].status).toBe('กำลังใช้งาน');
    expect(groups[0].parentName).toBe('โปรโมชัน A');
  });

  it('A.14 V47 USER REPORT scenario: 2 cards → 1 card invariant', () => {
    // EXACT shape from user's image (LC-26000006 ภมรศักดิ์ มงคล customer)
    const raw = [
      {
        name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
        product: 'ขลิบไร้เลือด',
        productId: '38843',
        qty: '1 / 1 ครั้ง',
        value: '13900 บาท',
        status: 'กำลังใช้งาน',
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        skipStockDeduction: true, // V45 OR-merged
      },
      {
        name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
        product: 'Stapple no 22',
        productId: '38699',
        qty: '1 / 1 ครั้ง',
        value: '13900 บาท',
        status: 'กำลังใช้งาน',
        courseType: 'ระบุสินค้าและจำนวนสินค้า',
        skipStockDeduction: false,
      },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    // V47 invariant — single card, NOT 2
    expect(groups).toHaveLength(1);
    // มูลค่าคงเหลือ shown ONCE (not duplicated 13900 + 13900 = 27800 misleading)
    expect(groups[0].value).toBe('13900 บาท');
    // Both products visible inside the group
    expect(groups[0].entries.map(e => e.course.product)).toEqual([
      'ขลิบไร้เลือด',
      'Stapple no 22',
    ]);
  });

  it('A.15 entries always present + non-empty for grouped output', () => {
    const raw = [{ name: 'X', product: 'P' }];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(Array.isArray(groups[0].entries)).toBe(true);
    expect(groups[0].entries.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V47.B — Group key parity with buildCustomerCourseGroups', () => {
  it('B.1 same purchase event yields same group regardless of which helper used', () => {
    // Raw shape (CDV input)
    const rawSamePurchase = [
      { name: 'C', product: 'P1', linkedSaleId: 'S', linkedTreatmentId: 'T' },
      { name: 'C', product: 'P2', linkedSaleId: 'S', linkedTreatmentId: 'T' },
    ];
    const cdvGroups = groupCustomerCoursesForDetailView(rawSamePurchase);
    expect(cdvGroups).toHaveLength(1);

    // Same data through mapRawCoursesToForm + buildCustomerCourseGroups
    const formShape = mapRawCoursesToForm(rawSamePurchase);
    const formGroups = buildCustomerCourseGroups(formShape);
    expect(formGroups).toHaveLength(1);

    // Both helpers agree: 2 entries → 1 group
    expect(cdvGroups.length).toBe(formGroups.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V47.C — CustomerDetailView source-grep wires', () => {
  it('C.1 imports groupCustomerCoursesForDetailView from treatmentBuyHelpers', () => {
    // V103 fixup (2026-05-19 LATE+2) — relaxed to allow sibling imports
    // alongside groupCustomerCoursesForDetailView (V103 added
    // `isTerminalCourseStatus` to the same import block for AV90).
    expect(cdvSrc).toMatch(
      /import\s*\{[^}]*groupCustomerCoursesForDetailView[^}]*\}\s*from\s*['"][^'"]*treatmentBuyHelpers\.js['"]/
    );
  });

  it('C.2 activeCourseGroups + expiredCourseGroups defined via useMemo', () => {
    expect(cdvSrc).toMatch(/const\s+activeCourseGroups\s*=\s*useMemo/);
    expect(cdvSrc).toMatch(/const\s+expiredCourseGroups\s*=\s*useMemo/);
    expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(activeCourses\)/);
    expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(expiredCourses\)/);
  });

  it('C.3 count badge uses activeCourseGroups.length (NOT activeCourses.length)', () => {
    expect(cdvSrc).toMatch(/activeCourseGroups\.length\s*>\s*0/);
    // Anti-regression: the count-badge must NOT use the raw activeCourses.length
    // (would over-count by N-products-per-course factor pre-V47)
    const badgeBlock = cdvSrc.match(/Package size=\{13\}[\s\S]+?<\/span>/);
    expect(badgeBlock?.[0] || '').not.toMatch(/activeCourses\.length/);
  });

  it('C.4 render iterates activeCourseGroups / expiredCourseGroups (NOT raw arrays)', () => {
    expect(cdvSrc).toMatch(
      /\(\s*courseTab === 'active' \? activeCourseGroups : expiredCourseGroups\s*\)\.map\(/
    );
  });

  it('C.5 each group renders ≥ 1 CourseItemBar via group.entries.map (per-product)', () => {
    expect(cdvSrc).toMatch(/group\.entries\.map\(/);
    expect(cdvSrc).toMatch(/<CourseItemBar/);
  });

  it('C.6 modals receive entry.originalIndex (NOT findIndex-based idx)', () => {
    // Modal callbacks must use originalIndex closure, not the (idx) param
    expect(cdvSrc).toMatch(
      /setAddQtyModal\(\{\s*courseIndex:\s*entry\.originalIndex/
    );
    expect(cdvSrc).toMatch(
      /setExchangeModal\(\{\s*courseIndex:\s*entry\.originalIndex/
    );
    expect(cdvSrc).toMatch(
      /setShareModal\(\{\s*courseIndex:\s*entry\.originalIndex/
    );
  });

  it('C.7 V47 markers present in CustomerDetailView', () => {
    expect(cdvSrc).toMatch(/V47/);
  });

  it('C.8 V47 markers present in treatmentBuyHelpers (helper definition)', () => {
    expect(helpersSrc).toMatch(/V47.*group|groupCustomerCoursesForDetailView/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V47.D — Helper is branch-blind (cross-branch identical behavior)', () => {
  it('D.1 same input on every branch produces identical output', () => {
    // The helper is pure JS — runs identically on every branch's data.
    // This test ensures the helper doesn't accidentally read any branch
    // context (no branchId references in its scope).
    const helperFn = groupCustomerCoursesForDetailView.toString();
    expect(helperFn).not.toMatch(/branchId/);
    expect(helperFn).not.toMatch(/SELECTED_BRANCH/);
    expect(helperFn).not.toMatch(/useSelectedBranch/);
  });

  it('D.2 fixture-matrix: 3 different "branches" (simulated via branchId field on entries) yield same grouping', () => {
    // Branch A — เบอร์22 + main + sub
    const branchA = [
      { name: 'C', product: 'P1', linkedSaleId: 'S', branchId: 'BR-A' },
      { name: 'C', product: 'P2', linkedSaleId: 'S', branchId: 'BR-A' },
    ];
    // Branch B — same shape but different branchId
    const branchB = branchA.map(e => ({ ...e, branchId: 'BR-B' }));
    // Branch C — future branch
    const branchC = branchA.map(e => ({ ...e, branchId: 'BR-FUTURE' }));

    const grpA = groupCustomerCoursesForDetailView(branchA);
    const grpB = groupCustomerCoursesForDetailView(branchB);
    const grpC = groupCustomerCoursesForDetailView(branchC);

    expect(grpA.length).toBe(grpB.length);
    expect(grpB.length).toBe(grpC.length);
    expect(grpA.length).toBe(1); // 2 entries → 1 group on every branch
  });
});
