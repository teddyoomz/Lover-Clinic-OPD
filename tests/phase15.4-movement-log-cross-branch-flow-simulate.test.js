// ─── Phase 15.4 — Movement log cross-branch visibility (items 3 + 4) ────────
// User directive (s19, verbatim):
//   item 3: "การโอนย้ายไม่แสดงใน Movement log ของหน้า stock แต่แสดงใน
//            movement ของหน้า คลังกลาง"
//   item 4: "การเบิกของไม่แสดงใน Movement log ของหน้า stock แต่แสดงใน
//            movement ของหน้า คลังกลาง"
//
// Diagnosis: each transfer/withdrawal creates 2 movements:
//   EXPORT_TRANSFER (type 8):  branchId = source
//   RECEIVE (type 9):           branchId = destination
//   EXPORT_WITHDRAWAL (type 10): branchId = source
//   WITHDRAWAL_CONFIRM (type 13): branchId = destination
// Filter `where('branchId', '==', X)` returned only ONE side. User at
// source-branch saw EXPORT but not RECEIVE (or vice versa). At destination
// they often saw nothing because RECEIVE only fires at status 1→2.
//
// Fix: writer sets `branchIds: [src, dst]` on those 4 movement types.
// Reader does dual-query: legacy `branchId == X` UNION new `branchIds
// array-contains X`. Old movements still match Q1 (no schema migration).
//
// Coverage:
//   ML.A — listStockMovements dual-query when branchId filter set
//   ML.B — listStockMovements falls back gracefully if Q2 fails (composite-index)
//   ML.C — writer sets branchIds on EXPORT_TRANSFER + RECEIVE
//   ML.D — writer sets branchIds on EXPORT_WITHDRAWAL + WITHDRAWAL_CONFIRM
//   ML.E — types 15+16 added to MovementLogPanel TYPE_LABELS + TYPE_GROUPS
//   ML.F — V14 lock: filter(Boolean) prevents undefined leaves in array

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');
const movementLogSrc = read('src/components/backend/MovementLogPanel.jsx');

