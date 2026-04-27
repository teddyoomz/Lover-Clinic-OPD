// V33.7 — LINE OA bot reply i18n (TH/EN) + full-date format + customer
// language toggle + หมดอายุ smart-hide fix (V33.6 follow-up).
//
// User directives (2026-04-27):
//   1. Appointment date should show full weekday + full month name
//      (อังคาร 28 เมษายน 2569 / Tuesday 28 April 2026)
//   2. Foreign customers (customer_type === 'foreigner') auto-receive
//      English replies; default is Thai
//   3. Admin can manually toggle customer's lineLanguage via segmented pill
//
// Plus: smart-hide หมดอายุ when formatThaiDate('-' / non-ISO) returns '-'.

import { describe, it, expect } from 'vitest';
import {
  buildCourseMetaLine,
  buildCoursesFlex,
  buildAppointmentsFlex,
  buildEmptyStateFlex,
  formatCoursesReply,
  formatAppointmentsReply,
  formatHelpReply,
  formatNotLinkedReply,
  formatIdRequestAck,
  formatIdRequestRateLimitedReply,
  formatIdRequestInvalidFormat,
  formatLinkRequestApprovedReply,
  formatLinkRequestRejectedReply,
  formatThaiDate,
  formatLongDate,
  getLanguageForCustomer,
  isMeaningfulValue,
  // V33.9 — formatLinkSuccessReply / formatLinkFailureReply REMOVED
} from '../src/lib/lineBotResponder.js';

const FUTURE = '2099-01-01';

