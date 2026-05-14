// ─── V66 regression bank — BRANCH_BUCKETS filter fields verified against
// PRODUCTION write-side code (2026-05-15) ──────────────────────────────────
//
// LESSON LOCK (Rule Q V66): mock-test self-consistency ≠ reality verification.
// Pre-fix branch-make-fresh.js + branch-backup-export.js + 2 CLI scripts
// hardcoded `.where('branchId', '==', X)` for ALL stock collections including
// be_stock_transfers + be_stock_withdrawals. Those 2 collections store
// sourceLocationId + destinationLocationId at write time (NOT branchId).
// Result: 0 matches → make-fresh deleted nothing → 1,064 transfers + 9
// withdrawals survived (Rule R env-pull diag 2026-05-15 confirmed).
//
// User report (verbatim): "กด ลบ Stock สาขานครราชสีมา จากปุ่มสาขาใหม่แล้ว
// แต่ยังเหลือตามภาพ มันต้องไม่เหลืออะไรเลย".
//
// This file enforces: every override in BUCKET_FILTER_FIELDS MUST appear as
// a write-time field in backendClient.js. If you add a new override, you
// MUST verify it appears in production write-side code (grep setDoc blocks).
//
// Mirrors `tests/central-stock-buckets-filter-field-prod-verification.test.js`
// (V66.1-V66.7 for CENTRAL_BUCKETS) but for BRANCH_BUCKETS.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUCKETS,
  BUCKET_FILTER_FIELDS,
  getFilterSpecForCollection,
  resolveBucketScopeWithFilterSpecs,
  queryWithFilterSpec,
} from '../src/lib/branchBackupBuckets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const backendClient = fs.readFileSync(path.join(ROOT, 'src/lib/backendClient.js'), 'utf8');

