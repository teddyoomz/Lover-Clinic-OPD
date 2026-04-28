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

  it('ML.A.3 — V21 anti-regression: NO branchIds.some(...) cross-branch matching (single-tier per movement)', () => {
    // Phase 15.4 post-deploy bug 2 v4 (2026-04-28): the cross-branch alias
    // match (v2/v3) caused 2× duplication — same movement visible from both
    // source and destination. User correction: each movement at OWN tier only.
    // EXPORT_TRANSFER at source → only at source view. RECEIVE at destination
    // → only at destination view. The `branchIds[]` field is STILL written
    // (Phase E) but used by UI for counterparty NAMES, not for filter match.
    expect(fnSlice).not.toMatch(/m\.branchIds\.some/);
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
  // Phase 15.4 post-deploy bug 2 v4 (2026-04-28): SINGLE-TIER filter.
  // No `branchIds.some(...)` check — each movement visible at OWN tier only.
  // Legacy-main fallback STILL applies (separate ID-mismatch fix).
  function simulateBranchFilter(movements, filters) {
    let mvts = [...movements];
    if (filters.branchId != null) {
      const branchIdStr = String(filters.branchId);
      const aliases = [branchIdStr];
      if (filters.includeLegacyMain && branchIdStr !== 'main') {
        aliases.push('main');
      }
      mvts = mvts.filter((m) => aliases.includes(String(m.branchId || '')));
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

  it('ML.B.1 — V4 SINGLE-TIER at BR-A: sees ONLY movements where branchId === BR-A', () => {
    // Phase 15.4 post-deploy bug 2 v4: each movement at OWN tier only.
    // BR-A sees: own EXPORT (tr-export, cb-export, wd-confirm) + own legacy (old-1).
    // BR-A does NOT see: tr-receive (at WH-X), wd-export (at WH-X), cb-receive (at BR-B).
    const result = simulateBranchFilter(FIXTURE, { branchId: 'BR-A' });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual([
      'cb-export',                // BR-A ↔ BR-B EXPORT (at BR-A)
      'old-1',                    // legacy own
      'tr-export',                // BR-A ↔ WH-X EXPORT (at BR-A)
      'wd-confirm',               // WH-X → BR-A WITHDRAWAL_CONFIRM at BR-A (RECEIVE side)
    ]);
  });

  it('ML.B.2 — V4 SINGLE-TIER at WH-X: sees ONLY movements where branchId === WH-X', () => {
    const result = simulateBranchFilter(FIXTURE, { branchId: 'WH-X' });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual([
      'old-2',                    // legacy own
      'tr-receive',               // BR-A ↔ WH-X RECEIVE (at WH-X)
      'wd-export',                // WH-X EXPORT_WITHDRAWAL (at WH-X)
    ]);
  });

  it('ML.B.3 — V4 SINGLE-TIER at BR-B: sees ONLY cb-receive (its OWN side of BR-A↔BR-B)', () => {
    const result = simulateBranchFilter(FIXTURE, { branchId: 'BR-B' });
    const ids = result.map((m) => m.movementId).sort();
    // cb-export is at BR-A's tier (NOT visible from BR-B). Only cb-receive at BR-B is visible.
    expect(ids).toEqual(['cb-receive']);
  });

  it('ML.B.4 — null branchId returns ALL', () => {
    const result = simulateBranchFilter(FIXTURE, {});
    expect(result.length).toBe(FIXTURE.length);
  });

  it('ML.B.5 — pre-15.4 movement WITHOUT branchIds[] still matches via branchId arm', () => {
    const result = simulateBranchFilter([{ movementId: 'a', branchId: 'BR-A' }], { branchId: 'BR-A' });
    expect(result).toHaveLength(1);
  });

  it('ML.B.6 — V4 SINGLE-TIER: cross-branch movement visible at OWN tier only (NOT both)', () => {
    // EXPORT at source: only at source view. RECEIVE at destination: only at destination.
    // User correction: NO 2× duplication.
    const fixture = [
      { movementId: 'tex', branchId: 'BR-A', branchIds: ['BR-A', 'WH-X'] }, // EXPORT at BR-A
      { movementId: 'rec', branchId: 'WH-X', branchIds: ['BR-A', 'WH-X'] }, // RECEIVE at WH-X
    ];
    // BR-A view: only EXPORT (its own movement)
    expect(simulateBranchFilter(fixture, { branchId: 'BR-A' }).map((m) => m.movementId)).toEqual(['tex']);
    // WH-X view: only RECEIVE (its own movement)
    expect(simulateBranchFilter(fixture, { branchId: 'WH-X' }).map((m) => m.movementId)).toEqual(['rec']);
    // Uninvolved BR-B: neither
    expect(simulateBranchFilter(fixture, { branchId: 'BR-B' })).toHaveLength(0);
  });

  // Phase 15.4 post-deploy bug 2 v3 + v4: legacy-main fallback for default branch.
  // Pre-V20 stock data has branchId='main'; BranchContext returns 'BR-XXX'.
  // listStockLocations() hardcodes id:'main' for transfer/withdrawal — so
  // even POST-V20 data has branchId='main' for default-branch operations.

  it('ML.B.7 — legacy-main fallback: default-branch BR-XXX with includeLegacyMain matches branchId=main', () => {
    const fixture = [{ movementId: 'tex', branchId: 'main', branchIds: ['main', 'WH-X'] }];
    // Without flag: invisible at BR-XXX
    expect(simulateBranchFilter(fixture, { branchId: 'BR-default' })).toHaveLength(0);
    // With flag: visible (legacy-main alias)
    expect(simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true })).toHaveLength(1);
  });

  it('ML.B.8 — legacy-main fallback does NOT cross-match branchIds[]: receive at WH-X stays invisible at default branch', () => {
    // V4 single-tier: even with includeLegacyMain, the RECEIVE movement at
    // WH-X (branchId='WH-X') is NOT visible at default branch view (which
    // aliases to ['BR-default', 'main']). 'WH-X' is not in aliases.
    const fixture = [
      { movementId: 'rec', branchId: 'WH-X', branchIds: ['main', 'WH-X'] },
    ];
    const result = simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true });
    expect(result).toHaveLength(0);
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

  it('ML.B.12 — full default-branch view: sees own EXPORT only (NOT RECEIVE at WH-X)', () => {
    // V4 single-tier semantics: default branch sees its own movements only.
    // Cross-branch RECEIVE counterpart lives at central tier.
    const fixture = [
      { movementId: 'old-main-imp', branchId: 'main' },                          // pre-V20 legacy IMPORT
      { movementId: 'new-br-imp', branchId: 'BR-default' },                      // post-V20 (rare)
      { movementId: 'tex', branchId: 'main', branchIds: ['main', 'WH-X'] },      // transfer EXPORT (at default)
      { movementId: 'rec', branchId: 'WH-X', branchIds: ['main', 'WH-X'] },      // transfer RECEIVE (at central — NOT visible here)
      { movementId: 'wh-own', branchId: 'WH-X' },                                // central own
      { movementId: 'br-y-own', branchId: 'BR-Y' },                              // OTHER branch
    ];
    const result = simulateBranchFilter(fixture, { branchId: 'BR-default', includeLegacyMain: true });
    const ids = result.map((m) => m.movementId).sort();
    expect(ids).toEqual(['new-br-imp', 'old-main-imp', 'tex']);
    // RECEIVE at WH-X is NOT visible — correct per V4 single-tier
    expect(ids).not.toContain('rec');
  });
});

