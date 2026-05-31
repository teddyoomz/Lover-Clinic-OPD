/**
 * V104 (2026-05-19 LATE+3 EOD+1) — handleSubmit param-shadow regression bank.
 *
 * Root cause: TreatmentFormPage.jsx line 2085 declared
 *   const handleSubmit = async (eventOrSaveMode, options = {}) => { ... }
 * which shadowed the React state `options` declared at line 461. Every
 * `options?.X` read inside handleSubmit body (V101 IIFE + 9 other call
 * sites) silently resolved to the empty parameter `{}` instead of the
 * React state. Result: V101 IIFE produced `courseItems=[]` → BOTH
 * existingDeductions + purchasedDeductions arrays were empty →
 * deductCourseItems NEVER called → customer.courses[].qty.remaining NEVER
 * decremented. Live save path had been broken since Phase 26.1 (2026-05-13);
 * V101 backfill script silently rescued treatments retroactively, masking
 * the bug for 4 days until user noticed (LC-26000078 Shock Wave 12+2 test
 * save 2026-05-19 20:53 BKK).
 *
 * Plus silent-swallow at TFP:3134 (purchased course deduction catch) hid
 * any error from the user — combined with shadow, surface was
 * "บันทึกสำเร็จ + ไม่ตัดสักครั้ง".
 *
 * Fix:
 *   Part A — rename 2nd param `options` → `submitOpts` (only used for editorContext)
 *   Part B — replace `console.warn` with throw + atomic-rollback (mirror existingDeductions)
 *
 * Rule N — targeted-test-only (small bugfix scope: 2 edits in 1 file).
 * Rule I — full-flow simulate present (F-group below).
 * Rule P — AV91 invariant (separate file v104-av91-react-state-param-shadow.test.js).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const TFP_SRC = readFileSync(TFP_PATH, 'utf8');
// V142-bis: the V101 courseItems serialization was extracted from the TFP inline
// IIFE to this helper (testability) — SG3 verifies the contract moved here.
const HELPER_SRC = readFileSync('src/lib/treatmentBuyHelpers.js', 'utf8');

describe('V104.SG — source-grep lockdown for shadow + silent-swallow', () => {
  it('SG1: handleSubmit 2nd param renamed to submitOpts (NOT options)', () => {
    // Locked-in shape after V104. Param name MUST NOT be `options` (would
    // shadow React state). MUST NOT be any name in the danger list either.
    const reShadow = /const handleSubmit = async \(eventOrSaveMode,\s*options\s*=\s*\{\}\)/;
    expect(TFP_SRC).not.toMatch(reShadow);
    const reFixed = /const handleSubmit = async \(eventOrSaveMode,\s*submitOpts\s*=\s*\{\}\)/;
    expect(TFP_SRC).toMatch(reFixed);
  });

  it('SG2: line ~2101 editorContext read uses submitOpts (NOT options)', () => {
    // The ONLY legitimate use of the 2nd param was the editorContext
    // extraction. Pre-V104 read `options.editorContext`; post-V104 reads
    // `submitOpts.editorContext`.
    expect(TFP_SRC).toMatch(/let editorContext = submitOpts\.editorContext \|\| null/);
    expect(TFP_SRC).not.toMatch(/let editorContext = options\.editorContext \|\| null/);
  });

  it('SG3: V101 serialization reads React-state options?.customerCourses (V142-bis: extracted to buildCourseItemsForSave)', () => {
    // V104 intent: the V101 serialization MUST read `options?.customerCourses`
    // (React state), NOT the shadowed `submitOpts` param. V142-bis (2026-05-31)
    // extracted the inline IIFE to buildCourseItemsForSave(...) for testability;
    // the TFP call-site still passes `options?.customerCourses` → same
    // non-shadowed read preserved.
    expect(TFP_SRC).toMatch(/buildCourseItemsForSave\(selectedCourseItems, options\?\.customerCourses, treatmentItems\)/);
    // the inline IIFE must be GONE (logic now lives in the helper)
    expect(TFP_SRC).not.toMatch(/courseItems: \(\(\) => \{/);
    // and the helper carries the V101 two-pass serialization
    expect(HELPER_SRC).toMatch(/export function buildCourseItemsForSave\(/);
    expect(HELPER_SRC).toMatch(/Pass 2 — V101 defensive auto-link via productId/);
  });

  it('SG4: purchased-course deduction NO LONGER silently swallows errors', () => {
    // Pre-V104 had:
    //   `} catch (e) { console.warn('[TreatmentForm] purchased course deduction failed:', e); }`
    // Post-V104 has explicit throw with Thai error + atomic-rollback.
    expect(TFP_SRC).not.toMatch(/console\.warn\(['"]\[TreatmentForm\] purchased course deduction failed/);
    // Must include the V104 throw pattern
    expect(TFP_SRC).toMatch(/ตัดคอร์สที่ซื้อในการรักษาไม่สำเร็จ/);
    // Must include atomic-rollback (mirror of existingDeductions)
    expect(TFP_SRC).toMatch(/V104 orphan-treatment rollback failed/);
  });

  it('SG5: NO arrow/regular function in TFP shadows React-state names', () => {
    // React state names declared in TFP via `useState` — these names MUST
    // NOT be reused as function parameters elsewhere in the file.
    // Sanctioned exceptions: closed list (none currently).
    const DANGER_REACT_STATE_NAMES = [
      'options',     // ← V104 trigger
      // 'customer',  // not currently used as state name
      // 'treatments', // not currently used as state name
    ];
    // Strip line + block comments to avoid matching the V104 documentation
    // comment that literally describes the pre-V104 broken signature.
    const stripped = TFP_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const name of DANGER_REACT_STATE_NAMES) {
      // Pattern: arrow or regular function with a parameter literally
      // named the same as a React state. Allowing default `= ...` or
      // not. Excludes object-destructuring `{X}` and rest `...X` since
      // those don't create plain identifier bindings that shadow.
      const re = new RegExp(`\\(\\s*\\w+\\s*,\\s*${name}\\s*=`, 'g');
      const hits = stripped.match(re) || [];
      expect(hits, `forbidden shadowing param '${name}' found in real code (comments stripped)`).toEqual([]);
    }
  });

  it('SG6: V104 marker comment present (institutional memory grep)', () => {
    expect(TFP_SRC).toMatch(/V104 \(2026-05-19 LATE\+3 EOD\+1\)/);
  });
});

// Pure-JS simulator of V101 IIFE — mirrors the logic in TFP exactly so we
// can test buy-this-visit + use-this-visit chain in isolation. Identical
// behavior to the IIFE; sync to TFP source if IIFE changes.
function v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses }) {
  const liveCustomerCourses = customerCourses || [];
  const out = [];
  const usedRowIds = new Set();
  // Pass 1 — original rowId-based serialization (happy path)
  for (const rowId of selectedCourseItems) {
    let found = false;
    for (const course of liveCustomerCourses) {
      const product = course.products?.find(p => p.rowId === rowId);
      if (product) {
        out.push({
          courseName: course.courseName,
          productName: product.name,
          rowId: product.rowId,
          courseIndex: typeof product.courseIndex === 'number' ? product.courseIndex : undefined,
          deductQty: Number(treatmentItems.find(t => t.id === rowId)?.qty || 1),
          unit: product.unit || '',
        });
        usedRowIds.add(rowId);
        found = true;
        break;
      }
    }
    if (!found) {
      // forensic console.warn in real IIFE; here just continue
    }
  }
  // Pass 2 — productId fallback
  for (const ti of treatmentItems) {
    if (!ti.id || !ti.productId) continue;
    if (usedRowIds.has(ti.id)) continue;
    if (out.some(c => String(c.rowId) === String(ti.id))) continue;
    let match = null;
    for (const course of liveCustomerCourses) {
      for (const product of (course.products || [])) {
        if (String(product.productId) === String(ti.productId)) {
          const rem = parseFloat(product.remaining);
          const isFillLater = !!product.fillLater;
          const isBuffet = !!product.isBuffet;
          if (isFillLater || isBuffet || (Number.isFinite(rem) && rem > 0)) {
            match = { course, product };
            break;
          }
        }
      }
      if (match) break;
    }
    if (match) {
      out.push({
        courseName: match.course.courseName,
        productName: match.product.name,
        rowId: match.product.rowId,
        courseIndex: typeof match.product.courseIndex === 'number' ? match.product.courseIndex : undefined,
        deductQty: Number(ti.qty) || 1,
        unit: match.product.unit || ti.unit || '',
        _v101AutoLinked: true,
      });
    }
  }
  return out;
}

describe('V104.F — Rule I flow-simulate (buy-this-visit + use-this-visit chain)', () => {
  it('F1: buy + use chain — Pass 1 finds purchased rows by rowId', () => {
    // Simulate confirmBuyModal output appended to customerCourses
    const buyEntry = {
      courseId: 'purchased-course-COURSES_X-1779000000000',
      courseName: 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง',
      courseType: '',
      isAddon: true,
      products: [
        { rowId: 'purchased-COURSES_X-row-38842', productId: '38842', name: 'Shock wave', remaining: '12', total: '12', unit: 'ครั้ง' },
        { rowId: 'purchased-COURSES_X-row-38849', productId: '38849', name: 'ติดตามอาการกับแพทย์', remaining: '2', total: '2', unit: 'ครั้ง' },
      ],
    };
    const selectedCourseItems = new Set([
      'purchased-COURSES_X-row-38842',
      'purchased-COURSES_X-row-38849',
    ]);
    const treatmentItems = [
      { id: 'purchased-COURSES_X-row-38842', productId: '38842', name: 'Shock wave', qty: '12', unit: 'ครั้ง' },
      { id: 'purchased-COURSES_X-row-38849', productId: '38849', name: 'ติดตามอาการกับแพทย์', qty: '2', unit: 'ครั้ง' },
    ];
    const courseItems = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [buyEntry] });
    expect(courseItems).toHaveLength(2);
    expect(courseItems[0].rowId).toBe('purchased-COURSES_X-row-38842');
    expect(courseItems[0].deductQty).toBe(12);
    expect(courseItems[0].productName).toBe('Shock wave');
    expect(courseItems[1].rowId).toBe('purchased-COURSES_X-row-38849');
    expect(courseItems[1].deductQty).toBe(2);
  });

  it('F2: bug repro — empty customerCourses (shadowed param) returns []', () => {
    // PRE-V104 behavior: shadowed options.customerCourses → []
    // → IIFE returns [] → purchasedDeductions = [] → deductCourseItems
    // never called → bug. This test locks the contract that empty
    // input → empty output (not silently broken).
    const selectedCourseItems = new Set(['purchased-X-row-38842']);
    const treatmentItems = [
      { id: 'purchased-X-row-38842', productId: '38842', name: 'Shock wave', qty: '12', unit: 'ครั้ง' },
    ];
    const courseItems = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [] });
    expect(courseItems).toEqual([]);
  });

  it('F3: Pass 2 productId fallback — buy course missing from rowId but matchable via productId', () => {
    // Edge case: somehow buy-this-visit course not in customerCourses but
    // existing course (depleted-then-refilled?) has matching productId.
    const existingCourse = {
      courseId: 'existing-old-shock',
      courseName: 'Shock Wave 12 ครั้ง',
      products: [
        { rowId: 'be-row-0', productId: '38842', name: 'Shock wave', remaining: '5', total: '12', unit: 'ครั้ง', courseIndex: 0 },
      ],
    };
    const selectedCourseItems = new Set(['unrelated-rowId']);
    const treatmentItems = [
      { id: 'unrelated-rowId', productId: '38842', name: 'Shock wave', qty: '3', unit: 'ครั้ง' },
    ];
    const courseItems = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [existingCourse] });
    expect(courseItems).toHaveLength(1);
    expect(courseItems[0].rowId).toBe('be-row-0');
    expect(courseItems[0]._v101AutoLinked).toBe(true);
  });

  it('F4: depleted existing course (rem=0) — Pass 2 skips, no match', () => {
    const depletedCourse = {
      courseId: 'old-depleted',
      courseName: 'Old Shock',
      products: [
        { rowId: 'be-row-0', productId: '38842', name: 'Shock wave', remaining: '0', total: '12', unit: 'ครั้ง', courseIndex: 0 },
      ],
    };
    const selectedCourseItems = new Set([]);
    const treatmentItems = [
      { id: 'unrelated', productId: '38842', name: 'Shock wave', qty: '1' },
    ];
    const courseItems = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [depletedCourse] });
    expect(courseItems).toEqual([]);
  });

  it('F5: mixed — Pass 1 hits purchased + Pass 2 hits existing for different productIds', () => {
    const buyEntry = {
      courseId: 'purchased-course-X',
      courseName: 'Shock 12+ติดตาม 1',
      products: [
        { rowId: 'purchased-X-row-38842', productId: '38842', name: 'Shock wave', remaining: '12', total: '12', unit: 'ครั้ง' },
      ],
    };
    const existingCourse = {
      courseId: 'existing-other',
      courseName: 'Old DripVit',
      products: [
        { rowId: 'be-row-5', productId: '99999', name: 'DripVit', remaining: '3', total: '5', unit: 'ครั้ง', courseIndex: 5 },
      ],
    };
    const selectedCourseItems = new Set(['purchased-X-row-38842']);
    const treatmentItems = [
      { id: 'purchased-X-row-38842', productId: '38842', name: 'Shock wave', qty: '12' },
      { id: 'tossed-rowid', productId: '99999', name: 'DripVit', qty: '1' },
    ];
    const courseItems = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [buyEntry, existingCourse] });
    expect(courseItems).toHaveLength(2);
    // Pass 1
    expect(courseItems[0].rowId).toBe('purchased-X-row-38842');
    expect(courseItems[0]._v101AutoLinked).toBeUndefined();
    // Pass 2
    expect(courseItems[1].rowId).toBe('be-row-5');
    expect(courseItems[1]._v101AutoLinked).toBe(true);
  });

  it('F6: adversarial — null/undefined/empty inputs handled gracefully', () => {
    expect(v101CourseItemsBuilder({ selectedCourseItems: new Set(), treatmentItems: [], customerCourses: [] })).toEqual([]);
    expect(v101CourseItemsBuilder({ selectedCourseItems: new Set(), treatmentItems: [], customerCourses: null })).toEqual([]);
    expect(v101CourseItemsBuilder({ selectedCourseItems: new Set(), treatmentItems: [], customerCourses: undefined })).toEqual([]);
  });

  it('F7: real-prod victim repro — BT-1779196388660 shape', () => {
    // Reproduce exact data shape from real production victim (LC-26000078,
    // 2026-05-19 20:53 BKK). Pre-V104 (shadowed empty options) returned [].
    // Post-V104 (correct options.customerCourses): returns 2 entries.
    const buyEntry = {
      courseId: 'purchased-course-COURSES_1778150447655_24EA110C',
      courseName: 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง',
      isAddon: true,
      products: [
        { rowId: 'purchased-COURSES_1778150447655_24EA110C-row-38842', productId: '38842', name: 'Shock wave', remaining: '12', total: '12', unit: 'ครั้ง' },
        { rowId: 'purchased-COURSES_1778150447655_24EA110C-row-38849', productId: '38849', name: 'ติดตามอาการกับแพทย์', remaining: '2', total: '2', unit: 'ครั้ง' },
      ],
    };
    const selectedCourseItems = new Set([
      'purchased-COURSES_1778150447655_24EA110C-row-38842',
      'purchased-COURSES_1778150447655_24EA110C-row-38849',
    ]);
    const treatmentItems = [
      { id: 'purchased-COURSES_1778150447655_24EA110C-row-38842', productId: '38842', name: 'Shock wave', qty: 12, unit: 'ครั้ง' },
      { id: 'purchased-COURSES_1778150447655_24EA110C-row-38849', productId: '38849', name: 'ติดตามอาการกับแพทย์', qty: 2, unit: 'ครั้ง' },
    ];
    const post = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [buyEntry] });
    expect(post).toHaveLength(2);
    expect(post[0].deductQty).toBe(12);
    expect(post[1].deductQty).toBe(2);
    // Pre-V104 simulation (empty customerCourses)
    const pre = v101CourseItemsBuilder({ selectedCourseItems, treatmentItems, customerCourses: [] });
    expect(pre).toEqual([]);
  });
});
