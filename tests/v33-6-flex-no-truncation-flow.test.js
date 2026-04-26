// V33.6 — Flex Bubble no-truncation flow simulate (Rule I).
//
// Bug user reported (2026-04-27 mobile screenshots): V33.5 Flex bubbles
// truncated critical data on mobile LINE viewer:
//   - Course "คงเหลือ" column: "0 / 3 a..." instead of "0 / 3 ครั้ง"
//   - Course "หมดอายุ" cell: "เหมาตา..." instead of "เหมาตามจริง"
//   - Appointment "เวลา": "10:00–10..." instead of "10:00–10:30"
//   - Doctor name in red (Rule 04 spirit: red on names = death omen)
//
// User constraint: "ไม่อยากแก้หลายรอบเพราะ deploy มันเสียตังทุกครั้ง" —
// fix must be definitive, no V33.7 round 2.
//
// Strategy: eliminate truncation as a bug CLASS (not patch one ratio).
// Restructure rows from horizontal "table" → vertical-stacked card per
// item. Mobile-first, no flex math, full data ALWAYS visible.
//
// Test layers (Rule I): helper-output (A) + structural contract (B/C/D)
// + adversarial inputs (E) + source-grep regression guards (F).

import { describe, it, expect } from 'vitest';
import {
  buildCourseMetaLine,
  buildCoursesFlex,
  buildAppointmentsFlex,
  buildEmptyStateFlex,
  isMeaningfulValue,
  formatThaiDate,
} from '../src/lib/lineBotResponder.js';

