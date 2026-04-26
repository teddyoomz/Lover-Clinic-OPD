// V33.5 — LINE Flex Message bot reply tests.
// Covers buildCoursesFlex + buildAppointmentsFlex + buildEmptyStateFlex +
// isMeaningfulValue + the formatAppointmentsReply doctor-name addition.

import { describe, it, expect } from 'vitest';
import {
  buildCoursesFlex,
  buildAppointmentsFlex,
  buildEmptyStateFlex,
  isMeaningfulValue,
  formatCoursesReply,
  formatAppointmentsReply,
} from '../src/lib/lineBotResponder.js';

// ─── isMeaningfulValue (smart "no display" guard) ───────────────────────
describe('V33.5.A — isMeaningfulValue', () => {
  it('A1 — null/undefined → false', () => {
    expect(isMeaningfulValue(null)).toBe(false);
    expect(isMeaningfulValue(undefined)).toBe(false);
  });
  it('A2 — empty / whitespace-only → false', () => {
    expect(isMeaningfulValue('')).toBe(false);
    expect(isMeaningfulValue('   ')).toBe(false);
  });
  it('A3 — placeholder dashes → false', () => {
    expect(isMeaningfulValue('-')).toBe(false);
    expect(isMeaningfulValue('—')).toBe(false);
  });
  it('A4 — Thai placeholders → false', () => {
    expect(isMeaningfulValue('ไม่มี')).toBe(false);
    expect(isMeaningfulValue('ไม่ระบุ')).toBe(false);
    expect(isMeaningfulValue('N/A')).toBe(false);
  });
  it('A5 — meaningful values → true', () => {
    expect(isMeaningfulValue('Course A')).toBe(true);
    expect(isMeaningfulValue('5/10')).toBe(true);
    expect(isMeaningfulValue('นพ. สมชาย')).toBe(true);
    expect(isMeaningfulValue(0)).toBe(true);   // numeric 0 is meaningful (0 remaining ≠ no info)
    expect(isMeaningfulValue('2026-12-31')).toBe(true);
  });
});

// ─── buildEmptyStateFlex ────────────────────────────────────────────────
describe('V33.5.B — buildEmptyStateFlex', () => {
  it('B1 — returns Flex bubble shape with altText', () => {
    const flex = buildEmptyStateFlex('Title', 'Body message');
    expect(flex.type).toBe('flex');
    expect(flex.altText).toMatch(/Title/);
    expect(flex.altText).toMatch(/Body message/);
    expect(flex.contents.type).toBe('bubble');
  });
  it('B2 — uses default accent color when opts omitted', () => {
    const flex = buildEmptyStateFlex('T', 'M');
    expect(flex.contents.header.backgroundColor).toBe('#dc2626');
  });
  it('B3 — overrides accent color from opts', () => {
    const flex = buildEmptyStateFlex('T', 'M', { accentColor: '#06C755' });
    expect(flex.contents.header.backgroundColor).toBe('#06C755');
  });
  it('B4 — uses provided clinic name in header', () => {
    const flex = buildEmptyStateFlex('T', 'M', { clinicName: 'Test Clinic' });
    const headerText = flex.contents.header.contents[0];
    expect(headerText.text).toBe('Test Clinic');
  });
});

