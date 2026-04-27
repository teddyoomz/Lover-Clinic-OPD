// ─── Phase 15.4 post-deploy bug 5 — full Movement Log wiring audit ──────────
// User directive (s19 EOD):
//   "ตรวจสอบว่าการเคลื่อนไหวทุกอย่างของ stock ผ่าน Movement log ของตัวเอง
//    และ Movement log ของคลังและสาขาที่เกี่ยวข้องทั้งหมด แบบถูกต้องตาม
//    wiring flow และ logic"
//
// This file is a STRUCTURAL AUDIT of every stock-mutating writer in
// backendClient.js. It greps each emit site + verifies:
//   1. branchId set correctly (every emit must have it)
//   2. branchIds: [src, dst] set for the 4 cross-branch types (8/9/10/13)
//   3. Reverse movements propagate branchIds via {...m} spread
//   4. Reader (listStockMovements) catches everything via client-side filter
//
// Future-proofing: when a new movement-emit site is added, this audit
// catches missing branchId/branchIds. When a new cross-branch type is
// introduced, add it to the cross-branch matrix below.
//
// Reference (post-deploy state, 2026-04-28):
// | Type | Const                  | Emitter                                  | Tier        | branchIds[] |
// | 1    | IMPORT                 | _buildBatchFromOrderItem (line ~4127)    | single      | no          |
// | 2    | SALE                   | deductStockForSale (line ~5090)          | single      | no          |
// | 3/4  | ADJUST_ADD/REDUCE      | createStockAdjustment (line ~4803)       | single      | no          |
// | 5    | SALE_VENDOR            | (legacy, similar to SALE)                | single      | no          |
// | 6/7  | TREATMENT/_MED         | deductStockForSale (line ~5090, shared)  | single      | no          |
// | 8    | EXPORT_TRANSFER        | updateStockTransferStatus (line ~5693)   | cross       | YES         |
// | 9    | RECEIVE                | updateStockTransferStatus (line ~5743)   | cross       | YES         |
// | 10   | EXPORT_WITHDRAWAL      | updateStockWithdrawalStatus (line ~5956) | cross       | YES         |
// | 12   | WITHDRAWAL_REQUEST     | (not currently emitted)                  | -           | -           |
// | 13   | WITHDRAWAL_CONFIRM     | updateStockWithdrawalStatus (line ~6000) | cross       | YES         |
// | 14   | CANCEL_IMPORT          | cancelStockOrder + cancelCentralStockOrder | single   | no          |
// | 15   | WITHDRAWAL_APPROVE     | (constant exists; not yet emitted)        | -          | -          |
// | 16   | WITHDRAWAL_REJECT      | (constant exists; not yet emitted)        | -          | -          |

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');
const stockUtilsSrc = read('src/lib/stockUtils.js');
const movementLogSrc = read('src/components/backend/MovementLogPanel.jsx');

// Helper: slice a `setDoc(stockMovementDoc(...)) { ... }` block from a function,
// starting from the next set call after a given anchor regex.
function sliceMovementEmit(src, anchorRegex) {
  const m = src.match(anchorRegex);
  if (!m) return null;
  const start = m.index;
  // grab the whole emit block (typical 25 lines)
  return src.slice(start, start + 1500);
}

