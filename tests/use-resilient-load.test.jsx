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

  it('markReady() → ready and survives a later timeout WITHOUT a spurious retry/reconnect (race fix)', () => {
    const { result } = renderHook(() => useResilientLoad());
    act(() => { result.current.markReady(); });
    expect(result.current.loadStatus).toBe('ready');
    act(() => { vi.advanceTimersByTime(30000); });
    // settledRef (set synchronously in markReady) must suppress any late timeout:
    expect(result.current.loadStatus).toBe('ready');
    expect(result.current.retryKey).toBe(0);          // no spurious re-subscribe
    expect(reconnectFirestore).not.toHaveBeenCalled(); // no spurious network churn
  });

  it('markError() AFTER markReady is ignored (sync settledRef guard — no retry/error)', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 1 }));
    act(() => { result.current.markReady(); });
    act(() => { result.current.markError(); });   // simulates a late onError on an already-loaded listener
    expect(result.current.loadStatus).toBe('ready');
    expect(result.current.retryKey).toBe(0);
    expect(reconnectFirestore).not.toHaveBeenCalled();
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

  it('a late timeout firing after ready is ignored (settledRef guard)', () => {
    const { result } = renderHook(() => useResilientLoad({ maxAutoRetries: 0 }));
    act(() => { result.current.markReady(); });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(result.current.loadStatus).toBe('ready');
  });

  it('resetKey change re-arms the loader (fresh stuck-detection for a new load context)', () => {
    const { result, rerender } = renderHook(({ k }) => useResilientLoad({ resetKey: k }), { initialProps: { k: 'branch-A' } });
    act(() => { result.current.markReady(); });
    expect(result.current.loadStatus).toBe('ready');
    act(() => { rerender({ k: 'branch-B' }); }); // context changed (e.g. branch switch → re-subscribe)
    expect(result.current.loadStatus).toBe('loading');
    // the new load now gets its own stuck-detection (default maxAutoRetries=1)
    act(() => { vi.advanceTimersByTime(8000); }); // silent auto-retry
    act(() => { vi.advanceTimersByTime(8000); }); // exhausted → error card
    expect(result.current.loadStatus).toBe('error');
  });

  it('resetKey change WHILE still loading reschedules the timer FROM THE SWITCH (no orphaned mount-timer)', () => {
    // R3 regression: a branch switch during the first load must clear the stale
    // mount-scheduled timer and start a fresh window from the switch — else a
    // premature reconnect fires at the old 8s mark.
    const { result, rerender } = renderHook(({ k }) => useResilientLoad({ resetKey: k, maxAutoRetries: 1 }), { initialProps: { k: 'A' } });
    act(() => { vi.advanceTimersByTime(4000); }); // 4s into A's load, no markReady
    expect(reconnectFirestore).not.toHaveBeenCalled();
    act(() => { rerender({ k: 'B' }); });          // branch switch while still loading
    act(() => { vi.advanceTimersByTime(4000); });  // t=8000 (A's original mark) — orphaned timer must be GONE
    expect(reconnectFirestore).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4000); });  // t=12000 = 8s after the switch — fresh timer fires
    expect(reconnectFirestore).toHaveBeenCalledTimes(1);
    expect(result.current.retryKey).toBe(1);
  });

  it('a STABLE resetKey does NOT re-arm after ready (one-shot customer links stay settled)', () => {
    const { result, rerender } = renderHook(({ k }) => useResilientLoad({ resetKey: k }), { initialProps: { k: 'tokenX' } });
    act(() => { result.current.markReady(); });
    act(() => { rerender({ k: 'tokenX' }); }); // same context — no re-arm
    act(() => { vi.advanceTimersByTime(30000); });
    expect(result.current.loadStatus).toBe('ready');
  });
});
