// V33.8 — Filter consumed courses (remaining = 0) from LINE OA bot replies.
//
// User report (2026-04-27 mobile screenshot): bot reply showed entries
// like "Acne Tx 12 ครั้ง / Remaining 0 / 3 amp." in the active courses
// list. User said: "0 มันแปลว่าคอร์สนั้นหมดแล้ว ไม่ควรนับเป็นรายการ
// คอร์สเหลือด้วยซ้ำ".
//
// Root cause: ProClinic doesn't auto-flip course.status when remaining
// hits 0; status stays "กำลังใช้งาน". V33.5/.6/.7 active filter checked
// status only, so consumed courses leaked into both the body list AND
// the "199 รายการ" header count.
//
// Fix: parse leading "remaining" number from qty (or remaining) field.
// If 0 → exclude. Buffet courses ("เหมาตามจริง") + unparseable strings
// keep through (defensive — shouldn't filter on uncertainty).

import { describe, it, expect } from 'vitest';
import {
  parseRemainingCount,
  isCourseConsumed,
  formatCoursesReply,
  buildCoursesFlex,
} from '../src/lib/lineBotResponder.js';

// ────────────────────────────────────────────────────────────────────────
// V33.8.A — parseRemainingCount unit
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.A — parseRemainingCount', () => {
  it('A1 — "0/3 amp." → 0', () => {
    expect(parseRemainingCount('0/3 amp.')).toBe(0);
  });
  it('A2 — "0 / 3 amp." (with spaces) → 0', () => {
    expect(parseRemainingCount('0 / 3 amp.')).toBe(0);
  });
  it('A3 — "0 / 1 Shot" → 0', () => {
    expect(parseRemainingCount('0 / 1 Shot')).toBe(0);
  });
  it('A4 — "100 / 100 U" → 100', () => {
    expect(parseRemainingCount('100 / 100 U')).toBe(100);
  });
  it('A5 — "0/3 ครั้ง" (Thai unit) → 0', () => {
    expect(parseRemainingCount('0/3 ครั้ง')).toBe(0);
  });
  it('A6 — "0.5 / 1 U" (decimal) → 0.5', () => {
    expect(parseRemainingCount('0.5 / 1 U')).toBe(0.5);
  });
  it('A7 — "เหมาตามจริง" (buffet) → null', () => {
    expect(parseRemainingCount('เหมาตามจริง')).toBeNull();
  });
  it('A8 — "buffet" / "unlimited" → null', () => {
    expect(parseRemainingCount('buffet')).toBeNull();
    expect(parseRemainingCount('Unlimited')).toBeNull();
  });
  it('A9 — single number "5" → 5', () => {
    expect(parseRemainingCount('5')).toBe(5);
  });
  it('A10 — single number "0" → 0', () => {
    expect(parseRemainingCount('0')).toBe(0);
  });
  it('A11 — numeric input 0 → 0', () => {
    expect(parseRemainingCount(0)).toBe(0);
  });
  it('A12 — numeric input 5 → 5', () => {
    expect(parseRemainingCount(5)).toBe(5);
  });
  it('A13 — null / undefined / "" → null', () => {
    expect(parseRemainingCount(null)).toBeNull();
    expect(parseRemainingCount(undefined)).toBeNull();
    expect(parseRemainingCount('')).toBeNull();
    expect(parseRemainingCount('   ')).toBeNull();
  });
  it('A14 — non-numeric arbitrary text → null (defensive: keep visible)', () => {
    expect(parseRemainingCount('not-a-number')).toBeNull();
    expect(parseRemainingCount('abc/def')).toBeNull();
  });
  it('A15 — mixed Thai+Latin "0/3 amp." returns 0', () => {
    expect(parseRemainingCount('0/3 amp.')).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.8.B — isCourseConsumed
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.B — isCourseConsumed', () => {
  it('B1 — qty="0/3 amp." → consumed', () => {
    expect(isCourseConsumed({ qty: '0/3 amp.' })).toBe(true);
  });
  it('B2 — qty="100/100 U" → NOT consumed (still active)', () => {
    expect(isCourseConsumed({ qty: '100/100 U' })).toBe(false);
  });
  it('B3 — qty="5/10 ครั้ง" → NOT consumed', () => {
    expect(isCourseConsumed({ qty: '5/10 ครั้ง' })).toBe(false);
  });
  it('B4 — qty="เหมาตามจริง" (buffet) → NOT consumed', () => {
    expect(isCourseConsumed({ qty: 'เหมาตามจริง' })).toBe(false);
  });
  it('B5 — qty=0 numeric → consumed', () => {
    expect(isCourseConsumed({ qty: 0 })).toBe(true);
  });
  it('B6 — qty=5 numeric → NOT consumed', () => {
    expect(isCourseConsumed({ qty: 5 })).toBe(false);
  });
  it('B7 — qty missing, remaining="0" → consumed (fall-back checks remaining)', () => {
    expect(isCourseConsumed({ remaining: '0' })).toBe(true);
  });
  it('B8 — qty missing, remaining="5" → NOT consumed', () => {
    expect(isCourseConsumed({ remaining: '5' })).toBe(false);
  });
  it('B9 — both qty + remaining missing → NOT consumed (defensive: keep visible)', () => {
    expect(isCourseConsumed({})).toBe(false);
  });
  it('B10 — null course → NOT consumed', () => {
    expect(isCourseConsumed(null)).toBe(false);
  });
  it('B11 — qty="0.0/1 U" (decimal zero) → consumed', () => {
    expect(isCourseConsumed({ qty: '0.0/1 U' })).toBe(true);
  });
  it('B12 — qty="0.5/1 U" (decimal non-zero) → NOT consumed', () => {
    expect(isCourseConsumed({ qty: '0.5/1 U' })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.8.C — formatCoursesReply filters consumed
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.C — formatCoursesReply hides consumed', () => {
  const SCREENSHOT = [
    { name: 'Acne Tx 12 ครั้ง', status: 'กำลังใช้งาน', qty: '0 / 3 amp.' },
    { name: 'Botox Nabota 100 U', status: 'กำลังใช้งาน', qty: '69 / 200 U' },
    { name: 'Botox 50U', status: 'กำลังใช้งาน', qty: '0.5 / 0.5 U' },
    { name: 'HIFU 500 Shot + Oxycool + Mask pacenta', status: 'กำลังใช้งาน', qty: '0 / 1 Shot' },
    { name: 'Allergan (USA) 100 U', status: 'กำลังใช้งาน', qty: '100 / 100 U' },
    { name: 'Allergan 100 unit', status: 'กำลังใช้งาน', qty: '0 / 100 U' },
  ];

  it('C1 — consumed courses (Acne Tx, HIFU, Allergan-100) NOT in output', () => {
    const text = formatCoursesReply(SCREENSHOT);
    expect(text).not.toMatch(/Acne Tx 12/);
    expect(text).not.toMatch(/HIFU 500/);
    // Allergan 100 unit consumed; Allergan (USA) 100 U is active
    const lines = text.split('\n').filter((l) => l.includes('Allergan'));
    expect(lines.some((l) => l.includes('USA'))).toBe(true);
    expect(lines.some((l) => l.includes('100 unit') && !l.includes('USA'))).toBe(false);
  });
  it('C2 — non-consumed courses still shown', () => {
    const text = formatCoursesReply(SCREENSHOT);
    expect(text).toMatch(/Botox Nabota 100 U/);
    expect(text).toMatch(/Botox 50U/);
    expect(text).toMatch(/Allergan \(USA\) 100 U/);
  });
  it('C3 — all-consumed input → empty-state message', () => {
    const text = formatCoursesReply([
      { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' },
      { name: 'B', status: 'กำลังใช้งาน', qty: '0 / 5' },
    ]);
    expect(text).toMatch(/ไม่พบคอร์สที่ยังใช้ได้/);
  });
  it('C4 — buffet course kept even alongside consumed ones', () => {
    const text = formatCoursesReply([
      { name: 'Consumed', status: 'กำลังใช้งาน', qty: '0 / 3' },
      { name: 'Buffet Course', status: 'กำลังใช้งาน', qty: 'เหมาตามจริง' },
    ]);
    expect(text).not.toMatch(/Consumed/);
    expect(text).toMatch(/Buffet Course/);
  });
  it('C5 — EN copy: all-consumed → "No active courses found"', () => {
    const text = formatCoursesReply([
      { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' },
    ], 'en');
    expect(text).toMatch(/No active courses found/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.8.D — buildCoursesFlex filters consumed (count + body)
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.D — buildCoursesFlex hides consumed in body + count', () => {
  it('D1 — consumed course not rendered in body', () => {
    const flex = buildCoursesFlex([
      { name: 'Consumed', status: 'กำลังใช้งาน', qty: '0 / 3' },
      { name: 'Active', status: 'กำลังใช้งาน', qty: '5 / 10' },
    ]);
    const allTexts = JSON.stringify(flex.contents.body);
    expect(allTexts).not.toContain('Consumed');
    expect(allTexts).toContain('Active');
  });
  it('D2 — header count "N รายการ" reflects FILTERED count, not raw length', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' }, // filtered
      { name: 'B', status: 'กำลังใช้งาน', qty: '5 / 10' }, // kept
      { name: 'C', status: 'กำลังใช้งาน', qty: '0 / 5' }, // filtered
      { name: 'D', status: 'กำลังใช้งาน', qty: '1 / 1' }, // kept
    ]);
    const headerTexts = JSON.stringify(flex.contents.header);
    expect(headerTexts).toContain('2 รายการ');
    expect(headerTexts).not.toContain('4 รายการ');
  });
  it('D3 — EN header count "N items"', () => {
    const flex = buildCoursesFlex(
      [
        { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' },
        { name: 'B', status: 'กำลังใช้งาน', qty: '5 / 10' },
      ],
      { language: 'en' },
    );
    const headerTexts = JSON.stringify(flex.contents.header);
    expect(headerTexts).toMatch(/1 item/);
  });
  it('D4 — buffet kept even when consumed siblings filtered', () => {
    const flex = buildCoursesFlex([
      { name: 'Buffet', status: 'กำลังใช้งาน', qty: 'เหมาตามจริง' },
      { name: 'Consumed', status: 'กำลังใช้งาน', qty: '0 / 3' },
    ]);
    const bodyTexts = JSON.stringify(flex.contents.body);
    expect(bodyTexts).toContain('Buffet');
    expect(bodyTexts).not.toContain('Consumed');
  });
  it('D5 — all-consumed → empty-state bubble (size kilo, "No active" message)', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' },
      { name: 'B', status: 'กำลังใช้งาน', qty: '0 / 5' },
    ]);
    expect(flex.contents.size).toBe('kilo');
    expect(flex.altText).toMatch(/ไม่พบคอร์สที่ยังใช้ได้/);
  });
  it('D6 — body row count = filtered active.length (no footer when ≤ 25)', () => {
    const flex = buildCoursesFlex([
      { name: 'A', status: 'กำลังใช้งาน', qty: '0 / 3' }, // filtered
      { name: 'B', status: 'กำลังใช้งาน', qty: '5 / 10' }, // kept
      { name: 'C', status: 'กำลังใช้งาน', qty: '3 / 5' }, // kept
    ]);
    expect(flex.contents.body.contents.length).toBe(2);
  });
  it('D7 — 30-input with consumed scattered → footer reflects filtered overflow', () => {
    // 28 active + 2 consumed = 28 active, 25 visible + footer "และอีก 3"
    const arr = [];
    for (let i = 0; i < 28; i++) {
      arr.push({ name: `C${i}`, status: 'กำลังใช้งาน', qty: `${i + 1}/30` });
    }
    arr.push({ name: 'CONSUMED1', status: 'กำลังใช้งาน', qty: '0 / 5' });
    arr.push({ name: 'CONSUMED2', status: 'กำลังใช้งาน', qty: '0 / 9' });
    const flex = buildCoursesFlex(arr);
    expect(flex.contents.body.contents.length).toBe(26); // 25 + footer
    const footerText = flex.contents.body.contents[25].contents[0].text;
    expect(footerText).toMatch(/และอีก 3/);
    const all = JSON.stringify(flex.contents.body);
    expect(all).not.toContain('CONSUMED1');
    expect(all).not.toContain('CONSUMED2');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.8.E — exact user-report screenshot regression
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.E — user screenshot regression', () => {
  // The user reported these specific entries leaked through with 0 remaining:
  it('E1 — Acne Tx (0 / 3 amp.) is filtered', () => {
    const flex = buildCoursesFlex([
      { name: 'Acne Tx 12 ครั้ง', status: 'กำลังใช้งาน', qty: '0 / 3 amp.' },
      { name: 'Botox Nabota 100 U', status: 'กำลังใช้งาน', qty: '69 / 200 U' },
    ]);
    const all = JSON.stringify(flex.contents.body);
    expect(all).not.toContain('Acne Tx 12');
    expect(all).toContain('Botox Nabota 100 U');
  });
  it('E2 — HIFU bundle (0 / 1 Shot) is filtered', () => {
    const flex = buildCoursesFlex([
      { name: 'HIFU 500 Shot + Oxycool + Mask pacenta', status: 'กำลังใช้งาน', qty: '0 / 1 Shot' },
    ]);
    expect(flex.contents.size).toBe('kilo');
  });
  it('E3 — "Allergan 100 unit" (0 / 100 U) filtered but "(USA) 100 U" (100/100) kept', () => {
    const flex = buildCoursesFlex([
      { name: 'Allergan 100 unit', status: 'กำลังใช้งาน', qty: '0 / 100 U' },
      { name: 'Allergan (USA) 100 U', status: 'กำลังใช้งาน', qty: '100 / 100 U' },
    ]);
    const all = JSON.stringify(flex.contents.body);
    expect(all).not.toContain('Allergan 100 unit');
    expect(all).toContain('Allergan (USA) 100 U');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.8.F — source-grep regression guards
// ────────────────────────────────────────────────────────────────────────
describe('V33.8.F — source-grep guards', () => {
  it('F1 — parseRemainingCount + isCourseConsumed exported', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/export function parseRemainingCount/);
    expect(src).toMatch(/export function isCourseConsumed/);
  });
  it('F2 — formatCoursesReply uses isCourseConsumed in filter', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    const fn = src.match(/export function formatCoursesReply[\s\S]*?\n\}\n/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/isCourseConsumed\(c\)/);
  });
  it('F3 — buildCoursesFlex uses isCourseConsumed in filter', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    const fn = src.match(/export function buildCoursesFlex[\s\S]*?\n\}\n/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/isCourseConsumed\(c\)/);
  });
  it('F4 — V33.8 marker comment present (institutional memory grep)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/lineBotResponder.js', 'utf-8');
    expect(src).toMatch(/V33\.8/);
  });
});
