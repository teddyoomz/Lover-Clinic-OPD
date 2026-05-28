// V129 (2026-05-28) — reports-sale "พนักงานขาย / ผู้ทำรายการ ไม่ครบ".
// be_sales stores sellers[].id but often empty sellers[].name (38/49 real prod)
// + never writes createdBy → the report showed "-" while SaleTab/SalePrintView
// resolve via resolveSellerName(seller, listAllSellers). Fix: thread the staff
// lookup through the aggregator + SaleDetailModal. Same class as V108 (report
// reads raw; resolve via lookup). AV147.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateSaleReport, buildSaleReportRow } from '../src/lib/saleReportAggregator.js';

const LOOKUP = [{ id: 'STAFF-aaa', name: 'กวางตุ้ง' }, { id: 'STAFF-bbb', name: 'วัน' }];
// Real-prod shape: seller carries only id, empty name.
const saleEmptyName = {
  saleId: 'INV-1', saleDate: '2026-05-27', status: 'active',
  billing: { netTotal: 500 }, payment: { status: 'paid', channels: [{ amount: 500 }] },
  sellers: [{ id: 'STAFF-aaa', name: '' }],
};

describe('V129.A aggregator resolves seller + creator via lookup', () => {
  it('A1: sellersLabel resolves from id when name empty (was "-")', () => {
    expect(buildSaleReportRow(saleEmptyName, null, null, LOOKUP).sellersLabel).toBe('กวางตุ้ง');
  });
  it('A2: createdBy falls back to resolved first seller (createdBy never written)', () => {
    expect(buildSaleReportRow(saleEmptyName, null, null, LOOKUP).createdBy).toBe('กวางตุ้ง');
  });
  it('A3: NO lookup → "-" (graceful; never leaks the opaque id — V22 lock)', () => {
    const row = buildSaleReportRow(saleEmptyName, null, null, null);
    expect(row.sellersLabel).toBe('-');
    expect(row.createdBy).toBe('-');
  });
  it('A4: denormalized name still wins (no lookup needed)', () => {
    const s = { ...saleEmptyName, sellers: [{ id: 'STAFF-aaa', name: 'ชื่อบันทึก' }] };
    expect(buildSaleReportRow(s, null, null, LOOKUP).sellersLabel).toBe('ชื่อบันทึก');
  });
  it('A5: multi-seller joins resolved names', () => {
    const s = { ...saleEmptyName, sellers: [{ id: 'STAFF-aaa', name: '' }, { id: 'STAFF-bbb', name: '' }] };
    expect(buildSaleReportRow(s, null, null, LOOKUP).sellersLabel).toBe('กวางตุ้ง, วัน');
  });
  it('A6: aggregateSaleReport threads the `sellers` lookup end-to-end', () => {
    const out = aggregateSaleReport([saleEmptyName], { sellers: LOOKUP, includeCancelled: true });
    expect(out.rows[0].sellersLabel).toBe('กวางตุ้ง');
    expect(out.rows[0].createdBy).toBe('กวางตุ้ง');
  });
  it('A7: explicit createdBy wins over the seller fallback', () => {
    expect(buildSaleReportRow({ ...saleEmptyName, createdBy: 'แอดมิน' }, null, null, LOOKUP).createdBy).toBe('แอดมิน');
  });
  it('A8: unknown id (no lookup hit) → "-" (never the raw id)', () => {
    const s = { ...saleEmptyName, sellers: [{ id: 'STAFF-zzz', name: '' }] };
    expect(buildSaleReportRow(s, null, null, LOOKUP).sellersLabel).toBe('-');
  });
});

describe('V129.SG source-grep (AV147)', () => {
  const agg = readFileSync('src/lib/saleReportAggregator.js', 'utf8');
  const tab = readFileSync('src/components/backend/reports/SaleReportTab.jsx', 'utf8');
  const modal = readFileSync('src/components/backend/reports/SaleDetailModal.jsx', 'utf8');
  const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('SG1: aggregator imports + uses resolveSellerName + accepts sellers lookup', () => {
    expect(agg).toMatch(/import \{ resolveSellerName \} from '\.\/documentFieldAutoFill\.js'/);
    expect(agg).toMatch(/deriveSellersLabel\(sale, sellerLookup/);
    expect(agg).toMatch(/sellers = null,/);
    // V130 (2026-05-28) superseded the old `createdBy: s.createdBy || resolveSellerName(`
    // one-liner with a fallback chain that prefers the captured creator. Lock
    // that legacy first-seller resolve is STILL in the chain (V129 behavior kept).
    expect(agg).toMatch(/resolveSellerName\(Array\.isArray\(s\.sellers\) \? s\.sellers\[0\] : null, sellerLookup\)/);
  });
  it('SG2: SaleReportTab loads listAllSellers + passes sellers + sellerLookup', () => {
    expect(tab).toMatch(/import \{ listAllSellers \} from '\.\.\/\.\.\/\.\.\/lib\/scopedDataLayer\.js'/);
    expect(tab).toMatch(/listAllSellers\(\{ branchId: selectedBranchId \}\)/);
    expect(tab).toMatch(/sellers: allSellers/);
    expect(tab).toMatch(/sellerLookup=\{allSellers\}/);
  });
  it('SG3: SaleDetailModal resolves sellers display + createdBy', () => {
    expect(modal).toMatch(/import \{ resolveSellerName \}/);
    expect(modal).toMatch(/resolveSellerName\(s, sellerLookup\)/);
    expect(modal).toMatch(/const recordedBy = sale\.createdBy \|\| resolveSellerName/);
  });
  it('SG4: AV147 present', () => {
    expect(av).toMatch(/### AV147 —/);
    expect(av).toMatch(/resolveSellerName/);
  });
});
