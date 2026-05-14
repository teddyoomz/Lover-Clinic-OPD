// ─── V66 regression bank — CENTRAL_BUCKETS filter fields verified against
// PRODUCTION write-side code (2026-05-15) ───────────────────────────────────
//
// LESSON LOCK: pre-fix CENTRAL_BUCKETS invented filterField names that didn't
// match production data fields. E2e seeded with same invented names + filtered
// with same invented names → 5/5 PASS despite real production make-fresh
// deleting 0 docs.
//
// User report (verbatim): "กดคลังใหม่ไปแล้ว ทั้งปุ่มย่อยคลังใหม่ และปุ่มเคลีย
// ทั้งหมด ทำไมยังมีข้อมูลอยู่ครบเลย แม่งข้อมูลอยู่ครบเลย"
//
// This file enforces: every filterField + orFilterField in CENTRAL_BUCKETS
// MUST appear as a write-time field in backendClient.js. If you add a new
// bucket with a new filterField, you MUST verify it appears in production
// write-side code (grep `setDoc(stockXxxDoc...)` blocks).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CENTRAL_BUCKETS } from '../src/lib/centralStockBuckets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const backendClient = fs.readFileSync(path.join(ROOT, 'src/lib/backendClient.js'), 'utf8');

describe('V66 CENTRAL_BUCKETS filter fields verified against production write code', () => {
  it('V66.1 — every filterField appears as a write-time field in backendClient.js', () => {
    const missing = [];
    for (const [bucketId, bucket] of Object.entries(CENTRAL_BUCKETS)) {
      for (const spec of bucket.collections) {
        // Look for either:
        //   `<filterField>: ` (write-time setDoc field) OR
        //   `where('<filterField>', '==', ...)` (read-time filter — proves field is canonical)
        const writeRegex = new RegExp(`\\b${spec.filterField}\\s*:\\s*[^,\\n]+,`);
        const queryRegex = new RegExp(`where\\(['"]${spec.filterField}['"]`);
        if (!writeRegex.test(backendClient) && !queryRegex.test(backendClient)) {
          missing.push(`${bucketId}.${spec.name}.filterField=${spec.filterField}`);
        }
        // Also check orFilterField if present
        if (spec.orFilterField) {
          const orWriteRegex = new RegExp(`\\b${spec.orFilterField}\\s*:\\s*[^,\\n]+,`);
          const orQueryRegex = new RegExp(`where\\(['"]${spec.orFilterField}['"]`);
          if (!orWriteRegex.test(backendClient) && !orQueryRegex.test(backendClient)) {
            missing.push(`${bucketId}.${spec.name}.orFilterField=${spec.orFilterField}`);
          }
        }
      }
    }
    expect(missing, `These filter fields don't exist in backendClient.js writers — they were INVENTED:\n${missing.join('\n')}`).toEqual([]);
  });

  it('V66.2 — be_central_stock_orders filterField === "centralWarehouseId"', () => {
    // Hard-coded sentinel — must match prod write site backendClient.js:5855
    const po = CENTRAL_BUCKETS.cs_po.collections.find(c => c.name === 'be_central_stock_orders');
    expect(po.filterField).toBe('centralWarehouseId');
    // Verify in source: `centralWarehouseId: wh` or similar appears
    expect(backendClient).toMatch(/centralWarehouseId:\s*wh/);
  });

  it('V66.3 — be_stock_batches + be_stock_movements filterField === "branchId"', () => {
    const batches = CENTRAL_BUCKETS.cs_stock_ledger.collections.find(c => c.name === 'be_stock_batches');
    expect(batches.filterField).toBe('branchId');
    const movements = CENTRAL_BUCKETS.cs_stock_ledger.collections.find(c => c.name === 'be_stock_movements');
    expect(movements.filterField).toBe('branchId');
    // Production stamps both as `branchId: String(locationId)` for central tier
    // per backendClient.js:5439, 5466
    expect(backendClient).toMatch(/branchId:\s*String\(locationId\)/);
  });

  it('V66.4 — be_stock_transfers orFilterField === "destinationLocationId" (NOT destLocationId)', () => {
    const transfers = CENTRAL_BUCKETS.cs_transfers_withdrawals.collections.find(c => c.name === 'be_stock_transfers');
    expect(transfers.filterField).toBe('sourceLocationId');
    expect(transfers.orFilterField).toBe('destinationLocationId');
    // Hard verify: NEVER use `destLocationId` (anti-regression — pre-V66 invented name)
    expect(transfers.orFilterField).not.toBe('destLocationId');
    expect(backendClient).toMatch(/destinationLocationId:\s*dst/);
  });

  it('V66.5 — be_stock_adjustments filterField === "branchId" (NOT locationId)', () => {
    const adj = CENTRAL_BUCKETS.cs_adjustments.collections[0];
    expect(adj.filterField).toBe('branchId');
    // Production stamps as `branchId,` in adjustment doc per backendClient.js:6291
    expect(backendClient).toMatch(/stockAdjustmentDoc\([^)]+\)\s*,\s*\{[\s\S]*?branchId/);
  });

  it('V66.6 — be_central_stock_movements REMOVED from any bucket (empty in prod)', () => {
    for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
      for (const c of b.collections) {
        expect(c.name, `${id} must NOT include be_central_stock_movements (empty in prod)`).not.toBe('be_central_stock_movements');
      }
    }
  });

  it('V66.7 — anti-pattern lock: spec MUST NOT include known invented field names', () => {
    // These field names appeared in pre-V66 spec but DO NOT exist in production
    // data. If they re-appear in CENTRAL_BUCKETS, that's a regression.
    const forbidden = ['destLocationId'];  // 'warehouseId' + 'locationId' are valid names in OTHER contexts; only check name-specific ones
    for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
      for (const c of b.collections) {
        if (forbidden.includes(c.filterField)) {
          throw new Error(`${id}.${c.name} uses forbidden invented field "${c.filterField}"`);
        }
        if (c.orFilterField && forbidden.includes(c.orFilterField)) {
          throw new Error(`${id}.${c.name} uses forbidden invented orFilterField "${c.orFilterField}"`);
        }
      }
    }
  });
});
