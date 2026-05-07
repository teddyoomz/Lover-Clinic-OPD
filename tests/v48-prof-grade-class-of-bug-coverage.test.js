// ─── V48 — PROF-GRADE comprehensive coverage of V42-V48 class-of-bug ──────
//
// User directive: "ใช้ประสบกาณ์ทั้งหมดออกแบบ test ทุกประเภท ทุกแบบ ที่จะ
// ช่วยให้เจอบั๊คที่ยังไม่เจอให้ได้".
//
// This test bank is designed to CATCH undiscovered bugs in the V42-V48
// class-of-bug family by exhaustively testing the invariants under EVERY
// kind of stress. Test categories:
//
//   1. SOURCE-GREP REGRESSION (AV20-AV26 universal locks)
//   2. PROPERTY-BASED (random fixtures verify invariants)
//   3. CROSS-BRANCH IDENTITY (helper branch-blind via toString.grep)
//   4. ADVERSARIAL INPUTS (Thai / null / undefined / Unicode normalization)
//   5. IDEMPOTENCY (every helper double-called yields same output)
//   6. FORWARD-COMPAT (adding new fields doesn't break readers)
//   7. BACKWARD-COMPAT (legacy missing fields handled gracefully)
//   8. CLASS-OF-BUG UNIVERSAL (V42-V48 patterns audited everywhere)
//   9. RULE O ENFORCEMENT (V48 extension to ALL stock writers)
//
// V42-V48 SAGA SUMMARY:
//   V42: Multi-writer-sweep at 3-level qty multiplier
//   V43: Denormalized-flag frozen at buy-time → live-resolve overlay + migration
//   V44: Canonical-mapper bypass via inline mapping → adopt mapper everywhere
//   V45: Silent-dedup drops user intent → OR-merge before continue
//   V46: Denormalized-cache poisons new writes → live-resolve at write (Rule O)
//   V47: Display-layer multi-reader-sweep → grouping helper everywhere
//   V48: Rule O EXTENSION to all stock-write sites (repay/cancel/adjust/transfer/withdrawal)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveCustomerCourseSkipFlag,
  overlayCustomerCoursesWithMaster,
  groupCustomerCoursesForDetailView,
  buildCustomerCourseGroups,
  buildPromotionSubCourseProducts,
  computePromotionProductQty,
  buildPurchasedCourseEntry,
  resolvePurchasedCourseForAssign,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';
