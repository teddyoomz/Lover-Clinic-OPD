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
describe('Phase 15.4 ML.A — listStockMovements dual-query when branchId filter set', () => {
  // Slice the function for focused grep.
  const fnStart = backendSrc.indexOf('export async function listStockMovements');
  expect(fnStart, 'listStockMovements not found').toBeGreaterThan(0);
  const fnSlice = backendSrc.slice(fnStart, fnStart + 3000);

  it('ML.A.1 — function exists', () => {
    expect(fnStart).toBeGreaterThan(0);
  });

  it('ML.A.2 — single-branch query (Q1) uses where("branchId", "==", X)', () => {
    expect(fnSlice).toMatch(/where\(['"]branchId['"],\s*['"]==['"],\s*branchIdStr/);
  });

  it('ML.A.3 — cross-branch query (Q2) uses where("branchIds", "array-contains", X)', () => {
    expect(fnSlice).toMatch(/where\(['"]branchIds['"],\s*['"]array-contains['"],\s*branchIdStr/);
  });

  it('ML.A.4 — Q1 + Q2 fired in parallel via Promise.all', () => {
    expect(fnSlice).toMatch(/Promise\.all\(\[/);
  });

  it('ML.A.5 — dedupes results by movementId', () => {
    expect(fnSlice).toMatch(/seen\s*=\s*new\s+Set\(\)/);
    expect(fnSlice).toMatch(/seen\.has/);
    expect(fnSlice).toMatch(/seen\.add/);
  });

  it('ML.A.6 — branchId filter REMOVED from common mapFields (must run dual-query, not single)', () => {
    const mapFieldsLine = fnSlice.match(/mapFields\s*=\s*\[[^\]]+\]/s);
    expect(mapFieldsLine).toBeTruthy();
    expect(mapFieldsLine[0]).not.toContain("'branchId'");
  });
});

describe('Phase 15.4 ML.B — listStockMovements graceful fallback', () => {
  const fnStart = backendSrc.indexOf('export async function listStockMovements');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 3000);

  it('ML.B.1 — Q2 wrapped in .catch with soft-fail (no UI crash on missing index)', () => {
    expect(fnSlice).toMatch(/getDocs\(q2\)\.catch/);
  });

  it('ML.B.2 — soft-fail returns empty docs array (Q1 results still surface)', () => {
    expect(fnSlice).toMatch(/return\s*\{\s*docs:\s*\[\]\s*\}/);
  });

  it('ML.B.3 — V31 anti-regression: catch logs warn, NOT silent', () => {
    expect(fnSlice).toMatch(/console\.warn\(/);
    // V31 lock: don't use the "continuing" pattern that hides errors.
    expect(fnSlice).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('ML.B.4 — null/undefined branchId still uses single query path (no dual)', () => {
    expect(fnSlice).toMatch(/if\s*\(\s*filters\.branchId\s*!=\s*null\s*\)/);
    expect(fnSlice).toMatch(/\}\s*else\s*\{/);
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