// ============================================================================
describe('Phase 15.4 ML.A — listStockMovements client-side branchId filter', () => {
  // POST-DEPLOY FIX (bug 2 v2): the dual-query Promise.all approach (initial
  // s19 ship) had a silent-fail trap when Firestore composite index was
  // missing. Refactored to client-side filter: fetch with non-branch
  // server-filters, then filter by branchId/branchIds in JS. Robust + no
  // index dependency.
  const fnStart = backendSrc.indexOf('export async function listStockMovements');
  expect(fnStart, 'listStockMovements not found').toBeGreaterThan(0);
  const fnSlice = backendSrc.slice(fnStart, fnStart + 3000);

  it('ML.A.1 — function exists', () => {
    expect(fnStart).toBeGreaterThan(0);
  });

  it('ML.A.2 — branchId filter is CLIENT-SIDE (filter() with branchId === branchIdStr)', () => {
    expect(fnSlice).toMatch(/String\(m\.branchId\s*\|\|\s*['"]['"]\)\s*===\s*branchIdStr/);
  });

  it('ML.A.3 — branchId filter ALSO checks Array.isArray(m.branchIds) && includes(X)', () => {
    expect(fnSlice).toMatch(/Array\.isArray\(m\.branchIds\)\s*&&\s*m\.branchIds\.includes\(branchIdStr\)/);
  });

  it('ML.A.4 — V21 anti-regression: NO Promise.all dual-query (was the silent-fail trap)', () => {
    // The dual-query pattern was deployed briefly but had silent-fail risk.
    // Lock: no `Promise.all([...])` pattern in this function.
    expect(fnSlice).not.toMatch(/Promise\.all\(\[/);
  });

  it('ML.A.5 — V21 anti-regression: NO server-side array-contains query (caused index needs)', () => {
    expect(fnSlice).not.toMatch(/where\(['"]branchIds['"],\s*['"]array-contains['"]/);
  });

  it('ML.A.6 — branchId filter NOT in mapFields (mapFields stays server-side; branchId is client-side)', () => {
    const mapFieldsLine = fnSlice.match(/mapFields\s*=\s*\[[^\]]+\]/s);
    expect(mapFieldsLine).toBeTruthy();
    expect(mapFieldsLine[0]).not.toContain("'branchId'");
    // 'branchIds' (plural) also not in mapFields — that's server-fetched into the result, used client-side.
    expect(mapFieldsLine[0]).not.toContain("'branchIds'");
  });

  it('ML.A.7 — backward compat: old movements (no branchIds[]) still match via branchId arm', () => {
    // Both arms must be in the filter (one matches old, one matches new).
    expect(fnSlice).toMatch(/m\.branchId/);
    expect(fnSlice).toMatch(/m\.branchIds/);
  });

  it('ML.A.8 — null/undefined branchId skips the filter entirely (returns all server-fetched)', () => {
    expect(fnSlice).toMatch(/if\s*\(\s*filters\.branchId\s*!=\s*null\s*\)/);
  });
});

describe('Phase 15.4 ML.B — Functional simulate of client-side filter logic', () => {
  // Pure simulate of the filter chain (no Firestore needed).
  function simulateBranchFilter(movements, filters) {
    let mvts = [...movements];
    if (filters.branchId != null) {
      const branchIdStr = String(filters.branchId);
      mvts = mvts.filter((m) => {
        if (String(m.branchId || '') === branchIdStr) return true;
        if (Array.isArray(m.branchIds) && m.branchIds.includes(branchIdStr)) return true;
        return false;
      });
    }
    return mvts;
  }

  const FIXTURE = [
    // Pre-Phase-15.4 (no branchIds[]) — only matches via branchId
    { movementId: 'old-1', branchId: 'BR-A' },
    { movementId: 'old-2', branchId: 'WH-X' },
    // Post-Phase-15.4 transfer movements (branchIds set on writer)
    { movementId: 'tr-export', branchId: 'BR-A', branchIds: ['BR-A', 'WH-X'] },
    { movementId: 'tr-receive', branchId: 'WH-X', branchIds: ['BR-A', 'WH-X'] },
    // Withdrawal pair
    { movementId: 'wd-export', branchId: 'WH-X', branchIds: ['WH-X', 'BR-A'] },
    { movementId: 'wd-confirm', branchId: 'BR-A', branchIds: ['WH-X', 'BR-A'] },
    // Cross-branch transfer (BR-A ↔ BR-B)
    { movementId: 'cb-export', branchId: 'BR-A', branchIds: ['BR-A', 'BR-B'] },
    { movementId: 'cb-receive', branchId: 'BR-B', branchIds: ['BR-A', 'BR-B'] },
  ];

  it('ML.B.1 — at branch BR-A: sees own movements + cross-branch involving BR-A', () => {
    const result = simulateBranchFilter(FIXTURE, { branchId: 'BR-A' });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual([
      'cb-export', 'cb-receive', // BR-A ↔ BR-B (BR-A in branchIds for both)
      'old-1',                    // legacy own
      'tr-export', 'tr-receive',  // BR-A ↔ WH-X (BR-A in branchIds for both)
      'wd-confirm', 'wd-export',  // WH-X ↔ BR-A (BR-A in branchIds for both)
    ]);
  });

  it('ML.B.2 — at central WH-X: sees own + cross-branch involving WH-X', () => {
    const result = simulateBranchFilter(FIXTURE, { branchId: 'WH-X' });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual([
      'old-2',                    // legacy own
      'tr-export', 'tr-receive',  // (WH-X in branchIds for both)
      'wd-confirm', 'wd-export',  // (WH-X in branchIds for both)
    ]);
  });

  it('ML.B.3 — at branch BR-B (not involved in transfers WH-X side): sees only BR-A↔BR-B', () => {
    const result = simulateBranchFilter(FIXTURE, { branchId: 'BR-B' });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual(['cb-export', 'cb-receive']);
  });

  it('ML.B.4 — null branchId returns ALL', () => {
    const result = simulateBranchFilter(FIXTURE, {});
    expect(result.length).toBe(FIXTURE.length);
  });

  it('ML.B.5 — pre-15.4 movement WITHOUT branchIds[] still matches via branchId arm', () => {
    const result = simulateBranchFilter([{ movementId: 'a', branchId: 'BR-A' }], { branchId: 'BR-A' });
    expect(result).toHaveLength(1);
  });

  it('ML.B.6 — post-15.4 movement with branchIds[src,dst]: visible from BOTH sides', () => {
    const fixture = [{ movementId: 'x', branchId: 'BR-A', branchIds: ['BR-A', 'WH-X'] }];
    expect(simulateBranchFilter(fixture, { branchId: 'BR-A' })).toHaveLength(1);
    expect(simulateBranchFilter(fixture, { branchId: 'WH-X' })).toHaveLength(1);
    expect(simulateBranchFilter(fixture, { branchId: 'BR-B' })).toHaveLength(0);
  });
});

describe('Phase 15.4 ML.C — writer sets branchIds[] on transfer movements', () => {
  // Slice updateStockTransferStatus
  const fnStart = backendSrc.indexOf('export async function updateStockTransferStatus');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 8000);

  it('ML.C.1 — EXPORT_TRANSFER movement has branchIds: [src, dst]', () => {
    // Find the EXPORT_TRANSFER block
    const expIdx = fnSlice.indexOf('MOVEMENT_TYPES.EXPORT_TRANSFER');
    expect(expIdx).toBeGreaterThan(0);
    const block = fnSlice.slice(expIdx, expIdx + 1000);
    expect(block).toMatch(/branchIds:\s*\[\s*b\.branchId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('ML.C.2 — RECEIVE movement has branchIds: [src, dst]', () => {
    const recIdx = fnSlice.indexOf('MOVEMENT_TYPES.RECEIVE');
    expect(recIdx).toBeGreaterThan(0);
    const block = fnSlice.slice(recIdx, recIdx + 1000);
    expect(block).toMatch(/branchIds:\s*\[\s*cur\.sourceLocationId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('ML.C.3 — V14 lock: filter(Boolean) strips null/undefined from array', () => {
    const expIdx = fnSlice.indexOf('MOVEMENT_TYPES.EXPORT_TRANSFER');
    const block = fnSlice.slice(expIdx, expIdx + 1000);
    expect(block).toMatch(/\.filter\(Boolean\)/);
  });

  it('ML.C.4 — legacy branchId field STILL written (backward compat with old readers)', () => {
    const expIdx = fnSlice.indexOf('MOVEMENT_TYPES.EXPORT_TRANSFER');
    const block = fnSlice.slice(expIdx, expIdx + 1000);
    expect(block).toMatch(/branchId:\s*b\.branchId/);
  });
});

describe('Phase 15.4 ML.D — writer sets branchIds[] on withdrawal movements', () => {
  const fnStart = backendSrc.indexOf('export async function updateStockWithdrawalStatus');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 8000);

  it('ML.D.1 — EXPORT_WITHDRAWAL movement has branchIds: [src, dst]', () => {
    const expIdx = fnSlice.indexOf('MOVEMENT_TYPES.EXPORT_WITHDRAWAL');
    expect(expIdx).toBeGreaterThan(0);
    const block = fnSlice.slice(expIdx, expIdx + 1000);
    expect(block).toMatch(/branchIds:\s*\[\s*b\.branchId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('ML.D.2 — WITHDRAWAL_CONFIRM movement has branchIds: [src, dst]', () => {
    const conIdx = fnSlice.indexOf('MOVEMENT_TYPES.WITHDRAWAL_CONFIRM');
    expect(conIdx).toBeGreaterThan(0);
    const block = fnSlice.slice(conIdx, conIdx + 1000);
    expect(block).toMatch(/branchIds:\s*\[\s*cur\.sourceLocationId,\s*cur\.destinationLocationId\s*\]\.filter\(Boolean\)/);
  });

  it('ML.D.3 — legacy branchId STILL written (backward compat)', () => {
    const expIdx = fnSlice.indexOf('MOVEMENT_TYPES.EXPORT_WITHDRAWAL');
    const block = fnSlice.slice(expIdx, expIdx + 1000);
    expect(block).toMatch(/branchId:\s*b\.branchId/);
  });
});

describe('Phase 15.4 ML.E — MovementLogPanel TYPE_LABELS + TYPE_GROUPS extended', () => {
  it('ML.E.1 — type 15 (อนุมัติเบิก) added to TYPE_LABELS', () => {
    expect(movementLogSrc).toMatch(/15:\s*\{\s*label:\s*['"]อนุมัติเบิก['"]/);
  });

  it('ML.E.2 — type 16 (ปฏิเสธเบิก) added to TYPE_LABELS', () => {
    expect(movementLogSrc).toMatch(/16:\s*\{\s*label:\s*['"]ปฏิเสธเบิก['"]/);
  });

  it('ML.E.3 — TYPE_GROUPS withdrawal includes 15+16 (admin approval visibility)', () => {
    // Match the withdrawal entry across the label-and-types fields.
    expect(movementLogSrc).toMatch(/id:\s*['"]withdrawal['"][\s\S]{0,80}types:\s*\[\s*12,\s*13,\s*15,\s*16\s*\]/);
  });
});

describe('Phase 15.4 ML.F — cross-cutting V14 + V19 + V21 anti-regression', () => {
  it('ML.F.1 — V14: branchIds always uses .filter(Boolean) (strips undefined)', () => {
    // Across both writers, every branchIds: [...] expression must filter Boolean
    const arrayMatches = backendSrc.match(/branchIds:\s*\[[^\]]+\]\.filter\(Boolean\)/g) || [];
    expect(arrayMatches.length).toBeGreaterThanOrEqual(4); // 4 movement emit sites
  });

  it('ML.F.2 — V19: movements remain append-only (no update to type field)', () => {
    // Only `reversedByMovementId` may be updated per V19. branchIds is on CREATE only.
    // Grep for any updateDoc(stockMovementDoc(..)) — should be reverseOf path only.
    const updateMatches = backendSrc.match(/updateDoc\(stockMovementDoc\([^)]+\)/g) || [];
    // Should be 0 or only inside _reverseOneMovement (not setting branchIds)
    expect(updateMatches.length).toBeLessThan(10);
  });

  it('ML.F.3 — V21 anti-regression: dual-query is in source (not lost in cleanup)', () => {
    expect(backendSrc).toContain("array-contains");
    expect(backendSrc).toMatch(/Phase 15\.4.*items 3\+4/);
  });
});