// ────────────────────────────────────────────────────────────────────────
// V33.7.A — getLanguageForCustomer priority
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.A — getLanguageForCustomer', () => {
  it('A1 — explicit lineLanguage:"en" wins', () => {
    expect(getLanguageForCustomer({ lineLanguage: 'en', customer_type: 'thai' })).toBe('en');
  });
  it('A2 — explicit lineLanguage:"th" wins (admin override of foreigner default)', () => {
    expect(getLanguageForCustomer({ lineLanguage: 'th', customer_type: 'foreigner' })).toBe('th');
  });
  it('A3 — customer_type === "foreigner" → "en"', () => {
    expect(getLanguageForCustomer({ customer_type: 'foreigner' })).toBe('en');
  });
  it('A4 — customer_type === "thai" → "th"', () => {
    expect(getLanguageForCustomer({ customer_type: 'thai' })).toBe('th');
  });
  it('A5 — customer_type === "" → "th" (default)', () => {
    expect(getLanguageForCustomer({ customer_type: '' })).toBe('th');
  });
  it('A6 — null/undefined customer → "th"', () => {
    expect(getLanguageForCustomer(null)).toBe('th');
    expect(getLanguageForCustomer(undefined)).toBe('th');
  });
  it('A7 — customer_type case-insensitive ("FOREIGNER" / "Foreigner")', () => {
    expect(getLanguageForCustomer({ customer_type: 'FOREIGNER' })).toBe('en');
    expect(getLanguageForCustomer({ customer_type: 'Foreigner' })).toBe('en');
    expect(getLanguageForCustomer({ customer_type: '  foreigner  ' })).toBe('en');
  });
  it('A8 — invalid lineLanguage value falls through to customer_type rule', () => {
    expect(getLanguageForCustomer({ lineLanguage: 'fr', customer_type: 'foreigner' })).toBe('en');
    expect(getLanguageForCustomer({ lineLanguage: 'EN', customer_type: 'thai' })).toBe('th'); // case-strict for explicit
    expect(getLanguageForCustomer({ lineLanguage: '', customer_type: 'foreigner' })).toBe('en');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.B — formatLongDate
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.B — formatLongDate (full weekday + full month)', () => {
  it('B1 — Thai BE: "อังคาร 28 เมษายน 2569"', () => {
    const out = formatLongDate('2026-04-28', 'th');
    expect(out).toMatch(/อังคาร/);
    expect(out).toMatch(/เมษายน/);
    expect(out).toMatch(/2569/); // BE year, NOT 2026
    expect(out).not.toMatch(/2026/);
    expect(out).not.toMatch(/^วัน/); // "วัน" prefix stripped
    expect(out).not.toMatch(/พ\.ศ\./); // "พ.ศ." stripped
  });
  it('B2 — English CE: "Tuesday 28 April 2026"', () => {
    const out = formatLongDate('2026-04-28', 'en');
    expect(out).toMatch(/Tuesday/);
    expect(out).toMatch(/April/);
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/2569/); // CE year, NOT BE
  });
  it('B3 — default language (omitted) is Thai', () => {
    expect(formatLongDate('2026-04-28')).toMatch(/2569/);
  });
  it('B4 — invalid format → "-"', () => {
    expect(formatLongDate('2026/04/28', 'th')).toBe('-');
    expect(formatLongDate('not-a-date', 'en')).toBe('-');
    expect(formatLongDate('', 'th')).toBe('-');
    expect(formatLongDate(null, 'en')).toBe('-');
  });
  it('B5 — January boundary "2026-01-01" works for both langs', () => {
    expect(formatLongDate('2026-01-01', 'th')).toMatch(/มกราคม/);
    expect(formatLongDate('2026-01-01', 'en')).toMatch(/January/);
  });
  it('B6 — December boundary "2026-12-31"', () => {
    expect(formatLongDate('2026-12-31', 'th')).toMatch(/ธันวาคม/);
    expect(formatLongDate('2026-12-31', 'en')).toMatch(/December/);
  });
  it('B7 — language fallback (unknown lang) defaults to Thai', () => {
    expect(formatLongDate('2026-04-28', 'fr')).toMatch(/2569/);
    expect(formatLongDate('2026-04-28', undefined)).toMatch(/2569/);
  });
  it('B8 — Thai output contains NO Latin letters in weekday/month', () => {
    const out = formatLongDate('2026-04-28', 'th');
    // Should be "อังคาร 28 เมษายน 2569" — only digits + Thai + spaces
    expect(out).not.toMatch(/[A-Za-z]/);
  });
  it('B9 — English output contains NO Thai chars', () => {
    const out = formatLongDate('2026-04-28', 'en');
    expect(out).not.toMatch(/[฀-๿]/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.C — Reply function language switching
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.C — reply functions accept language param', () => {
  it('C1 — formatHelpReply default = Thai', () => {
    const out = formatHelpReply();
    expect(out).toMatch(/คอร์ส/);
    expect(out).toMatch(/นัด/);
  });
  it('C2 — formatHelpReply("en") = English', () => {
    const out = formatHelpReply('en');
    expect(out).toMatch(/courses/i);
    expect(out).toMatch(/appointments/i);
    expect(out).not.toMatch(/[฀-๿]/);
  });
  // V33.9 — C3 / C4 (formatLinkSuccessReply / formatLinkFailureReply tests)
  // REMOVED. Functions stripped along with QR-token flow. Admin-mediated
  // approval push uses formatLinkRequestApprovedReply (covered by C9 below).
  it('C5 — formatNotLinkedReply', () => {
    expect(formatNotLinkedReply('th')).toMatch(/ยังไม่ได้ผูก/);
    expect(formatNotLinkedReply('en')).toMatch(/not yet linked/i);
  });
  it('C6 — formatIdRequestAck', () => {
    expect(formatIdRequestAck('th')).toMatch(/ระบบได้รับคำขอ/);
    expect(formatIdRequestAck('en')).toMatch(/Request received/i);
  });
  it('C7 — formatIdRequestRateLimitedReply', () => {
    expect(formatIdRequestRateLimitedReply('en')).toMatch(/Too many/i);
  });
  it('C8 — formatIdRequestInvalidFormat', () => {
    expect(formatIdRequestInvalidFormat('en')).toMatch(/Invalid ID format/i);
  });
  it('C9 — formatLinkRequestApprovedReply', () => {
    expect(formatLinkRequestApprovedReply('Alice', 'en')).toMatch(/approved/i);
    expect(formatLinkRequestApprovedReply('Alice', 'en')).toMatch(/Alice/);
  });
  it('C10 — formatLinkRequestRejectedReply', () => {
    expect(formatLinkRequestRejectedReply('en')).toMatch(/not approved/i);
  });
  it('C11 — undefined / unknown language defaults to Thai', () => {
    expect(formatHelpReply(undefined)).toMatch(/คอร์ส/);
    expect(formatHelpReply('fr')).toMatch(/คอร์ส/);
    expect(formatHelpReply(null)).toMatch(/คอร์ส/);
  });
  it('C12 — formatCoursesReply switches header + footer + labels', () => {
    const courses = [
      { name: 'Botox', status: 'กำลังใช้งาน', qty: '5/10', expiry: '2026-12-31' },
    ];
    const th = formatCoursesReply(courses, 'th');
    const en = formatCoursesReply(courses, 'en');
    expect(th).toMatch(/คอร์สที่ใช้ได้คงเหลือ/);
    expect(en).toMatch(/Active Courses/i);
    expect(en).toMatch(/Expires/i);
    expect(en).not.toMatch(/[฀-๿]/);
  });
  it('C13 — formatAppointmentsReply uses formatLongDate + APPT_TIME_PREFIX in EN', () => {
    const appts = [{ appointmentDate: FUTURE, startTime: '14:00', endTime: '15:00', doctorName: 'Dr X' }];
    const th = formatAppointmentsReply(appts, '2026-01-01', 'th');
    const en = formatAppointmentsReply(appts, '2026-01-01', 'en');
    // TH uses เวลา prefix
    expect(th).toMatch(/เวลา 14:00-15:00/);
    // EN uses 'at' prefix
    expect(en).toMatch(/at 14:00-15:00/);
    // EN should have a long English date
    expect(en).toMatch(/2099/); // CE year
    expect(en).not.toMatch(/2642/); // BE year shouldn't appear
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.D — Flex builders i18n
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.D — Flex builders accept opts.language', () => {
  it('D1 — buildCoursesFlex EN: header text "Active Courses"', () => {
    const flex = buildCoursesFlex(
      [{ name: 'Botox', status: 'กำลังใช้งาน', qty: '5/10' }],
      { language: 'en' },
    );
    const allTexts = JSON.stringify(flex.contents.header);
    expect(allTexts).toContain('Active Courses');
    expect(allTexts).toMatch(/1 item/i);
  });
  it('D2 — buildCoursesFlex TH (default) header preserved', () => {
    const flex = buildCoursesFlex([{ name: 'Botox', status: 'กำลังใช้งาน', qty: '5/10' }]);
    const allTexts = JSON.stringify(flex.contents.header);
    expect(allTexts).toContain('คอร์สคงเหลือ');
    expect(allTexts).toContain('1 รายการ');
  });
  it('D3 — buildCoursesFlex EN meta line uses "Remaining" / "Expires"', () => {
    const flex = buildCoursesFlex(
      [{ name: 'Botox', status: 'กำลังใช้งาน', qty: '5/10', expiry: '2026-12-31' }],
      { language: 'en' },
    );
    const meta = flex.contents.body.contents[0].contents[1].text;
    expect(meta).toMatch(/^Remaining 5\/10/);
    expect(meta).toMatch(/Expires/);
  });
  it('D4 — buildAppointmentsFlex EN: header "Upcoming Appointments"', () => {
    const flex = buildAppointmentsFlex(
      [{ appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30', doctorName: 'Dr X' }],
      { language: 'en' },
    );
    const allTexts = JSON.stringify(flex.contents.header);
    expect(allTexts).toContain('Upcoming Appointments');
    expect(allTexts).toMatch(/1 appt/i);
  });
  it('D5 — buildAppointmentsFlex EN date uses formatLongDate (full weekday + month)', () => {
    const flex = buildAppointmentsFlex(
      [{ appointmentDate: '2026-04-28', startTime: '10:00', doctorName: 'Dr X' }],
      { language: 'en', todayISO: '2026-01-01' },
    );
    const dateText = flex.contents.body.contents[0].contents[0].contents[1].text;
    expect(dateText).toMatch(/Tuesday/);
    expect(dateText).toMatch(/April/);
    expect(dateText).toMatch(/2026/);
  });
  it('D6 — buildAppointmentsFlex TH date uses Thai BE long format', () => {
    const flex = buildAppointmentsFlex(
      [{ appointmentDate: '2026-04-28', startTime: '10:00', doctorName: 'Dr X' }],
      { todayISO: '2026-01-01' },
    );
    const dateText = flex.contents.body.contents[0].contents[0].contents[1].text;
    expect(dateText).toMatch(/อังคาร/);
    expect(dateText).toMatch(/เมษายน/);
    expect(dateText).toMatch(/2569/); // BE
  });
  it('D7 — empty courses EN bubble', () => {
    const flex = buildCoursesFlex([], { language: 'en' });
    const allTexts = JSON.stringify(flex.contents);
    expect(allTexts).toMatch(/Your Courses/);
    expect(allTexts).toMatch(/No courses/i);
  });
  it('D8 — V33.6 carry-over: provider color #222 in BOTH langs', () => {
    const thFlex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, doctorName: 'Dr X' },
    ]);
    const enFlex = buildAppointmentsFlex(
      [{ appointmentDate: FUTURE, doctorName: 'Dr X' }],
      { language: 'en' },
    );
    [thFlex, enFlex].forEach((flex) => {
      const apptBox = flex.contents.body.contents[0];
      const providerRow = apptBox.contents.find((r) =>
        r.contents?.some?.((c) => c.text === '👨‍⚕️'),
      );
      const providerText = providerRow.contents.find((c) => c.text !== '👨‍⚕️');
      expect(providerText.color).toBe('#222222');
    });
  });
  it('D9 — V33.6 carry-over: NO wrap:false in code (regression-lock)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/wrap:\s*false/);
  });
  it('D10 — header bubble backgroundColor honors accentColor (theme regression)', () => {
    const flex = buildCoursesFlex(
      [{ name: 'A', status: 'กำลังใช้งาน' }],
      { language: 'en', accentColor: '#0088FF' },
    );
    expect(flex.contents.header.backgroundColor).toBe('#0088FF');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.E — V33.7 หมดอายุ smart-hide fix (V33.6 follow-up)
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.E — หมดอายุ smart-hide when formatThaiDate returns "-"', () => {
  it('E1 — c.expiry="6/2027" (non-ISO) → suffix omitted', () => {
    const out = buildCourseMetaLine({ qty: '5', expiry: '6/2027' });
    expect(out).toBe('คงเหลือ 5');
    expect(out).not.toMatch(/หมดอายุ/);
  });
  it('E2 — c.expiry="none" (truthy non-empty placeholder-ish) → suffix omitted', () => {
    const out = buildCourseMetaLine({ qty: '5', expiry: 'none' });
    expect(out).not.toMatch(/หมดอายุ -/);
  });
  it('E3 — c.expiry="2027" (year-only, non-ISO) → suffix omitted', () => {
    const out = buildCourseMetaLine({ qty: '5', expiry: '2027' });
    expect(out).toBe('คงเหลือ 5');
  });
  it('E4 — c.expiry="31-12-2027" (dash-separated, non-ISO) → suffix omitted', () => {
    const out = buildCourseMetaLine({ qty: '5', expiry: '31-12-2027' });
    expect(out).not.toMatch(/หมดอายุ/);
  });
  it('E5 — valid ISO "2027-12-31" → suffix INCLUDED', () => {
    const out = buildCourseMetaLine({ qty: '5', expiry: '2027-12-31' });
    expect(out).toBe('คงเหลือ 5 · หมดอายุ 31/12/2570');
  });
  it('E6 — same fix in formatCoursesReply text formatter', () => {
    const text = formatCoursesReply([
      { name: 'A', status: 'กำลังใช้งาน', qty: '5', expiry: '6/2027' },
    ], 'th');
    expect(text).not.toMatch(/หมดอายุ -/);
    expect(text).not.toMatch(/หมดอายุ —/);
  });
  it('E7 — EN equivalent: "Expires -" never appears', () => {
    const text = formatCoursesReply([
      { name: 'A', status: 'กำลังใช้งาน', qty: '5', expiry: 'invalid' },
    ], 'en');
    expect(text).not.toMatch(/Expires -/);
    expect(text).not.toMatch(/Expires —/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.F — Webhook lang threading (source-grep)
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.F — webhook line.js language threading', () => {
  it('F1 — getLanguageForCustomer is imported in webhook', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    expect(src).toMatch(/getLanguageForCustomer/);
  });
  it('F2 — courses + appointments call buildXFlex with language: lang', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    // Both calls must include language in opts
    expect(src).toMatch(/buildCoursesFlex\([^)]*language:\s*lang/s);
    expect(src).toMatch(/buildAppointmentsFlex\([^)]*language:\s*lang/s);
  });
  it('F3 — id-link-request match-found path passes lang to formatIdRequestAck', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    // The ack inside the customer-found block must call formatIdRequestAck(lang)
    const matchBlock = src.match(/if\s*\(customer\)\s*\{[\s\S]*?formatIdRequestAck\(([^)]+)\)/);
    expect(matchBlock).not.toBeNull();
    expect(matchBlock[1].trim()).toBe('lang');
  });
  it('F4 — webhook does NOT regress to formatThaiDate for appointment date (V33.7 lock)', async () => {
    // formatLongDate is the new appointment-date helper inside lineBotResponder
    // (responder side); webhook still calls Flex builders which use formatLongDate
    // internally. This test just confirms responder uses formatLongDate.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/formatLongDate\(date,\s*lang\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.G — customer-line-link.js update-language action (source-grep)
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.G — api/admin/customer-line-link update-language', () => {
  it('G1 — endpoint registers update-language action', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/admin/customer-line-link.js', 'utf-8');
    expect(src).toMatch(/action === 'update-language'/);
    expect(src).toMatch(/handleUpdateLanguage/);
  });
  it('G2 — handler validates language ∈ {th, en}', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/admin/customer-line-link.js', 'utf-8');
    const block = src.match(/async function handleUpdateLanguage[\s\S]*?\n\}\n/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/language !== 'th'.*language !== 'en'/);
  });
  it('G3 — handler writes lineLanguage field', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/admin/customer-line-link.js', 'utf-8');
    const block = src.match(/async function handleUpdateLanguage[\s\S]*?\n\}\n/);
    expect(block[0]).toMatch(/lineLanguage:\s*language/);
    expect(block[0]).toMatch(/lineLanguageChangedAt/);
    expect(block[0]).toMatch(/lineLanguageChangedBy/);
  });
  it('G4 — list-linked exposes lineLanguage + customer_type for UI toggle', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/admin/customer-line-link.js', 'utf-8');
    const listBlock = src.match(/async function handleListLinked[\s\S]*?\n\}\n/);
    expect(listBlock[0]).toMatch(/lineLanguage:\s*data\.lineLanguage/);
    expect(listBlock[0]).toMatch(/customer_type:\s*data\.customer_type/);
  });
  it('G5 — error message mentions update-language in dispatch fallthrough', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/admin/customer-line-link.js', 'utf-8');
    expect(src).toMatch(/suspend \| resume \| unlink \| list-linked \| update-language/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.H — customerLineLinkClient.js helper
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.H — updateLineLinkLanguage client helper', () => {
  it('H1 — exported with correct signature', async () => {
    const mod = await import('../src/lib/customerLineLinkClient.js');
    expect(typeof mod.updateLineLinkLanguage).toBe('function');
    // 2 params: customerId, language
    expect(mod.updateLineLinkLanguage.length).toBe(2);
  });
  it('H2 — throws on missing customerId', async () => {
    const { updateLineLinkLanguage } = await import('../src/lib/customerLineLinkClient.js');
    expect(() => updateLineLinkLanguage('', 'th')).toThrow(/customerId/);
    expect(() => updateLineLinkLanguage(undefined, 'en')).toThrow(/customerId/);
  });
  it('H3 — throws on invalid language', async () => {
    const { updateLineLinkLanguage } = await import('../src/lib/customerLineLinkClient.js');
    expect(() => updateLineLinkLanguage('cid', 'fr')).toThrow(/th.*en/);
    expect(() => updateLineLinkLanguage('cid', '')).toThrow();
  });
  it('H4 — source mentions action: update-language', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/customerLineLinkClient.js', 'utf-8');
    expect(src).toMatch(/action: 'update-language'/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.I — customerValidation.js lineLanguage normalization
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.I — customerValidation lineLanguage', () => {
  it('I1 — FIELD_BOUNDS includes lineLanguage', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/customerValidation.js', 'utf-8');
    expect(src).toMatch(/lineLanguage:\s*\d+/);
  });
  it('I2 — normalizeCustomer coerces "th" through', async () => {
    const { normalizeCustomer } = await import('../src/lib/customerValidation.js');
    const out = normalizeCustomer({ firstname: 'A', lineLanguage: 'th' });
    expect(out.lineLanguage).toBe('th');
  });
  it('I3 — normalizeCustomer coerces "en" through', async () => {
    const { normalizeCustomer } = await import('../src/lib/customerValidation.js');
    const out = normalizeCustomer({ firstname: 'A', lineLanguage: 'en' });
    expect(out.lineLanguage).toBe('en');
  });
  it('I4 — normalizeCustomer drops invalid values (so bot derives at read time)', async () => {
    const { normalizeCustomer } = await import('../src/lib/customerValidation.js');
    const out = normalizeCustomer({ firstname: 'A', lineLanguage: 'fr' });
    expect(out.lineLanguage).toBeUndefined();
  });
  it('I5 — normalizeCustomer accepts case variants ("EN" → "en")', async () => {
    const { normalizeCustomer } = await import('../src/lib/customerValidation.js');
    const out = normalizeCustomer({ firstname: 'A', lineLanguage: 'EN' });
    expect(out.lineLanguage).toBe('en');
  });
  it('I6 — absent lineLanguage stays absent (no default injected)', async () => {
    const { normalizeCustomer } = await import('../src/lib/customerValidation.js');
    const out = normalizeCustomer({ firstname: 'A' });
    expect(out.lineLanguage).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.7.J — UI source-grep guards
// ────────────────────────────────────────────────────────────────────────
describe('V33.7.J — UI source-grep guards', () => {
  it('J1 — LangPillToggle.jsx exists + exports default', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/LangPillToggle.jsx', 'utf-8');
    expect(src).toMatch(/export function LangPillToggle/);
    expect(src).toMatch(/export default LangPillToggle/);
  });
  it('J2 — LinkLineInstructionsModal imports LangPillToggle + updateLineLinkLanguage', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/LinkLineInstructionsModal.jsx', 'utf-8');
    expect(src).toMatch(/import\s+LangPillToggle/);
    expect(src).toMatch(/updateLineLinkLanguage/);
    expect(src).toMatch(/getLanguageForCustomer/);
  });
  it('J3 — LinkRequestsTab imports LangPillToggle + updateLineLinkLanguage', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/LinkRequestsTab.jsx', 'utf-8');
    expect(src).toMatch(/import\s+LangPillToggle/);
    expect(src).toMatch(/updateLineLinkLanguage/);
    expect(src).toMatch(/getLanguageForCustomer/);
  });
  it('J4 — DocumentPrintModal refactored to use LangPillToggle (Rule of 3 closure)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/DocumentPrintModal.jsx', 'utf-8');
    expect(src).toMatch(/import\s+LangPillToggle/);
    // Old inline pattern should be gone
    expect(src).not.toMatch(/\['th',\s*'en',\s*'bilingual'\]\.map\(lang/);
  });
  it('J5 — LinkRequestsTab handleLanguageToggle defined + optimistic update', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/LinkRequestsTab.jsx', 'utf-8');
    expect(src).toMatch(/handleLanguageToggle/);
    // Must do optimistic local update
    expect(src).toMatch(/setItems\(\(prev\)/);
  });
});
