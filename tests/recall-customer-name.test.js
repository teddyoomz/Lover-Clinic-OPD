// Task B1 — recall name overlay (pure). The hook is exercised by RTL/flow-sim.
import { describe, it, expect } from 'vitest';
import { collectRecallCustomerIds, overlayRecallNames } from '../src/lib/recallCustomerName.js';

describe('B1 collectRecallCustomerIds', () => {
  it('returns unique non-empty ids', () => {
    expect(collectRecallCustomerIds([
      { customerId: 'LC-1' }, { customerId: 'LC-1' }, { customerId: '' }, { customerId: 'LC-2' }, {},
    ])).toEqual(['LC-1', 'LC-2']);
  });
  it('handles null/non-array', () => {
    expect(collectRecallCustomerIds(null)).toEqual([]);
    expect(collectRecallCustomerIds(undefined)).toEqual([]);
  });
});

describe('B1 overlayRecallNames', () => {
  // kiosk-shape customer: name lives in patientData, top-level empty (the bug).
  const kiosk = { patientData: { prefix: 'นางสาว', firstNameTh: 'แพรพร', lastNameTh: 'พรแพร' }, firstname: '', lastname: '' };
  it('resolves a kiosk-shape name onto an empty recall.customerName', () => {
    const out = overlayRecallNames([{ customerId: 'LC-1', customerName: '' }], { 'LC-1': kiosk });
    expect(out[0].customerName).toBe('นางสาว แพรพร พรแพร');
  });
  it('keeps the existing snapshot when the customer is not loaded', () => {
    const out = overlayRecallNames([{ customerId: 'LC-9', customerName: 'snapshot' }], {});
    expect(out[0].customerName).toBe('snapshot');
  });
  it('keeps the existing snapshot when the customer has no resolvable name', () => {
    const out = overlayRecallNames([{ customerId: 'LC-1', customerName: 'old' }], { 'LC-1': { patientData: {}, firstname: '', lastname: '' } });
    expect(out[0].customerName).toBe('old');
  });
  it('passes through recalls with no customerId', () => {
    const r = { customerName: 'x' };
    expect(overlayRecallNames([r], { 'LC-1': kiosk })[0]).toBe(r);
  });
  it('returns the SAME object reference when the resolved name equals the snapshot (no churn)', () => {
    const r = { customerId: 'LC-1', customerName: 'นางสาว แพรพร พรแพร' };
    expect(overlayRecallNames([r], { 'LC-1': kiosk })[0]).toBe(r);
  });
  it('non-array input → []', () => {
    expect(overlayRecallNames(null, {})).toEqual([]);
  });
});
