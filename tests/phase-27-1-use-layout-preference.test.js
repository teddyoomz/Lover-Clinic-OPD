// V27.1 — useLayoutPreference hook unit tests
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutPreference } from '../src/hooks/useLayoutPreference.js';

describe('U1 — useLayoutPreference', () => {
  beforeEach(() => { localStorage.clear(); });

  it('U1.1 default returns "left"', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('left');
    expect(result.current.isPrimaryLeft).toBe(true);
  });

  it('U1.2 custom default "right"', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key', 'right'));
    expect(result.current.position).toBe('right');
    expect(result.current.isPrimaryLeft).toBe(false);
  });

  it('U1.3 swap() flips position', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.swap());
    expect(result.current.position).toBe('right');
    act(() => result.current.swap());
    expect(result.current.position).toBe('left');
  });

  it('U1.4 writes to localStorage on swap', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.swap());
    expect(localStorage.getItem('layout_pref:test-key')).toBe('right');
  });

  it('U1.5 reads from localStorage on mount', () => {
    localStorage.setItem('layout_pref:test-key', 'right');
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('right');
  });

  it('U1.6 rejects invalid stored values (falls back to default)', () => {
    localStorage.setItem('layout_pref:test-key', 'middle');
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('left');
  });

  it('U1.7 setPosition validates input', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.setPosition('right'));
    expect(result.current.position).toBe('right');
    act(() => result.current.setPosition('invalid'));
    expect(result.current.position).toBe('right');  // unchanged
  });

  it('U1.8 isPrimaryLeft reflects position', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.isPrimaryLeft).toBe(true);
    act(() => result.current.swap());
    expect(result.current.isPrimaryLeft).toBe(false);
  });
});