// ────────────────────────────────────────────────────────────────────────
// V33.6.A — buildCourseMetaLine pure helper unit tests
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.A — buildCourseMetaLine pure helper', () => {
  it('A1 — qty + expiry both meaningful → "คงเหลือ X · หมดอายุ Y"', () => {
    expect(buildCourseMetaLine({ qty: '69 / 200 U', expiry: '2027-12-31' }))
      .toBe('คงเหลือ 69 / 200 U · หมดอายุ 31/12/2570');
  });
  it('A2 — qty only (no expiry) → "คงเหลือ X" (no หมดอายุ)', () => {
    expect(buildCourseMetaLine({ qty: '5/10' })).toBe('คงเหลือ 5/10');
  });
  it('A3 — qty missing, remaining present → fallback to remaining', () => {
    expect(buildCourseMetaLine({ qty: null, remaining: '5' })).toBe('คงเหลือ 5');
  });
  it('A4 — both qty + remaining missing → "คงเหลือ -"', () => {
    expect(buildCourseMetaLine({})).toBe('คงเหลือ -');
    expect(buildCourseMetaLine({ qty: null, remaining: null })).toBe('คงเหลือ -');
  });
  it('A5 — expiry === "-" placeholder → suffix omitted (smart-hide)', () => {
    expect(buildCourseMetaLine({ qty: '5', expiry: '-' })).toBe('คงเหลือ 5');
    expect(buildCourseMetaLine({ qty: '5', expiry: '—' })).toBe('คงเหลือ 5');
    expect(buildCourseMetaLine({ qty: '5', expiry: 'ไม่มี' })).toBe('คงเหลือ 5');
  });
  it('A6 — expiry === "" empty → suffix omitted', () => {
    expect(buildCourseMetaLine({ qty: '5', expiry: '' })).toBe('คงเหลือ 5');
    expect(buildCourseMetaLine({ qty: '5', expiry: '   ' })).toBe('คงเหลือ 5');
  });
  it('A7 — long ASCII qty "100 / 100 UNIT" preserved verbatim (no truncation)', () => {
    const out = buildCourseMetaLine({ qty: '100 / 100 UNIT' });
    expect(out).toBe('คงเหลือ 100 / 100 UNIT');
    expect(out).not.toContain('…');
  });
  it('A8 — Thai-only qty "เหมาตามจริง" preserved verbatim (no truncation)', () => {
    const out = buildCourseMetaLine({ qty: 'เหมาตามจริง' });
    expect(out).toBe('คงเหลือ เหมาตามจริง');
    expect(out).not.toContain('…');
    expect(out).not.toContain('เหมาตา…'); // V33.5 reported bug
  });
  it('A9 — null/undefined input → "คงเหลือ -" (defensive)', () => {
    expect(buildCourseMetaLine(null)).toBe('คงเหลือ -');
    expect(buildCourseMetaLine(undefined)).toBe('คงเหลือ -');
  });
  it('A10 — numeric zero qty is meaningful (not falsy-stripped)', () => {
    expect(buildCourseMetaLine({ qty: 0 })).toBe('คงเหลือ 0');
    expect(buildCourseMetaLine({ qty: '0' })).toBe('คงเหลือ 0');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.B — buildCoursesFlex stacked-layout structural contract
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.B — buildCoursesFlex stacked layout', () => {
  const SAMPLE = [
    { name: 'Botox 100 U', status: 'กำลังใช้งาน', qty: '100 / 100 U', expiry: '2027-06-30' },
    { name: 'Acne Tx 12 ครั้ง', status: 'กำลังใช้งาน', qty: '0 / 3 ครั้ง' },
    { name: '11/12 เหมาตามจริง', status: 'กำลังใช้งาน', qty: 'เหมาตามจริง' },
  ];

  it('B1 — each course row uses VERTICAL layout (not horizontal table)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.layout).toBe('vertical');
    });
  });
  it('B2 — each course row has exactly 2 children: nameText + metaText', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.contents.length).toBe(2);
      expect(row.contents[0].type).toBe('text');
      expect(row.contents[1].type).toBe('text');
    });
  });
  it('B3 — name text has wrap:true (NEVER wrap:false)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.contents[0].wrap).toBe(true);
    });
  });
  it('B4 — meta text has wrap:true (NEVER wrap:false)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.contents[1].wrap).toBe(true);
    });
  });
  it('B5 — column-header row DROPPED (data is self-labeled inline)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    const firstRow = flex.contents.body.contents[0];
    // First row is the FIRST COURSE, not a header. Verify by name match.
    expect(firstRow.contents[0].text).toBe('Botox 100 U');
    // No row contains the literal column-label "คอร์ส" / "คงเหลือ" / "หมดอายุ"
    // as standalone label strings (the meta line has "คงเหลือ X" but that's
    // followed by the value).
    const labelRow = flex.contents.body.contents.find(
      (r) => r.contents?.some?.((c) => c.text === 'คอร์ส' || c.text === 'หมดอายุ'),
    );
    expect(labelRow).toBeUndefined();
  });
  it('B6 — name color = #222222 (dark, NOT accentColor red)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.contents[0].color).toBe('#222222');
      expect(row.contents[0].weight).toBe('bold');
    });
  });
  it('B7 — meta color = #666666 (medium gray, NOT accentColor)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    flex.contents.body.contents.slice(0, 3).forEach((row) => {
      expect(row.contents[1].color).toBe('#666666');
    });
  });
  it('B8 — body length = active.length (no header overhead, no footer when ≤ 25)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    expect(flex.contents.body.contents.length).toBe(3);
  });
  it('B9 — meta line content matches buildCourseMetaLine output exactly', () => {
    const flex = buildCoursesFlex(SAMPLE);
    expect(flex.contents.body.contents[0].contents[1].text)
      .toBe('คงเหลือ 100 / 100 U · หมดอายุ 30/06/2570');
    expect(flex.contents.body.contents[1].contents[1].text)
      .toBe('คงเหลือ 0 / 3 ครั้ง');
    expect(flex.contents.body.contents[2].contents[1].text)
      .toBe('คงเหลือ เหมาตามจริง');
  });
  it('B10 — bubble.size still mega (regression — V33.5 user-approved)', () => {
    const flex = buildCoursesFlex(SAMPLE);
    expect(flex.contents.size).toBe('mega');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.C — buildAppointmentsFlex stacked date+time
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.C — buildAppointmentsFlex stacked date+time', () => {
  const FUTURE = '2099-01-01';

  it('C1 — date and time are TWO separate stacked sub-rows (not 1 horizontal)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30', doctorName: 'D' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    // Sub-rows: [date, time, provider] when all present
    expect(apptBox.contents.length).toBe(3);
    // Each sub-row has exactly 2 components: emoji + text
    expect(apptBox.contents[0].contents.length).toBe(2);
    expect(apptBox.contents[1].contents.length).toBe(2);
  });
  it('C2 — date sub-row: 📅 emoji + date text (own line)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    const dateRow = apptBox.contents[0];
    expect(dateRow.layout).toBe('horizontal');
    expect(dateRow.contents[0].text).toBe('📅');
    // V33.7 — date now uses formatLongDate (full weekday + month + BE year)
    // not the short formatThaiDate '01/01/2642'. Assert long-form contents.
    expect(dateRow.contents[1].text).toMatch(/2642/);   // BE year preserved
    expect(dateRow.contents[1].text).toMatch(/มกราคม/); // full Thai month
    expect(dateRow.contents[1].wrap).toBe(true);
  });
  it('C3 — time sub-row: 🕐 emoji + time text (own line, NOT combined with date)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    const timeRow = apptBox.contents[1];
    expect(timeRow.layout).toBe('horizontal');
    expect(timeRow.contents[0].text).toBe('🕐');
    expect(timeRow.contents[1].text).toBe('10:00–10:30');
    expect(timeRow.contents[1].wrap).toBe(true);
  });
  it('C4 — time text has wrap:true (NEVER wrap:false — V33.5 truncation cause)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30' },
    ]);
    const timeRow = flex.contents.body.contents[0].contents[1];
    expect(timeRow.contents[1].wrap).toBe(true);
    expect(timeRow.contents[1].wrap).not.toBe(false);
  });
  it('C5 — full time string "10:00–10:30" preserved verbatim (no truncation)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain('10:00–10:30');
    expect(allTexts).not.toContain('10:00–10…');
    expect(allTexts).not.toContain('10:00…');
  });
  it('C6 — when no time, time sub-row OMITTED (no empty 🕐 row)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, doctorName: 'Dr X' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    // Only date + provider sub-rows (length 2, no time row)
    expect(apptBox.contents.length).toBe(2);
    const allTexts = JSON.stringify(apptBox);
    expect(allTexts).not.toContain('🕐');
  });
  it('C7 — start-only time (no end) renders just startTime (no dash)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '09:30' },
    ]);
    const timeRow = flex.contents.body.contents[0].contents[1];
    expect(timeRow.contents[1].text).toBe('09:30');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.D — Doctor name color (Rule 04 cultural compliance)
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.D — provider color #222 not accentColor (Rule 04)', () => {
  const FUTURE = '2099-01-01';

  it('D1 — provider text color = #222222 (NOT accentColor #dc2626)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, doctorName: 'นพ. สมชาย' },
    ]);
    const apptBox = flex.contents.body.contents[0];
    const providerRow = apptBox.contents.find((r) =>
      r.contents?.some?.((c) => c.text === '👨‍⚕️'),
    );
    expect(providerRow).toBeDefined();
    const providerText = providerRow.contents.find((c) => c.text !== '👨‍⚕️');
    expect(providerText.color).toBe('#222222');
    expect(providerText.color).not.toBe('#dc2626');
  });
  it('D2 — even when accentColor passed via opts, provider stays #222', () => {
    const flex = buildAppointmentsFlex(
      [{ appointmentDate: FUTURE, doctorName: 'นพ. สมชาย' }],
      { accentColor: '#0088FF' },
    );
    const providerRow = flex.contents.body.contents[0].contents.find((r) =>
      r.contents?.some?.((c) => c.text === '👨‍⚕️'),
    );
    const providerText = providerRow.contents.find((c) => c.text !== '👨‍⚕️');
    expect(providerText.color).toBe('#222222');
  });
  it('D3 — header band color = accentColor (theme regression — red preserved on STRUCTURE)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, doctorName: 'D' },
    ]);
    expect(flex.contents.header.backgroundColor).toBe('#dc2626');
  });
  it('D4 — header backgroundColor honors accentColor opts override', () => {
    const flex = buildAppointmentsFlex(
      [{ appointmentDate: FUTURE, doctorName: 'D' }],
      { accentColor: '#06C755' },
    );
    expect(flex.contents.header.backgroundColor).toBe('#06C755');
  });
  it('D5 — course bubble: NO body text uses accentColor (only header bg uses it)', () => {
    const flex = buildCoursesFlex(
      [{ name: 'A', status: 'กำลังใช้งาน', qty: '5/10' }],
      { accentColor: '#0088FF' },
    );
    // Walk every text node in body, ensure none uses the accentColor
    function walkColors(node, colors = []) {
      if (!node) return colors;
      if (Array.isArray(node)) {
        node.forEach((n) => walkColors(n, colors));
        return colors;
      }
      if (node.type === 'text' && node.color) colors.push(node.color);
      if (node.contents) walkColors(node.contents, colors);
      return colors;
    }
    const bodyColors = walkColors(flex.contents.body);
    expect(bodyColors).not.toContain('#0088FF');
    expect(bodyColors).not.toContain('#dc2626');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.E — Adversarial inputs (no truncation regardless of input)
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.E — adversarial inputs (no truncation possible)', () => {
  const FUTURE = '2099-01-01';

  it('E1 — 60-char Thai course name preserved (no … in stored text)', () => {
    const longName = 'คอร์สรักษาสิวอักเสบลึกระดับมาก แบบเหมาตามจริงพิเศษ ครั้งที่ 12';
    const flex = buildCoursesFlex([{ name: longName, status: 'กำลังใช้งาน' }]);
    const stored = flex.contents.body.contents[0].contents[0].text;
    expect(stored).toBe(longName);
    expect(stored).not.toContain('…');
  });
  it('E2 — "Ultraformer III 200 Shot (เลือกสินค้าตามจริง)" full string preserved', () => {
    const longName = 'Ultraformer III 200 Shot (เลือกสินค้าตามจริง)';
    const flex = buildCoursesFlex([{ name: longName, status: 'กำลังใช้งาน' }]);
    const stored = flex.contents.body.contents[0].contents[0].text;
    expect(stored).toBe(longName);
    expect(stored).not.toContain('…');
  });
  it('E3 — long qty + expiry in meta line: full string, no …', () => {
    const flex = buildCoursesFlex([
      { name: 'Botox 100', status: 'กำลังใช้งาน', qty: '100 / 100 UNIT', expiry: '2027-12-31' },
    ]);
    const meta = flex.contents.body.contents[0].contents[1].text;
    expect(meta).toBe('คงเหลือ 100 / 100 UNIT · หมดอายุ 31/12/2570');
    expect(meta).not.toContain('…');
  });
  it('E4 — appt time "10:00–10:30" verbatim in JSON (the V33.5 reported bug)', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '10:00', endTime: '10:30', doctorName: 'D' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain('10:00–10:30');
  });
  it('E5 — appt with all 5 fields → 4 sub-rows (date, time, provider, note)', () => {
    const flex = buildAppointmentsFlex([
      {
        appointmentDate: FUTURE, startTime: '14:00', endTime: '15:00',
        doctorName: 'นพ. สมชาย', note: 'ฉีดโบท็อกซ์', status: 'pending',
      },
    ]);
    const apptBox = flex.contents.body.contents[0];
    expect(apptBox.contents.length).toBe(4);
  });
  it('E6 — 30 courses → 25 visible + footer (cap regression)', () => {
    const courses = Array.from({ length: 30 }, (_, i) => ({
      name: `Course ${i}`, status: 'กำลังใช้งาน', qty: `${i}/${i + 5}`,
    }));
    const flex = buildCoursesFlex(courses);
    expect(flex.contents.body.contents.length).toBe(26); // 25 rows + footer
    const footer = flex.contents.body.contents[25];
    expect(footer.contents[0].text).toMatch(/และอีก 5 รายการ/);
  });
  it('E7 — 0 active courses (all refunded) → empty-state bubble', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'คืนเงิน' },
      { name: 'B', status: 'ยกเลิก' },
    ]);
    expect(flex.altText).toMatch(/ไม่พบคอร์ส/);
  });
  it('E8 — course with status="active" English → still renders', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'active', qty: '5' },
    ]);
    expect(flex.contents.body.contents.length).toBeGreaterThanOrEqual(1);
    expect(flex.contents.body.contents[0].contents[0].text).toBe('A');
  });
  it('E9 — course with qty=0 (numeric zero, meaningful) → "คงเหลือ 0"', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน', qty: 0 },
    ]);
    expect(flex.contents.body.contents[0].contents[1].text).toBe('คงเหลือ 0');
  });
  it('E10 — qty null but remaining present → "คงเหลือ {remaining}"', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน', qty: null, remaining: '5' },
    ]);
    expect(flex.contents.body.contents[0].contents[1].text).toBe('คงเหลือ 5');
  });
  it('E11 — appt timezone-edge boundary: time "23:59–00:30" preserved', () => {
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, startTime: '23:59', endTime: '00:30' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain('23:59–00:30');
  });
  it('E12 — appt note long Thai (~80 chars) preserved within truncate cap', () => {
    const longNote = 'ผู้ป่วยมารับการฉีดโบท็อกซ์ ครั้งที่ 3 วันนี้';
    const flex = buildAppointmentsFlex([
      { appointmentDate: FUTURE, note: longNote },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).toContain(longNote);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.F — Source-grep regression guards
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.F — source-grep regression guards', () => {
  it('F1 — lineBotResponder.js has ZERO `wrap: false` in code (only in comments)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    // Strip line comments (// ...) and block comments to count only CODE occurrences.
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // After comment-strip, no wrap:false should remain.
    expect(stripped).not.toMatch(/wrap:\s*false/);
  });
  it('F2 — buildCourseMetaLine exported (V33.6 helper contract)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/export function buildCourseMetaLine/);
  });
  it('F3 — provider color literal #222222 in appointment provider row (NOT accentColor)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    // Find the provider sub-row block (contains 👨‍⚕️) and assert color: '#222222'
    const match = src.match(/'👨‍⚕️'[\s\S]{0,400}?color:\s*'([^']+)'/);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('#222222');
  });
  it('F4 — course rows use vertical layout (structural fix lock)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    // Locate buildCoursesFlex and assert its data-row factory uses layout: 'vertical'
    const start = src.indexOf('export function buildCoursesFlex');
    const end = src.indexOf('export function buildAppointmentsFlex');
    const block = src.slice(start, end);
    // The data-row map must produce vertical-layout boxes.
    expect(block).toMatch(/visible\.map/);
    expect(block).toMatch(/layout:\s*'vertical'/);
    // And must NOT have a separate "Header row of the table" comment marker
    expect(block).not.toMatch(/Header row of the table/);
  });
  it('F5 — appointment date+time are SEPARATE box pushes (split layout lock)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    const start = src.indexOf('export function buildAppointmentsFlex');
    const end = src.length;
    const block = src.slice(start, end);
    // V33.6 pattern: innerRows starts with date row, then `if (time) innerRows.push`
    expect(block).toMatch(/innerRows\s*=\s*\[/);
    expect(block).toMatch(/if\s*\(time\)\s*\{?\s*\n?\s*innerRows\.push/);
    // V33.5 anti-pattern (date+time combined inside one row's contents) gone:
    expect(block).not.toMatch(/Date \+ time row/);
  });
  it('F6 — V33.6 marker comment present (institutional memory grep)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/V33\.6/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.6.G — Backward-compat (existing imports still resolve)
// ────────────────────────────────────────────────────────────────────────
describe('V33.6.G — backward compat', () => {
  it('G1 — buildCoursesFlex / buildAppointmentsFlex / buildEmptyStateFlex / isMeaningfulValue / formatThaiDate still exported', () => {
    expect(typeof buildCoursesFlex).toBe('function');
    expect(typeof buildAppointmentsFlex).toBe('function');
    expect(typeof buildEmptyStateFlex).toBe('function');
    expect(typeof isMeaningfulValue).toBe('function');
    expect(typeof formatThaiDate).toBe('function');
  });
  it('G2 — empty courses → empty-state path unchanged', () => {
    const flex = buildCoursesFlex([]);
    expect(flex.contents.size).toBe('kilo');
    expect(flex.altText).toMatch(/ยังไม่มีคอร์ส/);
  });
  it('G3 — empty appointments → empty-state path unchanged', () => {
    const flex = buildAppointmentsFlex([]);
    expect(flex.contents.size).toBe('kilo');
  });
  it('G4 — altText on non-empty bubble still uses formatCoursesReply prefix', () => {
    const flex = buildCoursesFlex([{ name: 'A', status: 'กำลังใช้งาน', qty: '5' }]);
    expect(flex.altText).toMatch(/คอร์สที่ใช้ได้คงเหลือ/);
    expect(flex.altText).toMatch(/^📋/); // emoji-prefixed first line
  });
});
