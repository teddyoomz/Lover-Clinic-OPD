// AV198 — pure pickSystemCardCustomerId. Mocks neutralize the resolve module's
// firebase import side effects (the picker itself is pure).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: () => ({}), onSnapshot: () => () => {},
  collection: () => ({}), query: () => ({}), where: () => ({}),
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: vi.fn() }));

import { pickSystemCardCustomerId } from '../src/lib/staffChatNotifyResolve.js';

describe('pickSystemCardCustomerId', () => {
  it('P1 follow-up → customerId directly (session + appt ignored)', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'followup', customerId: 'LC-9' } }, null, null)).toBe('LC-9');
    expect(pickSystemCardCustomerId({ system: { kind: 'followup', customerId: 'LC-9' } }, { brokerProClinicId: 'OTHER' }, { customerId: 'NOPE' })).toBe('LC-9');
  });
  it('P2 intake unregistered → null (no session broker, no appt customerId)', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, { id: 'S2' }, null)).toBeNull();
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, null, null)).toBeNull();
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, null, {})).toBeNull(); // appt exists but no customerId yet
  });
  it('P3 intake kiosk/queue-flow → session.brokerProClinicId', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, { brokerProClinicId: 'LC-180' }, null)).toBe('LC-180');
  });
  it('P5 intake booking/appointment-flow → appointment.customerId (session DELETED on save)', () => {
    // the real prod bug: session gone (null) + appt carries the registered id
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'BL-1' } }, null, { customerId: 'LC-26000176' })).toBe('LC-26000176');
  });
  it('P6 appointment.customerId is preferred over session.brokerProClinicId (both present → agree; appt wins by contract)', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S' } }, { brokerProClinicId: 'LC-7' }, { customerId: 'LC-7' })).toBe('LC-7');
  });
  it('P4 no system / null → null; NEVER throws', () => {
    expect(pickSystemCardCustomerId({}, null, null)).toBeNull();
    expect(pickSystemCardCustomerId(null, null, null)).toBeNull();
    expect(() => pickSystemCardCustomerId(undefined, undefined, undefined)).not.toThrow();
  });
});
