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
// Calendar-density (2026-05-20) — STATUSES palette moved to this shared lib
// module (APPT_STATUSES, single source / Rule of 3); the grid imports it.
const ADJS = readFileSync('src/lib/appointmentDisplay.js', 'utf8');

describe('Phase 21.0-quinquies — Calendar grid visual polish', () => {
  test('Q1 row-height floor = MIN_SLOT_H 22 (V128.cal — dynamic slotH clamps to this floor)', () => {
    // V128.cal (2026-05-28) — fixed SLOT_H replaced by a dynamic slotH that
    // fills the viewport (computeApptSlotHeight); 22 is preserved as the floor.
    expect(ACV).toMatch(/const MIN_SLOT_H = 22;/);
    expect(ACV).toMatch(/computeApptSlotHeight/);
  });

  test('Q2 STATUSES palette exposes per-status `accent` color (4px left-border)', () => {
    // Calendar-density (2026-05-20) — palette moved to APPT_STATUSES in the
    // shared lib (single source); the grid imports it as STATUSES.
    expect(ACV).toMatch(/import \{[^}]*APPT_STATUSES[^}]*\} from '\.\.\/\.\.\/lib\/appointmentDisplay\.js'/);
    expect(ACV).toMatch(/const STATUSES = APPT_STATUSES;/);
    // Each of the 4 statuses must still carry an `accent: 'rgb(...)'` field.
    expect(ADJS).toMatch(/value:\s*['"]pending['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ADJS).toMatch(/value:\s*['"]confirmed['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ADJS).toMatch(/value:\s*['"]done['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
    expect(ADJS).toMatch(/value:\s*['"]cancelled['"][\s\S]{0,200}?accent:\s*['"]rgb\(/);
  });

  test('Q3 appointment block applies 4px status-accent left border', () => {
    expect(ACV).toMatch(/borderLeft:\s*`4px solid \$\{st\.accent\}`/);
  });

  test('Q4 customer name uses text-sm font-bold for normal blocks (span-gated legibility)', () => {
    // Calendar-density (2026-05-20) — name size is span-gated via nameSizeCls
    // (span=1 → text-[11px] single-line; span>=2 → text-sm). Legibility for
    // normal/long blocks is preserved through the text-sm branch.
    expect(ACV).toMatch(/const nameSizeCls = isShortBlock \? 'text-\[11px\] leading-\[18px\]' : 'text-sm leading-tight'/);
    expect(ACV).toMatch(/\$\{nameSizeCls\} font-bold text-\[var\(--tx-heading\)\]/);
  });

  test('Q5 AppointmentSlotMeta exposes purpose chip with 🎯 emoji + data-testid', () => {
    expect(ACV).toMatch(/data-testid=['"]appt-purpose['"]/);
    expect(ACV).toMatch(/🎯\s*\{appt\.appointmentTo\}/);
    expect(ACV).toMatch(/text-emerald-300/);
  });

  test('Q5-septies purpose font matches customer-name size (text-sm font-bold) per user "ใหญ่พอๆกะชื่อ"', () => {
    // Locate the purpose <p> classes — must be text-sm font-bold leading-tight
    // (same size class as customer name; color differentiates).
    expect(ACV).toMatch(/data-testid=['"]appt-purpose['"]/);
    // Walk up to the className of the purpose <p>:
    const purposeBlock = ACV.match(/<p[\s\S]{0,400}?data-testid=['"]appt-purpose['"]/);
    expect(purposeBlock).not.toBeNull();
    expect(purposeBlock[0]).toMatch(/text-sm/);
    expect(purposeBlock[0]).toMatch(/font-bold/);
    expect(purposeBlock[0]).toMatch(/leading-tight/);
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
    // The row wrapper is `<div key={time} className="flex" style={{ height: slotH }}>`
    // (V128.cal — dynamic slotH; was SLOT_H) — note: NO border-t-* class on the wrapper.
    expect(ACV).toMatch(/<div key=\{time\} className="flex" style=\{\{ height: slotH \}\}>/);
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
    // Phase 24.0-undecies (2026-05-06) — emoji + value were split into two
    // <span> children so the outer flex container can wrap multi-line strings
    // (e.g. "อื่นๆ: ผ่ามุก, ทำหมัน") without truncating. The display still
    // uses 🎯 + dep.appointment.purpose || appointmentTo, just in two spans.
    expect(DP).toMatch(/<span\s+className="shrink-0">🎯<\/span>/);
    // V-deposit-noappt (2026-05-27) — optional-chained + dep.purpose fallback.
    expect(DP).toMatch(/<span>\{dep\.appointment\?\.purpose\s*\|\|\s*dep\.appointment\?\.appointmentTo\s*\|\|\s*dep\.purpose\}<\/span>/);
    expect(DP).toMatch(/bg-emerald-900\/20/);
  });

  test('D5 empty fallback renders dash placeholder', () => {
    expect(DP).toMatch(/text-\[var\(--tx-muted\)\]\/60[\s\S]{0,80}?—/);
  });

  test('D6 column max-width still bounds the layout (Phase 24.0-undecies widened to 280)', () => {
    // Phase 24.0-undecies — was max-w-[200px] (with truncate, hid long
    // purposes silently). Now max-w-[280px] + whitespace-normal break-words
    // so multi-purpose strings ("สมรรถภาพ, อื่นๆ: ผ่ามุก") show in full.
    // Lock-in: width must be present AND ≥240; truncate must be absent.
    const tdRow = DP.match(/<td\s+[^>]*deposit-purpose-cell[^>]*>/);
    expect(tdRow).toBeTruthy();
    const widthMatch = tdRow[0].match(/max-w-\[(\d+)px\]/);
    expect(widthMatch).toBeTruthy();
    expect(Number(widthMatch[1])).toBeGreaterThanOrEqual(240);
    // Anti-regression: no `truncate` class anywhere in the cell block.
    const cellBlock = DP.match(/data-testid="deposit-purpose-cell"[\s\S]*?<\/td>/);
    expect(cellBlock[0]).not.toMatch(/\btruncate\b/);
    expect(cellBlock[0]).toMatch(/whitespace-normal/);
  });
});
