// AV198 — pure pickSystemCardCustomerId. Mocks neutralize the resolve module's
// firebase import side effects (the picker itself is pure).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({ doc: () => ({}), onSnapshot: () => () => {} }));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getCustomer: vi.fn() }));

import { pickSystemCardCustomerId } from '../src/lib/staffChatNotifyResolve.js';

describe('pickSystemCardCustomerId', () => {
  it('P1 follow-up → customerId directly (session ignored)', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'followup', customerId: 'LC-9' } }, null)).toBe('LC-9');
    expect(pickSystemCardCustomerId({ system: { kind: 'followup', customerId: 'LC-9' } }, { brokerProClinicId: 'OTHER' })).toBe('LC-9');
  });
  it('P2 intake unregistered → null', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, { id: 'S2' })).toBeNull();
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, null)).toBeNull();
  });
  it('P3 intake registered → session.brokerProClinicId', () => {
    expect(pickSystemCardCustomerId({ system: { kind: 'intake', customerId: null, sessionId: 'S2' } }, { brokerProClinicId: 'LC-180' })).toBe('LC-180');
  });
  it('P4 no system / null → null; NEVER throws', () => {
    expect(pickSystemCardCustomerId({}, null)).toBeNull();
    expect(pickSystemCardCustomerId(null, null)).toBeNull();
    expect(() => pickSystemCardCustomerId(undefined, undefined)).not.toThrow();
  });
});
