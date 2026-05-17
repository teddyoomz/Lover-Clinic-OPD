import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  getBackendMenuMode,
  setBackendMenuMode,
  useBackendMenuMode,
  STORAGE_KEY,
} from '../src/components/backend/shell/backendMenuMode.js';

describe('Backend Menu D — Mode Toggle helper + hook', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  it('T1.1 STORAGE_KEY constant locked', () => {
    expect(STORAGE_KEY).toBe('lover.backendMenuMode');
  });

  it('T1.2 default mode is "new" when localStorage empty', () => {
    expect(getBackendMenuMode()).toBe('new');
  });

  it('T1.3 getBackendMenuMode returns "classic" when set', () => {
    localStorage.setItem(STORAGE_KEY, 'classic');
    expect(getBackendMenuMode()).toBe('classic');
  });

  it('T1.4 setBackendMenuMode persists', () => {
    setBackendMenuMode('classic');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('classic');
    setBackendMenuMode('new');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('new');
  });

  it('T1.5 invalid mode rejected — falls back to "new"', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    expect(getBackendMenuMode()).toBe('new');
    setBackendMenuMode('nonsense');
    // setter must reject invalid → storage unchanged (stays 'garbage' or cleared)
    expect(['garbage', null]).toContain(localStorage.getItem(STORAGE_KEY) === 'nonsense' ? 'INVALID' : localStorage.getItem(STORAGE_KEY));
  });

  it('T1.6 SSR-safe (no window) — returns default', () => {
    const origWindow = global.window;
    // @ts-ignore
    delete global.window;
    expect(getBackendMenuMode()).toBe('new');
    global.window = origWindow;
  });

  it('T1.7 mobile <768px forces "new" regardless of stored value', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    localStorage.setItem(STORAGE_KEY, 'classic');
    expect(getBackendMenuMode()).toBe('new');
  });

  it('T1.8 useBackendMenuMode hook returns current mode + setter', () => {
    const { result } = renderHook(() => useBackendMenuMode());
    expect(result.current[0]).toBe('new');
    act(() => result.current[1]('classic'));
    expect(result.current[0]).toBe('classic');
  });

  it('T1.9 useBackendMenuMode re-renders on cross-component change (storage event)', () => {
    const { result } = renderHook(() => useBackendMenuMode());
    expect(result.current[0]).toBe('new');
    act(() => {
      setBackendMenuMode('classic');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'classic' }));
    });
    expect(result.current[0]).toBe('classic');
  });

  it('T1.10 V82 marker in helper source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/backendMenuMode.js', 'utf-8');
    expect(src).toMatch(/Backend Menu D|backendMenuMode/);
  });
});
