import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { onSnapshotMock, unsub } = vi.hoisted(() => ({ onSnapshotMock: vi.fn(), unsub: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __path: a.slice(1).join('/') }),
  onSnapshot: (...a) => onSnapshotMock(...a),
}));
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'TEST-APP' }));

import { useScheduledTaskStatus } from '../src/hooks/useScheduledTaskStatus.js';

describe('useScheduledTaskStatus', () => {
  beforeEach(() => { onSnapshotMock.mockReset(); onSnapshotMock.mockReturnValue(unsub); unsub.mockReset(); });

  it('returns {} initially + subscribes to the status doc once', () => {
    const { result } = renderHook(() => useScheduledTaskStatus());
    expect(result.current).toEqual({});
    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    expect(onSnapshotMock.mock.calls[0][0].__path).toContain('scheduled_task_status');
  });

  it('reflects snapshot data, and clears on missing doc', () => {
    let cb;
    onSnapshotMock.mockImplementation((ref, onNext) => { cb = onNext; return unsub; });
    const { result } = renderHook(() => useScheduledTaskStatus());
    act(() => cb({ exists: () => true, data: () => ({ chatHistoryRetention: { ok: true, summary: 'ลบ 5' } }) }));
    expect(result.current.chatHistoryRetention).toEqual({ ok: true, summary: 'ลบ 5' });
    act(() => cb({ exists: () => false, data: () => undefined }));
    expect(result.current).toEqual({});
  });

  it('clears on listener error', () => {
    let errCb;
    onSnapshotMock.mockImplementation((ref, onNext, onErr) => { errCb = onErr; return unsub; });
    const { result } = renderHook(() => useScheduledTaskStatus());
    act(() => errCb(new Error('permission-denied')));
    expect(result.current).toEqual({});
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useScheduledTaskStatus());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
