// FCM push title/body builder (functions/notificationContent.js) + CJS resolver parity.
// Pure-unit (no firebase). Mirrors tests/materialize-assessment.test.js import style.
import { describe, it, expect } from 'vitest';
import { buildNotificationContent } from '../functions/notificationContent.js';
import { resolveCustomerName, resolveCustomerHN } from '../functions/customerDisplay.js';
// ESM canonical — for the parity check (N9):
import { resolveCustomerDisplayName, resolveCustomerHN as esmHN } from '../src/lib/customerDisplayName.js';

const FU = { sessionName: 'แบบประเมินติดตาม', linkedCustomerId: 'LC-26000082', patientData: { adam_1: true } };
const custNameHN = { patientData: { prefix: 'นางสาว', firstName: 'แพรพร', lastName: 'พรแพร' }, hn_no: '000123' };

describe('buildNotificationContent', () => {
  it('N1 follow-up + customer(name + hn_no) → "🔔 {name} · HN {hn_no}"', () => {
    const { title, body } = buildNotificationContent({ session: FU, sessionId: 'FW-ED-x', customer: custNameHN });
    expect(title).toBe('แบบประเมินติดตาม');
    expect(body).toBe('🔔 นางสาว แพรพร พรแพร · HN 000123');
  });

  it('N2 follow-up + customer(name, NO hn_no) → HN falls back to linkedCustomerId', () => {
    const { body } = buildNotificationContent({ session: FU, customer: { patientData: { prefix: 'นางสาว', firstName: 'แพรพร', lastName: 'พรแพร' } } });
    expect(body).toBe('🔔 นางสาว แพรพร พรแพร · HN LC-26000082');
  });

  it('N3 follow-up + customer null → name from confirmInfo snapshot, HN = linkedCustomerId', () => {
    const s = { ...FU, confirmInfo: { name: 'นางสาว สแนป ช็อต' } };
    const { body } = buildNotificationContent({ session: s, customer: null });
    expect(body).toBe('🔔 นางสาว สแนป ช็อต · HN LC-26000082');
  });

  it('N4 follow-up + no name anywhere → "🔔 HN {linkedCustomerId}"', () => {
    const { body } = buildNotificationContent({ session: FU, customer: null });
    expect(body).toBe('🔔 HN LC-26000082');
  });

  it('N5 intake (pd.firstName, no linkedCustomerId) → unchanged "🔔 ข้อมูลใหม่ · {name}"', () => {
    const { body } = buildNotificationContent({ session: { sessionName: 'คุณทดสอบ', patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } }, sessionId: 'BL-1' });
    expect(body).toBe('🔔 ข้อมูลใหม่ · สมชาย ใจดี');
  });

  it('N6 intake, no name → unchanged generic body', () => {
    const { body } = buildNotificationContent({ session: { sessionName: 'x', patientData: {} }, sessionId: 'BL-2' });
    expect(body).toBe('🔔 ได้รับข้อมูลผู้ป่วยแล้ว');
  });

  it('N7 edit (updatedAt) → "✏️ แก้ไขแล้ว · {sections}" / default', () => {
    const s = { sessionName: 'x', updatedAt: { _seconds: 1 }, patientData: {} };
    expect(buildNotificationContent({ session: s, changedSections: ['ยา', 'แชท'] }).body).toBe('✏️ แก้ไขแล้ว · ยา · แชท');
    expect(buildNotificationContent({ session: s, changedSections: [] }).body).toBe('✏️ แก้ไขแล้ว · ข้อมูลผู้ป่วย');
  });

  it('N8 long sessionName (>28) → title truncated to 27 + …', () => {
    const long = 'ก'.repeat(40);
    const { title } = buildNotificationContent({ session: { sessionName: long, patientData: {} }, sessionId: 's' });
    expect(title).toBe('ก'.repeat(27) + '…');
    expect([...title].length).toBe(28);
  });

  it('N10 edit takes precedence over linkedCustomerId (a follow-up that is also an edit → edit branch)', () => {
    const s = { ...FU, updatedAt: { _seconds: 9 } };
    expect(buildNotificationContent({ session: s, customer: custNameHN, changedSections: ['z'] }).body).toBe('✏️ แก้ไขแล้ว · z');
  });

  it('N11 follow-up + whitespace-only confirmInfo.name + customer null → trims → "🔔 HN {id}" (no blank name)', () => {
    const s = { ...FU, confirmInfo: { name: '   ' } };
    expect(buildNotificationContent({ session: s, customer: null }).body).toBe('🔔 HN LC-26000082');
  });

  it('N12 intake with ONLY lastName (no firstName) → shows it (parity with compose-either)', () => {
    const { body } = buildNotificationContent({ session: { sessionName: 'x', patientData: { lastName: 'ใจดี' } }, sessionId: 'BL-3' });
    expect(body).toBe('🔔 ข้อมูลใหม่ · ใจดี');
  });

  it('N13 whitespace-only sessionName → title falls back to sessionId (not blank)', () => {
    const { title } = buildNotificationContent({ session: { sessionName: '   ', patientData: {} }, sessionId: 'BL-4' });
    expect(title).toBe('BL-4');
  });

  it('N-guard: null/empty session → safe defaults (no throw)', () => {
    expect(buildNotificationContent({}).body).toBe('🔔 ได้รับข้อมูลผู้ป่วยแล้ว');
    expect(buildNotificationContent().title).toBe('OPD');
  });
});

describe('N9 CJS resolver parity vs ESM canonical (src/lib/customerDisplayName.js)', () => {
  const shapes = [
    { patientData: { prefix: 'นาย', firstNameTh: 'ก', lastNameTh: 'ข' } },        // Thai patientData
    { patientData: { firstName: 'John', lastName: 'Doe' } },                       // camelCase
    { firstname: 'somchai', lastname: 'jaidee' },                                  // top-level lowercase
    { customerName: 'Legacy Name' },                                               // composed legacy
    { patientData: {}, hn_no: '55-1234' },                                         // HN via hn_no
    { proClinicHN: 'PC-9' },                                                       // HN via proClinicHN
  ];
  it('name resolver matches ESM (includePrefix default true)', () => {
    shapes.forEach((c) => expect(resolveCustomerName(c)).toBe(resolveCustomerDisplayName(c)));
  });
  it('HN resolver matches ESM', () => {
    shapes.forEach((c) => expect(resolveCustomerHN(c)).toBe(esmHN(c)));
  });
});
