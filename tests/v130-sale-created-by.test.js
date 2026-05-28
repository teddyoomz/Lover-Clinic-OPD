// V130 (2026-05-28) — capture the TRUE acting user as createdBy at sale-write
// (ผู้ทำรายการ). V129 made the report fall back to the first seller; V130 writes
// the real logged-in staff at the createBackendSale chokepoint (createdById +
// createdByName snapshot + createdBySource honesty tag) and the report prefers
// it. Follow-up to V129; same write-chokepoint family as V108. AV149.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateSaleReport, buildSaleReportRow } from '../src/lib/saleReportAggregator.js';

const LOOKUP = [
  { id: 'STF-1042', name: 'กวางตุ้ง' },
  { id: 'STF-2001', name: 'วัน' },
  { id: 'STAFF-aaa', name: 'แอดมินขาย' },
];
const base = {
  saleId: 'INV-1', saleDate: '2026-05-27', status: 'active',
  billing: { netTotal: 500 }, payment: { status: 'paid', channels: [{ amount: 500 }] },
  sellers: [{ id: 'STAFF-aaa', name: '' }],
};

describe('V130.A report createdBy fallback chain', () => {
  it('A1: captured NAME snapshot (createdByName) wins', () => {
    const row = buildSaleReportRow({ ...base, createdByName: 'หมอเอ', createdById: 'STF-1042' }, null, null, LOOKUP);
    expect(row.createdBy).toBe('หมอเอ');
  });
  it('A2: createdById live-resolves via the seller lookup when no name snapshot', () => {
    const row = buildSaleReportRow({ ...base, createdById: 'STF-1042' }, null, null, LOOKUP);
    expect(row.createdBy).toBe('กวางตุ้ง');
  });
  it('A3: legacy denormalized createdBy used when no name/id captured', () => {
    const row = buildSaleReportRow({ ...base, createdBy: 'legacy ชื่อ' }, null, null, LOOKUP);
    expect(row.createdBy).toBe('legacy ชื่อ');
  });
  it('A4: FIRST-seller fallback (V129 behavior) when nothing captured', () => {
    const row = buildSaleReportRow(base, null, null, LOOKUP);
    expect(row.createdBy).toBe('แอดมินขาย');
  });
  it('A5: "-" when nothing resolves (never leaks a raw id — V22 lock)', () => {
    const row = buildSaleReportRow({ ...base, createdById: 'STF-UNKNOWN', sellers: [{ id: 'STF-UNKNOWN' }] }, null, null, LOOKUP);
    expect(row.createdBy).toBe('-');
  });
  it('A6: name snapshot wins even over a (different) captured id', () => {
    const row = buildSaleReportRow({ ...base, createdByName: 'เจ้าของ', createdById: 'STF-2001' }, null, null, LOOKUP);
    expect(row.createdBy).toBe('เจ้าของ');
  });
  it('A7: createdById resolves even when createdByName is whitespace only', () => {
    const row = buildSaleReportRow({ ...base, createdByName: '   ', createdById: 'STF-2001' }, null, null, LOOKUP);
    expect(row.createdBy).toBe('วัน');
  });
  it('A8: createdBySource carried onto the row (audit/CSV)', () => {
    expect(buildSaleReportRow({ ...base, createdBySource: 'staff' }, null, null, LOOKUP).createdBySource).toBe('staff');
    expect(buildSaleReportRow(base, null, null, LOOKUP).createdBySource).toBe('');
  });
  it('A9: aggregateSaleReport threads it end-to-end', () => {
    const out = aggregateSaleReport(
      [{ ...base, createdByName: 'หมอบี', createdById: 'STF-1042', createdBySource: 'staff' }],
      { sellers: LOOKUP, includeCancelled: true },
    );
    expect(out.rows[0].createdBy).toBe('หมอบี');
    expect(out.rows[0].createdBySource).toBe('staff');
  });
});

describe('V130.SG source-grep — chokepoint resolver + report chain + AV149', () => {
  const bc = readFileSync('src/lib/backendClient.js', 'utf8');
  const agg = readFileSync('src/lib/saleReportAggregator.js', 'utf8');
  const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('SG1: _resolveSaleCreatedBy exists with all 4 branches', () => {
    expect(bc).toMatch(/async function _resolveSaleCreatedBy\(data\)/);
    expect(bc).toMatch(/data\.createdBySource \|\| 'caller'/);     // 1 caller override
    expect(bc).toMatch(/createdBySource: 'staff'/);                // 2 staff
    expect(bc).toMatch(/createdBySource: 'auth'/);                 // 3 non-staff admin
    expect(bc).toMatch(/createdBySource: 'none'/);                 // 4 no user / catch
  });
  it('SG2: resolver queries be_staff by firebaseUid (NOT by doc id)', () => {
    expect(bc).toMatch(/where\('firebaseUid', '==', u\.uid\)/);
    expect(bc).toMatch(/staffCol\(\)/);
  });
  it('SG3: createBackendSale stamps the 3 fields via the resolver', () => {
    expect(bc).toMatch(/const _creator = await _resolveSaleCreatedBy\(data\); \/\/ V130/);
    expect(bc).toMatch(/createdById: _creator\.createdById/);
    expect(bc).toMatch(/createdByName: _creator\.createdByName/);
    expect(bc).toMatch(/createdBySource: _creator\.createdBySource/);
  });
  it('SG4: aggregator prefers snapshot, then live-resolves createdById', () => {
    expect(agg).toMatch(/typeof s\.createdByName === 'string' && s\.createdByName\.trim\(\)/);
    expect(agg).toMatch(/resolveSellerName\(\{ id: s\.createdById \}, sellerLookup\)/);
    expect(agg).toMatch(/createdBySource: s\.createdBySource \|\| ''/);
  });
  it('SG5: AV149 present', () => {
    expect(av).toMatch(/### AV149 —/);
    expect(av).toMatch(/createBackendSale/);
  });
});
