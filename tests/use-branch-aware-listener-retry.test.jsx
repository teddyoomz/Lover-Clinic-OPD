// Task 10 — useBranchAwareListener silent auto-heal (mobile-load reliability, 2026-06-16)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const reconnectFirestore = vi.fn();
vi.mock('../src/lib/firestoreReconnect.js', () => ({
  reconnectFirestore: (...a) => reconnectFirestore(...a),
}));
let branchIdValue = 'BR-1';
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: branchIdValue }),
}));

import { useBranchAwareListener } from '../src/hooks/useBranchAwareListener.js';

describe('useBranchAwareListener — silent auto-heal', () => {
  beforeEach(() => { vi.useFakeTimers(); reconnectFirestore.mockClear(); branchIdValue = 'BR-1'; });
  afterEach(() => { vi.useRealTimers(); });

  it('re-subscribes + reconnects when no onChange arrives within the timeout', () => {
    const unsub = vi.fn();
    const listenerFn = vi.fn(() => unsub); // never calls onChange
    renderHook(() => useBranchAwareListener(listenerFn, { x: 1 }, () => {}, () => {}));
    expect(listenerFn).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(reconnectFirestore).toHaveBeenCalledTimes(1);
    expect(listenerFn).toHaveBeenCalledTimes(2); // re-subscribed
    expect(unsub).toHaveBeenCalledTimes(1);       // old subscription torn down
  });

  it('caps auto-heal at MAX_AUTO_RETRIES (2)', () => {
    const listenerFn = vi.fn(() => vi.fn());
    renderHook(() => useBranchAwareListener(listenerFn, { x: 1 }, () => {}, () => {}));
    act(() => { vi.advanceTimersByTime(8000); }); // retry 1
    act(() => { vi.advanceTimersByTime(8000); }); // retry 2
    act(() => { vi.advanceTimersByTime(8000); }); // capped — no further re-subscribe
    expect(listenerFn).toHaveBeenCalledTimes(3);  // initial + 2 retries
  });

  it('does NOT retry once onChange has fired', () => {
    const listenerFn = vi.fn((args, onChange) => { onChange({ ok: true }); return vi.fn(); });
    const onChange = vi.fn();
    renderHook(() => useBranchAwareListener(listenerFn, { x: 1 }, onChange, () => {}));
    expect(onChange).toHaveBeenCalledWith({ ok: true });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(listenerFn).toHaveBeenCalledTimes(1);
    expect(reconnectFirestore).not.toHaveBeenCalled();
  });

  it('forwards onError', () => {
    const listenerFn = vi.fn((args, onChange, onError) => { onError(new Error('e')); return vi.fn(); });
    const onError = vi.fn();
    renderHook(() => useBranchAwareListener(listenerFn, { x: 1 }, () => {}, onError));
    expect(onError).toHaveBeenCalled();
  });

  it('injects branchId into object args for non-universal listeners', () => {
    const listenerFn = vi.fn(() => vi.fn());
    renderHook(() => useBranchAwareListener(listenerFn, { date: '2026-01-01' }, () => {}, () => {}));
    expect(listenerFn).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-01', branchId: 'BR-1' }),
      expect.any(Function), expect.any(Function),
    );
  });

  it('universal listener skips branchId injection', () => {
    const listenerFn = vi.fn(() => vi.fn());
    listenerFn.__universal__ = true;
    renderHook(() => useBranchAwareListener(listenerFn, { id: 'C1' }, () => {}, () => {}));
    expect(listenerFn).toHaveBeenCalledWith({ id: 'C1' }, expect.any(Function), expect.any(Function));
  });

  it('null listenerFn is a no-op (no throw)', () => {
    expect(() => renderHook(() => useBranchAwareListener(null, {}, () => {}, () => {}))).not.toThrow();
  });
});
