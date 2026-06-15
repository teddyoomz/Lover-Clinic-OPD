// Task 2 — useResilientLoad 3-state machine (mobile-load reliability, 2026-06-16)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const reconnectFirestore = vi.fn();
vi.mock('../src/lib/firestoreReconnect.js', () => ({
  reconnectFirestore: (...a) => reconnectFirestore(...a),
}));

import { useResilientLoad } from '../src/hooks/useResilientLoad.js';

describe('useResilientLoad', () => {
  beforeEach(() => { vi.useFakeTimers(); reconnectFirestore.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts in loading with retryKey 0', () => {
    const { result } = renderHook(() => useResilientLoad());
    expect(result.current.loadStatus).toBe('loading');
    expect(result.current.retryKey).toBe(0);
  });

  it('markReady() → ready and survives a later timeout', () => {
    const { result } = renderHook(() => useResilientLoad());
    act(() => { result.current.markReady(); });
    expect(result.current.loadStatus).toBe('ready');
    act(() => { vi.advanceTimersByTime(30000); });
    expect(result.current.loadStatus).toBe('ready');
  });

  it('soft timeout → silent auto-retry (retryKey++, stays loading, reconnect once); 2nd timeout → error', () => {
    const { result } = renderHook(() => useResilientLoad({ softTimeoutMs: 8000, maxAutoRetries: 1 }));
    act(() => { vi.advanceTimersByTime(8000); });
    expect(result.current.retryKey).toBe(1);
    expect(result.current.loadStatus).toBe('loading');
    expect(reconnectFirestore).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(result.current.loadStatus).toBe('error');
  });

  it('markReady() after an auto-retry → recovered (ready)', () => {
    const { result } = renderHook(() => useResilientLoad());
    act(() => { vi.advanceTimersByTime(8000); }); // auto-retry
    act(() => { result.current.markReady(); });
    expect(result.current.loadStatus).toBe('ready');
  });

  it('markError() funnels to the same retry → error path', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 1 }));
    act(() => { result.current.markError(); });
    expect(result.current.loadStatus).toBe('loading'); // first failure = silent retry
    expect(result.current.retryKey).toBe(1);
    act(() => { result.current.markError(); });
    expect(result.current.loadStatus).toBe('error');
  });

  it('maxAutoRetries 0 → first failure goes straight to error', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 0 }));
    act(() => { result.current.markError(); });
    expect(result.current.loadStatus).toBe('error');
    expect(reconnectFirestore).not.toHaveBeenCalled();
  });

  it('retry() from error → loading + retryKey bump', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 0 }));
    act(() => { result.current.markError(); });
    expect(result.current.loadStatus).toBe('error');
    const k = result.current.retryKey;
    act(() => { result.current.retry(); });
    expect(result.current.loadStatus).toBe('loading');
    expect(result.current.retryKey).toBe(k + 1);
  });

  it('markReady is idempotent across many fires', () => {
    const { result } = renderHook(() => useResilientLoad());
    act(() => { result.current.markReady(); result.current.markReady(); result.current.markReady(); });
    expect(result.current.loadStatus).toBe('ready');
  });

  it('a late timeout firing after ready is ignored (statusRef guard)', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 0 }));
    act(() => { result.current.markReady(); });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(result.current.loadStatus).toBe('ready');
  });
});
