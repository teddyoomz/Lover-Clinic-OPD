// V27.1 — useLayoutPreference property-based invariants (V55 methodology)
import { describe, beforeEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutPreference } from '../src/hooks/useLayoutPreference.js';

const RUNS_50 = { numRuns: 50 };
const RUNS_100 = { numRuns: 100 };

function uniqueKey() {
  return `pb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('PB — useLayoutPreference invariants', () => {
  beforeEach(() => { localStorage.clear(); });

  test.prop([fc.integer({ min: 0, max: 50 })], RUNS_50)(
    'PB.1 swap involution: N×swap from default — N even → "left", N odd → "right"',
    (n) => {
      localStorage.clear();
      const { result } = renderHook(() => useLayoutPreference(uniqueKey()));
      act(() => {
        for (let i = 0; i < n; i++) result.current.swap();
      });
      const expected = n % 2 === 0 ? 'left' : 'right';
      return result.current.position === expected;
    }
  );

  test.prop([fc.string()], RUNS_100)(
    'PB.2 invalid stored values always reduce to default "left"',
    (junk) => {
      // Skip if junk happens to be a valid value
      if (junk === 'left' || junk === 'right') return true;
      const key = uniqueKey();
      localStorage.setItem(`layout_pref:${key}`, junk);
      const { result } = renderHook(() => useLayoutPreference(key));
      return result.current.position === 'left';
    }
  );

  test.prop([fc.constantFrom('left', 'right')], RUNS_50)(
    'PB.3 setPosition with valid value always wins',
    (target) => {
      const { result } = renderHook(() => useLayoutPreference(uniqueKey()));
      act(() => result.current.setPosition(target));
      return result.current.position === target;
    }
  );

  test.prop([fc.string({ minLength: 1 })], RUNS_50)(
    'PB.4 storage key has prefix "layout_pref:"',
    (key) => {
      const { result } = renderHook(() => useLayoutPreference(key));
      act(() => result.current.swap());
      const stored = localStorage.getItem(`layout_pref:${key}`);
      return stored === 'right';
    }
  );

  test.prop([fc.array(fc.constantFrom('swap', 'left', 'right'), { minLength: 1, maxLength: 20 })], RUNS_50)(
    'PB.5 only "left" or "right" ever in localStorage (no invalid leaks)',
    (ops) => {
      const key = uniqueKey();
      const { result } = renderHook(() => useLayoutPreference(key));
      act(() => {
        for (const op of ops) {
          if (op === 'swap') result.current.swap();
          else result.current.setPosition(op);
        }
      });
      const stored = localStorage.getItem(`layout_pref:${key}`);
      return stored === 'left' || stored === 'right';
    }
  );
});