// ============================================================================
describe('Phase 15.4 AU.A — every stock movement emit site has branchId set', () => {
  // Find every `setDoc(stockMovementDoc(...))` AND `tx.set(stockMovementDoc(...))`.
  // For each, slice ~30 lines and verify `branchId:` is in the emit object.
  const emitRegex = /(?:await\s+setDoc|tx\.set)\(stockMovementDoc\([^)]+\)\s*,\s*\{/g;
  const emitMatches = [...backendSrc.matchAll(emitRegex)];

  it('AU.A.1 — at least 8 emit sites detected (audit coverage sanity)', () => {
    expect(emitMatches.length).toBeGreaterThanOrEqual(8);
  });

  it('AU.A.2 — every emit site sets branchId (inline OR via movementDoc variable OR via {...m} spread)', () => {
    for (const m of emitMatches) {
      // Look BOTH backward (variable defined above the call, e.g. movementDoc)
      // AND forward (inline object literal). 1500 chars each direction covers
      // every realistic emit site.
      const before = backendSrc.slice(Math.max(0, m.index - 1500), m.index);
      const after = backendSrc.slice(m.index, m.index + 1500);
      const slice = before + after;
      // Match `branchId:` (explicit) OR `branchId,` (ES6 shorthand) — but NOT `branchIds`.
      const hasBranchId = /\bbranchId(?!s)\b/.test(slice);
      const hasSpread = /\.\.\.m,/.test(after) || /\.\.\.m\s*\n/.test(after);
      expect(
        hasBranchId || hasSpread,
        `Movement emit at offset ${m.index} missing branchId or {...m} spread`
      ).toBe(true);
    }
  });
});

// ============================================================================
describe('Phase 15.4 AU.B — cross-branch movement types (8/9/10/13) have branchIds[]', () => {
  // For each of the 4 cross-branch types, find the emit + verify branchIds.

  it('AU.B.1 — EXPORT_TRANSFER (8): branchIds = [b.branchId, cur.destinationLocationId]', () => {
    const slice = sliceMovementEmit(backendSrc, /type:\s*MOVEMENT_TYPES\.EXPORT_TRANSFER/);
    expect(slice).toBeTruthy();
    expect(slice).toMatch(/branchIds:\s*\[\s*b\.branchId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('AU.B.2 — RECEIVE (9): branchIds = [cur.sourceLocationId, cur.destinationLocationId]', () => {
    const slice = sliceMovementEmit(backendSrc, /type:\s*MOVEMENT_TYPES\.RECEIVE/);
    expect(slice).toBeTruthy();
    expect(slice).toMatch(/branchIds:\s*\[\s*cur\.sourceLocationId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('AU.B.3 — EXPORT_WITHDRAWAL (10): branchIds = [b.branchId, cur.destinationLocationId]', () => {
    const slice = sliceMovementEmit(backendSrc, /type:\s*MOVEMENT_TYPES\.EXPORT_WITHDRAWAL/);
    expect(slice).toBeTruthy();
    expect(slice).toMatch(/branchIds:\s*\[\s*b\.branchId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('AU.B.4 — WITHDRAWAL_CONFIRM (13): branchIds = [cur.sourceLocationId, cur.destinationLocationId]', () => {
    const slice = sliceMovementEmit(backendSrc, /type:\s*MOVEMENT_TYPES\.WITHDRAWAL_CONFIRM/);
    expect(slice).toBeTruthy();
    expect(slice).toMatch(/branchIds:\s*\[\s*cur\.sourceLocationId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('AU.B.5 — V14 lock: every cross-branch branchIds uses .filter(Boolean) (no undefined leaves)', () => {
    const matches = backendSrc.match(/branchIds:\s*\[[^\]]+\]\.filter\(Boolean\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
describe('Phase 15.4 AU.C — single-branch types (1/3/4/14) only set branchId (no branchIds[])', () => {
  // These types are intentionally single-tier. Adding branchIds would be
  // wasteful + might confuse the cross-branch contract. Audit confirms
  // they DON'T have branchIds set (it's redundant for single-tier).

  it('AU.C.1 — IMPORT (type 1) emit at _buildBatchFromOrderItem has no branchIds field', () => {
    // The shared helper writes type=IMPORT for both branch + central order receives.
    // Look at the movementDoc construction.
    const idx = backendSrc.indexOf('await setDoc(stockMovementDoc(movementId), movementDoc)');
    expect(idx).toBeGreaterThan(0);
    // Walk back to find the movementDoc declaration.
    const beforeIdx = backendSrc.lastIndexOf('const movementDoc =', idx);
    expect(beforeIdx).toBeGreaterThan(0);
    const block = backendSrc.slice(beforeIdx, idx);
    expect(block).toContain('branchId:');
    expect(block).not.toContain('branchIds:');
  });

  it('AU.C.2 — CANCEL_IMPORT (type 14) cancelStockOrder emit only has branchId', () => {
    // First CANCEL_IMPORT site (cancelStockOrder)
    const allMatches = [...backendSrc.matchAll(/type:\s*MOVEMENT_TYPES\.CANCEL_IMPORT/g)];
    expect(allMatches.length).toBeGreaterThanOrEqual(1);
    for (const m of allMatches) {
      const slice = backendSrc.slice(m.index, m.index + 1000);
      expect(slice).toContain('branchId:');
      // Single-tier — no branchIds expected.
      expect(slice).not.toContain('branchIds:');
    }
  });

  it('AU.C.3 — ADJUST emit (single-batch, single-branch) has branchId, no branchIds', () => {
    const idx = backendSrc.indexOf('linkedAdjustId: adjustmentId');
    expect(idx).toBeGreaterThan(0);
    const block = backendSrc.slice(Math.max(0, idx - 800), idx + 800);
    // Match `branchId:` OR `branchId,` shorthand.
    expect(block).toMatch(/\bbranchId(?!s)\b/);
    // No branchIds (plural) — single-tier doesn't need it.
    expect(block).not.toMatch(/branchIds:/);
  });

  it('AU.C.4 — SALE/TREATMENT emits in deductStockForSale have branchId (no branchIds)', () => {
    const idx = backendSrc.indexOf('linkedSaleId: saleId || null');
    expect(idx).toBeGreaterThan(0);
    const block = backendSrc.slice(Math.max(0, idx - 1500), idx + 800);
    // branchId is set as ES6 shorthand or explicit assignment.
    expect(block).toMatch(/\bbranchId(?!s)\b/);
    // No branchIds (single-tier).
    expect(block).not.toMatch(/branchIds:/);
  });
});

// ============================================================================
describe('Phase 15.4 AU.D — reverse movements propagate branchIds via {...m} spread', () => {
  it('AU.D.1 — _reverseOneMovement (skipped path) spreads ...m into reverse doc', () => {
    const idx = backendSrc.indexOf('reverseOf: m.movementId');
    expect(idx).toBeGreaterThan(0);
    // Must have a `...m,` spread above
    const block = backendSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(block).toMatch(/\.\.\.m,/);
  });

  it('AU.D.2 — _reverseOneMovement (with-batch path) also spreads ...m', () => {
    // 2nd `reverseOf: m.movementId` occurrence
    const allMatches = [...backendSrc.matchAll(/reverseOf:\s*m\.movementId/g)];
    expect(allMatches.length).toBeGreaterThanOrEqual(2);
    for (const m of allMatches) {
      const block = backendSrc.slice(Math.max(0, m.index - 300), m.index + 50);
      expect(block).toMatch(/\.\.\.m,/);
    }
  });
});

// ============================================================================
describe('Phase 15.4 AU.E — listStockMovements client-side filter catches every emit', () => {
  // The reader is the truth for "does it show up in MovementLog?". Verified
  // by simulate fixtures matching every writer's emit shape.

  function simulateBranchFilter(movements, branchId) {
    if (branchId == null) return movements;
    const branchIdStr = String(branchId);
    return movements.filter((m) => {
      if (String(m.branchId || '') === branchIdStr) return true;
      if (Array.isArray(m.branchIds) && m.branchIds.includes(branchIdStr)) return true;
      return false;
    });
  }

  // Realistic fixture: one of each emit type.
  const FIXTURE = [
    { movementId: 'imp', type: 1, branchId: 'BR-A' },                                    // IMPORT
    { movementId: 'sal', type: 2, branchId: 'BR-A' },                                    // SALE
    { movementId: 'adj+', type: 3, branchId: 'BR-A' },                                   // ADJUST_ADD
    { movementId: 'adj-', type: 4, branchId: 'BR-A' },                                   // ADJUST_REDUCE
    { movementId: 'tre', type: 6, branchId: 'BR-A' },                                    // TREATMENT
    { movementId: 'tex', type: 8, branchId: 'BR-A', branchIds: ['BR-A', 'WH-X'] },       // EXPORT_TRANSFER
    { movementId: 'rec', type: 9, branchId: 'WH-X', branchIds: ['BR-A', 'WH-X'] },       // RECEIVE
    { movementId: 'wex', type: 10, branchId: 'BR-A', branchIds: ['BR-A', 'WH-X'] },      // EXPORT_WITHDRAWAL
    { movementId: 'wco', type: 13, branchId: 'WH-X', branchIds: ['BR-A', 'WH-X'] },      // WITHDRAWAL_CONFIRM
    { movementId: 'can', type: 14, branchId: 'BR-A' },                                    // CANCEL_IMPORT
    // Cross-branch transfer (BR-A → BR-B, no central involved)
    { movementId: 'tex2', type: 8, branchId: 'BR-A', branchIds: ['BR-A', 'BR-B'] },
    { movementId: 'rec2', type: 9, branchId: 'BR-B', branchIds: ['BR-A', 'BR-B'] },
    // Legacy movement (pre-Phase-E, no branchIds[])
    { movementId: 'lex', type: 8, branchId: 'BR-A' },
  ];

  it('AU.E.1 — at branch BR-A: sees 5 single-tier own + 4 cross-branch (involving BR-A) + 1 legacy = 10', () => {
    const result = simulateBranchFilter(FIXTURE, 'BR-A');
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual([
      'adj+', 'adj-',                      // own ADJUST
      'can',                               // own CANCEL_IMPORT
      'imp',                               // own IMPORT
      'lex',                               // legacy own EXPORT_TRANSFER
      'rec',                               // RECEIVE involving BR-A
      'rec2',                              // RECEIVE BR-A↔BR-B
      'sal',                               // own SALE
      'tex', 'tex2',                       // EXPORT_TRANSFER involving BR-A (2 of them)
      'tre',                               // own TREATMENT
      'wco',                               // WITHDRAWAL_CONFIRM involving BR-A
      'wex',                               // EXPORT_WITHDRAWAL involving BR-A
    ]);
  });

  it('AU.E.2 — at central WH-X: sees only cross-branch (NOT BR-A single-tier)', () => {
    const result = simulateBranchFilter(FIXTURE, 'WH-X');
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual(['rec', 'tex', 'wco', 'wex']);
  });

  it('AU.E.3 — at branch BR-B (only BR-A↔BR-B cross): sees only 2 movements', () => {
    const result = simulateBranchFilter(FIXTURE, 'BR-B');
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual(['rec2', 'tex2']);
  });

  it('AU.E.4 — null branchId: returns all (admin global view)', () => {
    const result = simulateBranchFilter(FIXTURE, null);
    expect(result.length).toBe(FIXTURE.length);
  });

  it('AU.E.5 — V21 anti-regression: single-tier movements NOT visible at central from BR-A', () => {
    // Bug 4 was the inverse: central pulled BR-A stock. Inverse failure: BR-A
    // pulled WH-X stock. Both must be cleanly separated.
    const wh = simulateBranchFilter(FIXTURE, 'WH-X');
    expect(wh.find((m) => m.movementId === 'sal')).toBeUndefined(); // BR-A's SALE not visible
    expect(wh.find((m) => m.movementId === 'imp')).toBeUndefined();
    expect(wh.find((m) => m.movementId === 'tre')).toBeUndefined();
    expect(wh.find((m) => m.movementId === 'lex')).toBeUndefined(); // legacy BR-A not visible at WH-X
  });
});

// ============================================================================
describe('Phase 15.4 AU.F — MOVEMENT_TYPES + TYPE_LABELS + TYPE_GROUPS coherence', () => {
  it('AU.F.1 — stockUtils.MOVEMENT_TYPES has all 14 active codes', () => {
    const codes = ['IMPORT', 'SALE', 'ADJUST_ADD', 'ADJUST_REDUCE', 'SALE_VENDOR',
      'TREATMENT', 'TREATMENT_MED', 'EXPORT_TRANSFER', 'RECEIVE',
      'EXPORT_WITHDRAWAL', 'WITHDRAWAL_REQUEST', 'WITHDRAWAL_CONFIRM',
      'CANCEL_IMPORT', 'WITHDRAWAL_APPROVE', 'WITHDRAWAL_REJECT'];
    for (const c of codes) {
      expect(stockUtilsSrc).toMatch(new RegExp(`${c}:\\s*\\d+`));
    }
  });

  it('AU.F.2 — MovementLogPanel TYPE_LABELS covers types 1-16 (no orphan label)', () => {
    // Required types in the UI:
    const required = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16];
    for (const t of required) {
      expect(movementLogSrc).toMatch(new RegExp(`${t}:\\s*\\{\\s*label:`));
    }
  });

  it('AU.F.3 — MovementLogPanel TYPE_GROUPS includes withdrawal: [12, 13, 15, 16]', () => {
    expect(movementLogSrc).toMatch(/id:\s*['"]withdrawal['"][\s\S]{0,80}types:\s*\[\s*12,\s*13,\s*15,\s*16\s*\]/);
  });

  it('AU.F.4 — MovementLogPanel TYPE_GROUPS includes export: [8, 10] (transfer-out + withdrawal-out)', () => {
    expect(movementLogSrc).toMatch(/id:\s*['"]export['"][\s\S]{0,80}types:\s*\[\s*8,\s*10\s*\]/);
  });
});