// ─── buildCoursesFlex ───────────────────────────────────────────────────
describe('V33.5.C — buildCoursesFlex bubble shape', () => {
  it('C1 — empty array → empty-state bubble', () => {
    const flex = buildCoursesFlex([]);
    expect(flex.contents.type).toBe('bubble');
    // Empty bubbles use 'kilo' (smaller)
    expect(flex.contents.size).toBe('kilo');
  });
  it('C2 — null courses → empty-state bubble', () => {
    expect(buildCoursesFlex(null).contents.type).toBe('bubble');
  });
  it('C3 — only inactive courses → empty-state bubble (filter applied)', () => {
    const flex = buildCoursesFlex([{ name: 'X', status: 'ใช้หมดแล้ว' }]);
    expect(flex.altText).toMatch(/ไม่พบคอร์ส/);
  });
  it('C4 — active courses → mega bubble with table rows', () => {
    const flex = buildCoursesFlex([
      { name: 'Course A', status: 'กำลังใช้งาน', qty: '5/10', expiry: '2026-12-31' },
      { name: 'Course B', status: 'กำลังใช้งาน', qty: '0/3' },
    ]);
    expect(flex.contents.size).toBe('mega');
    expect(flex.altText).toMatch(/Course A/);
    expect(flex.altText).toMatch(/Course B/);
  });
  it('C5 — header shows total count', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน' },
      { name: 'B', status: 'กำลังใช้งาน' },
      { name: 'C', status: 'กำลังใช้งาน' },
    ]);
    const headerRow = flex.contents.header.contents[1];
    const countText = headerRow.contents.find(c => c.text?.includes('รายการ'));
    expect(countText.text).toBe('3 รายการ');
  });
  it('C6 — truncates at maxRows (default 25) + adds footer', () => {
    const courses = Array.from({ length: 30 }, (_, i) => ({ name: `C${i}`, status: 'กำลังใช้งาน' }));
    const flex = buildCoursesFlex(courses);
    const bodyContents = flex.contents.body.contents;
    // V33.6 — column-header row dropped (data is self-labeled inline).
    // 25 course rows + footer = 26.
    expect(bodyContents.length).toBe(26);
    const footer = bodyContents[bodyContents.length - 1];
    const footerText = footer.contents[0].text;
    expect(footerText).toMatch(/และอีก 5 รายการ/);
  });
  it('C7 — custom accent color flows to header background', () => {
    const flex = buildCoursesFlex([{ name: 'A', status: 'กำลังใช้งาน' }], { accentColor: '#0088FF' });
    expect(flex.contents.header.backgroundColor).toBe('#0088FF');
  });
});

// ─── V33.5 + V33.6 directive: smart-display (no empty placeholders for expiry) ──
describe('V33.5.D — courses smart-hide empty expiry/qty (V33.6 stacked layout)', () => {
  it('D1 — course without expiry: meta line OMITS "หมดอายุ" (smart-hide)', () => {
    // V33.6 — vertical stack. body.contents[0] = first course row;
    // course row contents = [nameText, metaText]. No expiry cell exists.
    const flex = buildCoursesFlex([{ name: 'A', status: 'กำลังใช้งาน', qty: '5/10' }]);
    const courseRow = flex.contents.body.contents[0];
    expect(courseRow.layout).toBe('vertical');
    const metaText = courseRow.contents[1];
    expect(metaText.text).toBe('คงเหลือ 5/10');
    expect(metaText.text).not.toMatch(/หมดอายุ/);
  });
  it('D2 — course WITH valid expiry: meta line includes Thai BE date', () => {
    const flex = buildCoursesFlex([{ name: 'A', status: 'กำลังใช้งาน', qty: '5/10', expiry: '2026-12-31' }]);
    const courseRow = flex.contents.body.contents[0];
    const metaText = courseRow.contents[1];
    expect(metaText.text).toBe('คงเหลือ 5/10 · หมดอายุ 31/12/2569');
  });
  it('D3 — expiry === "-" treated as missing (no "หมดอายุ" suffix)', () => {
    const flex = buildCoursesFlex([{ name: 'A', status: 'กำลังใช้งาน', qty: '3', expiry: '-' }]);
    const courseRow = flex.contents.body.contents[0];
    const metaText = courseRow.contents[1];
    expect(metaText.text).not.toMatch(/หมดอายุ/);
    expect(metaText.text).toBe('คงเหลือ 3');
  });
  it('D4 — text formatter (altText) ALSO hides empty expiry now', () => {
    const text = formatCoursesReply([
      { name: 'Course A', status: 'กำลังใช้งาน', qty: '5/10' },
      { name: 'Course B', status: 'กำลังใช้งาน', qty: '0/3', expiry: '-' },
    ]);
    expect(text).not.toMatch(/หมดอายุ -/);
    expect(text).not.toMatch(/หมดอายุ —/);
  });
  it('D5 — text formatter STILL shows expiry when meaningful', () => {
    const text = formatCoursesReply([
      { name: 'A', status: 'กำลังใช้งาน', expiry: '2026-12-31' },
    ]);
    expect(text).toMatch(/หมดอายุ 31\/12\/2569/);
  });
});

