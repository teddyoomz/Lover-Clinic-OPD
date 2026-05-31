import { describe, test, expect } from 'vitest';
import { sortApptsConfirmedFirst } from '../src/lib/appointmentHubFilters.js';

const mk = (id, status, startTime, serviceCompletedAt = null, date = '2026-05-31') =>
  ({ id, status, startTime, serviceCompletedAt, date });

describe('sortApptsConfirmedFirst (①)', () => {
  test('confirmed-active first, each partition by time asc', () => {
    const out = sortApptsConfirmedFirst([
      mk('a','pending','09:00'), mk('b','confirmed','10:30'),
      mk('c','pending','11:15'), mk('d','confirmed','13:00'),
    ]);
    expect(out.map(x => x.id)).toEqual(['b','d','a','c']);
  });
  test('confirmed but already served (serviceCompletedAt) drops to rest', () => {
    const out = sortApptsConfirmedFirst([
      mk('a','confirmed','09:00','2026-05-31T05:00:00Z'), // served → rest
      mk('b','confirmed','10:30'),                        // active → top
    ]);
    expect(out.map(x => x.id)).toEqual(['b','a']);
  });
  test('done/cancelled never bubble; empty safe', () => {
    expect(sortApptsConfirmedFirst([])).toEqual([]);
    const out = sortApptsConfirmedFirst([mk('a','done','09:00'), mk('b','cancelled','08:00'), mk('c','confirmed','12:00')]);
    expect(out[0].id).toBe('c');
  });
  test('does not mutate input', () => {
    const input = [mk('a','pending','09:00'), mk('b','confirmed','10:30')];
    const copy = JSON.parse(JSON.stringify(input));
    sortApptsConfirmedFirst(input);
    expect(input).toEqual(copy);
  });
});
