import { describe, it, expect } from 'vitest';
import {
  deriveRounds, nextRoundNumber, latestPerType, latestRounds, ED_TYPES,
} from '../src/lib/assessmentRoundsCore.js';

const intake = { adam_1: true, adam_2: true, adam_3: true, adam_6: true, assessmentDate: '2026-05-20' };
const fuA = {
  id: 'A', status: 'completed', assessmentDate: '2026-06-14', types: ['adam', 'iief'],
  rawAnswers: { adam_1: true, adam_3: true, adam_6: true, iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3' },
};
const fuB = {
  id: 'B', status: 'completed', assessmentDate: '2026-06-20', types: ['mrs'],
  rawAnswers: { mrs_1: '2', mrs_2: '1', mrs_3: '1' },
};

describe('deriveRounds', () => {
  it('intake present → round 1 is virtual intake, sorted date asc, derived round#', () => {
    const rounds = deriveRounds(intake, [fuA]);
    expect(rounds.length).toBe(2);
    expect(rounds[0].round).toBe(1);
    expect(rounds[0].source).toBe('intake');
    expect(rounds[0].deletable).toBe(false);
    expect(rounds[1].round).toBe(2);
    expect(rounds[1].source).toBe('followup');
    expect(rounds[1].deletable).toBe(true);
  });

  it('no intake perf → first followup is round 1', () => {
    const rounds = deriveRounds({}, [fuA]);
    expect(rounds.length).toBe(1);
    expect(rounds[0].round).toBe(1);
    expect(rounds[0].source).toBe('followup');
  });

  it('3 rounds sort by date asc regardless of input order', () => {
    const rounds = deriveRounds(intake, [fuB, fuA]); // out of order
    expect(rounds.map((r) => r.id)).toEqual(['__intake__', 'A', 'B']);
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it('pending (not-completed) rounds are excluded', () => {
    const pending = { id: 'P', status: 'pending', assessmentDate: '', rawAnswers: {} };
    expect(deriveRounds(intake, [pending]).length).toBe(1); // only intake
  });

  it('types derived from rawAnswers when types[] absent', () => {
    const noTypes = { id: 'X', status: 'completed', assessmentDate: '2026-06-01', rawAnswers: { adam_1: true, symp_pe: true } };
    expect(deriveRounds({}, [noTypes])[0].types.sort()).toEqual(['adam', 'pe']);
  });
});

describe('nextRoundNumber (delete renumbers — Q4)', () => {
  it('intake + 0 followups → next 2; +1 → next 3', () => {
    expect(nextRoundNumber(intake, [])).toBe(2);
    expect(nextRoundNumber(intake, [fuA])).toBe(3);
  });
  it('delete the latest followup → next reverts (3 → back to 3, not 4)', () => {
    expect(nextRoundNumber(intake, [fuA, fuB])).toBe(4);
    expect(nextRoundNumber(intake, [fuA])).toBe(3); // fuB deleted → next is 3 again
  });
  it('no data at all → next 1', () => {
    expect(nextRoundNumber({}, [])).toBe(1);
    expect(nextRoundNumber(null, null)).toBe(1);
  });
});

describe('latestPerType', () => {
  it('each type → most-recent round measuring it (with round#)', () => {
    const lpt = latestPerType(intake, [fuA, fuB]);
    expect(lpt.adam.round).toBe(2); // fuA newer than intake
    expect(lpt.iief.round).toBe(2); // only fuA
    expect(lpt.mrs.round).toBe(3);  // only fuB
    expect(lpt.pe).toBeNull();      // never measured
  });
  it('intake-only → adam from intake', () => {
    const lpt = latestPerType(intake, []);
    expect(lpt.adam.round).toBe(1);
    expect(lpt.iief).toBeNull();
  });
});

describe('latestRounds (newest-first, for TFP latest-2)', () => {
  it('returns last N reversed', () => {
    const lr = latestRounds(intake, [fuA, fuB], 2);
    expect(lr.map((r) => r.id)).toEqual(['B', 'A']); // newest first
    expect(lr[0].round).toBe(3);
  });
  it('fewer than N → all', () => {
    expect(latestRounds(intake, [], 2).length).toBe(1);
  });
});

describe('adversarial', () => {
  it('handles null/undefined/empty without throwing', () => {
    expect(deriveRounds(null, null)).toEqual([]);
    expect(deriveRounds(undefined, undefined)).toEqual([]);
    expect(deriveRounds({}, [])).toEqual([]);
  });
  it('blank assessmentDate sorts stable (insertion order)', () => {
    const noDate1 = { id: 'N1', status: 'completed', assessmentDate: '', rawAnswers: { adam_1: true } };
    const noDate2 = { id: 'N2', status: 'completed', assessmentDate: '', rawAnswers: { adam_2: true } };
    const rounds = deriveRounds({}, [noDate1, noDate2]);
    expect(rounds.map((r) => r.id)).toEqual(['N1', 'N2']);
  });
  it('intake with no meaningful perf is NOT a round', () => {
    expect(deriveRounds({ adam_1: false, assessmentDate: '2026-01-01' }, []).length).toBe(0);
  });
  it('mrs_x="0" (valid zero) counts as meaningful', () => {
    const z = { id: 'Z', status: 'completed', assessmentDate: '2026-06-01', rawAnswers: { mrs_1: '0' } };
    expect(deriveRounds({}, [z])[0].types).toContain('mrs');
  });
  it('50-round stress → derived round# is dense 1..51', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `R${i}`, status: 'completed', assessmentDate: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      rawAnswers: { adam_1: true },
    }));
    const rounds = deriveRounds(intake, many);
    expect(rounds.length).toBe(51);
    expect(rounds[rounds.length - 1].round).toBe(51);
  });
  it('ED_TYPES is the canonical 4', () => {
    expect(ED_TYPES).toEqual(['adam', 'iief', 'mrs', 'pe']);
  });
});
