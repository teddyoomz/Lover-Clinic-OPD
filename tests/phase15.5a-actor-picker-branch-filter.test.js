// Phase 15.5A (2026-04-28) — ActorPicker branchIds[] filter regression bank.
//
// Problem: pre-V20 staff/doctor docs had no `branchIds[]` field; post-V20 docs
// can have it set. ActorPicker dropdown should filter to current-branch staff
// when branchId is provided, but NOT hide legacy staff (empty branchIds[]).
//
// Per Rule I: pure helper unit tests + adversarial inputs + source-grep
// regression guards locking the call shape across 5 stock forms.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Source files for grep guards
const BACKEND_CLIENT_SRC = readFileSync(
  join(process.cwd(), 'src', 'lib', 'backendClient.js'),
  'utf-8'
);
const STOCK_ADJUST_SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'backend', 'StockAdjustPanel.jsx'),
  'utf-8'
);
const ORDER_PANEL_SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'backend', 'OrderPanel.jsx'),
  'utf-8'
);
const CENTRAL_ORDER_SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'backend', 'CentralStockOrderPanel.jsx'),
  'utf-8'
);
const TRANSFER_SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'backend', 'StockTransferPanel.jsx'),
  'utf-8'
);
const WITHDRAWAL_SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'backend', 'StockWithdrawalPanel.jsx'),
  'utf-8'
);

// Pure helper imported directly — no Firestore mock needed since
// mergeSellersWithBranchFilter is independent of Firestore.
import { mergeSellersWithBranchFilter } from '../src/lib/backendClient.js';