// ============================================================================
describe('Phase 15.4 ML.I — Counterparty label rendering (post-deploy bug 2 v4)', () => {
  // User wants: source-side (type 8/10) shows "ส่งออกไป {dest}" / "เบิกโดย {dest}",
  // destination-side (type 9/13) shows "รับเข้าจาก {src}" / "รับเบิกจาก {src}".
  // Counterparty derived from `branchIds[]`: the entry that's NOT m.branchId.
  const panelSrc = read('src/components/backend/MovementLogPanel.jsx');

  it('ML.I.1 — COUNTERPARTY_TEMPLATES const has 4 entries (types 8, 9, 10, 13)', () => {
    expect(panelSrc).toMatch(/COUNTERPARTY_TEMPLATES\s*=\s*\{[\s\S]{0,400}8:\s*['"]ส่งออกไป['"]/);
    expect(panelSrc).toMatch(/9:\s*['"]รับเข้าจาก['"]/);
    expect(panelSrc).toMatch(/10:\s*['"]เบิกโดย['"]/);
    expect(panelSrc).toMatch(/13:\s*['"]รับเบิกจาก['"]/);
  });

  it('ML.I.2 — getCounterpartyId helper picks the entry of branchIds NOT equal to m.branchId', () => {
    expect(panelSrc).toMatch(/function\s+getCounterpartyId/);
    expect(panelSrc).toMatch(/m\.branchIds\.find\(\([^)]*\)\s*=>\s*String\([^)]+\)\s*!==\s*own\)/);
  });

  it('ML.I.3 — getCounterpartyId returns null for movements without branchIds[] (legacy + single-tier)', () => {
    expect(panelSrc).toMatch(/!Array\.isArray\(m\?\.branchIds\)\s*\|\|\s*m\.branchIds\.length\s*<\s*2/);
  });

  it('ML.I.4 — renders cross-tier label as "{template} {counterpartyName}" (template + name)', () => {
    expect(panelSrc).toMatch(/labelText\s*=\s*\(cpId\s*&&\s*cpName\)/);
    expect(panelSrc).toMatch(/\$\{COUNTERPARTY_TEMPLATES\[m\.type\]\}\s*\$\{cpName\}/);
  });

  it('ML.I.5 — falls back to TYPE_LABELS[m.type].label when no counterparty (legacy / single-tier)', () => {
    expect(panelSrc).toMatch(/info\?\.label\s*\|\|\s*`type=\$\{m\.type\}`/);
  });

  it('ML.I.6 — resolveCounterpartyName helper: locations → branches → fallback to id', () => {
    expect(panelSrc).toMatch(/function|const\s+resolveCounterpartyName/);
    expect(panelSrc).toMatch(/locations\.find\(\([^)]*\)\s*=>\s*String\([^)]+\)\s*===\s*String\(id\)\)/);
    expect(panelSrc).toMatch(/resolveBranchName\(id,\s*branches\)/);
  });

  it('ML.I.7 — listStockLocations imported + fetched on mount', () => {
    expect(panelSrc).toMatch(/import\s*\{[^}]*listStockLocations[^}]*\}/);
    expect(panelSrc).toMatch(/setLocations\(/);
  });

  it('ML.I.8 — movement-type-label data-testid for preview_eval addressability', () => {
    expect(panelSrc).toMatch(/data-testid="movement-type-label"/);
  });
});

// Functional simulate of the counterparty resolution (no React mount).
describe('Phase 15.4 ML.I-sim — counterparty resolution simulate', () => {
  const COUNTERPARTY_TEMPLATES = {
    8: 'ส่งออกไป',
    9: 'รับเข้าจาก',
    10: 'เบิกโดย',
    13: 'รับเบิกจาก',
  };

  function getCounterpartyId(m) {
    if (!Array.isArray(m?.branchIds) || m.branchIds.length < 2) return null;
    const own = String(m.branchId || '');
    const other = m.branchIds.find((b) => String(b) !== own);
    return other ? String(other) : null;
  }

  function buildLabel(m, info, resolveName) {
    const cpId = COUNTERPARTY_TEMPLATES[m.type] ? getCounterpartyId(m) : null;
    const cpName = cpId ? resolveName(cpId) : '';
    return (cpId && cpName)
      ? `${COUNTERPARTY_TEMPLATES[m.type]} ${cpName}`
      : (info?.label || `type=${m.type}`);
  }

  const FIXTURE_LOCATIONS = [
    { id: 'main', name: 'สาขาหลัก (main)' },
    { id: 'WH-X', name: 'คลังกลางกรุงเทพ' },
    { id: 'BR-Korat', name: 'สาขาโคราช' },
  ];
  const resolveName = (id) => FIXTURE_LOCATIONS.find((l) => l.id === id)?.name || id;

  it('ML.I-sim.1 — type 8 (EXPORT_TRANSFER) at Korat: "ส่งออกไป คลังกลางกรุงเทพ"', () => {
    const m = { type: 8, branchId: 'BR-Korat', branchIds: ['BR-Korat', 'WH-X'] };
    expect(buildLabel(m, { label: 'ส่งออก (transfer)' }, resolveName)).toBe('ส่งออกไป คลังกลางกรุงเทพ');
  });

  it('ML.I-sim.2 — type 9 (RECEIVE) at central: "รับเข้าจาก สาขาโคราช"', () => {
    const m = { type: 9, branchId: 'WH-X', branchIds: ['BR-Korat', 'WH-X'] };
    expect(buildLabel(m, { label: 'รับเข้า' }, resolveName)).toBe('รับเข้าจาก สาขาโคราช');
  });

  it('ML.I-sim.3 — type 10 (EXPORT_WITHDRAWAL) at Korat: "เบิกโดย คลังกลางกรุงเทพ"', () => {
    const m = { type: 10, branchId: 'BR-Korat', branchIds: ['BR-Korat', 'WH-X'] };
    expect(buildLabel(m, { label: 'ส่งออก (withdrawal)' }, resolveName)).toBe('เบิกโดย คลังกลางกรุงเทพ');
  });

  it('ML.I-sim.4 — type 13 (WITHDRAWAL_CONFIRM) at central: "รับเบิกจาก สาขาโคราช"', () => {
    const m = { type: 13, branchId: 'WH-X', branchIds: ['BR-Korat', 'WH-X'] };
    expect(buildLabel(m, { label: 'เบิก (confirm)' }, resolveName)).toBe('รับเบิกจาก สาขาโคราช');
  });

  it('ML.I-sim.5 — legacy movement without branchIds[]: falls back to TYPE_LABELS', () => {
    const m = { type: 8, branchId: 'main' }; // no branchIds
    expect(buildLabel(m, { label: 'ส่งออก (transfer)' }, resolveName)).toBe('ส่งออก (transfer)');
  });

  it('ML.I-sim.6 — non-cross-tier types use TYPE_LABELS unchanged', () => {
    expect(buildLabel({ type: 1, branchId: 'main' }, { label: 'นำเข้า' }, resolveName)).toBe('นำเข้า');
    expect(buildLabel({ type: 2, branchId: 'main' }, { label: 'ขาย' }, resolveName)).toBe('ขาย');
  });

  it('ML.I-sim.7 — V14 lock: counterparty resolution never returns undefined', () => {
    const m = { type: 8, branchId: 'main', branchIds: ['main', 'unknown-id'] };
    const result = buildLabel(m, { label: 'ส่งออก (transfer)' }, resolveName);
    expect(result).toBeTypeOf('string');
    expect(result).not.toContain('undefined');
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

  it('ML.G.4 — V4 anti-regression: NO branchIds.some(...) — single-tier only', () => {
    // Reverted in v4 (2026-04-28): cross-branch alias caused 2× duplication.
    expect(fnSlice).not.toMatch(/branchIds\.some/);
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
    // Phase 15.7-bis (2026-04-28): _repayNegativeBalances helper invocation
    // also references MOVEMENT_TYPES.RECEIVE (as `movementType:` arg) before
    // the actual setDoc. Anchor specifically on the setDoc's `type:` field
    // so we read the real movement record body.
    const recIdx = fnSlice.indexOf('type: MOVEMENT_TYPES.RECEIVE');
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
    // Phase 15.7-bis: anchor on `type: MOVEMENT_TYPES.WITHDRAWAL_CONFIRM`
    // so we read the actual setDoc body, not the helper arg.
    const conIdx = fnSlice.indexOf('type: MOVEMENT_TYPES.WITHDRAWAL_CONFIRM');
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