// ─── buildAppointmentsFlex ──────────────────────────────────────────────
describe('V33.5.E — buildAppointmentsFlex bubble shape', () => {
  const FUTURE = '2099-01-01';
  it('E1 — empty array → empty-state bubble', () => {
    const flex = buildAppointmentsFlex([]);
    expect(flex.contents.type).toBe('bubble');
  });
  it('E2 — only past appointments → empty-state', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: '2020-01-01', status: 'pending' },
    ], { todayISO: '2026-04-27' });
    expect(flex.altText).toMatch(/ไม่พบรายการนัดหมายล่วงหน้า/);
  });
  it('E3 — single upcoming appointment renders date + time + provider', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '14:00', endTime: '15:00', doctorName: 'นพ. สมชาย', note: 'OPD' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    expect(apptBox.type).toBe('box');
    // Walk all text descendants
    const allTexts = JSON.stringify(apptBox);
    expect(allTexts).toContain('14:00–15:00');
    expect(allTexts).toContain('นพ. สมชาย');
    expect(allTexts).toContain('OPD');
  });
  it('E4 — only startTime (no end) shows just startTime', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '09:30', doctorName: 'D' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain('09:30');
    expect(allTexts).not.toContain('09:30–');
  });
  it('E5 — V33.5 directive: provider row OMITTED when no doctorName/staffName', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', note: 'follow-up' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    // V33.6 stacked: date row + time row + note row (NO provider row).
    // V33.5 had date+time combined → length was 2; V33.6 splits → length 3.
    expect(apptBox.contents.length).toBe(3);
    const allTexts = JSON.stringify(apptBox);
    expect(allTexts).not.toContain('👨‍⚕️');
  });
  it('E6 — staffName fallback when doctorName empty', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, staffName: 'พี่นัส' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain('พี่นัส');
  });
  it('E7 — header shows upcoming count', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, doctorName: 'A' },
      { appointmentDate: FUTURE, doctorName: 'B' },
    ]);
    const headerRow = flex.contents.header.contents[1];
    // Match "N นัด" pattern (not "นัดหมายล่วงหน้า")
    const countText = headerRow.contents.find(c => /^\d+ นัด$/.test(c.text || ''));
    expect(countText.text).toBe('2 นัด');
  });
  it('E8 — truncates at maxItems (10) + footer "และอีก X นัด"', () => {
    const appts = Array.from({ length: 15 }, (_, i) => ({ appointmentDate: FUTURE, doctorName: `D${i}` }));
    const flex = buildAppointmentsFlex(appts);
    const lastBox = flex.contents.body.contents[flex.contents.body.contents.length - 1];
    const footerText = lastBox.contents[0].text;
    expect(footerText).toMatch(/และอีก 5 นัด/);
  });
  it('E9 — cancelled / completed / no-show filtered out', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, status: 'cancelled', doctorName: 'X' },
      { appointmentDate: FUTURE, status: 'completed', doctorName: 'Y' },
      { appointmentDate: FUTURE, status: 'no-show', doctorName: 'Z' },
    ]);
    expect(flex.altText).toMatch(/ไม่พบรายการนัดหมายล่วงหน้า/);
  });
  it('E10 — sort by date ascending', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: '2099-12-31', doctorName: 'Z' },
      { appointmentDate: '2099-01-01', doctorName: 'A' },
      { appointmentDate: '2099-06-15', doctorName: 'M' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    const idxA = allTexts.indexOf('"A"');
    const idxM = allTexts.indexOf('"M"');
    const idxZ = allTexts.indexOf('"Z"');
    expect(idxA).toBeLessThan(idxM);
    expect(idxM).toBeLessThan(idxZ);
  });
});

