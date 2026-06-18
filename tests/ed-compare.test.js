// Unit — pure ED compare helpers (autoPickCompareRound + markChangedRows).
import { describe, it, expect } from 'vitest';
import { autoPickCompareRound, markChangedRows } from '../src/lib/edCompare.js';

const R = (id, date, types) => ({ id, assessmentDate: date, types, raw: {} });
const rounds = [
  R('r1', '2026-05-01', ['adam', 'iief']),
  R('r2', '2026-05-15', ['adam']),
  R('r3', '2026-06-01', ['adam', 'mrs']),
];

describe('autoPickCompareRound', () => {
  it('A1 picks nearest PRIOR round measuring the type', () => {
    expect(autoPickCompareRound(rounds, rounds[2], 'adam')?.id).toBe('r2'); // r3 → closest prior adam = r2
  });

  it('A2 falls back to nearest LATER when no prior measures the type', () => {
    expect(autoPickCompareRound(rounds, rounds[0], 'adam')?.id).toBe('r2'); // r1 → no prior → earliest later adam = r2
  });

  it('A3 returns null when no OTHER round measures the type', () => {
    expect(autoPickCompareRound(rounds, rounds[2], 'mrs')).toBeNull(); // only r3 has mrs
  });

  it('A4 excludes the primary itself + single-round + bad input → null', () => {
    expect(autoPickCompareRound([rounds[2]], rounds[2], 'adam')).toBeNull();
    expect(autoPickCompareRound(null, rounds[2], 'adam')).toBeNull();
    expect(autoPickCompareRound(rounds, null, 'adam')).toBeNull();
  });

  it('A5 type-filtered: iief only in r1 → from r1 there is no other iief → null', () => {
    expect(autoPickCompareRound(rounds, rounds[0], 'iief')).toBeNull();
  });

  it('A6 tolerates full-ISO + missing dates', () => {
    const withIso = [R('x', '2026-04-01T08:00:00.000Z', ['adam']), R('y', '', ['adam']), rounds[2]];
    expect(autoPickCompareRound(withIso, rounds[2], 'adam')?.id).toBe('x'); // x is prior; y('' → '') sorts before, x closest before
  });
});

describe('markChangedRows', () => {
  const a = [{ n: 1, answer: 'มีอาการ' }, { n: 2, answer: 'ไม่มี' }, { n: 3, answer: '—' }];
  const b = [{ n: 1, answer: 'ไม่มี' }, { n: 2, answer: 'ไม่มี' }, { n: 3, answer: 'มีอาการ' }];

  it('M1 flags differing rows (both present), aligned by n', () => {
    const { primary, compare } = markChangedRows(a, b);
    expect(primary.find((r) => r.n === 1).changed).toBe(true);
    expect(primary.find((r) => r.n === 2).changed).toBe(false); // identical
    expect(compare.find((r) => r.n === 1).changed).toBe(true); // symmetric
  });

  it('M2 does NOT flag when one side is "—" (missing answer)', () => {
    const { primary } = markChangedRows(a, b);
    expect(primary.find((r) => r.n === 3).changed).toBe(false); // a=— vs b=มีอาการ → not flagged
  });

  it('M3 aligns by n regardless of order', () => {
    const shuffled = [{ n: 2, answer: 'ไม่มี' }, { n: 1, answer: 'ไม่มี' }, { n: 3, answer: 'มีอาการ' }];
    const { primary } = markChangedRows(a, shuffled);
    expect(primary.find((r) => r.n === 1).changed).toBe(true);
    expect(primary.find((r) => r.n === 2).changed).toBe(false);
  });

  it('M4 handles empty / different-length / non-array', () => {
    expect(markChangedRows([], b).primary).toEqual([]);
    expect(markChangedRows(a, []).primary.every((r) => r.changed === false)).toBe(true);
    expect(markChangedRows(null, undefined)).toEqual({ primary: [], compare: [] });
  });

  it('M5 preserves the original row fields', () => {
    const rich = [{ n: 1, answer: 'x', question: 'q', flagged: true }];
    const { primary } = markChangedRows(rich, [{ n: 1, answer: 'y' }]);
    expect(primary[0]).toMatchObject({ n: 1, answer: 'x', question: 'q', flagged: true, changed: true });
  });
});