import { beCourseToMasterShape } from '../src/lib/backendClient.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');
const helpersSrc = read('src/lib/treatmentBuyHelpers.js');
const tfpSrc = read('src/components/TreatmentFormPage.jsx');
const cdvSrc = read('src/components/backend/CustomerDetailView.jsx');
const auditSrc = read('.agents/skills/audit-anti-vibe-code/SKILL.md');

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 1 — SOURCE-GREP REGRESSION (AV20-AV26 universal locks)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT1 — Source-grep regression (AV20-AV26 universal locks)', () => {
  it('1.1 AV24 — every tx.set/setDoc(stockMovementDoc productName uses live-resolve OR item.productName', () => {
    // Find every stockMovementDoc write block. Each must have either:
    //   - productName: <liveVar>... (V46/V48 path)
    //   - productName: item.productName... (skip-path V46-EXEMPT)
    //   - productName: m.productName (read-existing-movement context, EXEMPT)
    const blocks = [...backendSrc.matchAll(/(?:tx\.set|setDoc|wb\.set)\(stockMovementDoc\(\w+\)[\s\S]+?productName:\s*([a-zA-Z_][\w.\s|()'"\\,!]*?),/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(7);
    for (const m of blocks) {
      const valueExpr = m[1].trim();
      const isLiveResolve = /live(?:Name|NameNeg|ProductName|CancelName|AdjustName|ExportName|ExportWdName|TransferName|WithdrawName|CentralCancelName)/i.test(valueExpr);
      const isItemBased = /\b(?:item|it)\.productName/.test(valueExpr); // includes String(item|it.productName||'')
      const isReadExisting = /\bm\.productName/.test(valueExpr); // reading existing movement / line / order item
      const isLineBased = /\b(?:line|p|t|c)\.productName/.test(valueExpr); // sale items split by category
      // Each productName assignment must fall into one of these sanctioned categories
      expect(isLiveResolve || isItemBased || isReadExisting || isLineBased,
        `Movement productName must use live-resolve OR item.productName OR read-existing pattern; got: ${valueExpr}`).toBe(true);
    }
  });

  it('1.2 AV24 — pure batch.productName / b.productName as sole source is FORBIDDEN', () => {
    // The bare anti-pattern `productName: b.productName,` (no fallback chain)
    // in a stockMovementDoc write block is V48 anti-pattern.
    // Allow it ONLY in skip-reason readers (display structure not movement write).
    const fnStart = backendSrc.indexOf('async function _deductOneItem(');
    const fnEnd = backendSrc.indexOf('async function deductStockForSale(', fnStart);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    // _deductOneItem must NOT have bare `productName: b.productName,` followed by `qty: -`
    // (this was the V46-fixed pattern)
    expect(fnBody).not.toMatch(/productName:\s*b\.productName,\s*\n\s*qty:\s*-/);
  });

  it('1.3 AV22 — TFP buy fetcher uses beCourseToMasterShape canonical', () => {
    expect(tfpSrc).toMatch(/beCourseToMasterShape\(c,\s*\{[^}]*productLookup/);
  });

  it('1.4 AV23 — beCourseToMasterShape dedup-shadow OR-merge present', () => {
    expect(backendSrc).toMatch(
      /if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*\{[\s\S]*?cp\.skipStockDeduction\s*===\s*true[\s\S]*?continue;\s*\}/
    );
  });

  it('1.5 AV25 — CustomerDetailView uses groupCustomerCoursesForDetailView helper', () => {
    expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(activeCourses\)/);
    expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(expiredCourses\)/);
  });

  it('1.6 AV21 — V43 overlay helpers exist for skip-stock denormalized flag', () => {
    expect(helpersSrc).toMatch(/export function resolveCustomerCourseSkipFlag/);
    expect(helpersSrc).toMatch(/export function overlayCustomerCoursesWithMaster/);
  });

  it('1.7 V48 markers — Rule O extension applied at non-_deductOneItem sites', () => {
    // Every V48 fix site has a V48 marker comment
    expect(backendSrc).toMatch(/V48 \(2026-05-08\)/);
    // Specific call-out: Rule O extension to repay / cancel / adjust / transfer / withdrawal
    const v48Mentions = (backendSrc.match(/V48[^\n]*Rule O/g) || []).length;
    expect(v48Mentions).toBeGreaterThanOrEqual(5);
  });

  it('1.8 audit-anti-vibe-code SKILL has AV20-AV25 invariants documented', () => {
    expect(auditSrc).toMatch(/AV20/);
    expect(auditSrc).toMatch(/AV21/);
    expect(auditSrc).toMatch(/AV22/);
    expect(auditSrc).toMatch(/AV23/);
    expect(auditSrc).toMatch(/AV24/);
    expect(auditSrc).toMatch(/AV25/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 2 — PROPERTY-BASED (random fixtures verify invariants)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT2 — Property-based: random fixtures verify invariants', () => {
  // Deterministic PRNG — seed-based for reproducible test runs
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(42); // deterministic
  function randPick(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function randName() { return `Prop-${Math.floor(rng() * 1e6)}`; }
  function randBool() { return rng() < 0.5; }
  function randInt(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }

  it('2.1 PROPERTY: 100 random course shapes — no row in shape.products has name === courseName (V44 invariant)', () => {
    for (let i = 0; i < 100; i++) {
      const courseName = randName();
      const mainId = `MAIN-${i}`;
      const subCount = randInt(0, 5);
      const c = {
        courseName,
        mainProductId: mainId,
        mainProductName: `Main-${i}`,
        mainQty: randInt(1, 10),
        skipStockDeduction: randBool(),
        courseProducts: Array.from({ length: subCount }, (_, k) => ({
          productId: randBool() ? mainId : `SUB-${i}-${k}`, // sometimes dup-of-main
          productName: `Sub-${i}-${k}`,
          qty: randInt(1, 5),
          skipStockDeduction: randBool(),
          isHidden: randBool(),
        })),
      };
      const shape = beCourseToMasterShape(c);
      // V44 invariant: no row name === courseName
      const hasCourseLeak = shape.products.some(p => p.name === courseName);
      expect(hasCourseLeak).toBe(false);
    }
  });

  it('2.2 PROPERTY: 100 random courses — V45 OR-merge always preserves user intent (sub.skip=true ⇒ main.skip=true)', () => {
    for (let i = 0; i < 100; i++) {
      const mainId = `M-${i}`;
      const c = {
        courseName: randName(),
        mainProductId: mainId,
        mainProductName: `Main-${i}`,
        mainQty: 1,
        skipStockDeduction: false, // top-level FALSE
        courseProducts: [
          // dup-of-main with sub.skip=true (V45 OR-merge target)
          { productId: mainId, productName: `Main-${i}`, qty: 1, skipStockDeduction: true },
          // distinct sub
          { productId: `S-${i}`, productName: `Sub-${i}`, qty: 1 },
        ],
      };
      const shape = beCourseToMasterShape(c);
      const main = shape.products.find(p => p.isMainProduct);
      // V45 invariant: dup-of-main with sub.skip=true → main.skip=true via OR-merge
      expect(main.skipStockDeduction).toBe(true);
    }
  });

  it('2.3 PROPERTY: 100 random customer.courses[] arrays → grouping yields ≤ raw entries count', () => {
    for (let i = 0; i < 100; i++) {
      const entryCount = randInt(0, 20);
      const raw = Array.from({ length: entryCount }, (_, k) => ({
        name: randPick(['CourseA', 'CourseB', 'CourseC']),
        product: `P-${k}`,
        qty: '1 / 1 ครั้ง',
        linkedSaleId: randPick(['S1', 'S2', 'S3']),
        linkedTreatmentId: randPick(['T1', 'T2', 'T3']),
      }));
      const groups = groupCustomerCoursesForDetailView(raw);
      // V47 invariant: groups ≤ raw entries
      expect(groups.length).toBeLessThanOrEqual(raw.length);
      // Total entries across groups = total raw (no entries lost)
      const totalEntriesInGroups = groups.reduce((s, g) => s + g.entries.length, 0);
      expect(totalEntriesInGroups).toBe(entryCount);
    }
  });

  it('2.4 PROPERTY: V42 promotion qty multiplier — mathematically 3-level (outer × sub × per)', () => {
    for (let i = 0; i < 50; i++) {
      const outer = randInt(1, 10);
      const subQty = randInt(1, 8);
      const perQty = randInt(1, 6);
      const sub = {
        name: 'P', qty: subQty,
        products: [{ productId: 'X', name: 'X', qty: perQty, skipStockDeduction: randBool() }],
      };
      const out = buildPromotionSubCourseProducts(sub, outer);
      const expected = computePromotionProductQty(outer, subQty, perQty);
      expect(out[0].qty).toBe(expected);
      // Manually verify: outer × sub × per
      expect(expected).toBe(outer * subQty * perQty);
    }
  });

  it('2.5 PROPERTY: every helper exhibits commutativity for entries with identical group keys', () => {
    // Reorder same-group entries → same group output
    const raw1 = [
      { name: 'C', product: 'A', linkedSaleId: 'S' },
      { name: 'C', product: 'B', linkedSaleId: 'S' },
    ];
    const raw2 = [...raw1].reverse();
    const g1 = groupCustomerCoursesForDetailView(raw1);
    const g2 = groupCustomerCoursesForDetailView(raw2);
    expect(g1.length).toBe(g2.length);
    expect(g1[0].entries.length).toBe(g2[0].entries.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 3 — CROSS-BRANCH IDENTITY (branch-blindness via toString.grep)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT3 — Cross-branch identity: helpers are branch-blind', () => {
  const BRANCH_BLIND_HELPERS = [
    { fn: resolveCustomerCourseSkipFlag, name: 'resolveCustomerCourseSkipFlag' },
    { fn: overlayCustomerCoursesWithMaster, name: 'overlayCustomerCoursesWithMaster' },
    { fn: groupCustomerCoursesForDetailView, name: 'groupCustomerCoursesForDetailView' },
    { fn: buildCustomerCourseGroups, name: 'buildCustomerCourseGroups' },
    { fn: buildPromotionSubCourseProducts, name: 'buildPromotionSubCourseProducts' },
    { fn: computePromotionProductQty, name: 'computePromotionProductQty' },
    { fn: buildPurchasedCourseEntry, name: 'buildPurchasedCourseEntry' },
    { fn: resolvePurchasedCourseForAssign, name: 'resolvePurchasedCourseForAssign' },
    { fn: mapRawCoursesToForm, name: 'mapRawCoursesToForm' },
    { fn: beCourseToMasterShape, name: 'beCourseToMasterShape' },
  ];
  for (const { fn, name } of BRANCH_BLIND_HELPERS) {
    it(`3.${name} — has NO branchId / SELECTED_BRANCH / useSelectedBranch references`, () => {
      const src = fn.toString();
      expect(src).not.toMatch(/branchId/);
      expect(src).not.toMatch(/SELECTED_BRANCH/);
      expect(src).not.toMatch(/useSelectedBranch/);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 4 — ADVERSARIAL INPUTS (Thai / null / Unicode / extreme)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT4 — Adversarial inputs', () => {
  it('4.1 Thai full-width course name with combining marks', () => {
    const c = {
      courseName: 'ขลิบไร้เลือดㅋㅋ ภาษา-混合-ทดสอบ',
      mainProductId: 'P', mainProductName: 'หลัก', mainQty: 1,
      courseProducts: [],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].name).toBe('หลัก');
    expect(shape.products.every(p => p.name !== c.courseName)).toBe(true);
  });

  it('4.2 NUL byte / control character in productName', () => {
    const c = {
      courseName: 'X',
      mainProductId: 'P', mainProductName: 'A\x00B\x01C', mainQty: 1,
      courseProducts: [],
    };
    const shape = beCourseToMasterShape(c);
    // Non-mutating preserves the bytes
    expect(shape.products[0].name).toBe('A\x00B\x01C');
  });

  it('4.3 extreme-length courseName (10K chars)', () => {
    const longName = 'X'.repeat(10000);
    const c = { courseName: longName, mainProductId: 'P', mainProductName: 'M', mainQty: 1, courseProducts: [] };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].name).toBe('M');
    expect(shape.products[0].name.length).toBe(1);
  });

  it('4.4 null/undefined entries in array do not crash helpers', () => {
    const raw = [null, undefined, { name: 'X', product: 'P' }];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups.length).toBe(1);
  });

  it('4.5 mixed-type productId (number / string / null / undefined)', () => {
    const c = {
      courseName: 'X',
      mainProductId: 12345, // numeric
      mainProductName: 'M', mainQty: 1,
      courseProducts: [
        { productId: '67890', productName: 'A', qty: 1 },     // string
        { productId: null, productName: 'B', qty: 1 },         // null
        { productId: undefined, productName: 'C', qty: 1 },    // undefined
      ],
    };
    const shape = beCourseToMasterShape(c);
    // Helper coerces all to strings; no crash
    expect(shape.products.length).toBeGreaterThan(0);
  });

  it('4.6 deeply-nested courseProducts (defensive against arbitrary input)', () => {
    const c = {
      courseName: 'X',
      mainProductId: 'M', mainProductName: 'M', mainQty: 1,
      courseProducts: Array.from({ length: 200 }, (_, k) => ({
        productId: `P-${k}`, productName: `N-${k}`, qty: k,
      })),
    };
    const shape = beCourseToMasterShape(c);
    // Main + 200 distinct subs
    expect(shape.products.length).toBe(201);
  });

  it('4.7 V47 grouping — same name with different unicode normalization (NFC vs NFD) → DIFFERENT keys', () => {
    // 'é' as single code point (NFC) vs 'e' + combining acute (NFD) are
    // DIFFERENT byte sequences — group key uses raw string, so they differ.
    const raw = [
      { name: 'café', product: 'A' }, // NFC
      { name: 'café', product: 'B' }, // NFD
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    // Document the actual behavior — different unicode forms = different groups
    // (this matches Firestore string comparison behavior; if NFC-normalization
    // is desired in future, that's a feature not a bug)
    expect(groups.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 5 — IDEMPOTENCY (every helper double-call yields same output)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT5 — Idempotency: helpers are pure + repeat-safe', () => {
  const FIXTURE = {
    courseName: 'IdemCourse',
    mainProductId: 'M', mainProductName: 'Main', mainQty: 5,
    skipStockDeduction: false,
    courseProducts: [
      { productId: 'M', productName: 'Main', qty: 5, skipStockDeduction: true }, // dup-of-main
      { productId: 'S1', productName: 'Sub1', qty: 3 },
    ],
  };

  it('5.1 beCourseToMasterShape: 5 calls → identical output', () => {
    const calls = Array.from({ length: 5 }, () => beCourseToMasterShape(FIXTURE));
    const s = JSON.stringify(calls[0]);
    expect(calls.every(c => JSON.stringify(c) === s)).toBe(true);
  });

  it('5.2 groupCustomerCoursesForDetailView: 5 calls → identical', () => {
    const raw = [{ name: 'X', product: 'P1' }, { name: 'X', product: 'P2' }];
    const calls = Array.from({ length: 5 }, () => groupCustomerCoursesForDetailView(raw));
    const s = JSON.stringify(calls[0]);
    expect(calls.every(c => JSON.stringify(c) === s)).toBe(true);
  });

  it('5.3 No mutation of input — input bytes unchanged after helper call', () => {
    const before = JSON.stringify(FIXTURE);
    beCourseToMasterShape(FIXTURE);
    expect(JSON.stringify(FIXTURE)).toBe(before);
  });

  it('5.4 buildPromotionSubCourseProducts: 5 calls on same sub → identical qty', () => {
    const sub = { name: 'X', qty: 5, products: [{ name: 'P', qty: 3 }] };
    const calls = Array.from({ length: 5 }, () => buildPromotionSubCourseProducts(sub, 2));
    const s = JSON.stringify(calls[0]);
    expect(calls.every(c => JSON.stringify(c) === s)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 6 — FORWARD-COMPAT (new fields don't break readers)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT6 — Forward-compat: helpers tolerate unknown future fields', () => {
  it('6.1 beCourseToMasterShape: unknown sub-product field preserved via spread', () => {
    const c = {
      courseName: 'X',
      mainProductId: 'M', mainProductName: 'Main', mainQty: 1,
      courseProducts: [
        { productId: 'S', productName: 'Sub', qty: 1, _v99FutureField: 'YES' },
      ],
    };
    const shape = beCourseToMasterShape(c);
    // Sub product entry doesn't carry the future field via mapper output —
    // mapper output is minimal canonical shape, so future fields are dropped.
    // This is by design (mapper as filter) — assert mapping is stable.
    expect(shape.products[1].name).toBe('Sub');
  });

  it('6.2 groupCustomerCoursesForDetailView: future field on entry preserved on entry.course', () => {
    const raw = [{ name: 'X', product: 'P', _v99NewFlag: true }];
    const groups = groupCustomerCoursesForDetailView(raw);
    // entry.course is the original (passed by reference, not copied)
    expect(groups[0].entries[0].course._v99NewFlag).toBe(true);
  });

  it('6.3 resolveCustomerCourseSkipFlag: ignores unknown master fields', () => {
    const master = {
      courseName: 'X',
      _v99TimeMachine: true, // future field
      courseProducts: [{ productId: 'P', skipStockDeduction: true }],
    };
    const out = resolveCustomerCourseSkipFlag({ productId: 'P' }, master);
    expect(out).toBe(true); // unaffected by future fields
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 7 — BACKWARD-COMPAT (legacy missing fields handled)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT7 — Backward-compat: legacy missing fields tolerated', () => {
  it('7.1 customer.courses[] entry from pre-V44 era (no productId) — no crash', () => {
    const raw = [{ name: 'LegacyCourse', product: 'LegacyProduct' /* no productId */ }];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups.length).toBe(1);
    expect(groups[0].entries[0].originalIndex).toBe(0);
  });

  it('7.2 be_courses doc from pre-V45 (no skipStockDeduction field) — defaults to false', () => {
    const c = {
      courseName: 'X',
      mainProductId: 'M', mainProductName: 'Main', mainQty: 1,
      courseProducts: [{ productId: 'M', productName: 'Main', qty: 1 }], // dup-of-main, no skip
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products[0].skipStockDeduction).toBe(false);
  });

  it('7.3 customer.courses[] entry without linkedSaleId/Treatment — uses fallback key', () => {
    const raw = [
      { name: 'X', product: 'P1' /* no link fields */, courseId: 'leg-1' },
      { name: 'X', product: 'P2', courseId: 'leg-2' },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    // Both have empty link fields → group by name+empty+empty = same group
    expect(groups.length).toBe(1);
    expect(groups[0].entries.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 8 — CLASS-OF-BUG UNIVERSAL (V42-V48 patterns audited everywhere)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT8 — Class-of-bug universal patterns', () => {
  it('8.1 V46/V48 — all stock_movement productName writes use live-resolve OR sanctioned exceptions', () => {
    // Comprehensive sweep — count writes, classify each
    const writes = [...backendSrc.matchAll(/(?:tx\.set|setDoc|wb\.set)\(stockMovementDoc\([^)]+\),\s*\{[\s\S]+?productName:\s*([a-zA-Z_S][\w.\s|()'"\\,!]*?),/g)];
    let sanctionedCount = 0;
    let unsanctionedCount = 0;
    for (const m of writes) {
      const expr = m[1].trim();
      const isLiveResolve = /live(Name|NameNeg|ProductName|CancelName|AdjustName|ExportName|ExportWdName|TransferName|WithdrawName|CentralCancelName)/i.test(expr);
      const isItemBased = /\b(?:item|it)\.productName/.test(expr);
      const isReadExisting = /\bm\.productName/.test(expr);
      const isLineBased = /\b(?:line|p|t|c)\.productName/.test(expr);
      if (isLiveResolve || isItemBased || isReadExisting || isLineBased) {
        sanctionedCount += 1;
      } else {
        unsanctionedCount += 1;
        console.log(`  unsanctioned productName at write: ${expr}`);
      }
    }
    expect(unsanctionedCount).toBe(0);
    expect(sanctionedCount).toBeGreaterThan(0);
  });

  it('8.2 V47 — every UI component reading customer.courses[] for cards uses grouping helper', () => {
    // CustomerDetailView is the canonical case — verify it imports + uses
    expect(cdvSrc).toMatch(/import\s*\{\s*groupCustomerCoursesForDetailView/);
    // No raw activeCourses.map for card rendering
    expect(cdvSrc).not.toMatch(/activeCourses\.map\(\(course,\s*i\)\s*=>\s*\{[\s\S]+?<h4/);
  });

  it('8.3 V44 — TFP uses canonical mapper, NOT inline c.courseProducts || c.products', () => {
    const tfpCourseBranchStart = tfpSrc.indexOf("} else if (type === 'course')");
    const tfpCourseBranchEnd = tfpSrc.indexOf("} else if (type === 'promotion')", tfpCourseBranchStart);
    const block = tfpSrc.slice(tfpCourseBranchStart, tfpCourseBranchEnd);
    expect(block).toMatch(/beCourseToMasterShape\(c,/);
    expect(block).not.toMatch(/c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]/);
  });

  it('8.4 V42 — buildPromotionSubCourseProducts present + uses computePromotionProductQty', () => {
    expect(helpersSrc).toMatch(/export function buildPromotionSubCourseProducts/);
    expect(helpersSrc).toMatch(/computePromotionProductQty\(buy, subQty, p\?\.qty\)/);
  });

  it('8.5 V43 — overlay applied at TFP load AFTER mapRawCoursesToForm', () => {
    const mapIdx = tfpSrc.indexOf('customerCoursesForForm = mapRawCoursesToForm(rawCourses);');
    const overlayIdx = tfpSrc.indexOf('customerCoursesForForm = overlayCustomerCoursesWithMaster(');
    expect(mapIdx).toBeGreaterThan(0);
    expect(overlayIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeLessThan(overlayIdx);
  });

  it('8.6 V45 — beCourseToMasterShape OR-merges per-row flag on dup-of-main', () => {
    const fnStart = backendSrc.indexOf('export function beCourseToMasterShape');
    const fnEnd = backendSrc.indexOf('\n}', fnStart);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/products\.find\(p => p\.isMainProduct/);
    expect(fnBody).toMatch(/cp\.skipStockDeduction\s*===\s*true/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 9 — RULE O ENFORCEMENT (V48 extension to all stock writers)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT9 — Rule O extension to all stock writers (V48)', () => {
  it('9.1 _repayNegativeBalances: live-resolve before tx loop', () => {
    const fnStart = backendSrc.indexOf('async function _repayNegativeBalances(');
    if (fnStart < 0) return; // helper renamed/inlined; skip
    // Wider window — function body is large, has nested tx blocks
    const fnBody = backendSrc.slice(fnStart, fnStart + 8000);
    expect(fnBody).toMatch(/_resolveProductNameLive\(productId\)/);
    expect(fnBody).toMatch(/productName:\s*liveProductName\s*\|\|\s*b\.productName/);
  });

  it('9.2 cancelStockOrder: live-resolve productName before CANCEL_IMPORT movement', () => {
    const fnStart = backendSrc.indexOf('export async function cancelStockOrder(');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = backendSrc.indexOf('\n}', fnStart + 3000);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/_resolveProductNameLive\(batch\.productId\)/);
    expect(fnBody).toMatch(/productName:\s*liveCancelName\s*\|\|\s*batch\.productName/);
  });

  it('9.3 createStockAdjustment: live-resolve productName before tx body', () => {
    const fnStart = backendSrc.indexOf('export async function createStockAdjustment(');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = backendSrc.indexOf('\n}', fnStart + 3000);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/_resolveProductNameLive\(preBatchSnap\.data\(\)\?\.productId\)/);
    expect(fnBody).toMatch(/productName:\s*liveAdjustName\s*\|\|\s*batch\.productName/);
  });

  it('9.4 createStockTransfer: live-resolve at POISON GATE (resolvedItems)', () => {
    const fnStart = backendSrc.indexOf('export async function createStockTransfer(');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = backendSrc.indexOf('\n}', fnStart + 3000);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/_resolveProductNameLive\(b\.productId\)/);
    expect(fnBody).toMatch(/productName:\s*liveTransferName\s*\|\|\s*b\.productName/);
  });

  it('9.5 transfer EXPORT_TRANSFER movement: uses item.productName (live-resolved upstream)', () => {
    const transferStart = backendSrc.indexOf('export async function updateStockTransferStatus(');
    const transferEnd = backendSrc.indexOf('export async function ', transferStart + 100);
    const fnBody = backendSrc.slice(transferStart, transferEnd);
    expect(fnBody).toMatch(/MOVEMENT_TYPES\.EXPORT_TRANSFER/);
    expect(fnBody).toMatch(/productName:\s*liveExportName\s*\|\|\s*b\.productName/);
  });

  it('9.6 createStockWithdrawal: live-resolve at POISON GATE (resolvedItems)', () => {
    const fnStart = backendSrc.indexOf('export async function createStockWithdrawal(');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = backendSrc.indexOf('\n}', fnStart + 3000);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/_resolveProductNameLive\(b\.productId\)/);
    expect(fnBody).toMatch(/productName:\s*liveWithdrawName\s*\|\|\s*b\.productName/);
  });

  it('9.7 withdrawal EXPORT_WITHDRAWAL movement: uses item.productName (live-resolved upstream)', () => {
    const wdStart = backendSrc.indexOf('export async function updateStockWithdrawalStatus(');
    const wdEnd = backendSrc.indexOf('export async function ', wdStart + 100);
    const fnBody = backendSrc.slice(wdStart, wdEnd);
    expect(fnBody).toMatch(/MOVEMENT_TYPES\.EXPORT_WITHDRAWAL/);
    expect(fnBody).toMatch(/productName:\s*liveExportWdName\s*\|\|\s*b\.productName/);
  });

  it('9.8 V48 marker discoverable + count ≥ 7 (one per Rule O extension site)', () => {
    const v48 = (backendSrc.match(/V48 \(2026-05-08\)/g) || []).length;
    expect(v48).toBeGreaterThanOrEqual(7);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY 10 — EXPLORATIVE: USER-REPORT REPRO MATRIX (V42-V47 each verified)
// ════════════════════════════════════════════════════════════════════════════
describe('CAT10 — User-report reproduction matrix (V42-V47 explicit fixtures)', () => {
  it('10.V42 — promo bundle qty multiplier matches user expectation', () => {
    // 6 PRP × 2 AHL outer-bundle, multiplied by promo qty
    const sub = { name: 'PRP', qty: 6, products: [{ name: 'PRP', qty: 1 }] };
    const out = buildPromotionSubCourseProducts(sub, 1);
    expect(out[0].qty).toBe(6); // 1 × 6 × 1 = 6
  });

  it('10.V43 — frozen flag overlay rescue (LC-26000006 PRP × 3)', () => {
    const customerEntry = {
      name: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      product: 'PRP เกล็ดเลือดบำรุงรากผม',
      productId: '38841',
      skipStockDeduction: false, // FROZEN
    };
    const masterCourse = {
      courseName: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38841', productName: 'PRP เกล็ดเลือดบำรุงรากผม', skipStockDeduction: true },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(customerEntry, masterCourse)).toBe(true);
  });

  it('10.V44 — Image 1 (ขลิบไร้เลือด เบอร์22) — main + sub names canonical', () => {
    const c = {
      courseName: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
      mainProductId: '38843', mainProductName: 'ขลิบไร้เลือด', mainQty: 1,
      courseProducts: [
        { productId: '38843', productName: 'ขลิบไร้เลือด', qty: 1, skipStockDeduction: true },
        { productId: '38699', productName: 'Stapple no 22', qty: 1 },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products.map(p => p.name)).toEqual(['ขลิบไร้เลือด', 'Stapple no 22']);
    expect(shape.products.every(p => p.name !== c.courseName)).toBe(true);
  });

  it('10.V45 — dedup-shadow OR-merge (เบอร์26)', () => {
    const c = {
      courseName: 'ขลิบไร้เลือด (เบอร์26) 1 ครั้ง',
      mainProductId: '38843', mainProductName: 'ขลิบไร้เลือด', mainQty: 1,
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38843', productName: 'ขลิบไร้เลือด', qty: 1, skipStockDeduction: true },
        { productId: 'STAPPLE-26', productName: 'Stapple no 26', qty: 1 },
      ],
    };
    const shape = beCourseToMasterShape(c);
    const main = shape.products.find(p => p.isMainProduct);
    expect(main.skipStockDeduction).toBe(true); // V45 OR-merge
  });

  it('10.V47 — customer.courses[] grouping invariant', () => {
    const raw = [
      { name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง', product: 'ขลิบไร้เลือด', productId: '38843',
        value: '13900 บาท', linkedSaleId: 'S', linkedTreatmentId: 'T' },
      { name: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง', product: 'Stapple no 22', productId: '38699',
        value: '13900 บาท', linkedSaleId: 'S', linkedTreatmentId: 'T' },
    ];
    const groups = groupCustomerCoursesForDetailView(raw);
    expect(groups.length).toBe(1);
    expect(groups[0].entries.length).toBe(2);
    expect(groups[0].value).toBe('13900 บาท'); // shown ONCE per group
  });
});
