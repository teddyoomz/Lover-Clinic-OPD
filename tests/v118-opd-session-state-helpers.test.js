// V118 (2026-05-23) — unit + adversarial tests for OPD state helpers.
//
// Locks the 4 canonical functions in `src/lib/opdSessionState.js` (AV118).
// Helper-output tests only — full-flow simulate lives in
// `v118-card-opd-lifecycle-row-flow-simulate.test.jsx`.

import { describe, expect, it } from 'vitest';
import {
  isOpdSessionSaved,
  hasPatientData,
  resolveCardOpdState,
  synthesizeSessionFromCustomer,
} from '../src/lib/opdSessionState.js';

describe('V118 — isOpdSessionSaved', () => {
  it('U1.1 — true when opdRecordedAt + brokerStatus="done"', () => {
    expect(isOpdSessionSaved({ opdRecordedAt: new Date(), brokerStatus: 'done' })).toBe(true);
  });
  it('U1.2 — false when missing opdRecordedAt', () => {
    expect(isOpdSessionSaved({ brokerStatus: 'done' })).toBe(false);
  });
  it('U1.3 — false when brokerStatus is not "done" (pending)', () => {
    expect(isOpdSessionSaved({ opdRecordedAt: new Date(), brokerStatus: 'pending' })).toBe(false);
  });
  it('U1.4 — false when brokerStatus is "failed"', () => {
    expect(isOpdSessionSaved({ opdRecordedAt: new Date(), brokerStatus: 'failed' })).toBe(false);
  });
  it('U1.5 — false on null', () => {
    expect(isOpdSessionSaved(null)).toBe(false);
  });
  it('U1.6 — false on undefined', () => {
    expect(isOpdSessionSaved(undefined)).toBe(false);
  });
  it('U1.7 — false on non-object input (adversarial)', () => {
    expect(isOpdSessionSaved('string')).toBe(false);
    expect(isOpdSessionSaved(42)).toBe(false);
  });
  it('U1.8 — false on array (adversarial)', () => {
    expect(isOpdSessionSaved([])).toBe(false);
  });
});

describe('V118 — hasPatientData', () => {
  it('U2.1 — true when patientData has keys', () => {
    expect(hasPatientData({ patientData: { firstName: 'A' } })).toBe(true);
  });
  it('U2.2 — false when patientData is empty object', () => {
    expect(hasPatientData({ patientData: {} })).toBe(false);
  });
  it('U2.3 — false when patientData missing', () => {
    expect(hasPatientData({})).toBe(false);
  });
  it('U2.4 — false on null/undefined session', () => {
    expect(hasPatientData(null)).toBe(false);
    expect(hasPatientData(undefined)).toBe(false);
  });
  it('U2.5 — false when patientData is null', () => {
    expect(hasPatientData({ patientData: null })).toBe(false);
  });
  it('U2.6 — false when patientData is non-object (adversarial)', () => {
    expect(hasPatientData({ patientData: 'string' })).toBe(false);
    expect(hasPatientData({ patientData: 42 })).toBe(false);
  });
});

describe('V118 — resolveCardOpdState', () => {
  it('U3.1 — A: appt has customerId', () => {
    expect(resolveCardOpdState({ appt: { customerId: 'CUST-1' }, linkedSession: null })).toBe('A');
  });
  it('U3.2 — A: appt has customerId even if linkedSession also exists (precedence)', () => {
    expect(resolveCardOpdState({
      appt: { customerId: 'CUST-1', linkedOpdSessionId: 'S-1' },
      linkedSession: { opdRecordedAt: new Date(), brokerStatus: 'done', patientData: { firstName: 'X' } },
    })).toBe('A');
  });
  it('U3.3 — B: no customerId, no linkedOpdSessionId', () => {
    expect(resolveCardOpdState({ appt: { customerNameTemp: 'X' }, linkedSession: null })).toBe('B');
  });
  it('U3.4 — C: linkedOpdSessionId stamped, session not yet resolved (null lazy state)', () => {
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: null,
    })).toBe('C');
  });
  it('U3.5 — C: session exists but patientData is empty object', () => {
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: { id: 'S-1', patientData: {} },
    })).toBe('C');
  });
  it('U3.6 — D: patientData filled, not saved', () => {
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: { id: 'S-1', patientData: { firstName: 'A' } },
    })).toBe('D');
  });
  it('U3.7 — D: patientData filled, opdRecordedAt set but brokerStatus pending (not yet done)', () => {
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: { id: 'S-1', patientData: { firstName: 'A' }, opdRecordedAt: new Date(), brokerStatus: 'pending' },
    })).toBe('D');
  });
  it('U3.8 — E: saved (transient — listener will stamp customerId on next tick)', () => {
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: { id: 'S-1', patientData: { firstName: 'A' }, opdRecordedAt: new Date(), brokerStatus: 'done' },
    })).toBe('E');
  });
  it('U3.9 — B fallback on null appt', () => {
    expect(resolveCardOpdState({ appt: null, linkedSession: null })).toBe('B');
  });
});

describe('V118 — synthesizeSessionFromCustomer', () => {
  it('U4.1 — synthesizes session with __synthetic flag', () => {
    const synth = synthesizeSessionFromCustomer(
      { id: 'CUST-1', patientData: { firstName: 'A' }, proClinicHN: 'LC-001', createdAt: new Date() },
      { id: 'APPT-1' },
    );
    expect(synth.__synthetic).toBe(true);
    expect(synth.brokerStatus).toBe('done');
    expect(synth.patientData.firstName).toBe('A');
    expect(synth.brokerProClinicHN).toBe('LC-001');
    expect(synth.customerId).toBe('CUST-1');
  });
  it('U4.2 — null on null customer', () => {
    expect(synthesizeSessionFromCustomer(null, { id: 'APPT-1' })).toBeNull();
  });
  it('U4.3 — null on non-object customer (adversarial)', () => {
    expect(synthesizeSessionFromCustomer('string', { id: 'APPT-1' })).toBeNull();
    expect(synthesizeSessionFromCustomer(42, { id: 'APPT-1' })).toBeNull();
  });
  it('U4.4 — empty patientData if customer.patientData missing', () => {
    const synth = synthesizeSessionFromCustomer({ id: 'CUST-1' }, { id: 'APPT-1' });
    expect(synth.patientData).toEqual({});
  });
  it('U4.5 — deterministic id from customer+appt ids (stable across calls)', () => {
    const s1 = synthesizeSessionFromCustomer({ id: 'CUST-1' }, { id: 'APPT-1' });
    const s2 = synthesizeSessionFromCustomer({ id: 'CUST-1' }, { id: 'APPT-1' });
    expect(s1.id).toBe(s2.id);
    expect(s1.id).toMatch(/^synth-CUST-1-APPT-1$/);
  });
  it('U4.6 — falls back to proClinicId then HN when proClinicHN missing', () => {
    const synth = synthesizeSessionFromCustomer(
      { id: 'CUST-1', HN: 'HN-002' },
      { id: 'APPT-1' },
    );
    expect(synth.brokerProClinicHN).toBe('HN-002');
  });
  it('U4.7 — handles missing appt gracefully', () => {
    const synth = synthesizeSessionFromCustomer({ id: 'CUST-1' }, null);
    expect(synth).not.toBeNull();
    expect(synth.id).toMatch(/synth-CUST-1-noappt/);
  });
});
