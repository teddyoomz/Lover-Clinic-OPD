import { describe, it, expect } from 'vitest';
import {
  dateRangeFilter,
  groupBy,
  sumBy,
  sortBy,
  proportional,
  quantileBoundaries,
  quintileOf,
} from '../src/lib/reportsUtils.js';

describe('dateRangeFilter', () => {
  const items = [
    { id: 1, d: '2026-01-01' },
    { id: 2, d: '2026-02-15' },
    { id: 3, d: '2026-03-31' },
    { id: 4, d: '' },          // empty -> excluded
    { id: 5, d: null },        // null -> excluded
  ];

  it('filters inclusive of from + to', () => {
    const out = dateRangeFilter(items, 'd', '2026-02-01', '2026-03-31');
    expect(out.map(x => x.id)).toEqual([2, 3]);
  });

  it('treats empty from as no lower bound', () => {
    const out = dateRangeFilter(items, 'd', '', '2026-02-15');
    expect(out.map(x => x.id)).toEqual([1, 2]);
  });

  it('treats empty to as no upper bound', () => {
    const out = dateRangeFilter(items, 'd', '2026-02-15', '');
    expect(out.map(x => x.id)).toEqual([2, 3]);
  });

  it('excludes items missing the date field', () => {
    const out = dateRangeFilter(items, 'd', '', '');
    expect(out.map(x => x.id)).toEqual([1, 2, 3]);
  });

  it('returns [] for non-array input', () => {
    expect(dateRangeFilter(null, 'd', '', '')).toEqual([]);
    expect(dateRangeFilter(undefined, 'd', '', '')).toEqual([]);
  });

  it('returns [] when dateField is empty', () => {
    expect(dateRangeFilter(items, '', '', '')).toEqual([]);
  });
});

describe('groupBy', () => {
  it('groups by string key', () => {
    const items = [{ k: 'a' }, { k: 'b' }, { k: 'a' }];
    const map = groupBy(items, x => x.k);
    expect(map.get('a')).toHaveLength(2);
    expect(map.get('b')).toHaveLength(1);
  });

  it('coerces key to string (numbers become strings)', () => {
    const map = groupBy([{ k: 1 }, { k: 1 }], x => x.k);
    expect(map.get('1')).toHaveLength(2);
  });

  it('puts undefined / null keys into "" bucket', () => {
    const map = groupBy([{ k: undefined }, { k: null }], x => x.k);
    expect(map.get('')).toHaveLength(2);
  });

  it('returns empty Map on bad input', () => {
    expect(groupBy(null, x => x).size).toBe(0);
    expect(groupBy([], null).size).toBe(0);
  });
});

describe('sumBy', () => {
  it('sums simple numbers', () => {
    expect(sumBy([{ n: 1 }, { n: 2 }, { n: 3 }], x => x.n)).toBe(6);
  });

  it('coerces strings to numbers', () => {
    expect(sumBy([{ n: '1.5' }, { n: '2.5' }], x => x.n)).toBe(4);
  });

  it('skips NaN / non-finite without polluting total', () => {
    expect(sumBy([{ n: 1 }, { n: 'oops' }, { n: 2 }], x => x.n)).toBe(3);
  });

  it('returns 0 for empty / bad input', () => {
    expect(sumBy([], x => x)).toBe(0);
    expect(sumBy(null, x => x)).toBe(0);
    expect(sumBy([1, 2], null)).toBe(0);
  });
});

describe('sortBy', () => {
  it('sorts numbers ascending by default', () => {
    expect(sortBy([{ n: 3 }, { n: 1 }, { n: 2 }], x => x.n).map(x => x.n)).toEqual([1, 2, 3]);
  });

  it('sorts numbers descending', () => {
    expect(sortBy([{ n: 1 }, { n: 3 }], x => x.n, 'desc').map(x => x.n)).toEqual([3, 1]);
  });

  it('sorts Thai strings using locale comparator', () => {
    const out = sortBy([{ n: 'ข' }, { n: 'ก' }, { n: 'ค' }], x => x.n);
    expect(out.map(x => x.n)).toEqual(['ก', 'ข', 'ค']);
  });

  it('is stable on ties (preserves input order)', () => {
    const items = [{ n: 1, id: 'a' }, { n: 1, id: 'b' }, { n: 1, id: 'c' }];
    expect(sortBy(items, x => x.n).map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for bad input', () => {
    expect(sortBy(null, x => x)).toEqual([]);
    expect(sortBy([], null)).toEqual([]);
  });
});

describe('proportional', () => {
  it('splits total in proportion to weights and sums to total', () => {
    const out = proportional([1, 1, 2], 100);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(out[0]).toBeCloseTo(25, 2);
    expect(out[1]).toBeCloseTo(25, 2);
  });

  it('absorbs rounding drift in last cell so sum exactly equals total', () => {
    const out = proportional([1, 1, 1], 10); // 3.33 + 3.33 + 3.34 = 10
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
  });

  it('returns zeros when sum of weights is 0', () => {
    expect(proportional([0, 0, 0], 100)).toEqual([0, 0, 0]);
  });

  it('returns zeros when total is 0', () => {
    expect(proportional([1, 2, 3], 0)).toEqual([0, 0, 0]);
  });

  it('treats negative weights as 0', () => {
    const out = proportional([-1, 1], 100);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100);
  });

  it('returns [] for empty / non-array weights', () => {
    expect(proportional([], 100)).toEqual([]);
    expect(proportional(null, 100)).toEqual([]);
  });
});

describe('quantileBoundaries + quintileOf', () => {
  it('produces n+1 boundaries from a numeric series', () => {
    const b = quantileBoundaries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(b).toHaveLength(6);
    expect(b[0]).toBe(1);
    expect(b[5]).toBe(10);
  });

  it('returns [] for empty input', () => {
    expect(quantileBoundaries([], 5)).toEqual([]);
  });

  it('quintileOf maps top value to 5 and bottom value to 1', () => {
    const b = quantileBoundaries([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 5);
    expect(quintileOf(100, b)).toBe(5);
    expect(quintileOf(10, b)).toBe(1);
  });

  it('quintileOf collapses to median bin when boundaries empty', () => {
    expect(quintileOf(50, [])).toBe(3);
  });

  it('quintileOf handles non-finite values gracefully', () => {
    const b = quantileBoundaries([1, 2, 3], 5);
    expect(quintileOf(NaN, b)).toBe(3);
    expect(quintileOf(Infinity, b)).toBe(5);
  });

  it('all-equal series → all values map to top quintile', () => {
    const b = quantileBoundaries([5, 5, 5, 5, 5], 5);
    expect(quintileOf(5, b)).toBe(5);
  });
});
