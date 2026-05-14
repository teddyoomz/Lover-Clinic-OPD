import { describe, it, expect } from 'vitest';
import { buildReminderFlex, resolveTokens, renderTemplate, getDefaultFlexShape } from '../src/lib/lineReminderTemplate.js';

const baseInput = {
  cust: { fullName: 'นาย โอ๊ค', lineDisplayName: 'OakLINE' },
  appt: { id: 'BA-1778001-aaa', appointmentDate: '2026-05-16', startTime: '14:30' },
  branch: { branchName: 'นครราชสีมา', branchId: 'BR-X' },
  doctor: { name: 'นพ. สมชาย' },
  treatments: [{ name: 'ฉีดผิว' }, { name: 'เลเซอร์' }],
  branchSettings: { cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชม.' },
  clinicName: 'LoverClinic',
};

describe('T2 lineReminderTemplate.resolveTokens', () => {
  it('T2.1 resolves all canonical tokens', () => {
    const tokens = resolveTokens(baseInput);
    expect(tokens.customerName).toBe('นาย โอ๊ค');
    expect(tokens.branchName).toBe('นครราชสีมา');
    expect(tokens.doctorName).toBe('นพ. สมชาย');
    expect(tokens.treatments).toBe('ฉีดผิว, เลเซอร์');
    expect(tokens.time).toBe('14:30');
    expect(tokens.appointmentId).toBe('BA-1778001-aaa');
    expect(tokens.cancellationPolicyText).toMatch(/24 ชม\./);
  });

  it('T2.2 date is Thai dd/mm/yyyy พ.ศ.', () => {
    const tokens = resolveTokens(baseInput);
    expect(tokens.date).toBe('16/05/2569');
  });

  it('T2.3 missing doctor falls back to "แพทย์ผู้ดูแล"', () => {
    const tokens = resolveTokens({ ...baseInput, doctor: null });
    expect(tokens.doctorName).toBe('แพทย์ผู้ดูแล');
  });

  it('T2.4 missing treatments falls back to "-"', () => {
    const tokens = resolveTokens({ ...baseInput, treatments: [] });
    expect(tokens.treatments).toBe('-');
  });

  it('T2.5 empty fullName falls back to name', () => {
    const tokens = resolveTokens({ ...baseInput, cust: { name: 'foo' } });
    expect(tokens.customerName).toBe('foo');
  });
});

describe('T2 lineReminderTemplate.renderTemplate', () => {
  it('T2.6 substitutes {{token}}', () => {
    expect(renderTemplate('Hi {{a}}, see you {{b}}', { a: 'X', b: 'Y' })).toBe('Hi X, see you Y');
  });
  it('T2.7 missing token renders as empty string', () => {
    expect(renderTemplate('Hi {{missing}}', {})).toBe('Hi ');
  });
  it('T2.8 handles adversarial inputs (null/undefined/numeric/Thai)', () => {
    expect(renderTemplate('{{a}}-{{b}}-{{c}}', { a: null, b: 0, c: 'ก' })).toBe('-0-ก');
  });
});

describe('T2 buildReminderFlex', () => {
  it('T2.9 returns valid LINE Flex Message JSON for dayBefore', () => {
    const branchSettings = { ...baseInput.branchSettings, templateDayBefore: 'Hi {{customerName}} appt {{date}} {{time}}' };
    const flex = buildReminderFlex({ ...baseInput, branchSettings, reminderType: 'dayBefore' });
    expect(flex.type).toBe('flex');
    expect(flex.altText).toMatch(/แจ้งเตือนนัดหมาย/);
    expect(flex.contents.type).toBe('bubble');
    expect(flex.contents.footer.contents).toHaveLength(3);
  });

  it('T2.10 footer buttons emit postback with appointmentId + branchId', () => {
    const flex = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    const confirmBtn = flex.contents.footer.contents[0];
    expect(confirmBtn.action.type).toBe('postback');
    expect(confirmBtn.action.data).toContain('action=confirm');
    expect(confirmBtn.action.data).toContain(`appt=${baseInput.appt.id}`);
    expect(confirmBtn.action.data).toContain(`br=${baseInput.branch.branchId}`);
  });

  it('T2.11 dayOf altText differs from dayBefore', () => {
    const flexBefore = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    const flexOf = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayOf' });
    expect(flexBefore.altText).not.toBe(flexOf.altText);
  });

  it('T2.12 header background is fire-red brand', () => {
    const flex = buildReminderFlex({ ...baseInput, branchSettings: baseInput.branchSettings, reminderType: 'dayBefore' });
    expect(flex.contents.header.backgroundColor).toBe('#DC2626');
  });
});
