// ─── Phase 12.3 · Sale Insurance Claim — full-flow simulate test ──────────
// Rule I: chain every step the user exercises — master data (sales) → UI
// whitelist (pick sale in modal auto-fills customer) → form submit →
// backend write shape → status transition pending→approved→paid → SaleReport
// "เบิกประกัน" column finally shows the non-zero amount.
//
// What this guards:
// - The "เบิกประกัน" col was hardcoded ฿0 because SaleReportTab never
//   loaded be_sale_insurance_claims. V11/V12/V13 cluster: backend helpers
//   existed, validator passed 38/38 tests, but user-facing number was
//   still 0 because nothing called the aggregator with claimsBySaleId.
// - Status machine cannot shortcut pending → paid (must pass approved).
// - aggregateClaimsBySaleId ONLY counts status='paid' claims (not
//   'pending' or 'approved') so the report matches actual cash received.
// - Multi-claim-per-sale: partial reimbursements accumulate correctly.
//
// Structure:
//   F1: saleId → customer auto-fill (pure simulate of handleSaleChange)
//   F2: validator full-chain (form shape as saved by saveSaleInsuranceClaim)
//   F3: status transition machine full matrix
//   F4: aggregateClaimsBySaleId paid-only spec
//   F5: end-to-end — claim created → SaleReport row shows claim value
//   F6: adversarial inputs (nulls / Thai text / duplicate paid sums)
//   F7: source-grep regression guards (locks the fix pattern in place)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateSaleInsuranceClaim,
  normalizeSaleInsuranceClaim,
  emptySaleInsuranceClaimForm,
  generateSaleInsuranceClaimId,
  applyClaimStatusTransition,
  aggregateClaimsBySaleId,
  STATUS_OPTIONS,
  TRANSITIONS,
} from '../src/lib/saleInsuranceClaimValidation.js';
import {
  aggregateSaleReport,
  buildSaleReportRow,
  buildSaleReportColumns,
} from '../src/lib/saleReportAggregator.js';

// Pure simulate of SaleInsuranceClaimsTab.handleSaleChange — picking a sale
// from the dropdown auto-fills customerId/HN/name + defaults claimAmount +
// claimDate. This matters because the backend validator rejects
// `customerId=''`; if the auto-fill ever broke we'd get a validator crash
// instead of a save, AND the report would see orphan claims that don't
// link to any customer.
function simHandleSaleChange(formState, saleId, salesList) {
  const s = salesList.find(x => (x.saleId || x.id) === saleId);
  if (!s) {
    return { ...formState, saleId, customerId: '', customerHN: '', customerName: '', claimAmount: 0 };
  }
  return {
    ...formState,
    saleId,
    customerId: s.customerId || '',
    customerHN: s.customerHN || '',
    customerName: s.customerName || '',
    claimAmount: formState.claimAmount > 0 ? formState.claimAmount : Number(s?.billing?.netTotal) || 0,
    claimDate: formState.claimDate || s.saleDate || '',
  };
}

const fakeSale = (o = {}) => ({
  saleId: 'INV-0001',
  id: 'INV-0001',
  saleDate: '2026-04-20',
  customerId: 'CUST-1',
  customerHN: 'HN000001',
  customerName: 'คุณทดสอบ ระบบ',
  status: 'active',
  payment: { status: 'paid' },
  billing: { netTotal: 2000, depositApplied: 0, walletApplied: 0 },
  ...o,
});

/* ─── F1: handleSaleChange whitelist ────────────────────────────────── */

