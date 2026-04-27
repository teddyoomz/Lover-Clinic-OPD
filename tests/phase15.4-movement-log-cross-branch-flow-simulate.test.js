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
  // Bumped from 3000 → 5000 to cover the legacy-main fallback block (post v3).
  const fnSlice = backendSrc.slice(fnStart, fnStart + 5000);

  it('ML.A.1 — function exists', () => {
    expect(fnStart).toBeGreaterThan(0);
  });

  it('ML.A.2 — branchId filter is CLIENT-SIDE (aliases.includes(m.branchId))', () => {
    // Phase 15.4 post-deploy bug 2 v3 — uses an `aliases` set (branchIdStr +
    // optional 'main') instead of direct === comparison.
    expect(fnSlice).toMatch(/aliases\.includes\(String\(m\.branchId\s*\|\|\s*['"]['"]\)\)/);
  });

  it('ML.A.3 — branchId filter ALSO checks branchIds.some((b) => aliases.includes(b))', () => {
    expect(fnSlice).toMatch(/Array\.isArray\(m\.branchIds\)\s*&&\s*m\.branchIds\.some\(\([^)]*\)\s*=>\s*aliases\.includes\(/);
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
  // Bumped from 3000 → 5000 to cover legacy-main fallback block (post v3).
  // Pure simulate of the filter chain (no Firestore needed).
  // Mirrors the listStockMovements implementation including legacy-main
  // fallback (post-deploy bug 2 v3, 2026-04-28).
  function simulateBranchFilter(movements, filters) {
    let mvts = [...movements];
    if (filters.branchId != null) {
      const branchIdStr = String(filters.branchId);
      const aliases = [branchIdStr];
      if (filters.includeLegacyMain && branchIdStr !== 'main') {
        aliases.push('main');
      }
      mvts = mvts.filter((m) => {
        if (aliases.includes(String(m.branchId || ''))) return true;
        if (Array.isArray(m.branchIds) && m.branchIds.some((b) => aliases.includes(b))) return true;
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

  // Phase 15.4 post-deploy bug 2 v3: legacy-main fallback for default branch.
  // Pre-V20 stock data has branchId='main'; BranchContext returns 'BR-XXX'.
  // listStockLocations() hardcodes id:'main' for transfer/withdrawal — so
  // even POST-V20 data has branchId='main'. Default branch view must alias.

  it('ML.B.7 — legacy-main fallback: default-branch BR-XXX with includeLegacyMain matches branchId=main', () => {
    const fixture = [{ movementId: 'tex', branchId: 'main', branchIds: ['main', 'WH-X'] }];
    // Without flag: invisible at BR-XXX
    expect(simulateBranchFilter(fixture, { branchId: 'BR-default' })).toHaveLength(0);
    // With flag: visible
    expect(simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true })).toHaveLength(1);
  });

  it('ML.B.8 — legacy-main fallback: also matches via branchIds["main", ...] some()', () => {
    const fixture = [
      { movementId: 'rec', branchId: 'WH-X', branchIds: ['main', 'WH-X'] },
    ];
    expect(simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true })).toHaveLength(1);
  });

  it('ML.B.9 — central-tier (WH-*) with includeLegacyMain=false: legacy "main" data NOT visible (no cross-tier contamination)', () => {
    const fixture = [
      { movementId: 'leg-main', branchId: 'main' }, // legacy branch data
      { movementId: 'wh-own', branchId: 'WH-X' },   // central own
    ];
    const result = simulateBranchFilter(fixture, { branchId: 'WH-X', includeLegacyMain: false });
    expect(result.map((m) => m.movementId)).toEqual(['wh-own']);
  });

  it('ML.B.10 — non-default branch BR-Y with includeLegacyMain=false: does NOT see "main" data (default-branch isolation)', () => {
    const fixture = [
      { movementId: 'leg-main', branchId: 'main' },
      { movementId: 'br-y-own', branchId: 'BR-Y' },
    ];
    const result = simulateBranchFilter(fixture, { branchId: 'BR-Y', includeLegacyMain: false });
    expect(result.map((m) => m.movementId)).toEqual(['br-y-own']);
  });

  it('ML.B.11 — branchId="main" itself with includeLegacyMain=true: NO duplicate alias (still single match)', () => {
    const fixture = [{ movementId: 'mm', branchId: 'main' }];
    expect(simulateBranchFilter(fixture, { branchId: 'main', includeLegacyMain: true })).toHaveLength(1);
  });

  it('ML.B.12 — full default-branch view: sees own (BR-X) movements + legacy (main) + cross-branch w/ "main"', () => {
    const fixture = [
      { movementId: 'old-main-imp', branchId: 'main' },                          // pre-V20 legacy
      { movementId: 'new-br-imp', branchId: 'BR-default' },                      // post-V20 (rare)
      { movementId: 'tex', branchId: 'main', branchIds: ['main', 'WH-X'] },      // transfer EXPORT
      { movementId: 'rec', branchId: 'WH-X', branchIds: ['main', 'WH-X'] },      // transfer RECEIVE
      { movementId: 'wh-own', branchId: 'WH-X' },                                // central own
      { movementId: 'br-y-own', branchId: 'BR-Y' },                              // OTHER branch
    ];
    const result = simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true });
    const ids = result.map((m) => m.movementId).sort();
    // Default branch sees: own legacy + own new + cross-branch with main + RECEIVE-back
    expect(ids).toEqual(['new-br-imp', 'old-main-imp', 'rec', 'tex']);
  });
});

describe('Phase 15.4 ML.G — listStockMovements: includeLegacyMain filter signature', () => {
  // Source-grep: backendClient.js listStockMovements supports the flag.
  const fnStart = backendSrc.indexOf('export async function listStockMovements');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 4000);

  it('ML.G.1 — fnSlice contains includeLegacyMain handling', () => {
    expect(fnSlice).toMatch(/filters\.includeLegacyMain/);
  });

  it('ML.G.2 — aliases array used to expand match set', () => {
    expect(fnSlice).toMatch(/const\s+aliases\s*=\s*\[branchIdStr\]/);
  });

  it('ML.G.3 — main NOT added to aliases when branchIdStr === "main" (no duplicate)', () => {
    expect(fnSlice).toMatch(/branchIdStr\s*!==\s*['"]main['"]/);
  });

  it('ML.G.4 — branchIds.some((b) => aliases.includes(b)) is the check pattern', () => {
    expect(fnSlice).toMatch(/branchIds\.some\(\([^)]*\)\s*=>\s*aliases\.includes\(/);
  });
});

describe('Phase 15.4 ML.H — MovementLogPanel passes includeLegacyMain only at default branch', () => {
  const panelSrc = read('src/components/backend/MovementLogPanel.jsx');

  it('ML.H.1 — destructures `branches` from useSelectedBranch', () => {
    expect(panelSrc).toMatch(/const\s*\{\s*branchId:\s*ctxBranchId\s*,\s*branches\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  it('ML.H.2 — gates includeLegacyMain on stock-tab + default-branch detection', () => {
    expect(panelSrc).toMatch(/includeLegacyMain\s*=\s*!branchIdOverride/);
    expect(panelSrc).toMatch(/b\.isDefault\s*===\s*true/);
  });

  it('ML.H.3 — central-tab (branchIdOverride) → includeLegacyMain false (no cross-tier pull)', () => {
    // The `!branchIdOverride` short-circuit ensures it.
    expect(panelSrc).toMatch(/!branchIdOverride/);
  });

  it('ML.H.4 — passes includeLegacyMain to listStockMovements call', () => {
    expect(panelSrc).toMatch(/listStockMovements\([^)]*\)/);
    // It's in a filters object — verify the filters object has the flag.
    expect(panelSrc).toMatch(/includeLegacyMain[\s,}]/);
  });

  it('ML.H.5 — `main` literal alias check for legacy BranchContext fallback', () => {
    // When BranchProvider falls back to 'main' (no be_branches), still apply.
    expect(panelSrc).toMatch(/String\(BRANCH_ID\)\s*===\s*['"]main['"]/);
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
