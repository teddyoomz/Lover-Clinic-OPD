// V131 (2026-05-28) — HN class-of-bug: read-sites used a hardcoded `proClinicHN`
// subset that OMITS `hn_no`, where 100% of real customers store their HN
// (real-prod diag: 109/109 in hn_no, 0 in proClinicHN/hn/pd.hn). Result: 6 sale
// rows blank HN + CustomerDetailView HN badge never showed + customer-report HN
// blank + HN search dead. Fix: canonical resolveCustomerHN(c) (checks hn_no)
// everywhere HN is displayed/searched. AV150.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSaleReportRow } from '../src/lib/saleReportAggregator.js';
import { resolveCustomerHN } from '../src/lib/customerDisplayName.js';

describe('V131.A resolveCustomerHN reads hn_no (the real field)', () => {
  it('A1: hn_no resolves (proClinicHN/hn empty — the real-prod shape)', () => {
    expect(resolveCustomerHN({ id: 'LC-26000078', hn_no: 'LC-26000078' })).toBe('LC-26000078');
  });
  it('A2: proClinicHN still wins when present (back-compat)', () => {
    expect(resolveCustomerHN({ proClinicHN: 'HN-999', hn_no: 'LC-1' })).toBe('HN-999');
  });
  it('A3: patientData.hn resolves', () => {
    expect(resolveCustomerHN({ patientData: { hn: 'PD-5' } })).toBe('PD-5');
  });
  it('A4: empty when truly none', () => {
    expect(resolveCustomerHN({ id: 'X' })).toBe('');
  });
});

describe('V131.B sale-report row resolves HN via the customer lookup (Task B)', () => {
  const sale = { saleId: 'INV-1', saleDate: '2026-05-20', customerId: 'LC-26000078', customerHN: '', billing: {}, payment: {} };
  it('B1: blank sale.customerHN + customer.hn_no → resolved (was "" pre-V131)', () => {
    const lookup = new Map([['LC-26000078', { id: 'LC-26000078', hn_no: 'LC-26000078', patientData: {} }]]);
    expect(buildSaleReportRow(sale, lookup, null, null).customerHN).toBe('LC-26000078');
  });
  it('B2: denormalized sale.customerHN still wins (no lookup needed)', () => {
    const s = { ...sale, customerHN: 'LC-EXPLICIT' };
    expect(buildSaleReportRow(s, null, null, null).customerHN).toBe('LC-EXPLICIT');
  });
  it('B3: no lookup + blank → blank (graceful)', () => {
    expect(buildSaleReportRow(sale, null, null, null).customerHN).toBe('');
  });
});

describe('V131.SG source-grep — every HN read-site uses the canonical resolver (AV150)', () => {
  const files = {
    agg: 'src/lib/saleReportAggregator.js',
    custAgg: 'src/lib/customerReportAggregator.js',
    cdv: 'src/components/backend/CustomerDetailView.jsx',
    bulk: 'src/components/backend/BulkPrintModal.jsx',
    list: 'src/components/backend/CustomerListTab.jsx',
    apptForm: 'src/components/backend/AppointmentFormModal.jsx',
  };
  const src = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, readFileSync(p, 'utf8')]));

  it('SG1: all 6 files import resolveCustomerHN from customerDisplayName', () => {
    for (const [k, s] of Object.entries(src)) {
      expect(s, k).toMatch(/import \{[^}]*resolveCustomerHN[^}]*\} from ['"][^'"]*customerDisplayName\.js['"]/);
    }
  });
  it('SG2: saleReportAggregator HN uses resolveCustomerHN, not the old proClinicHN||hn', () => {
    expect(src.agg).toMatch(/resolvedHN = resolveCustomerHN\(c\)/);
    expect(src.agg).not.toMatch(/resolvedHN = c\.proClinicHN \|\| c\.hn/);
  });
  it('SG3: customerReportAggregator deriveHN uses resolveCustomerHN', () => {
    expect(src.custAgg).toMatch(/function deriveHN\(c\) \{\s*return resolveCustomerHN\(c\);/);
  });
  it('SG4: CustomerDetailView header HN uses resolveCustomerHN (not proClinicHN)', () => {
    expect(src.cdv).toMatch(/const hn = resolveCustomerHN\(customer\)/);
    expect(src.cdv).not.toMatch(/const hn = customer\?\.proClinicHN \|\| ''/);
  });
  it('SG5: BulkPrintModal printed HN uses resolveCustomerHN', () => {
    expect(src.bulk).toMatch(/customerHN: resolveCustomerHN\(customer\)/);
  });
  it('SG6: CustomerListTab + AppointmentFormModal HN search/picker use resolveCustomerHN', () => {
    expect(src.list).toMatch(/resolveCustomerHN\(c\)\.toLowerCase\(\)/);
    expect(src.apptForm).toMatch(/resolveCustomerHN\(c\)\.toLowerCase\(\)/);
    expect(src.apptForm).toMatch(/customerHN: resolveCustomerHN\(c\)/);
  });
  it('SG7: AV150 documented', () => {
    const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(av).toMatch(/### AV150 —/);
    expect(av).toMatch(/hn_no/);
  });
});