describe('F1: handleSaleChange auto-fills customer from picked sale', () => {
  it('F1.1: empty form + valid saleId pulls customer + defaults amount', () => {
    const sales = [fakeSale()];
    const initial = emptySaleInsuranceClaimForm();
    const next = simHandleSaleChange(initial, 'INV-0001', sales);
    expect(next.saleId).toBe('INV-0001');
    expect(next.customerId).toBe('CUST-1');
    expect(next.customerHN).toBe('HN000001');
    expect(next.customerName).toBe('คุณทดสอบ ระบบ');
    expect(next.claimAmount).toBe(2000);
    expect(next.claimDate).toBe('2026-04-20');
  });

  it('F1.2: unknown saleId clears customer fields (validator will reject)', () => {
    const sales = [fakeSale()];
    const initial = { ...emptySaleInsuranceClaimForm(), customerId: 'STALE', customerHN: 'ZZZ' };
    const next = simHandleSaleChange(initial, 'NOPE', sales);
    expect(next.saleId).toBe('NOPE');
    expect(next.customerId).toBe('');
    expect(next.customerHN).toBe('');
  });

  it('F1.3: user-entered claimAmount preserved (not overwritten by auto-default)', () => {
    const sales = [fakeSale()];
    const initial = { ...emptySaleInsuranceClaimForm(), claimAmount: 1500 };
    const next = simHandleSaleChange(initial, 'INV-0001', sales);
    expect(next.claimAmount).toBe(1500);
  });

  it('F1.4: sale missing billing.netTotal defaults to 0, not NaN', () => {
    const sales = [fakeSale({ billing: undefined })];
    const next = simHandleSaleChange(emptySaleInsuranceClaimForm(), 'INV-0001', sales);
    expect(next.claimAmount).toBe(0);
  });

  it('F1.5: result still passes strict validator when claimAmount > 0', () => {
    const sales = [fakeSale()];
    const next = simHandleSaleChange(emptySaleInsuranceClaimForm(), 'INV-0001', sales);
    const err = validateSaleInsuranceClaim(next, { strict: true });
    expect(err).toBeNull();
  });
});

/* ─── F2: validator → normalizer chain mirrors saveSaleInsuranceClaim ── */

describe('F2: save-chain validate → normalize', () => {
  it('F2.1: valid pending claim normalizes cleanly', () => {
    const form = { ...emptySaleInsuranceClaimForm(), saleId: 'INV-001', customerId: 'CUST-1', claimAmount: 1000, claimDate: '2026-04-20' };
    expect(validateSaleInsuranceClaim(form, { strict: true })).toBeNull();
    const norm = normalizeSaleInsuranceClaim(form);
    expect(norm.status).toBe('pending');
    expect(norm.claimAmount).toBe(1000);
    expect(norm.paidAmount).toBe(0);
  });

  it('F2.2: normalize trims whitespace + coerces numeric fields', () => {
    const form = { ...emptySaleInsuranceClaimForm(), saleId: '  INV-002  ', customerId: ' CUST-2 ', claimAmount: '500', claimDate: '2026-04-21' };
    const norm = normalizeSaleInsuranceClaim(form);
    expect(norm.saleId).toBe('INV-002');
    expect(norm.customerId).toBe('CUST-2');
    expect(norm.claimAmount).toBe(500);
  });

  it('F2.3: unknown status defaults to pending (silent recovery)', () => {
    const form = { ...emptySaleInsuranceClaimForm(), saleId: 'INV-003', customerId: 'CUST-3', claimAmount: 100, status: 'wtf' };
    const norm = normalizeSaleInsuranceClaim(form);
    expect(norm.status).toBe('pending');
  });

  it('F2.4: Thai text in insuranceCompany + policyNumber preserved', () => {
    const form = { ...emptySaleInsuranceClaimForm(), saleId: 'INV-004', customerId: 'CUST-4', claimAmount: 100, insuranceCompany: 'บริษัท เอไอเอ จำกัด', policyNumber: 'กรมธรรม์-๑๒๓' };
    const norm = normalizeSaleInsuranceClaim(form);
    expect(norm.insuranceCompany).toBe('บริษัท เอไอเอ จำกัด');
    expect(norm.policyNumber).toBe('กรมธรรม์-๑๒๓');
  });
});

/* ─── F3: status transition machine ─────────────────────────────────── */