describe('V66.B BRANCH_BUCKETS filter fields verified against production write code', () => {
  it('V66.B1 — every BUCKET_FILTER_FIELDS override field appears as write-time field in backendClient.js', () => {
    const missing = [];
    for (const [colName, spec] of Object.entries(BUCKET_FILTER_FIELDS)) {
      const writeRegex = new RegExp(`\\b${spec.filterField}\\s*:\\s*[^,\\n]+,`);
      const queryRegex = new RegExp(`where\\(['"]${spec.filterField}['"]`);
      if (!writeRegex.test(backendClient) && !queryRegex.test(backendClient)) {
        missing.push(`${colName}.filterField=${spec.filterField}`);
      }
      if (spec.orFilterField) {
        const orWriteRegex = new RegExp(`\\b${spec.orFilterField}\\s*:\\s*[^,\\n]+,`);
        const orQueryRegex = new RegExp(`where\\(['"]${spec.orFilterField}['"]`);
        if (!orWriteRegex.test(backendClient) && !orQueryRegex.test(backendClient)) {
          missing.push(`${colName}.orFilterField=${spec.orFilterField}`);
        }
      }
    }
    expect(missing, `These filter fields don't exist in backendClient.js writers — they were INVENTED:\n${missing.join('\n')}`).toEqual([]);
  });

  it('V66.B2 — be_stock_transfers has spec {sourceLocationId, destinationLocationId}', () => {
    const spec = BUCKET_FILTER_FIELDS['be_stock_transfers'];
    expect(spec).toBeDefined();
    expect(spec.filterField).toBe('sourceLocationId');
    expect(spec.orFilterField).toBe('destinationLocationId');
    // Hard verify in source code — production write site at backendClient.js:7681
    expect(backendClient).toMatch(/sourceLocationId:\s*src/);
    expect(backendClient).toMatch(/destinationLocationId:\s*dst/);
  });

  it('V66.B3 — be_stock_withdrawals has spec {sourceLocationId, destinationLocationId}', () => {
    const spec = BUCKET_FILTER_FIELDS['be_stock_withdrawals'];
    expect(spec).toBeDefined();
    expect(spec.filterField).toBe('sourceLocationId');
    expect(spec.orFilterField).toBe('destinationLocationId');
    // Production write site at backendClient.js:8056-8060 (same src/dst pattern)
    expect(backendClient).toMatch(/stockWithdrawalDoc\([^)]+\),\s*\{[\s\S]*?sourceLocationId/);
  });

  it('V66.B4 — getFilterSpecForCollection() returns {filterField:branchId} default for non-overridden collections', () => {
    // Default branchId for collections NOT in BUCKET_FILTER_FIELDS
    expect(getFilterSpecForCollection('be_appointments')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_treatments')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_sales')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_stock_batches')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_stock_movements')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_stock_orders')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_stock_adjustments')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_expenses')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_deposits')).toEqual({ filterField: 'branchId' });
    expect(getFilterSpecForCollection('be_link_requests')).toEqual({ filterField: 'branchId' });
    // Unknown collection also gets default — endpoint should still work for any new collection
    expect(getFilterSpecForCollection('be_some_new_collection_2027')).toEqual({ filterField: 'branchId' });
  });

  it('V66.B5 — getFilterSpecForCollection() returns override for transfers + withdrawals', () => {
    expect(getFilterSpecForCollection('be_stock_transfers')).toMatchObject({
      filterField: 'sourceLocationId',
      orFilterField: 'destinationLocationId',
    });
    expect(getFilterSpecForCollection('be_stock_withdrawals')).toMatchObject({
      filterField: 'sourceLocationId',
      orFilterField: 'destinationLocationId',
    });
  });

  it('V66.B6 — anti-pattern lock: BUCKET_FILTER_FIELDS MUST NOT include known invented field names', () => {
    // These field names appeared in pre-V66 central spec but DO NOT exist in
    // production data. If they re-appear in BRANCH spec, that's a regression.
    const forbidden = ['destLocationId', 'warehouseId'];
    for (const [colName, spec] of Object.entries(BUCKET_FILTER_FIELDS)) {
      expect(forbidden.includes(spec.filterField),
        `${colName} uses forbidden invented field "${spec.filterField}"`).toBe(false);
      if (spec.orFilterField) {
        expect(forbidden.includes(spec.orFilterField),
          `${colName} uses forbidden invented orFilterField "${spec.orFilterField}"`).toBe(false);
      }
    }
  });

  it('V66.B7 — BUCKET_FILTER_FIELDS is frozen + every entry is frozen (immutability)', () => {
    expect(Object.isFrozen(BUCKET_FILTER_FIELDS)).toBe(true);
    for (const [colName, spec] of Object.entries(BUCKET_FILTER_FIELDS)) {
      expect(Object.isFrozen(spec), `${colName} spec frozen`).toBe(true);
    }
  });

  it('V66.B8 — stock bucket collections all resolve to known canonical fields (no drift)', () => {
    // resolveBucketScopeWithFilterSpecs returns normalized {name,filterField,orFilterField?}
    const { collections } = resolveBucketScopeWithFilterSpecs(['stock']);
    expect(collections).toHaveLength(6);

    const map = new Map(collections.map(c => [c.name, c]));

    // 4 collections use branchId
    expect(map.get('be_stock_batches')).toEqual({ name: 'be_stock_batches', filterField: 'branchId' });
    expect(map.get('be_stock_movements')).toEqual({ name: 'be_stock_movements', filterField: 'branchId' });
    expect(map.get('be_stock_orders')).toEqual({ name: 'be_stock_orders', filterField: 'branchId' });
    expect(map.get('be_stock_adjustments')).toEqual({ name: 'be_stock_adjustments', filterField: 'branchId' });

    // 2 collections use OR-merge
    expect(map.get('be_stock_transfers')).toMatchObject({
      name: 'be_stock_transfers',
      filterField: 'sourceLocationId',
      orFilterField: 'destinationLocationId',
    });
    expect(map.get('be_stock_withdrawals')).toMatchObject({
      name: 'be_stock_withdrawals',
      filterField: 'sourceLocationId',
      orFilterField: 'destinationLocationId',
    });
  });

  it('V66.B9 — branch-make-fresh.js endpoint actually uses getFilterSpecForCollection (not hardcoded branchId)', () => {
    // Source-grep guard against V66 regression — endpoint must consult spec
    const endpoint = fs.readFileSync(path.join(ROOT, 'api/admin/branch-make-fresh.js'), 'utf8');
    expect(endpoint).toMatch(/getFilterSpecForCollection/);
    expect(endpoint).toMatch(/orFilterField/);
    expect(endpoint).toMatch(/spec\.filterField/);
    // Anti-regression: must NOT carry the pre-V66 hardcoded line for top-level
    // collections wipe loop. (The customer-subcollection branch may still
    // legitimately use `branchId` — verified separately below.)
    // We scan for the SPECIFIC pre-V66 line shape:
    //   `await dataCol(db, col).where('branchId', '==', branchId).get()`
    // in the wipe phase (NOT the subcollection phase).
    const wipePhase = endpoint.split('Wipe phase — top-level collections')[1] || '';
    const wipePhaseTopHalf = wipePhase.split('Wipe phase — per-customer subcollections')[0] || '';
    expect(wipePhaseTopHalf).not.toMatch(/dataCol\(db,\s*col\)\.where\(['"]branchId['"]/);
  });

  it('V66.B10 — branch-backup-export.js endpoint uses queryBranchScopedDocs helper (spec-aware)', () => {
    const endpoint = fs.readFileSync(path.join(ROOT, 'api/admin/branch-backup-export.js'), 'utf8');
    expect(endpoint).toMatch(/getFilterSpecForCollection/);
    expect(endpoint).toMatch(/queryBranchScopedDocs/);
    expect(endpoint).toMatch(/orFilterField/);
    // Anti-regression: helper queryBranchScopedDocs must contain spec-aware logic
    expect(endpoint).toMatch(/spec\.filterField/);
  });

  it('V66.B11 — CLI scripts mirror endpoint spec-aware logic', () => {
    const makeFreshCli = fs.readFileSync(path.join(ROOT, 'scripts/branch-make-fresh.mjs'), 'utf8');
    expect(makeFreshCli).toMatch(/getFilterSpecForCollection/);
    expect(makeFreshCli).toMatch(/queryBranchScopedDocs/);
    expect(makeFreshCli).toMatch(/orFilterField/);

    const backupCli = fs.readFileSync(path.join(ROOT, 'scripts/branch-backup-export.mjs'), 'utf8');
    expect(backupCli).toMatch(/getFilterSpecForCollection/);
    expect(backupCli).toMatch(/orFilterField/);
  });
});

describe('V66.Q queryWithFilterSpec helper — OR-merge dedup logic', () => {
  function mockQuery(docs) {
    return Promise.resolve({ docs });
  }
  function mockDoc(id, fields = {}) {
    return { id, ref: { id }, data: () => fields };
  }

  it('V66.Q1 — single-field (no orFilterField) returns Map of single query result', async () => {
    const spec = { filterField: 'branchId' };
    const getQueryFn = async (field, value) => {
      expect(field).toBe('branchId');
      expect(value).toBe('BR-A');
      return { docs: [mockDoc('doc1'), mockDoc('doc2')] };
    };
    const result = await queryWithFilterSpec(spec, 'BR-A', getQueryFn);
    expect(result.size).toBe(2);
    expect(result.has('doc1')).toBe(true);
    expect(result.has('doc2')).toBe(true);
  });

  it('V66.Q2 — OR-merge runs 2 queries + unions results', async () => {
    const spec = { filterField: 'sourceLocationId', orFilterField: 'destinationLocationId' };
    const calls = [];
    const getQueryFn = async (field, value) => {
      calls.push({ field, value });
      if (field === 'sourceLocationId') {
        return { docs: [mockDoc('TRF-1'), mockDoc('TRF-2')] };
      }
      return { docs: [mockDoc('TRF-3'), mockDoc('TRF-4')] };
    };
    const result = await queryWithFilterSpec(spec, 'BR-A', getQueryFn);
    expect(calls).toEqual([
      { field: 'sourceLocationId', value: 'BR-A' },
      { field: 'destinationLocationId', value: 'BR-A' },
    ]);
    expect(result.size).toBe(4);
    expect(result.has('TRF-1')).toBe(true);
    expect(result.has('TRF-4')).toBe(true);
  });

  it('V66.Q3 — OR-merge dedups when same docId appears in both queries (self-transfer)', async () => {
    // Edge case: a transfer where source === dest === same branch (unusual but
    // possible — internal warehouse-to-warehouse within same branch). Should
    // count ONCE in delete, not twice.
    const spec = { filterField: 'sourceLocationId', orFilterField: 'destinationLocationId' };
    const getQueryFn = async (field) => {
      return { docs: [mockDoc('TRF-SELF-1'), mockDoc('TRF-OTHER-' + field)] };
    };
    const result = await queryWithFilterSpec(spec, 'BR-A', getQueryFn);
    // TRF-SELF-1 appears in both queries → only counted once
    expect(result.size).toBe(3);
    expect(result.has('TRF-SELF-1')).toBe(true);
    expect(result.has('TRF-OTHER-sourceLocationId')).toBe(true);
    expect(result.has('TRF-OTHER-destinationLocationId')).toBe(true);
  });

  it('V66.Q4 — empty result returns empty Map', async () => {
    const spec = { filterField: 'branchId' };
    const getQueryFn = async () => ({ docs: [] });
    const result = await queryWithFilterSpec(spec, 'BR-A', getQueryFn);
    expect(result.size).toBe(0);
  });

  it('V66.Q5 — first query returns docs, OR-query returns empty: result is just first query docs', async () => {
    const spec = { filterField: 'sourceLocationId', orFilterField: 'destinationLocationId' };
    const getQueryFn = async (field) => {
      if (field === 'sourceLocationId') return { docs: [mockDoc('TRF-1'), mockDoc('TRF-2')] };
      return { docs: [] };
    };
    const result = await queryWithFilterSpec(spec, 'BR-A', getQueryFn);
    expect(result.size).toBe(2);
  });
});
