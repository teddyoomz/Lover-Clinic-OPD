// V118 (2026-05-23) — Rule I full-flow simulate.
//
// Chains the 5-state transition machine B → C → D → E → A using the pure
// state-derivation helper. Does NOT mount real Firestore — simulates the
// appt/session shape mutations that would happen across a real lifecycle.
//
// Pairs with the RTL tests (component-level coverage) + source-grep
// (regression locks) for full V118 coverage per Rule I item (a).

import { describe, expect, it } from 'vitest';
import { resolveCardOpdState, isOpdSessionSaved, hasPatientData, synthesizeSessionFromCustomer } from '../src/lib/opdSessionState.js';

describe('V118 — Full-flow simulate (Rule I)', () => {
  it('F1.1 — B→C transition: provision stamps linkedOpdSessionId', () => {
    let appt = { id: 'A-1', customerNameTemp: 'X' };
    let session = null;
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('B');

    // Admin clicks 🔵 ส่งลิ้งค์ → provisionOpdLinkForBookingPair simulated
    appt = { ...appt, linkedOpdSessionId: 'S-1' };
    session = { id: 'S-1', patientData: {} };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('C');
  });

  it('F1.2 — C→D transition: customer submits PatientForm via remote link', () => {
    const appt = { id: 'A-1', linkedOpdSessionId: 'S-1' };
    let session = { id: 'S-1', patientData: {} };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('C');

    // Customer fills via remote link → patientData populates
    session = { id: 'S-1', patientData: { firstName: 'John', lastName: 'Doe' } };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('D');
  });

  it('F1.3 — D→E transition: admin clicks 🔴 → handleOpdClick fires', () => {
    let appt = { id: 'A-1', linkedOpdSessionId: 'S-1' };
    let session = { id: 'S-1', patientData: { firstName: 'John' } };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('D');

    // handleOpdClick mutates session — stamps opdRecordedAt + brokerStatus
    session = { ...session, opdRecordedAt: new Date(), brokerStatus: 'done' };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('E');
  });

  it('F1.4 — E→A transition: listener fires with customerId stamped on appt', () => {
    let appt = { id: 'A-1', linkedOpdSessionId: 'S-1' };
    const session = { id: 'S-1', patientData: { firstName: 'John' }, opdRecordedAt: new Date(), brokerStatus: 'done' };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('E');

    // attachCustomerToOpdSessionLinks stamps customerId on appt
    appt = { ...appt, customerId: 'CUST-NEW' };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('A');
  });

  it('F2.1 — Full B→A lifecycle chain in single test', () => {
    const states = [];

    // Stage 1: appointment created, no link
    let appt = { id: 'A-1', customerNameTemp: 'Test User' };
    let session = null;
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // B

    // Stage 2: admin sends QR link
    appt = { ...appt, linkedOpdSessionId: 'S-1' };
    session = { id: 'S-1', patientData: {} };
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // C

    // Stage 3: customer fills the PatientForm
    session = { id: 'S-1', patientData: { firstName: 'A', lastName: 'B' } };
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // D

    // Stage 3.5 (optional review): admin clicks 🟢 ดูข้อมูล - state UNCHANGED
    // (predicates depend on data, not UI clicks). Still D.
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // D

    // Stage 4: admin clicks 🔴 บันทึก → handleOpdClick stamps session
    session = { ...session, opdRecordedAt: new Date(), brokerStatus: 'done' };
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // E

    // Stage 5: listener catches up, appt.customerId stamps
    appt = { ...appt, customerId: 'CUST-NEW' };
    states.push(resolveCardOpdState({ appt, linkedSession: session })); // A

    expect(states).toEqual(['B', 'C', 'D', 'D', 'E', 'A']);
  });

  it('F3.1 — Cancelled appt: predicate still returns "B" (HubView is what hides)', () => {
    const appt = { id: 'A-1', status: 'cancelled', customerNameTemp: 'X' };
    // The HubView gates rendering on activeTab === 'cancelled', not the appt
    // status — but the predicate logic itself returns 'B' for an unattached
    // appt (regardless of cancellation). HubView is the one that hides the row.
    expect(resolveCardOpdState({ appt, linkedSession: null })).toBe('B');
  });

  it('F4.1 — Cross-helper consistency: D state implies hasPatientData true + isOpdSessionSaved false', () => {
    const session = { id: 'S-1', patientData: { firstName: 'A' } };
    expect(hasPatientData(session)).toBe(true);
    expect(isOpdSessionSaved(session)).toBe(false);
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: session,
    })).toBe('D');
  });

  it('F4.2 — Cross-helper consistency: E state implies hasPatientData true + isOpdSessionSaved true', () => {
    const session = { id: 'S-1', patientData: { firstName: 'A' }, opdRecordedAt: new Date(), brokerStatus: 'done' };
    expect(hasPatientData(session)).toBe(true);
    expect(isOpdSessionSaved(session)).toBe(true);
    expect(resolveCardOpdState({
      appt: { linkedOpdSessionId: 'S-1' },
      linkedSession: session,
    })).toBe('E');
  });

  it('F5.1 — Synth session is treated as saved (downstream consumers see it as State-A data)', () => {
    const customer = { id: 'CUST-1', patientData: { firstName: 'X' }, createdAt: new Date(), proClinicHN: 'LC-001' };
    const appt = { id: 'APPT-1', customerId: 'CUST-1' };
    const synth = synthesizeSessionFromCustomer(customer, appt);
    expect(synth.__synthetic).toBe(true);
    expect(isOpdSessionSaved(synth)).toBe(true);
    expect(hasPatientData(synth)).toBe(true);
    // appt.customerId precedence → State A regardless of session shape
    expect(resolveCardOpdState({ appt, linkedSession: synth })).toBe('A');
  });

  it('F6.1 — Lazy fetch race: linkedOpdSessionId stamped but session null (mid-fetch) → State C (wait)', () => {
    // Real scenario: ก่อนหน้า sub-tab loads card from past month;
    // resolveLinkedSession fires getDoc; first render = null.
    const appt = { id: 'A-1', linkedOpdSessionId: 'S-PAST' };
    expect(resolveCardOpdState({ appt, linkedSession: null })).toBe('C');

    // Fetch resolves with filled data → next render = D
    const session = { id: 'S-PAST', patientData: { firstName: 'A' } };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('D');
  });

  it('F7.1 — Adversarial: appt with customerId AND filled patientData session AND saved → A wins', () => {
    // customerId precedence: once the appt has customerId, ALWAYS State A
    // (regardless of how the linked session looks). The customer is already
    // saved in be_customers — the linked session is now historical reference.
    const appt = { id: 'A-1', customerId: 'CUST-1', linkedOpdSessionId: 'S-1' };
    const session = { id: 'S-1', patientData: { firstName: 'A' }, opdRecordedAt: new Date(), brokerStatus: 'done' };
    expect(resolveCardOpdState({ appt, linkedSession: session })).toBe('A');
  });

  it('F7.2 — Adversarial: appt has linkedOpdSessionId but session lookup returns null FOREVER (orphan)', () => {
    // Edge: linked session was deleted but appt still references it.
    // Predicate returns C (wait) — UX: disabled "รอลูกค้ากรอก" pill until
    // admin manually re-sends link or deletes/cancels the appt.
    const appt = { id: 'A-1', linkedOpdSessionId: 'S-DELETED' };
    expect(resolveCardOpdState({ appt, linkedSession: null })).toBe('C');
  });
});