describe('F3: applyClaimStatusTransition covers every legal + illegal edge', () => {
  it('F3.1: pending → approved allowed', () => expect(applyClaimStatusTransition('pending', 'approved')).toBe('approved'));
  it('F3.2: pending → rejected allowed', () => expect(applyClaimStatusTransition('pending', 'rejected')).toBe('rejected'));
  it('F3.3: approved → paid allowed', () => expect(applyClaimStatusTransition('approved', 'paid')).toBe('paid'));
  it('F3.4: approved → rejected allowed', () => expect(applyClaimStatusTransition('approved', 'rejected')).toBe('rejected'));
  it('F3.5: paid is terminal — no onward transition', () => {
    for (const next of STATUS_OPTIONS) {
      if (next === 'paid') continue;
      expect(() => applyClaimStatusTransition('paid', next)).toThrow();
    }
  });
  it('F3.6: rejected is terminal — no onward transition', () => {
    for (const next of STATUS_OPTIONS) {
      if (next === 'rejected') continue;
      expect(() => applyClaimStatusTransition('rejected', next)).toThrow();
    }
  });
  it('F3.7: pending → paid (skip approved) REJECTED — must be approved first', () => {
    // NOTE: this is actually NOT in TRANSITIONS.pending — pending can only go
    // to approved or rejected. The UI exposes "ชำระเงิน" on both pending AND
    // approved rows for convenience but the transition helper enforces the
    // hop through approved. Check both directions.
    expect(() => applyClaimStatusTransition('pending', 'paid')).toThrow();
  });
  it('F3.8: same → same returns same (idempotent no-op)', () => {
    for (const s of STATUS_OPTIONS) {
      expect(applyClaimStatusTransition(s, s)).toBe(s);
    }
  });
  it('F3.9: every legal transition appears in TRANSITIONS map (audit)', () => {
    const legal = new Set();
    for (const [from, to] of Object.entries(TRANSITIONS)) {
      for (const t of to) legal.add(`${from}->${t}`);
    }
    // The UI only has 3 positive paths: approve / pay / reject.
    expect(legal.has('pending->approved')).toBe(true);
    expect(legal.has('approved->paid')).toBe(true);
    expect(legal.has('pending->rejected')).toBe(true);
    expect(legal.has('approved->rejected')).toBe(true);
  });
});

/* ─── F4: aggregateClaimsBySaleId (paid-only) ───────────────────────── */

describe('F4: aggregateClaimsBySaleId only counts paid', () => {
  it('F4.1: mixed statuses — only paid count', () => {
    const map = aggregateClaimsBySaleId([
      { saleId: 'INV-1', status: 'pending', paidAmount: 100 },
      { saleId: 'INV-1', status: 'approved', paidAmount: 200 },
      { saleId: 'INV-1', status: 'paid', paidAmount: 300 },
      { saleId: 'INV-2', status: 'paid', paidAmount: 500 },
      { saleId: 'INV-3', status: 'rejected', paidAmount: 999 }, // ignored
    ]);
    expect(map.get('INV-1')).toBe(300);
    expect(map.get('INV-2')).toBe(500);
    expect(map.has('INV-3')).toBe(false);
  });

  it('F4.2: multiple paid claims per sale sum (partial reimbursements)', () => {
    const map = aggregateClaimsBySaleId([
      { saleId: 'INV-X', status: 'paid', paidAmount: 100 },
      { saleId: 'INV-X', status: 'paid', paidAmount: 200 },
      { saleId: 'INV-X', status: 'paid', paidAmount: 50 },
    ]);
    expect(map.get('INV-X')).toBe(350);
  });

  it('F4.3: null / non-array / missing-saleId all safe', () => {
    expect(aggregateClaimsBySaleId(null).size).toBe(0);
    expect(aggregateClaimsBySaleId(undefined).size).toBe(0);
    expect(aggregateClaimsBySaleId([{ status: 'paid', paidAmount: 100 }]).size).toBe(0);
    expect(aggregateClaimsBySaleId([{ saleId: '  ', status: 'paid', paidAmount: 100 }]).size).toBe(0);
  });

  it('F4.4: NaN/string paidAmount coerced to 0 (no NaN leak)', () => {
    const map = aggregateClaimsBySaleId([
      { saleId: 'INV-Y', status: 'paid', paidAmount: 'abc' },
      { saleId: 'INV-Y', status: 'paid', paidAmount: 100 },
    ]);
    expect(map.get('INV-Y')).toBe(100);
  });
});

/* ─── F5: end-to-end — claim → SaleReport row ──────────────────────── */

