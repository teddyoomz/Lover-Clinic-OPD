import { describe, it, expect } from 'vitest';
import {
  SESSION_STATUS, CANCELLED_BY, HEARTBEAT_STALE_MS, HEARTBEAT_INTERVAL_MS,
  isTerminal, isHeartbeatStale, isPresenceReady, canTransition, toMillis,
  buildPresenceUpsert, buildSessionCreate,
} from '../src/lib/chartEditSessionCore.js';

describe('chartEditSessionCore', () => {
  it('A1 status enum + terminal detection', () => {
    expect(SESSION_STATUS.REQUESTED).toBe('requested');
    expect(isTerminal('saved')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('active')).toBe(false);
  });
  it('A2 toMillis handles number / ISO / Date / Firestore Timestamp shapes (V81-fix1)', () => {
    expect(toMillis(1000)).toBe(1000);
    expect(toMillis(new Date(1000))).toBe(1000);
    expect(toMillis('1970-01-01T00:00:01.000Z')).toBe(1000);
    expect(toMillis({ seconds: 1, nanoseconds: 0 })).toBe(1000);
    expect(toMillis({ _seconds: 1, _nanoseconds: 0 })).toBe(1000);
    expect(toMillis({ toMillis: () => 1000 })).toBe(1000);
    expect(toMillis(null)).toBe(0);
  });
  it('A3 isHeartbeatStale uses 30s default', () => {
    expect(isHeartbeatStale(0, 29999)).toBe(false);
    expect(isHeartbeatStale(0, 30001)).toBe(true);
    expect(HEARTBEAT_STALE_MS).toBe(30000);
    expect(HEARTBEAT_INTERVAL_MS).toBe(10000);
  });
  it('A4 isPresenceReady = idle && fresh', () => {
    const now = 100000;
    expect(isPresenceReady({ status: 'idle', lastHeartbeatAt: 90000 }, now)).toBe(true);
    expect(isPresenceReady({ status: 'busy', lastHeartbeatAt: 99000 }, now)).toBe(false);
    expect(isPresenceReady({ status: 'idle', lastHeartbeatAt: 1000 }, now)).toBe(false);
    expect(isPresenceReady(null, now)).toBe(false);
  });
  it('A5 canTransition allows only the legal edges', () => {
    expect(canTransition('requested', 'active')).toBe(true);
    expect(canTransition('active', 'saved')).toBe(true);
    expect(canTransition('requested', 'cancelled')).toBe(true);
    expect(canTransition('active', 'cancelled')).toBe(true);
    expect(canTransition('saved', 'active')).toBe(false);
    expect(canTransition('cancelled', 'active')).toBe(false);
    expect(canTransition('requested', 'saved')).toBe(false);
  });
  it('A6 buildPresenceUpsert stamps shape + branchId', () => {
    const d = buildPresenceUpsert({ deviceId: 'TEST-T1', deviceName: 'iPad 1', branchId: 'BR-x', uid: 'u1', byName: 'Dr A' });
    expect(d).toMatchObject({ deviceId: 'TEST-T1', deviceName: 'iPad 1', branchId: 'BR-x', status: 'idle', byUid: 'u1', byName: 'Dr A' });
    expect(d.lastHeartbeatAt).toBeDefined();
  });
  it('A7 buildSessionCreate produces a requested session', () => {
    const s = buildSessionCreate({ sessionId: 'TEST-S1', branchId: 'BR-x', pcDeviceId: 'PC1', pcUid: 'u1',
      tabletDeviceId: 'TEST-T1', tabletName: 'iPad 1', template: { id: 'tpl', name: 'face', category: 'head' }, patientLabel: 'คุณ มะลิ' });
    expect(s).toMatchObject({ sessionId: 'TEST-S1', status: 'requested', cancelledBy: null, tabletDeviceId: 'TEST-T1' });
    expect(s.template).toEqual({ id: 'tpl', name: 'face', category: 'head' });
    expect(s.templateImageUrl).toBe(null);
    expect(s.resultImageUrl).toBe(null);
  });
});
