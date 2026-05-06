// tests/phase-21-0-quinquies-visual-polish.test.js
// Phase 21.0-quinquies + 21.0-sexies — UI polish source-grep contract.
//
// Locks the visual upgrades shipped after user feedback:
//   - "ตารางเราแม่งโคตรจะไม่สวยดูยาก ลายตา" (calendar grid hard to read)
//   - "ลูกค้าลากคิวยาว ... เอาเส้นขาวๆในพื้นที่สีส้มออกไปปป" (occupied
//     cells must skip top border so block area stays clean)
//   - "นัดมาเพื่อ ไปแสดงในช่องการเงิน ในตารางรายการนั้นๆ โดนเพื่อ column
//     มัดจำสำหรับ" (Finance.มัดจำ table needs a "มัดจำสำหรับ" column)
//
// Anti-regression: refactors that drop the contract fail the build/test.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ACV = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
const DP  = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');

describe('Phase 21.0-quinquies — Calendar grid visual polish', () => {
  test('Q1 SLOT_H bumped to 22 (was 18) for breathing room', () => {
    expect(ACV).toMatch(/const SLOT_H = 22;/);
  });

  test('Q2 STATUSES array exposes per-status `accent` color (4px left-border)', () => {
    // Each of the 4 statuses must have an `accent: 'rgb(...)'` field.
    expect(ACV).toMatch(/value:\s*['"]pending['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ACV).toMatch(/value:\s*['"]confirmed['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ACV).toMatch(/value:\s*['"]done['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ACV).toMatch(/value:\s*['"]cancelled['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
  });

  test('Q3 appointment block applies 4px status-accent left border', () => {
    expect(ACV).toMatch(/borderLeft:\s*`4px solid \$\{st\.accent\}`/);
  });

  test('Q4 customer name uses text-sm font-bold leading-tight (legibility)', () => {
    expect(ACV).toMatch(/text-sm font-bold text-\[var\(--tx-heading\)\] leading-tight/);
  });

  test('Q5 AppointmentSlotMeta exposes purpose chip with 🎯 emoji + data-testid', () => {
    expect(ACV).toMatch(/data-testid=['"]appt-purpose['"]/);
    expect(ACV).toMatch(/🎯\s*\{appt\.appointmentTo\}/);
    expect(ACV).toMatch(/text-emerald-300/);
  });

  test('Q6 doctor row has 👨‍⚕️ icon prefix + data-testid for selectability', () => {
    expect(ACV).toMatch(/data-testid=['"]appt-doctor-row['"]/);
    expect(ACV).toMatch(/👨‍⚕️/);
  });

  test('Q7 visibility tiers: span >= 2 purpose, >= 3 doctor, >= 4 assistants', () => {
    // Purpose tier
    expect(ACV).toMatch(/appt\.appointmentTo\s*&&\s*span\s*>=\s*2/);
    // Doctor tier
    expect(ACV).toMatch(/span\s*>=\s*3[\s\S]{0,200}?appt-doctor-row/);
    // Assistants tier (15.7 had >= 2; bumped to >= 4 for the bigger SLOT_H)
    expect(ACV).toMatch(/assistantNames\.length\s*>\s*0\s*&&\s*span\s*>=\s*4/);
  });
});

describe('Phase 21.0-sexies — Occupied cells skip top border', () => {
  test('S1 cellBorderCls helper defined inside TIME_SLOTS map', () => {
    // The hour/half/quarter style logic now lives at cell level.
    expect(ACV).toMatch(/const cellBorderCls =\s*isHour/);
    expect(ACV).toMatch(/border-t-2 border-\[var\(--bd\)\]\/70/);
    expect(ACV).toMatch(/border-t border-\[var\(--bd\)\]\/35/);
    expect(ACV).toMatch(/border-t border-\[var\(--bd\)\]\/15/);
  });

  test('S2 row wrapper itself does NOT carry the row border (moved to cells)', () => {
    // The row wrapper is `<div key={time} className="flex" style={{ height: SLOT_H }}>`
    // — note: NO border-t-* class on the wrapper.
    expect(ACV).toMatch(/<div key=\{time\} className="flex" style=\{\{ height: SLOT_H \}\}>/);
  });

  test('S3 time-label cell carries cellBorderCls (always visible)', () => {
    expect(ACV).toMatch(/text-right pr-2 pt-0\.5 font-mono \$\{labelCls\} \$\{cellBorderCls\}/);
  });

  test('S4 appointment-block FIRST row keeps cellBorderCls (top boundary)', () => {
    // The block-rendering branch's outer cell includes cellBorderCls.
    expect(ACV).toMatch(/relative \$\{cellBorderCls\}/);
  });

  test('S5 occupied empty cells SKIP cellBorderCls (no stripes through block)', () => {
    // The conditional at the empty-cell branch: occupied → no border.
    expect(ACV).toMatch(/\$\{occupied\s*\?\s*['"]['"]\s*:\s*`\$\{cellBorderCls\}/);
  });
});

describe('Phase 21.0-quinquies — Finance.มัดจำ table "มัดจำสำหรับ" column', () => {
  test('D1 column header "มัดจำสำหรับ" present in deposit table', () => {
    // Column header array now includes มัดจำสำหรับ between ลูกค้า and ยอด.
    expect(DP).toMatch(/'มัดจำสำหรับ'/);
    // Position check: must come BEFORE 'ยอด / คงเหลือ' in the header array.
    const headerLine = DP.match(/\['เลขที่',[\s\S]{0,200}?\.map\(h =>/);
    expect(headerLine).not.toBeNull();
    const idxPurpose = headerLine[0].indexOf("'มัดจำสำหรับ'");
    const idxAmount  = headerLine[0].indexOf("'ยอด / คงเหลือ'");
    expect(idxPurpose).toBeGreaterThan(0);
    expect(idxPurpose).toBeLessThan(idxAmount);
  });

  test('D2 deposit row renders <td data-testid="deposit-purpose-cell">', () => {
    expect(DP).toMatch(/data-testid=['"]deposit-purpose-cell['"]/);
  });

  test('D3 cell sources from dep.appointment.purpose with appointmentTo fallback', () => {
    expect(DP).toMatch(/dep\.appointment\?\.purpose\s*\|\|\s*dep\.appointment\?\.appointmentTo/);
  });

  test('D4 non-empty value renders with 🎯 prefix in emerald chip', () => {
    expect(DP).toMatch(/🎯\s*\{dep\.appointment\.purpose\s*\|\|\s*dep\.appointment\.appointmentTo\}/);
    expect(DP).toMatch(/bg-emerald-900\/20/);
  });

  test('D5 empty fallback renders dash placeholder', () => {
    expect(DP).toMatch(/text-\[var\(--tx-muted\)\]\/60[\s\S]{0,80}?—/);
  });

  test('D6 column max-width prevents long purposes from breaking the layout', () => {
    expect(DP).toMatch(/max-w-\[200px\][\s\S]{0,40}?deposit-purpose-cell/);
  });
});