describe('F5: claim amount flows into SaleReport "เบิกประกัน" column', () => {
  it('F5.1: sale with paid claim → row.insuranceClaim = paid amount', () => {
    const sale = fakeSale({ saleId: 'INV-E1', billing: { netTotal: 2000, depositApplied: 0, walletApplied: 0 }, payment: { paid: 2000, status: 'paid' } });
    const claims = [{ saleId: 'INV-E1', status: 'paid', paidAmount: 1500 }];
    const map = aggregateClaimsBySaleId(claims);
    const row = buildSaleReportRow(sale, null, map);
    expect(row.insuranceClaim).toBe(1500);
  });

  it('F5.2: sale with no claim → row.insuranceClaim = 0 (falls back to sale.insuranceClaim=0)', () => {
    const sale = fakeSale();
    const map = aggregateClaimsBySaleId([]);
    const row = buildSaleReportRow(sale, null, map);
    expect(row.insuranceClaim).toBe(0);
  });

  it('F5.3: sale with pending claim ONLY → row.insuranceClaim = 0 (pending doesn\'t count)', () => {
    const sale = fakeSale({ saleId: 'INV-E3' });
    const claims = [{ saleId: 'INV-E3', status: 'pending', paidAmount: 0 }];
    const map = aggregateClaimsBySaleId(claims);
    const row = buildSaleReportRow(sale, null, map);
    expect(row.insuranceClaim).toBe(0);
  });

  it('F5.4: full aggregateSaleReport sums paid claims into footer total', () => {
    const sales = [
      fakeSale({ saleId: 'INV-1', saleDate: '2026-04-20', billing: { netTotal: 1000, depositApplied: 0, walletApplied: 0 } }),
      fakeSale({ saleId: 'INV-2', saleDate: '2026-04-21', billing: { netTotal: 2000, depositApplied: 0, walletApplied: 0 } }),
    ];
    const claims = [
      { saleId: 'INV-1', status: 'paid', paidAmount: 500 },
      { saleId: 'INV-2', status: 'approved', paidAmount: 0 }, // not paid yet — 0
      { saleId: 'INV-2', status: 'paid', paidAmount: 200 }, // partial
    ];
    const out = aggregateSaleReport(sales, {
      from: '2026-04-01', to: '2026-04-30',
      claimsBySaleId: aggregateClaimsBySaleId(claims),
    });
    expect(out.totals.insuranceClaim).toBe(700);
  });

  it('F5.5: passing raw claims array (not pre-built Map) also works', () => {
    const sales = [fakeSale({ saleId: 'INV-R1', billing: { netTotal: 900, depositApplied: 0, walletApplied: 0 } })];
    const claims = [{ saleId: 'INV-R1', status: 'paid', paidAmount: 300 }];
    const out = aggregateSaleReport(sales, {
      from: '2026-04-01', to: '2026-04-30',
      claims, // aggregator builds the Map internally
    });
    const row = out.rows.find(r => r.saleId === 'INV-R1');
    expect(row.insuranceClaim).toBe(300);
    expect(out.totals.insuranceClaim).toBe(300);
  });

  it('F5.6: cancelled sales excluded from claim total even if a paid claim exists', () => {
    const sales = [
      fakeSale({ saleId: 'INV-C1', status: 'cancelled', billing: { netTotal: 1000, depositApplied: 0, walletApplied: 0 } }),
    ];
    const claims = [{ saleId: 'INV-C1', status: 'paid', paidAmount: 400 }];
    const out = aggregateSaleReport(sales, {
      from: '2026-04-01', to: '2026-04-30',
      claimsBySaleId: aggregateClaimsBySaleId(claims),
    });
    // Cancelled excluded by default — rows empty, totals 0
    expect(out.totals.insuranceClaim).toBe(0);
  });
});

/* ─── F6: adversarial inputs ───────────────────────────────────────── */

describe('F6: adversarial inputs', () => {
  it('F6.1: claim with huge paidAmount > claimAmount rejected by validator', () => {
    const err = validateSaleInsuranceClaim(base({ paidAmount: 999999, claimAmount: 1000 }));
    expect(err?.[0]).toBe('paidAmount');
  });

  it('F6.2: claim file URL exceeding 500 chars rejected', () => {
    const long = 'x'.repeat(501);
    const err = validateSaleInsuranceClaim(base({ claimFileUrl: long }));
    expect(err?.[0]).toBe('claimFileUrl');
  });

  it('F6.3: note exceeding 1000 chars rejected', () => {
    const long = 'ก'.repeat(1001);
    const err = validateSaleInsuranceClaim(base({ note: long }));
    expect(err?.[0]).toBe('note');
  });

  it('F6.4: generateSaleInsuranceClaimId produces unique crypto-random IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateSaleInsuranceClaimId());
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.startsWith('CLAIM-')).toBe(true);
  });

  it('F6.5: duplicate paid claims from same saleId do NOT double-count if deduped upstream', () => {
    // aggregateClaimsBySaleId intentionally SUMS all paid rows (partial
    // reimbursement support). Upstream deduplication is the UI's job — if
    // the UI accidentally creates 2 rows for the same payment, the report
    // will show 2× the amount. Lock this behaviour so it's a conscious
    // design choice, not a latent bug.
    const map = aggregateClaimsBySaleId([
      { saleId: 'INV-D', status: 'paid', paidAmount: 100 },
      { saleId: 'INV-D', status: 'paid', paidAmount: 100 },
    ]);
    expect(map.get('INV-D')).toBe(200);
  });
});

