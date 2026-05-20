// tests/use-is-below-lg.test.js
//
// Calendar-density T6 (2026-05-20) — useIsBelowLg responsive hook.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsBelowLg } from '../src/hooks/useIsBelowLg.js';

function mockMatchMedia(matches) {
  const listeners = new Set();
  const mql = {
    matches,
    media: '(max-width: 1023px)',
    addEventListener: (_e, cb) => listeners.add(cb),
    removeEventListener: (_e, cb) => listeners.delete(cb),
    addListener: (cb) => listeners.add(cb),
    removeListener: (cb) => listeners.delete(cb),
    dispatchChange(next) {
      this.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
  window.matchMedia = vi.fn(() => mql);
  return mql;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useIsBelowLg', () => {
  it('IBL1 returns true when matchMedia matches (below lg)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsBelowLg());
    expect(result.current).toBe(true);
  });

  it('IBL2 returns false when matchMedia does not match (>= lg)', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsBelowLg());
    expect(result.current).toBe(false);
  });

  it('IBL3 updates when the media query change fires', () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useIsBelowLg());
    expect(result.current).toBe(false);
    act(() => mql.dispatchChange(true));
    expect(result.current).toBe(true);
    act(() => mql.dispatchChange(false));
    expect(result.current).toBe(false);
  });
});
