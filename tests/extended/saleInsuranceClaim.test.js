// ─── Phase 12.7 · insurance-claim validator + aggregator wiring ───────────
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  validateSaleInsuranceClaim, normalizeSaleInsuranceClaim,
  emptySaleInsuranceClaimForm, generateSaleInsuranceClaimId,
  applyClaimStatusTransition, aggregateClaimsBySaleId,
  STATUS_OPTIONS, TRANSITIONS,
} from '../src/lib/saleInsuranceClaimValidation.js';
import { aggregateSaleReport } from '../src/lib/saleReportAggregator.js';

const base = (o = {}) => ({
  ...emptySaleInsuranceClaimForm(),
  saleId: 'SALE-1',
  customerId: 'CUST-1',
  claimAmount: 1000,
  claimDate: '2026-04-20',
  ...o,
});

describe('validateSaleInsuranceClaim', () => {
  it('SC1: null rejected', () => expect(validateSaleInsuranceClaim(null)?.[0]).toBe('form'));
  it('SC2: missing saleId rejected', () => expect(validateSaleInsuranceClaim({ ...base(), saleId: '' })?.[0]).toBe('saleId'));
  it('SC3: missing customerId rejected', () => expect(validateSaleInsuranceClaim({ ...base(), customerId: '' })?.[0]).toBe('customerId'));
  it('SC4: NaN claimAmount rejected', () => expect(validateSaleInsuranceClaim({ ...base(), claimAmount: 'abc' })?.[0]).toBe('claimAmount'));
  it('SC5: negative claimAmount rejected', () => expect(validateSaleInsuranceClaim({ ...base(), claimAmount: -1 })?.[0]).toBe('claimAmount'));
  it('SC6: strict requires claimAmount > 0', () => expect(validateSaleInsuranceClaim({ ...base(), claimAmount: 0 }, { strict: true })?.[0]).toBe('claimAmount'));
  it('SC7: strict requires claimDate', () => expect(validateSaleInsuranceClaim({ ...base(), claimDate: '' }, { strict: true })?.[0]).toBe('claimDate'));
  it('SC8: malformed claimDate rejected', () => expect(validateSaleInsuranceClaim({ ...base(), claimDate: '04/20/2026' })?.[0]).toBe('claimDate'));
  it('SC9: paidAmount > claimAmount rejected', () => expect(validateSaleInsuranceClaim({ ...base(), paidAmount: 2000 })?.[0]).toBe('paidAmount'));
  it('SC10: negative paidAmount rejected', () => expect(validateSaleInsuranceClaim({ ...base(), paidAmount: -10 })?.[0]).toBe('paidAmount'));
  it('SC11: status=paid requires paidAmount > 0', () => expect(validateSaleInsuranceClaim({ ...base(), status: 'paid', paidAmount: 0 })?.[0]).toBe('paidAmount'));
  it('SC12: valid paid claim accepted', () => expect(validateSaleInsuranceClaim({ ...base(), status: 'paid', paidAmount: 800 })).toBeNull());
  it('SC13: each status accepted', () => {
    for (const s of STATUS_OPTIONS) {
      const f = s === 'paid' ? { ...base(), status: s, paidAmount: 500 } : { ...base(), status: s };
      expect(validateSaleInsuranceClaim(f)).toBeNull();
    }
  });
  it('SC14: unknown status rejected', () => expect(validateSaleInsuranceClaim({ ...base(), status: 'weird' })?.[0]).toBe('status'));
  it('SC15: minimal non-strict valid', () => expect(validateSaleInsuranceClaim(base())).toBeNull());
});

describe('applyClaimStatusTransition', () => {
  it('TR1: pending → approved OK', () => expect(applyClaimStatusTransition('pending', 'approved')).toBe('approved'));
  it('TR2: pending → rejected OK', () => expect(applyClaimStatusTransition('pending', 'rejected')).toBe('rejected'));
  it('TR3: approved → paid OK', () => expect(applyClaimStatusTransition('approved', 'paid')).toBe('paid'));
  it('TR4: approved → rejected OK', () => expect(applyClaimStatusTransition('approved', 'rejected')).toBe('rejected'));
  it('TR5: pending → paid BLOCKED (must approve first)', () => expect(() => applyClaimStatusTransition('pending', 'paid')).toThrow());
  it('TR6: paid → approved BLOCKED (terminal)', () => expect(() => applyClaimStatusTransition('paid', 'approved')).toThrow());
  it('TR7: rejected → approved BLOCKED (terminal)', () => expect(() => applyClaimStatusTransition('rejected', 'approved')).toThrow());
  it('TR8: idempotent same-state', () => expect(applyClaimStatusTransition('paid', 'paid')).toBe('paid'));
  it('TR9: TRANSITIONS deeply frozen', () => expect(() => TRANSITIONS.pending.push('paid')).toThrow());
});