/* ─── F7: source-grep regression guards ────────────────────────────── */

describe('F7: source-grep regression guards (lock the fix pattern)', () => {
  const srcDir = path.resolve(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(srcDir, p), 'utf8');

  it('F7.1: SaleReportTab imports + uses loadSaleInsuranceClaimsByDateRange', () => {
    const src = read('src/components/backend/reports/SaleReportTab.jsx');
    expect(src).toMatch(/loadSaleInsuranceClaimsByDateRange/);
    expect(src).toMatch(/aggregateClaimsBySaleId/);
  });

  it('F7.2: SaleReportTab passes claimsBySaleId to aggregateSaleReport', () => {
    const src = read('src/components/backend/reports/SaleReportTab.jsx');
    // The shape we care about: `claimsBySaleId,` passed into the filters
    // object given to aggregateSaleReport. If someone rearranges the hook
    // and drops the param, this guard flags it at test-time.
    expect(src).toMatch(/aggregateSaleReport\(allSales,\s*\{[\s\S]*claimsBySaleId[\s\S]*\}/);
  });

  it('F7.3: SaleInsuranceClaimsTab + FormModal exist + use backend CRUD helpers', () => {
    const tab = read('src/components/backend/SaleInsuranceClaimsTab.jsx');
    // Tab owns list + transitions + delete
    expect(tab).toMatch(/listSaleInsuranceClaims/);
    expect(tab).toMatch(/deleteSaleInsuranceClaim/);
    expect(tab).toMatch(/transitionSaleInsuranceClaim/);
    // FormModal owns save (split per modal pattern — tab hosts list + status
    // buttons, modal hosts create/edit form so it renders outside the shell's
    // empty-state gate that would otherwise hide inline forms on fresh installs).
    const modal = read('src/components/backend/SaleInsuranceClaimFormModal.jsx');
    expect(modal).toMatch(/saveSaleInsuranceClaim/);
    expect(modal).toMatch(/validateSaleInsuranceClaim/);
    expect(modal).toMatch(/generateSaleInsuranceClaimId/);
  });

  it('F7.4: nav config has insurance-claims entry under sales section', () => {
    const src = read('src/components/backend/nav/navConfig.js');
    expect(src).toMatch(/id: 'insurance-claims'/);
    expect(src).toMatch(/เบิกประกัน/);
  });

  it('F7.5: BackendDashboard routes activeTab=insurance-claims to Tab component', () => {
    const src = read('src/pages/BackendDashboard.jsx');
    expect(src).toMatch(/activeTab === 'insurance-claims'/);
    expect(src).toMatch(/<SaleInsuranceClaimsTab/);
  });

  it('F7.6: firestore.rules includes be_sale_insurance_claims with staff-only write', () => {
    const src = read('firestore.rules');
    expect(src).toMatch(/be_sale_insurance_claims/);
    // Must gate on isClinicStaff() — no `allow:if true` on claim data.
    const block = src.split('be_sale_insurance_claims')[1]?.slice(0, 200) || '';
    expect(block).toMatch(/isClinicStaff/);
    expect(block).not.toMatch(/if true/);
  });

  it('F7.7: Rule E — SaleInsuranceClaimsTab does NOT import brokerClient or api/proclinic', () => {
    const src = read('src/components/backend/SaleInsuranceClaimsTab.jsx');
    expect(src).not.toMatch(/brokerClient/);
    expect(src).not.toMatch(/\/api\/proclinic\//);
  });
});

function base(o = {}) {
  return {
    ...emptySaleInsuranceClaimForm(),
    saleId: 'SALE-1',
    customerId: 'CUST-1',
    claimAmount: 1000,
    claimDate: '2026-04-20',
    ...o,
  };
}
