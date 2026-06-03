// V159-fix B3 — stock date display normalized to dd/mm/yyyy (2026-06-03).
// User: "ปรับระบบการโชว์วันหมดอายุ หรือวันที่อื่นๆเป็น DD-MM-YYYY ด้วย" → chose
// dd/mm/yyyy (slash, consistent with the whole app + DateField + rule 04), display
// only (DB stays ISO). Stock expiry was rendering raw ISO (2026-09-30). New shared
// `fmtSlashDate` (canonical dateFormat.js) — TZ-safe for pure calendar dates.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtSlashDate } from '../src/lib/dateFormat.js';

// ════════ A — fmtSlashDate unit ════════
describe('fmtSlashDate', () => {
  it('A1 pure YYYY-MM-DD → dd/mm/yyyy (CE)', () => {
    expect(fmtSlashDate('2026-09-30')).toBe('30/09/2026');
    expect(fmtSlashDate('2027-01-01')).toBe('01/01/2027');
  });
  it('A2 ISO timestamp → dd/mm/yyyy (slices the date head)', () => {
    expect(fmtSlashDate('2026-09-30T00:00:00.000Z')).toBe('30/09/2026');
    expect(fmtSlashDate('2026-12-31T17:00:00+07:00')).toBe('31/12/2026');
  });
  it('A3 ★ TZ-safe — a pure calendar date never shifts day (no new Date math)', () => {
    // "2026-01-01" must NOT become 31/12/2025 on a UTC/negative-TZ host.
    expect(fmtSlashDate('2026-01-01')).toBe('01/01/2026');
    expect(fmtSlashDate('2026-12-31')).toBe('31/12/2026');
  });
  it('A4 be locale adds +543', () => {
    expect(fmtSlashDate('2026-09-30', { locale: 'be' })).toBe('30/09/2569');
  });
  it('A5 empty / null / undefined → "" (caller controls placeholder)', () => {
    expect(fmtSlashDate('')).toBe('');
    expect(fmtSlashDate(null)).toBe('');
    expect(fmtSlashDate(undefined)).toBe('');
  });
  it('A6 already-formatted dd/mm/yyyy → unchanged (idempotent-safe)', () => {
    expect(fmtSlashDate('30/09/2026')).toBe('30/09/2026');
  });
  it('A7 Date object → dd/mm/yyyy', () => {
    expect(fmtSlashDate(new Date(2026, 8, 30))).toBe('30/09/2026'); // month 8 = Sept
  });
  it('A8 unparseable string → returned as-is (no crash)', () => {
    expect(fmtSlashDate('not a date')).toBe('not a date');
  });
});

// ════════ B — source-grep: stock display sites use fmtSlashDate ════════
const FILES = {
  'StockBalancePanel.jsx': ['{fmtSlashDate(p.nextExpiry)', '{fmtSlashDate(b.expiresAt)', '(exp ${fmtSlashDate(b.expiresAt)'],
  'StockAdjustPanel.jsx': ['{fmtSlashDate(a.oldExpiresAt)', '${fmtSlashDate(b.expiresAt)', '{fmtSlashDate(selectedBatch.expiresAt)', '{fmtSlashDate(newExpiresAt)'],
  'AdjustDetailModal.jsx': ['{fmtSlashDate(batch.expiresAt)', '{fmtSlashDate(data.oldExpiresAt)', '{fmtSlashDate(data.newExpiresAt)'],
  'OrderDetailModal.jsx': ['{fmtSlashDate(it.expiresAt)', '{fmtSlashDate(order.importedDate)'],
  'CentralOrderDetailModal.jsx': ['{fmtSlashDate(it.expiresAt)'],
  'TransferDetailModal.jsx': ['หมด {fmtSlashDate(src.expiresAt)}'],
  'WithdrawalDetailModal.jsx': ['หมด {fmtSlashDate(src.expiresAt)}'],
};
const base = join(process.cwd(), 'src', 'components', 'backend');

describe('V159-fix B3 — stock expiry renders use fmtSlashDate', () => {
  for (const [file, needles] of Object.entries(FILES)) {
    const src = readFileSync(join(base, file), 'utf-8');
    it(`${file} imports fmtSlashDate from dateFormat`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bfmtSlashDate\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/dateFormat\.js['"]/);
    });
    for (const needle of needles) {
      it(`${file} renders ${needle.slice(0, 32)}… via fmtSlashDate`, () => {
        expect(src.includes(needle)).toBe(true);
      });
    }
  }
});
