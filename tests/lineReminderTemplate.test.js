import { describe, it, expect } from 'vitest';
import { buildReminderFlex, resolveTokens, renderTemplate, getDefaultFlexShape, parsePostbackData } from '../src/lib/lineReminderTemplate.js';

// V67 (2026-05-15): fixtures use REAL be_appointments / be_branches schema:
//   - appt uses `date` (NOT `appointmentDate` — Wave 1 mock-shadow drift)
//   - branch uses `name` (NOT `branchName` — same drift class)
// The helper retains backward-compat fallback chain so old fixtures still work,
// but tests should LOCK the canonical schema by primary fixture name.
const baseInput = {
  cust: { fullName: 'นาย โอ๊ค', lineDisplayName: 'OakLINE' },
  appt: { id: 'BA-1778001-aaa', date: '2026-05-16', startTime: '14:30' },
  branch: { name: 'นครราชสีมา', branchId: 'BR-X' },
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

describe('T2 buildReminderFlex — Task 2 polish (I1-I5)', () => {
  // Helper: find any body content node whose `text` property equals the supplied value.
  const findBodyTextNode = (flex, predicate) => {
    const contents = flex?.contents?.body?.contents || [];
    return contents.find(
      (n) => n && n.type === 'text' && (typeof predicate === 'function' ? predicate(n.text) : n.text === predicate)
    );
  };

  it('T2.13 buildReminderFlex({ reminderType: "dayBefore" }) with missing branchSettings does NOT throw and returns valid flex', () => {
    // I1 — must be tolerant of missing input.branchSettings.
    // appointmentId required by I3 contract, so supply minimal appt.id only.
    let flex;
    expect(() => {
      flex = buildReminderFlex({ reminderType: 'dayBefore', appt: { id: 'BA-min' } });
    }).not.toThrow();
    expect(flex).toBeTruthy();
    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('bubble');
    // Body must exist and be a vertical box; no empty text nodes leaked in.
    expect(flex.contents.body.type).toBe('box');
    const emptyTextNode = findBodyTextNode(flex, '');
    expect(emptyTextNode).toBeUndefined();
  });

  it('T2.14 empty templateDayBefore → body has NO empty text node (only detail rows + cancellation policy if present)', () => {
    // I4 — LINE API rejects { type:'text', text:'' } with HTTP 400.
    const flex = buildReminderFlex({
      ...baseInput,
      branchSettings: { cancellationPolicyText: 'นโยบายยกเลิก' }, // no templateDayBefore
      reminderType: 'dayBefore',
    });
    const bodyContents = flex.contents.body.contents;
    // No content node should be an empty-string text.
    const emptyTextNodes = bodyContents.filter((n) => n && n.type === 'text' && n.text === '');
    expect(emptyTextNodes).toHaveLength(0);
    // Body still has detail rows (📍 สาขา, 👨‍⚕️ แพทย์, 💊 บริการ, 📅 วันที่, 🕐 เวลา).
    const hasDetailRows = bodyContents.some(
      (n) => n && n.type === 'box' && n.layout === 'baseline'
    );
    expect(hasDetailRows).toBe(true);
    // Cancellation policy text still present (non-empty).
    const policyNode = bodyContents.find(
      (n) => n && n.type === 'text' && n.text === 'นโยบายยกเลิก'
    );
    expect(policyNode).toBeTruthy();
  });

  it('T2.15 empty cancellationPolicyText → body has NO trailing separator + empty cancellation text node', () => {
    // I4 mirror — when cancellationPolicyText is empty, drop BOTH the separator and the empty text node.
    const flex = buildReminderFlex({
      ...baseInput,
      branchSettings: {
        templateDayBefore: 'Hi {{customerName}}',
        // cancellationPolicyText omitted (empty)
      },
      reminderType: 'dayBefore',
    });
    const bodyContents = flex.contents.body.contents;
    // No empty-string text node.
    const emptyTextNodes = bodyContents.filter((n) => n && n.type === 'text' && n.text === '');
    expect(emptyTextNodes).toHaveLength(0);
    // No #999999-colored empty text node anywhere.
    const policyEmpty = bodyContents.find(
      (n) => n && n.type === 'text' && n.color === '#999999' && (!n.text || n.text === '')
    );
    expect(policyEmpty).toBeUndefined();
    // The last node should NOT be a bare separator (we drop the separator+text pair together).
    const last = bodyContents[bodyContents.length - 1];
    expect(last && last.type === 'separator').toBe(false);
  });

  it('T2.16 empty appointmentId throws LINE_REMINDER_FLEX_NO_APPT_ID', () => {
    // I3 — V14 lesson: fail loud rather than ship malformed postback `action=confirm&appt=`.
    expect(() =>
      buildReminderFlex({
        ...baseInput,
        appt: { ...baseInput.appt, id: '' },
        branchSettings: baseInput.branchSettings,
        reminderType: 'dayBefore',
      })
    ).toThrow(/LINE_REMINDER_FLEX_NO_APPT_ID/);

    // Also throws on undefined appt entirely.
    expect(() =>
      buildReminderFlex({
        ...baseInput,
        appt: undefined,
        branchSettings: baseInput.branchSettings,
        reminderType: 'dayBefore',
      })
    ).toThrow(/LINE_REMINDER_FLEX_NO_APPT_ID/);
  });

  it('T2.17 postback data is URL-encoded on emit and round-trips through parsePostbackData with special chars', () => {
    // I2 — appointmentId with `=`, `&`, or other reserved chars must survive build → parse cleanly.
    const specialId = 'BA-with=eq&amp';
    const flex = buildReminderFlex({
      ...baseInput,
      appt: { ...baseInput.appt, id: specialId },
      branchSettings: baseInput.branchSettings,
      reminderType: 'dayBefore',
    });
    const confirmBtn = flex.contents.footer.contents[0];
    const rawData = confirmBtn.action.data;
    // Encoded on emit — raw special chars must NOT appear literally in the data string.
    expect(rawData).toContain('action=confirm');
    expect(rawData).not.toContain('appt=BA-with=eq&amp'); // would corrupt the wire
    // Decode round-trip via parsePostbackData.
    const parsed = parsePostbackData(rawData);
    expect(parsed.action).toBe('confirm');
    expect(parsed.appt).toBe(specialId);
    expect(parsed.br).toBe(baseInput.branch.branchId);
  });

  it('T2.18 detailRow with undefined token value renders empty string (not literal "undefined")', () => {
    // I5 — String(undefined) === 'undefined' would surface in the LINE bubble as literal text.
    const flex = buildReminderFlex({
      ...baseInput,
      // Force all detail tokens that might be undefined to be empty.
      branch: { branchId: 'BR-X' }, // no branchName
      doctor: null, // falls back to 'แพทย์ผู้ดูแล' (still a string)
      treatments: [],
      appt: { id: 'BA-z', date: '', startTime: '' },
      branchSettings: baseInput.branchSettings,
      reminderType: 'dayBefore',
    });
    const bodyContents = flex.contents.body.contents;
    // Walk every nested text node; none should equal the literal string 'undefined'.
    const walk = (node) => {
      if (!node || typeof node !== 'object') return [];
      const found = [];
      if (node.type === 'text' && typeof node.text === 'string') found.push(node.text);
      if (Array.isArray(node.contents)) {
        for (const c of node.contents) found.push(...walk(c));
      }
      return found;
    };
    const allTexts = bodyContents.flatMap(walk);
    expect(allTexts).not.toContain('undefined');
  });
});
