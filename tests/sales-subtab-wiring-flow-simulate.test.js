// Sales sub-tab CROSS-WIRING (2026-05-20). Verifies that a sale created from
// ANY surface (SaleTab create button + TFP auto-sale chain) routes to the
// "การขาย" (active) pill, and only cancellation routes it to "ยกเลิกแล้ว".
// Source-grep grounds the claim against the REAL creation code; pure flow
// chains the helper across the create→cancel lifecycle.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterSalesBySubTab } from '../src/lib/saleSubTabFilter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = readFileSync(join(__dirname, '../src/lib/backendClient.js'), 'utf8');
const TFP = readFileSync(join(__dirname, '../src/components/TreatmentFormPage.jsx'), 'utf8');

// =============================================================================
describe('W1 — createBackendSale routing contract', () => {
  it('W1.1 createBackendSale defaults sale.status to active (never cancelled on create)', () => {
    expect(BACKEND).toMatch(/export async function createBackendSale/);
    expect(BACKEND).toMatch(/status:\s*data\.status \|\| 'active'/);
  });
  it('W1.2 a created sale (status active) lands on the การขาย pill', () => {
    const created = { saleId: 'INV-NEW', status: 'active', payment: { status: 'paid' } };
    expect(filterSalesBySubTab([created], 'active')).toEqual([created]);
    expect(filterSalesBySubTab([created], 'cancelled')).toEqual([]);
  });
  it('W1.3 every non-cancelled top-level status routes to active', () => {
    // sale.status is active|cancelled; payment.status carries paid/unpaid/etc.
    for (const st of ['active', undefined, 'draft', 'deferred']) {
      const s = { saleId: `INV-${st}`, status: st };
      expect(filterSalesBySubTab([s], 'active')).toEqual([s]);
      expect(filterSalesBySubTab([s], 'cancelled')).toEqual([]);
    }
  });
});

// =============================================================================
describe('W2 — TFP auto-sale chain routes to active', () => {
  it('W2.1 TFP creates its auto-sale via createBackendSale', () => {
    expect(TFP).toMatch(/await createBackendSale\(clean\(/);
  });
  it('W2.2 TFP auto-sale does NOT stamp status:cancelled (would mis-route)', () => {
    expect(TFP).not.toMatch(/createBackendSale\(clean\(\{[\s\S]{0,400}status:\s*'cancelled'/);
  });
  it('W2.3 a TFP-shaped auto-sale (no explicit cancelled) → active pill', () => {
    // mirrors createBackendSale default: status = data.status || 'active'
    const tfpData = { customerId: 'LC-1', items: {}, payment: { status: 'paid' } };
    const persisted = { ...tfpData, saleId: 'INV-TFP', status: tfpData.status || 'active' };
    expect(filterSalesBySubTab([persisted], 'active')).toEqual([persisted]);
    expect(filterSalesBySubTab([persisted], 'cancelled')).toEqual([]);
  });
});

// =============================================================================
describe('W3 — cancel lifecycle migrates active → cancelled', () => {
  it('W3.1 cancelBackendSale flips status to cancelled', () => {
    // backendClient cancel path stamps status: 'cancelled'
    expect(BACKEND).toMatch(/status:\s*'cancelled'/);
  });
  it('W3.2 create → active pill; after cancel → cancelled pill', () => {
    let sales = [{ saleId: 'INV-1', status: 'active' }, { saleId: 'INV-2', status: 'active' }];
    expect(filterSalesBySubTab(sales, 'active').map(s => s.saleId)).toEqual(['INV-1', 'INV-2']);
    expect(filterSalesBySubTab(sales, 'cancelled')).toEqual([]);
    // cancel INV-1 → reload returns it cancelled
    sales = [{ saleId: 'INV-1', status: 'cancelled' }, { saleId: 'INV-2', status: 'active' }];
    expect(filterSalesBySubTab(sales, 'active').map(s => s.saleId)).toEqual(['INV-2']);
    expect(filterSalesBySubTab(sales, 'cancelled').map(s => s.saleId)).toEqual(['INV-1']);
  });
});
