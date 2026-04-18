// ─── dateFormat.js adversarial tests — Rule-of-3 dedupe (test-equal-to-code) ──
// Before this module existed, 11 files duplicated fmtDate/fmtThaiDate with
// slightly-drifting behavior. These tests pin the new shared contract so that
// any future regression trips here first.

import { describe, it, expect } from 'vitest';
import {
  fmtThaiDate,
  fmtSlashDateTime,
  THAI_MONTHS_SHORT,
  THAI_MONTHS_FULL,
} from '../src/lib/dateFormat.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Month arrays — guard against typos (accidentally deleting 'ต.ค.' etc.)
// ═══════════════════════════════════════════════════════════════════════════
describe('THAI_MONTHS_SHORT', () => {
  it('has 12 entries in calendar order', () => {
    expect(THAI_MONTHS_SHORT).toHaveLength(12);
    expect(THAI_MONTHS_SHORT[0]).toBe('ม.ค.');
    expect(THAI_MONTHS_SHORT[11]).toBe('ธ.ค.');
  });
});

describe('THAI_MONTHS_FULL', () => {
  it('has 12 entries in calendar order', () => {
    expect(THAI_MONTHS_FULL).toHaveLength(12);
    expect(THAI_MONTHS_FULL[0]).toBe('มกราคม');
    expect(THAI_MONTHS_FULL[11]).toBe('ธันวาคม');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. fmtThaiDate — pure YYYY-MM-DD path (no TZ math)
// ═══════════════════════════════════════════════════════════════════════════
describe('fmtThaiDate — pure date string', () => {
  it('defaults to short month + full BE year', () => {
    expect(fmtThaiDate('2026-04-19')).toBe('19 เม.ย. 2569');
  });

  it('supports full month name', () => {
    expect(fmtThaiDate('2026-04-19', { monthStyle: 'full' })).toBe('19 เมษายน 2569');
  });

  it('supports 2-digit short year (DepositPicker legacy format)', () => {
    expect(fmtThaiDate('2026-04-19', { yearStyle: 'short' })).toBe('19 เม.ย. 69');
  });

  it('combines full month + short year', () => {
    expect(fmtThaiDate('2026-01-05', { monthStyle: 'full', yearStyle: 'short' })).toBe('5 มกราคม 69');
  });

  it('strips leading zero from day', () => {
    expect(fmtThaiDate('2026-04-09')).toBe('9 เม.ย. 2569');
  });

  it('handles edge months — January → ม.ค., December → ธ.ค.', () => {
    expect(fmtThaiDate('2026-01-01')).toBe('1 ม.ค. 2569');
    expect(fmtThaiDate('2026-12-31')).toBe('31 ธ.ค. 2569');
  });

  it('is TZ-independent on pure date strings — no drift at midnight UTC', () => {
    // Old bug: .toISOString() on a Date("2026-04-19") at Thai 00:30 returned previous day.
    // The pure-date path in fmtThaiDate never touches Date, so it cannot drift.
    expect(fmtThaiDate('2026-04-19')).toBe('19 เม.ย. 2569');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. fmtThaiDate — ISO / Date path (uses local TZ)
// ═══════════════════════════════════════════════════════════════════════════
describe('fmtThaiDate — Date/ISO input', () => {
  it('accepts a Date instance', () => {
    const d = new Date(2026, 3, 19, 12, 30); // April 19, 2026 local
    expect(fmtThaiDate(d)).toBe('19 เม.ย. 2569');
  });

  it('accepts an ISO string with time', () => {
    const d = new Date(2026, 0, 5, 12, 30);
    const iso = d.toISOString();
    // Host TZ applies — MembershipPanel semantics preserved.
    expect(fmtThaiDate(iso)).toBe(`${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. fmtThaiDate — defensive behavior
// ═══════════════════════════════════════════════════════════════════════════
describe('fmtThaiDate — empty / invalid', () => {
  it('returns "-" for null', () => expect(fmtThaiDate(null)).toBe('-'));
  it('returns "-" for undefined', () => expect(fmtThaiDate(undefined)).toBe('-'));
  it('returns "-" for empty string', () => expect(fmtThaiDate('')).toBe('-'));

  it('returns original string for invalid date input', () => {
    expect(fmtThaiDate('not-a-date')).toBe('not-a-date');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. fmtSlashDateTime — DD/MM/YYYY + HH:mm format
// ═══════════════════════════════════════════════════════════════════════════
describe('fmtSlashDateTime', () => {
  it('returns DD/MM/YYYY HH:mm by default', () => {
    const d = new Date(2026, 3, 19, 9, 5);
    expect(fmtSlashDateTime(d)).toBe('19/04/2026 09:05');
  });

  it('zero-pads single-digit day, month, hour, minute', () => {
    const d = new Date(2026, 0, 5, 3, 7);
    expect(fmtSlashDateTime(d)).toBe('05/01/2026 03:07');
  });

  it('supports withTime:false for OrderPanel-style display', () => {
    const d = new Date(2026, 3, 19, 9, 5);
    expect(fmtSlashDateTime(d, { withTime: false })).toBe('19/04/2026');
  });

  it('returns "-" for empty input', () => {
    expect(fmtSlashDateTime(null)).toBe('-');
    expect(fmtSlashDateTime(undefined)).toBe('-');
    expect(fmtSlashDateTime('')).toBe('-');
  });

  it('returns the original string for invalid input', () => {
    expect(fmtSlashDateTime('garbage')).toBe('garbage');
  });

  it('accepts ISO datetime strings', () => {
    const d = new Date(2026, 3, 19, 14, 30);
    const iso = d.toISOString();
    expect(fmtSlashDateTime(iso)).toBe('19/04/2026 14:30');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Cross-helper sanity — output consistency across the 11 ex-duplicate sites
// ═══════════════════════════════════════════════════════════════════════════
describe('cross-site equivalence', () => {
  it('SaleTab-style "2026-04-19" → "19 เม.ย. 2569"', () => {
    expect(fmtThaiDate('2026-04-19')).toBe('19 เม.ย. 2569');
  });

  it('DepositPicker-style "2026-04-19" w/ short year → "19 เม.ย. 69"', () => {
    expect(fmtThaiDate('2026-04-19', { yearStyle: 'short' })).toBe('19 เม.ย. 69');
  });

  it('MovementLog-style ISO → "19/04/2026 09:05"', () => {
    const iso = new Date(2026, 3, 19, 9, 5).toISOString();
    expect(fmtSlashDateTime(iso)).toBe('19/04/2026 09:05');
  });

  it('OrderPanel-style ISO no-time → "19/04/2026"', () => {
    const iso = new Date(2026, 3, 19, 9, 5).toISOString();
    expect(fmtSlashDateTime(iso, { withTime: false })).toBe('19/04/2026');
  });
});
