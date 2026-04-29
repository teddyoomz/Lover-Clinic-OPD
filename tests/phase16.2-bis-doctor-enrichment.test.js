// tests/phase16.2-bis-doctor-enrichment.test.js — Phase 16.2-bis (2026-04-29 session 33)
//
// Pure helper coverage of `enrichSalesWithDoctorIdFromTreatments` —
// the fix for TOP-10 DOCTORS empty-table bug.
//
// Bug: staffSalesAggregator.doctorRows reads sale.doctorId, but treatment-
// linked sales don't carry a denormalized doctorId. The enrich helper joins
// via treatment.detail.linkedSaleId and stamps sale.doctorId before the
// aggregator runs.
//
// Rule D adversarial coverage required: null inputs, missing fields, multi-
// treatment-same-sale, non-linked sales, idempotency.

import { describe, it, expect } from 'vitest';
import { enrichSalesWithDoctorIdFromTreatments } from '../src/lib/clinicReportAggregator.js';

describe('DE.A — happy path (single treatment, single sale)', () => {
  it('DE.A.1 — stamps doctorId from treatment.detail.doctorId', () => {
    const sales = [{ id: 'S-1', billing: { netTotal: 1000 } }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A', doctorName: 'หมอ ก' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out).toHaveLength(1);
    expect(out[0].doctorId).toBe('DOC-A');
    expect(out[0].doctorName).toBe('หมอ ก');
    // Original fields preserved
    expect(out[0].id).toBe('S-1');
    expect(out[0].billing.netTotal).toBe(1000);
  });

  it('DE.A.2 — falls back to dfEntries[0].doctorId when detail.doctorId missing', () => {
    const sales = [{ id: 'S-2' }];
    const treatments = [{
      id: 'T-2',
      detail: {
        linkedSaleId: 'S-2',
        dfEntries: [{ doctorId: 'DOC-B', doctorName: 'หมอ ข' }],
      },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-B');
    expect(out[0].doctorName).toBe('หมอ ข');
  });

  it('DE.A.3 — falls back to top-level treatment.doctorId (legacy schema)', () => {
    const sales = [{ id: 'S-3' }];
    const treatments = [{
      id: 'T-3',
      doctorId: 'DOC-C',
      doctorName: 'หมอ ค',
      detail: { linkedSaleId: 'S-3' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-C');
  });

  it('DE.A.4 — also reads top-level linkedSaleId (Phase 12.2b mirror field)', () => {
    const sales = [{ id: 'S-4' }];
    const treatments = [{
      id: 'T-4',
      linkedSaleId: 'S-4', // top-level (legacy)
      detail: { doctorId: 'DOC-D' }, // detail without linkedSaleId
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-D');
  });
});

describe('DE.B — idempotency (existing doctorId wins)', () => {
  it('DE.B.1 — preserves sale.doctorId when already set', () => {
    const sales = [{ id: 'S-1', doctorId: 'DOC-EXIST', billing: { netTotal: 500 } }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'S-1', doctorId: 'DOC-NEW' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    // Existing doctorId wins (do not overwrite)
    expect(out[0].doctorId).toBe('DOC-EXIST');
  });

  it('DE.B.2 — preserves doctorName when already set', () => {
    const sales = [{ id: 'S-1', doctorId: 'DOC-EXIST', doctorName: 'ชื่อเดิม' }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'S-1', doctorId: 'DOC-NEW', doctorName: 'ชื่อใหม่' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorName).toBe('ชื่อเดิม');
  });

  it('DE.B.3 — running enrichment twice has same result as once', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A' },
    }];
    const once = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    const twice = enrichSalesWithDoctorIdFromTreatments(once, treatments);
    expect(twice[0].doctorId).toBe('DOC-A');
    expect(twice).toEqual(once);
  });
});

describe('DE.C — multi-treatment / multi-sale interactions', () => {
  it('DE.C.1 — first-match-wins when 2 treatments link to same sale', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [
      { id: 'T-A', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-FIRST' } },
      { id: 'T-B', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-SECOND' } },
    ];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-FIRST');
  });

  it('DE.C.2 — different treatments stamp different sales', () => {
    const sales = [{ id: 'S-1' }, { id: 'S-2' }, { id: 'S-3' }];
    const treatments = [
      { id: 'T-1', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A' } },
      { id: 'T-2', detail: { linkedSaleId: 'S-3', doctorId: 'DOC-C' } },
    ];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-A');
    expect(out[1].doctorId).toBeUndefined(); // no treatment for S-2
    expect(out[2].doctorId).toBe('DOC-C');
  });

  it('DE.C.3 — sales without any matching treatment pass through untouched', () => {
    const sales = [{ id: 'S-LONE', billing: { netTotal: 999 } }];
    const treatments = [
      { id: 'T-OTHER', detail: { linkedSaleId: 'S-DIFFERENT', doctorId: 'DOC-X' } },
    ];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0]).toBe(sales[0]); // SAME REFERENCE — no copy
  });

  it('DE.C.4 — produces a NEW array (not the input array)', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [{ id: 'T-1', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A' } }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out).not.toBe(sales);
  });
});

describe('DE.D — adversarial inputs', () => {
  it('DE.D.1 — null sales returns []', () => {
    expect(enrichSalesWithDoctorIdFromTreatments(null, [{}])).toEqual([]);
  });

  it('DE.D.2 — null treatments returns input unchanged', () => {
    const sales = [{ id: 'S-1' }];
    expect(enrichSalesWithDoctorIdFromTreatments(sales, null)).toBe(sales);
  });

  it('DE.D.3 — empty treatments returns input unchanged', () => {
    const sales = [{ id: 'S-1' }];
    expect(enrichSalesWithDoctorIdFromTreatments(sales, [])).toBe(sales);
  });

  it('DE.D.4 — treatments with no linkedSaleId are skipped', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [
      { id: 'T-1', detail: { doctorId: 'DOC-A' } }, // no linkedSaleId
      { id: 'T-2' }, // no detail at all
    ];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBeUndefined();
  });

  it('DE.D.5 — treatments with linkedSaleId but no doctorId are skipped', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [
      { id: 'T-1', detail: { linkedSaleId: 'S-1' } }, // no doctorId
    ];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBeUndefined();
  });

  it('DE.D.6 — null/undefined sale entries pass through', () => {
    const sales = [null, { id: 'S-1' }, undefined];
    const treatments = [{ id: 'T-1', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A' } }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0]).toBe(null);
    expect(out[1].doctorId).toBe('DOC-A');
    expect(out[2]).toBe(undefined);
  });

  it('DE.D.7 — handles whitespace in linkedSaleId / doctorId via trim', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: '  S-1  ', doctorId: '  DOC-A  ' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DOC-A');
  });

  it('DE.D.8 — empty-string doctorId after trim is rejected (no stamp)', () => {
    const sales = [{ id: 'S-1' }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'S-1', doctorId: '   ' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBeUndefined();
  });

  it('DE.D.9 — non-array sales returns []', () => {
    expect(enrichSalesWithDoctorIdFromTreatments('not-array', [])).toEqual([]);
    expect(enrichSalesWithDoctorIdFromTreatments(undefined, [])).toEqual([]);
    expect(enrichSalesWithDoctorIdFromTreatments({}, [])).toEqual([]);
  });

  it('DE.D.10 — Thai-character doctorId / saleId both work', () => {
    const sales = [{ id: 'INV-๒๕๖๘-๐๐๐๑' }];
    const treatments = [{
      id: 'T-1',
      detail: { linkedSaleId: 'INV-๒๕๖๘-๐๐๐๑', doctorId: 'DR-แพทย์ก' },
    }];
    const out = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    expect(out[0].doctorId).toBe('DR-แพทย์ก');
  });
});

describe('DE.E — integration with staffSalesAggregator (the real downstream consumer)', () => {
  it('DE.E.1 — enriched sales produce non-empty doctorRows in aggregateStaffSales', async () => {
    const { aggregateStaffSales } = await import('../src/lib/staffSalesAggregator.js');
    const sales = [
      { id: 'S-1', saleDate: '2026-04-15', billing: { netTotal: 5000 }, status: 'paid', sellers: [{ id: 'STAFF-1', name: 'พนักงาน 1' }] },
      { id: 'S-2', saleDate: '2026-04-16', billing: { netTotal: 3000 }, status: 'paid', sellers: [{ id: 'STAFF-2', name: 'พนักงาน 2' }] },
    ];
    const treatments = [
      { id: 'T-1', detail: { linkedSaleId: 'S-1', doctorId: 'DOC-A', doctorName: 'หมอ ก' } },
      { id: 'T-2', detail: { linkedSaleId: 'S-2', doctorId: 'DOC-B', doctorName: 'หมอ ข' } },
    ];
    // BEFORE enrichment — doctorRows is empty (no sale.doctorId)
    const beforeEnrich = aggregateStaffSales(sales);
    expect(beforeEnrich.doctorRows).toHaveLength(0);
    // AFTER enrichment — doctorRows has 2 entries
    const enriched = enrichSalesWithDoctorIdFromTreatments(sales, treatments);
    const afterEnrich = aggregateStaffSales(enriched);
    expect(afterEnrich.doctorRows).toHaveLength(2);
    const docIds = afterEnrich.doctorRows.map(r => r.doctorKey);
    expect(docIds).toContain('id:DOC-A');
    expect(docIds).toContain('id:DOC-B');
  });
});
