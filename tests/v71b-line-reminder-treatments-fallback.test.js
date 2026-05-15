// V71.B (2026-05-16) — LINE reminder {{treatments}} token falls back to
// appt.appointmentTo when treatments array is empty.
//
// User-reported (image): LINE reminder fired for appointment with
// `appointmentTo: 'botox'` rendered "บริการ: -" because the appt has no
// be_treatments doc yet (treatment hasn't happened — reminder fires BEFORE
// the visit). Resolver pre-V71.B only checked the `treatments` array; '-'
// fallback fired even when admin had set "นัดมาเพื่อ" at booking.
//
// Fix: extend the resolver's fallback chain:
//   1. real treatments[] from be_treatments (post-treatment reminders, rare)
//   2. appt.appointmentTo (admin's "นัดมาเพื่อ" — canonical for reminders)
//   3. '-' (final fallback when both empty)

import { describe, it, expect } from 'vitest';
import { resolveTokens, buildReminderFlex } from '../src/lib/lineReminderTemplate.js';

const baseApptWithAppointmentTo = {
  id: 'BA-V71B-test',
  date: '2026-05-16',
  startTime: '13:15',
  appointmentTo: 'botox',
};
const baseBranchSettings = {
  templateDayBefore: 'สวัสดีคุณ {{customerName}} ค่ะ พรุ่งนี้ {{date}} เวลา {{time}} คุณมีนัดที่สาขา {{branchName}} กับ {{doctorName}} บริการ: {{treatments}}',
  cancellationPolicyText: 'กรุณาเลื่อน/ยกเลิกล่วงหน้า 24 ชม.',
};

describe('V71.B resolveTokens.treatments fallback to appt.appointmentTo', () => {
  it('VB1.1 treatments [] + appointmentTo set → token = appointmentTo (user-reported case)', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: baseApptWithAppointmentTo,
      branch: { name: 'นครราชสีมา', branchId: 'BR-X' },
      doctor: { name: 'หมอมายด์' },
      treatments: [],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('botox');
  });

  it('VB1.2 treatments [] + appointmentTo empty → token = "-"', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: { id: 'X', date: '2026-05-16', startTime: '13:15', appointmentTo: '' },
      branch: { name: 'BR' },
      treatments: [],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('-');
  });

  it('VB1.3 treatments has entries → uses treatment names (NOT appointmentTo)', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: baseApptWithAppointmentTo,
      branch: { name: 'BR' },
      treatments: [{ name: 'ฉีดผิว' }, { name: 'เลเซอร์' }],
      branchSettings: baseBranchSettings,
    });
    // Real treatment names take precedence over appointmentTo (post-treatment case)
    expect(tokens.treatments).toBe('ฉีดผิว, เลเซอร์');
    expect(tokens.treatments).not.toContain('botox');
  });

  it('VB1.4 treatments [{name:""}] (all empty) + appointmentTo set → fallback to appointmentTo', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: baseApptWithAppointmentTo,
      branch: { name: 'BR' },
      treatments: [{ name: '' }, { name: null }],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('botox');
  });

  it('VB1.5 appointmentTo with leading/trailing whitespace → trimmed', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: { ...baseApptWithAppointmentTo, appointmentTo: '  botox  ' },
      branch: { name: 'BR' },
      treatments: [],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('botox');
  });

  it('VB1.6 appointmentTo non-string (number / object) → falls through to "-"', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: { ...baseApptWithAppointmentTo, appointmentTo: 123 },
      branch: { name: 'BR' },
      treatments: [],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('-');
  });

  it('VB1.7 appointmentTo Thai text → renders unchanged', () => {
    const tokens = resolveTokens({
      cust: { fullName: 'แพรพร' },
      appt: { ...baseApptWithAppointmentTo, appointmentTo: 'ฉีดวัคซีน HPV' },
      branch: { name: 'BR' },
      treatments: [],
      branchSettings: baseBranchSettings,
    });
    expect(tokens.treatments).toBe('ฉีดวัคซีน HPV');
  });

  it('VB1.8 buildReminderFlex body span contains appointmentTo (full integration)', () => {
    // The body uses contents:[span] post-V70 — verify the treatments span
    // text comes from appointmentTo when treatments is empty.
    const flex = buildReminderFlex({
      cust: { fullName: 'แพรพร' },
      appt: baseApptWithAppointmentTo,
      branch: { name: 'นครราชสีมา', branchId: 'BR-X' },
      doctor: { name: 'หมอมายด์' },
      treatments: [],
      branchSettings: baseBranchSettings,
      reminderType: 'dayBefore',
    });
    const bodyTextNode = flex.contents.body.contents.find(
      (n) => n.type === 'text' && Array.isArray(n.contents)
    );
    expect(bodyTextNode).toBeDefined();
    const boldSpans = bodyTextNode.contents.filter((s) => s.weight === 'bold').map((s) => s.text);
    // V71.B: appointmentTo "botox" appears as bold span (was '-' pre-fix)
    expect(boldSpans).toContain('botox');
    expect(boldSpans).not.toContain('-');
  });

  it('VB1.9 detail row "💊 บริการ" value uses fallback when treatments empty', () => {
    // The detail-rows block builds 5 baseline rows including "💊 บริการ" with
    // tokens.treatments as the value cell. Verify the value cell reads appointmentTo.
    const flex = buildReminderFlex({
      cust: { fullName: 'แพรพร' },
      appt: baseApptWithAppointmentTo,
      branch: { name: 'นครราชสีมา', branchId: 'BR-X' },
      doctor: { name: 'หมอมายด์' },
      treatments: [],
      branchSettings: baseBranchSettings,
      reminderType: 'dayBefore',
    });
    // Detail rows are baseline boxes with [labelCell, valueCell]
    const detailRows = flex.contents.body.contents.filter(
      (n) => n.type === 'box' && n.layout === 'baseline'
    );
    const serviceRow = detailRows.find((row) => row.contents[0]?.text === '💊 บริการ');
    expect(serviceRow).toBeDefined();
    const valueCell = serviceRow.contents[1];
    expect(valueCell.text).toBe('botox');
  });
});