describe('normalizeSaleInsuranceClaim + aggregateClaimsBySaleId', () => {
  it('NC1: coerces claimAmount + paidAmount strings', () => {
    const n = normalizeSaleInsuranceClaim({ ...base(), claimAmount: '1500', paidAmount: '1200' });
    expect(n.claimAmount).toBe(1500);
    expect(n.paidAmount).toBe(1200);
  });
  it('NC2: trims strings', () => {
    const n = normalizeSaleInsuranceClaim({ ...base(), insuranceCompany: '  AIA  ' });
    expect(n.insuranceCompany).toBe('AIA');
  });
  it('NC3: invalid status → pending', () => {
    expect(normalizeSaleInsuranceClaim({ ...base(), status: 'weird' }).status).toBe('pending');
  });
  it('AG1: aggregateClaimsBySaleId ignores non-paid', () => {
    const m = aggregateClaimsBySaleId([
      { saleId: 'S1', status: 'pending', paidAmount: 500 },
      { saleId: 'S1', status: 'paid', paidAmount: 800 },
      { saleId: 'S1', status: 'rejected', paidAmount: 0 },
    ]);
    expect(m.get('S1')).toBe(800);
  });
  it('AG2: sums multiple paid claims per saleId', () => {
    const m = aggregateClaimsBySaleId([
      { saleId: 'S1', status: 'paid', paidAmount: 500 },
      { saleId: 'S1', status: 'paid', paidAmount: 300 },
      { saleId: 'S2', status: 'paid', paidAmount: 200 },
    ]);
    expect(m.get('S1')).toBe(800);
    expect(m.get('S2')).toBe(200);
  });
  it('AG3: empty/null input → empty map', () => {
    expect(aggregateClaimsBySaleId(null).size).toBe(0);
    expect(aggregateClaimsBySaleId([]).size).toBe(0);
  });
  it('AG4: generateSaleInsuranceClaimId prefix', () => {
    expect(generateSaleInsuranceClaimId()).toMatch(/^CLAIM-/);
  });
});

describe('Phase 12.7 — saleReportAggregator uses claimsBySaleId', () => {
  const makeSale = (saleId, net, paid = 0) => ({
    saleId, id: saleId, saleDate: '2026-04-20',
    status: 'completed',
    billing: { netTotal: net },
    payment: { status: 'paid', channels: [{ amount: paid || net }] },
  });

  it('SR1: without claimsBySaleId, insuranceClaim = 0 (backwards-compat)', () => {
    const result = aggregateSaleReport([makeSale('S1', 1000)]);
    expect(result.rows[0].insuranceClaim).toBe(0);
    expect(result.totals.insuranceClaim).toBe(0);
  });

  it('SR2: with claims, paid claim populates insuranceClaim col', () => {
    const claims = [{ saleId: 'S1', status: 'paid', paidAmount: 800 }];
    const result = aggregateSaleReport([makeSale('S1', 1000)], { claims });
    expect(result.rows[0].insuranceClaim).toBe(800);
    expect(result.totals.insuranceClaim).toBe(800);
  });

  it('SR3: multiple paid claims on same sale sum together', () => {
    const claims = [
      { saleId: 'S1', status: 'paid', paidAmount: 500 },
      { saleId: 'S1', status: 'paid', paidAmount: 300 },
    ];
    const result = aggregateSaleReport([makeSale('S1', 1000)], { claims });
    expect(result.rows[0].insuranceClaim).toBe(800);
  });

  it('SR4: pending/approved claims do NOT count', () => {
    const claims = [
      { saleId: 'S1', status: 'pending', paidAmount: 500 },
      { saleId: 'S1', status: 'approved', paidAmount: 400 },
    ];
    const result = aggregateSaleReport([makeSale('S1', 1000)], { claims });
    expect(result.rows[0].insuranceClaim).toBe(0);
  });

  it('SR5: falls back to sale.insuranceClaim when no claims provided', () => {
    const sale = makeSale('S1', 1000);
    sale.insuranceClaim = 750;
    const result = aggregateSaleReport([sale]);
    expect(result.rows[0].insuranceClaim).toBe(750);
  });

  it('SR6: explicit claimsBySaleId map overrides sale.insuranceClaim', () => {
    const sale = makeSale('S1', 1000);
    sale.insuranceClaim = 750;
    const claimsBySaleId = new Map([['S1', 900]]);
    const result = aggregateSaleReport([sale], { claimsBySaleId });
    expect(result.rows[0].insuranceClaim).toBe(900);
  });
});

describe('Phase 12.7 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;
  it('RE1: validator clean', () => {
    const src = fs.readFileSync('src/lib/saleInsuranceClaimValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
});