// ════════════════════════════════════════════════════════════════════════════
// PA — Pure helper: mergeSellersWithBranchFilter (heart of the filter logic)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5A.PA — mergeSellersWithBranchFilter pure helper', () => {
  it('PA.1 no branchId: returns all (preserves pre-15.5A behavior)', () => {
    const staff = [
      { id: 's1', firstname: 'Alice', branchIds: ['BR-1'] },
      { id: 's2', firstname: 'Bob', branchIds: ['BR-2'] },
    ];
    const doctors = [
      { id: 'd1', firstname: 'Dr. Carol', branchIds: ['BR-1'] },
    ];
    const result = mergeSellersWithBranchFilter(staff, doctors);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id).sort()).toEqual(['d1', 's1', 's2']);
  });

  it('PA.2 branchId="" (empty string): treated as no filter', () => {
    const result = mergeSellersWithBranchFilter(
      [{ id: 's1', firstname: 'Alice', branchIds: ['BR-1'] }],
      [],
      { branchId: '' }
    );
    expect(result).toHaveLength(1);
  });

  it('PA.3 branchId=null: treated as no filter', () => {
    const result = mergeSellersWithBranchFilter(
      [{ id: 's1', firstname: 'Alice', branchIds: ['BR-1'] }],
      [],
      { branchId: null }
    );
    expect(result).toHaveLength(1);
  });

  it('PA.4 branchId="BR-1" filters staff with branchIds=[BR-1]', () => {
    const result = mergeSellersWithBranchFilter(
      [
        { id: 's1', firstname: 'Alice', branchIds: ['BR-1'] },
        { id: 's2', firstname: 'Bob', branchIds: ['BR-2'] },
      ],
      [],
      { branchId: 'BR-1' }
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
    expect(result[0].name).toBe('Alice');
  });

  it('PA.5 multi-branch staff visible at all assigned branches', () => {
    const staff = [
      { id: 's1', firstname: 'Alice', branchIds: ['BR-1', 'BR-2'] },
      { id: 's2', firstname: 'Bob', branchIds: ['BR-2'] },
    ];
    const atBR1 = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-1' });
    expect(atBR1).toHaveLength(1);
    expect(atBR1[0].id).toBe('s1');
    const atBR2 = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-2' });
    expect(atBR2).toHaveLength(2);
    expect(atBR2.map(r => r.id).sort()).toEqual(['s1', 's2']);
  });

  it('PA.6 LEGACY FALLBACK: staff with NO branchIds field visible everywhere', () => {
    const staff = [
      { id: 's1', firstname: 'Legacy' /* no branchIds */ },
      { id: 's2', firstname: 'Modern', branchIds: ['BR-1'] },
    ];
    const atBR1 = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-1' });
    expect(atBR1.map(r => r.id).sort()).toEqual(['s1', 's2']);
    const atBR2 = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-2' });
    expect(atBR2.map(r => r.id).sort()).toEqual(['s1']);
  });

  it('PA.7 LEGACY FALLBACK: staff with empty branchIds:[] visible everywhere', () => {
    const staff = [
      { id: 's1', firstname: 'Empty', branchIds: [] },
      { id: 's2', firstname: 'Modern', branchIds: ['BR-1'] },
    ];
    const atBR_ALPHA = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-ALPHA' });
    expect(atBR_ALPHA.map(r => r.id)).toEqual(['s1']);
    const atBR1 = mergeSellersWithBranchFilter(staff, [], { branchId: 'BR-1' });
    expect(atBR1.map(r => r.id).sort()).toEqual(['s1', 's2']);
  });

  it('PA.8 staff with falsy values in branchIds[] (defensive)', () => {
    // After filtering falsy, branchIds becomes [] → legacy fallback → visible
    const result = mergeSellersWithBranchFilter(
      [{ id: 's1', firstname: 'X', branchIds: [null, '', undefined] }],
      [],
      { branchId: 'BR-1' }
    );
    expect(result).toHaveLength(1);
  });

  it('PA.9 mixed staff + doctors with different branch assignments', () => {
    const result = mergeSellersWithBranchFilter(
      [
        { id: 's1', firstname: 'Alice', branchIds: ['BR-1'] },
        { id: 's2', firstname: 'Bob', branchIds: ['BR-2'] },
      ],
      [
        { id: 'd1', firstname: 'Dr.', lastname: 'Carol', branchIds: ['BR-1'] },
        { id: 'd2', firstname: 'Dr.', lastname: 'Dave', branchIds: ['BR-2'] },
      ],
      { branchId: 'BR-1' }
    );
    expect(result.map(r => r.id).sort()).toEqual(['d1', 's1']);
  });

  it('PA.10 central tier (WH-) ID works as branchId argument', () => {
    const result = mergeSellersWithBranchFilter(
      [
        { id: 's1', firstname: 'Central', branchIds: ['WH-1776517066355-4nz4'] },
        { id: 's2', firstname: 'Branch', branchIds: ['BR-1'] },
      ],
      [],
      { branchId: 'WH-1776517066355-4nz4' }
    );
    expect(result.map(r => r.id)).toEqual(['s1']);
  });

  it('PA.11 numeric coercion: branchId number-typed branchIds[] entry', () => {
    // Defensive: if a doc has branchIds: [123] (number), still works via String()
    const result = mergeSellersWithBranchFilter(
      [{ id: 's1', firstname: 'X', branchIds: [123, 'BR-2'] }],
      [],
      { branchId: '123' }
    );
    expect(result).toHaveLength(1);
  });

  it('PA.12 dedupe by id preserved (staff + doctor with same id collide)', () => {
    const result = mergeSellersWithBranchFilter(
      [{ id: 'shared', firstname: 'StaffName', branchIds: ['BR-1'] }],
      [{ id: 'shared', firstname: 'DocName', branchIds: ['BR-1'] }],
      { branchId: 'BR-1' }
    );
    expect(result).toHaveLength(1);
    // Doctor wins per existing dedup contract
    expect(result[0].name).toBe('DocName');
  });

  it('PA.13 null/undefined arrays handled defensively', () => {
    expect(mergeSellersWithBranchFilter(null, null, { branchId: 'BR-1' })).toEqual([]);
    expect(mergeSellersWithBranchFilter(undefined, undefined)).toEqual([]);
    expect(mergeSellersWithBranchFilter([], [])).toEqual([]);
  });

  it('PA.14 empty name staff filtered out (no name = unusable for picker)', () => {
    const result = mergeSellersWithBranchFilter(
      [
        { id: 's1', branchIds: ['BR-1'] }, // no name fields
        { id: 's2', firstname: 'Alice', branchIds: ['BR-1'] },
      ],
      [],
      { branchId: 'BR-1' }
    );
    expect(result.map(r => r.id)).toEqual(['s2']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PB — Source-grep regression guards (locks the wire-through pattern)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5A.PB — source-grep regression guards', () => {
  it('PB.1 backendClient.js exports listAllSellers with branchId param', () => {
    expect(BACKEND_CLIENT_SRC).toMatch(
      /export async function listAllSellers\s*\(\s*\{\s*branchId\s*\}\s*=\s*\{\s*\}\s*\)/
    );
  });

  it('PB.2 backendClient.js documents the legacy fallback', () => {
    expect(BACKEND_CLIENT_SRC).toMatch(/legacy fallback/i);
    expect(BACKEND_CLIENT_SRC).toMatch(/Phase 15\.5A/);
  });

  it('PB.3 StockAdjustPanel passes branchId: BRANCH_ID', () => {
    expect(STOCK_ADJUST_SRC).toMatch(
      /listAllSellers\s*\(\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*\)/
    );
  });

  it('PB.3.b StockAdjustPanel re-fetches when BRANCH_ID changes', () => {
    // useEffect dep array includes BRANCH_ID
    const fnMatch = STOCK_ADJUST_SRC.match(
      /listAllSellers[\s\S]*?\}\s*,\s*\[BRANCH_ID\]\s*\)/
    );
    expect(fnMatch, 'StockAdjustPanel useEffect [BRANCH_ID] dep').toBeTruthy();
  });

  it('PB.4 OrderPanel passes branchId: BRANCH_ID', () => {
    expect(ORDER_PANEL_SRC).toMatch(
      /listAllSellers\s*\(\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*\)/
    );
  });

  it('PB.4.b OrderPanel re-fetches when BRANCH_ID changes', () => {
    expect(ORDER_PANEL_SRC).toMatch(/\[BRANCH_ID\]/);
  });

  it('PB.5 CentralStockOrderPanel passes branchId: centralWarehouseId', () => {
    expect(CENTRAL_ORDER_SRC).toMatch(
      /listAllSellers\s*\(\s*\{\s*branchId:\s*centralWarehouseId\s*\}\s*\)/
    );
  });

  it('PB.5.b CentralStockOrderPanel re-fetches when centralWarehouseId changes', () => {
    expect(CENTRAL_ORDER_SRC).toMatch(/\[centralWarehouseId\]/);
  });

  it('PB.6 StockTransferPanel passes branchId: filterLocationId', () => {
    expect(TRANSFER_SRC).toMatch(
      /listAllSellers\s*\(\s*\{\s*branchId:\s*filterLocationId\s*\}\s*\)/
    );
  });

  it('PB.6.b StockTransferPanel re-fetches when filterLocationId changes', () => {
    // Must have at least one [filterLocationId] dep array (for the sellers effect)
    const matches = TRANSFER_SRC.match(/\[filterLocationId\]/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('PB.7 StockWithdrawalPanel passes branchId: filterLocationId', () => {
    expect(WITHDRAWAL_SRC).toMatch(
      /listAllSellers\s*\(\s*\{\s*branchId:\s*filterLocationId\s*\}\s*\)/
    );
  });

  it('PB.8 NO panel calls listAllSellers() without args (would skip filter)', () => {
    // Anti-regression: every stock-form call must pass {branchId: ...}
    const allFiles = [
      ['StockAdjustPanel', STOCK_ADJUST_SRC],
      ['OrderPanel', ORDER_PANEL_SRC],
      ['CentralStockOrderPanel', CENTRAL_ORDER_SRC],
      ['StockTransferPanel', TRANSFER_SRC],
      ['StockWithdrawalPanel', WITHDRAWAL_SRC],
    ];
    for (const [name, src] of allFiles) {
      // Find every listAllSellers call. Each must have non-empty arg.
      const calls = src.match(/listAllSellers\s*\([^)]*\)/g) || [];
      for (const call of calls) {
        const isEmpty = /listAllSellers\s*\(\s*\)/.test(call);
        expect(isEmpty, `${name}: listAllSellers() with no args breaks 15.5A filter`).toBe(false);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PC — V34 institutional-memory guard (Phase 15.5A marker present)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5A.PC — institutional memory', () => {
  it('PC.1 backendClient.js carries Phase 15.5A doc comment', () => {
    expect(BACKEND_CLIENT_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
  });

  it('PC.2 each panel marks Phase 15.5A in its sellers-load section', () => {
    expect(STOCK_ADJUST_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
    expect(ORDER_PANEL_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
    expect(CENTRAL_ORDER_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
    expect(TRANSFER_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
    expect(WITHDRAWAL_SRC).toMatch(/Phase 15\.5A \(2026-04-28\)/);
  });
});
