// AV198 — functions/staffChatNotify.js builder unit. Pure (no firebase).
import { describe, it, expect } from 'vitest';
import { buildStaffChatNotification } from '../functions/staffChatNotify.js';

describe('buildStaffChatNotification', () => {
  it('B1 follow-up card carries customerId + hn + resolved name + ระบบ identity', () => {
    const doc = buildStaffChatNotification({
      kind: 'followup', sessionId: 'S1', branchId: 'BR1',
      session: { linkedCustomerId: 'LC-9' },
      customer: { firstname: 'แพรพร', lastname: 'พรแพร', hn_no: 'LC-26000079' },
      idFactory: () => 'CHAT-T1',
    });
    expect(doc).toMatchObject({ id: 'CHAT-T1', branchId: 'BR1', deviceId: 'system', displayName: 'ระบบ' });
    expect(doc.system).toMatchObject({ kind: 'followup', sessionId: 'S1', customerId: 'LC-9', hnSnapshot: 'LC-26000079' });
    expect(doc.system.nameSnapshot).toMatch(/แพรพร/);
    expect(doc.text).toMatch(/ประเมินติดตาม/);
  });

  it('B2 follow-up + no hn → HN falls back to linkedCustomerId', () => {
    const doc = buildStaffChatNotification({
      kind: 'followup', sessionId: 'S1', branchId: 'BR1',
      session: { linkedCustomerId: 'LC-9' },
      customer: { firstname: 'A', lastname: 'B' }, idFactory: () => 'x',
    });
    expect(doc.system.hnSnapshot).toBe('LC-9');
  });

  it('B3 intake card → null customerId, null hn, name from patientData', () => {
    const doc = buildStaffChatNotification({
      kind: 'intake', sessionId: 'S2', branchId: 'BR1',
      session: { patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } },
      customer: null, idFactory: () => 'CHAT-T2',
    });
    expect(doc.system).toMatchObject({ kind: 'intake', sessionId: 'S2', customerId: null, hnSnapshot: null });
    expect(doc.system.nameSnapshot).toBe('สมชาย ใจดี');
    expect(doc.text).toMatch(/รับเข้า/);
  });

  it('B4 intake name honors a Thai prefix from patientData', () => {
    const doc = buildStaffChatNotification({
      kind: 'intake', sessionId: 'S2', branchId: 'BR1',
      session: { patientData: { prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' } }, idFactory: () => 'x',
    });
    expect(doc.system.nameSnapshot).toBe('นาย สมชาย ใจดี');
  });

  it('B5 deviceId is ALWAYS "system" (never a human device) + displayName ระบบ', () => {
    const a = buildStaffChatNotification({ kind: 'intake', session: {}, idFactory: () => 'x' });
    const b = buildStaffChatNotification({ kind: 'followup', session: { linkedCustomerId: 'LC-1' }, customer: {}, idFactory: () => 'y' });
    expect(a.deviceId).toBe('system'); expect(b.deviceId).toBe('system');
    expect(a.displayName).toBe('ระบบ'); expect(b.displayName).toBe('ระบบ');
  });

  it('B6 NEVER throws on empty / garbage inputs (non-fatal contract)', () => {
    expect(() => buildStaffChatNotification()).not.toThrow();
    expect(() => buildStaffChatNotification({ kind: 'intake', session: {}, idFactory: () => 'x' })).not.toThrow();
    expect(() => buildStaffChatNotification({ kind: 'followup', session: null, customer: null, idFactory: () => 'x' })).not.toThrow();
  });

  it('B7 adversarial — Thai/emoji/long names + snake-vs-camel customer fields', () => {
    const longName = 'ก'.repeat(300);
    const doc = buildStaffChatNotification({
      kind: 'followup', sessionId: 'S', branchId: 'BR',
      session: { linkedCustomerId: 'LC-9' },
      customer: { patientData: { firstNameTh: longName + '😀', lastNameTh: 'ใจดี' }, hn_no: 'LC-X' },
      idFactory: () => 'x',
    });
    expect(doc.system.nameSnapshot).toMatch(/😀/);
    expect(doc.system.hnSnapshot).toBe('LC-X');
  });
});
