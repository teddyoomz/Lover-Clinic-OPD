// AV198 — Rule I full-flow simulate: build (functions) → the doc the per-branch
// listener receives → resolve (client) → the pending→registered flip. Chains the
// REAL pure pieces (no React). Firebase mocked so the resolve module imports.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: () => ({}), onSnapshot: () => () => {},
  collection: () => ({}), query: () => ({}), where: () => ({}),
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: vi.fn() }));

import { buildStaffChatNotification, writeStaffChatNotification } from '../functions/staffChatNotify.js';
import { pickSystemCardCustomerId } from '../src/lib/staffChatNotifyResolve.js';

describe('staff-chat system-notify flow-simulate', () => {
  it('F1 follow-up: build → card → resolves to the linkedCustomerId immediately', () => {
    const card = buildStaffChatNotification({
      kind: 'followup', sessionId: 'S1', branchId: 'BR1',
      session: { linkedCustomerId: 'LC-9' }, customer: { firstname: 'แพร', lastname: 'พร', hn_no: 'LC-26000079' },
      idFactory: () => 'CHAT-1',
    });
    // the listener delivers `card` verbatim (admin SDK setDoc → client snapshot)
    expect(pickSystemCardCustomerId(card, null)).toBe('LC-9');
  });

  it('F2 intake: pending (no session broker) → flips to brokerProClinicId after registration', () => {
    const card = buildStaffChatNotification({
      kind: 'intake', sessionId: 'S2', branchId: 'BR1',
      session: { patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } }, customer: null, idFactory: () => 'CHAT-2',
    });
    expect(card.system.customerId).toBeNull();
    expect(pickSystemCardCustomerId(card, { exists: true }, null)).toBeNull();          // before registration
    expect(pickSystemCardCustomerId(card, { brokerProClinicId: 'LC-180' }, null)).toBe('LC-180'); // after handleOpdClick (kiosk/queue)
  });

  it('F7 intake booking-flow: session DELETED on save → flips via the LINKED APPOINTMENT customerId', () => {
    // Prod bug 2026-06-21 (นาย ปรัชญา / LC-26000176): handleOpdClick for a
    // booking-flow session stamps appt.customerId (keyed by linkedOpdSessionId)
    // + hard-deletes the opd_session — so brokerProClinicId is NEVER set + the
    // session is gone. The durable resolve signal is the appointment.
    const card = buildStaffChatNotification({
      kind: 'intake', sessionId: 'BL-1782029621467', branchId: 'BR1',
      session: { patientData: { prefix: 'นาย', firstName: 'ปรัชญา', lastName: 'มนเทียรอาสน์' } }, customer: null, idFactory: () => 'CHAT-7',
    });
    expect(card.system.customerId).toBeNull();
    expect(pickSystemCardCustomerId(card, null, null)).toBeNull();                       // session gone, appt not yet stamped
    expect(pickSystemCardCustomerId(card, null, { customerId: 'LC-26000176' })).toBe('LC-26000176'); // appt stamped → FLIP
  });

  it('F3 edit is never carded (caller guard: !session.updatedAt)', () => {
    const shouldCard = (session) => !session.updatedAt; // mirror of functions/index.js guard (source-locked in AV198)
    expect(shouldCard({ submittedAt: 'x' })).toBe(true);   // fresh intake/follow-up → card
    expect(shouldCard({ updatedAt: 'x' })).toBe(false);    // edit → push only, no card
  });

  it('F4 writer skips (returns false) when there is no branchId — never touches the db', async () => {
    const fakeDb = { doc: () => { throw new Error('writer must not write without a branch'); } };
    const FV = { serverTimestamp: () => 'TS' };
    expect(await writeStaffChatNotification(fakeDb, 'BASE', FV, { id: 'x', branchId: '' })).toBe(false);
    expect(await writeStaffChatNotification(fakeDb, 'BASE', FV, null)).toBe(false);
  });

  it('F5 writer stamps createdAt + writes at the canonical be_staff_chat_messages path', async () => {
    let writtenPath = null; let writtenDoc = null;
    const fakeDb = { doc: (p) => ({ set: async (d) => { writtenPath = p; writtenDoc = d; } }) };
    const FV = { serverTimestamp: () => 'SERVER_TS' };
    const ok = await writeStaffChatNotification(fakeDb, 'artifacts/APP/public/data', FV, { id: 'CHAT-9', branchId: 'BR1', system: {} });
    expect(ok).toBe(true);
    expect(writtenPath).toBe('artifacts/APP/public/data/be_staff_chat_messages/CHAT-9');
    expect(writtenDoc.createdAt).toBe('SERVER_TS');
    expect(writtenDoc.branchId).toBe('BR1');
  });

  it('F6 adversarial — missing patientData / customer / Thai+emoji names still build a valid card', () => {
    const c1 = buildStaffChatNotification({ kind: 'intake', sessionId: 'S', branchId: 'BR', session: {}, idFactory: () => 'x' });
    expect(c1.system.kind).toBe('intake'); expect(c1.system.customerId).toBeNull();
    const c2 = buildStaffChatNotification({
      kind: 'followup', sessionId: 'S', branchId: 'BR', session: { linkedCustomerId: 'LC-1' },
      customer: { patientData: { firstNameTh: 'อิอิ😀', lastNameTh: 'ฮ่าๆ' }, hn_no: 'LC-Z' }, idFactory: () => 'y',
    });
    expect(c2.system.nameSnapshot).toMatch(/😀/); expect(c2.system.hnSnapshot).toBe('LC-Z');
    expect(pickSystemCardCustomerId(c2, null)).toBe('LC-1');
  });
});