// ─── V33.5 directive #2 — appointment text reply now includes doctor ──
describe('V33.5.F — formatAppointmentsReply now includes doctor name (text fallback)', () => {
  const FUTURE = '2099-01-01';
  it('F1 — text reply includes 👨‍⚕️ doctor row when doctorName present', () => {
    const text = formatAppointmentsReply([
      { appointmentDate: FUTURE, startTime: '14:00', doctorName: 'นพ. สมชาย', note: 'follow-up' },
    ], '2026-04-27');
    expect(text).toContain('👨‍⚕️ นพ. สมชาย');
  });
  it('F2 — text reply uses staffName fallback when doctor empty', () => {
    const text = formatAppointmentsReply([
      { appointmentDate: FUTURE, staffName: 'พี่นัส' },
    ], '2026-04-27');
    expect(text).toContain('👨‍⚕️ พี่นัส');
  });
  it('F3 — text reply OMITS doctor row when both empty', () => {
    const text = formatAppointmentsReply([
      { appointmentDate: FUTURE, startTime: '10:00' },
    ], '2026-04-27');
    expect(text).not.toContain('👨‍⚕️');
  });
  it('F4 — text reply shows time as HH:MM-HH:MM when both start+end', () => {
    const text = formatAppointmentsReply([
      { appointmentDate: FUTURE, startTime: '14:00', endTime: '15:30' },
    ], '2026-04-27');
    expect(text).toContain('14:00-15:30');
  });
});

// ─── altText backward-compat regression guard ───────────────────────────
describe('V33.5.G — altText backward-compat (Flex graceful fallback)', () => {
  const FUTURE = '2099-01-01';
  it('G1 — buildCoursesFlex altText === formatCoursesReply output', () => {
    const courses = [{ name: 'A', status: 'กำลังใช้งาน', qty: '5/10' }];
    const flex = buildCoursesFlex(courses);
    const text = formatCoursesReply(courses);
    // altText is truncated at 400 — assert prefix matches
    expect(flex.altText.startsWith(text.slice(0, Math.min(text.length, 380)))).toBe(true);
  });
  it('G2 — buildAppointmentsFlex altText === formatAppointmentsReply output', () => {
    const appts = [{ appointmentDate: FUTURE, doctorName: 'D' }];
    const flex = buildAppointmentsFlex(appts, { todayISO: '2026-04-27' });
    const text = formatAppointmentsReply(appts, '2026-04-27');
    expect(flex.altText.startsWith(text.slice(0, Math.min(text.length, 380)))).toBe(true);
  });
});

// ─── source-grep regression guards ──────────────────────────────────────
describe('V33.5.H — source-grep guards', () => {
  it('H1 — buildCoursesFlex + buildAppointmentsFlex + buildEmptyStateFlex exported', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/export function buildCoursesFlex/);
    expect(src).toMatch(/export function buildAppointmentsFlex/);
    expect(src).toMatch(/export function buildEmptyStateFlex/);
    expect(src).toMatch(/export function isMeaningfulValue/);
  });
  it('H2 — webhook imports + uses Flex builders inside maybeEmitBotReply', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    expect(src).toMatch(/buildCoursesFlex/);
    expect(src).toMatch(/buildAppointmentsFlex/);
    // Reply call sites must pass Flex array, not text
    const start = src.indexOf("intent.intent === 'courses'");
    const end = src.indexOf("intent.intent === 'unknown'");
    const block = src.slice(start, end);
    expect(block).toMatch(/replyLineMessage\(event\.replyToken,\s*\[flex\]/);
  });
  it('H3 — replyLineMessage accepts Array payload (V33.5 contract)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    expect(src).toMatch(/Array\.isArray\(payload\)/);
  });
  it('H4 — getChatConfig surfaces clinicName + accentColor (best-effort)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('api/webhook/line.js', 'utf-8');
    expect(src).toMatch(/clinicName:\s*doc\.fields\?\.clinicName/);
    expect(src).toMatch(/accentColor:\s*doc\.fields\?\.accentColor/);
  });
});
