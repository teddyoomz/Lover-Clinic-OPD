// V73 Task 4 (2026-05-16) — useStaffChat hook test bank.
// Verifies listener subscribe/unsubscribe + send gating (name picker) + unread
// counter logic (incoming non-own messages bump count; own messages don't).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(),
  addStaffChatMessage: vi.fn(() => Promise.resolve('CHAT-x')),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-TEST' }),
}));

import { useStaffChat } from '../src/hooks/useStaffChat.js';
import { listenToStaffChatMessages, addStaffChatMessage } from '../src/lib/scopedDataLayer.js';

describe('V73.H1 useStaffChat hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('H1.1 subscribes to listener on mount', () => {
    listenToStaffChatMessages.mockReturnValue(() => {});
    renderHook(() => useStaffChat());
    expect(listenToStaffChatMessages).toHaveBeenCalledTimes(1);
  });

  it('H1.2 receives messages via onChange callback', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: 'other' }]));
    expect(result.current.messages).toHaveLength(1);
  });

  it('H1.3 send requires displayName + opens picker if missing', () => {
    listenToStaffChatMessages.mockReturnValue(() => {});
    const { result } = renderHook(() => useStaffChat());
    act(() => result.current.send('hello'));
    expect(result.current.namePickerOpen).toBe(true);
    expect(addStaffChatMessage).not.toHaveBeenCalled();
  });

  it('H1.4 send when displayName set calls addStaffChatMessage', async () => {
    localStorage.setItem('staffChatName', 'ดร.วี');
    listenToStaffChatMessages.mockReturnValue(() => {});
    const { result } = renderHook(() => useStaffChat());
    await act(async () => result.current.send('hello'));
    expect(addStaffChatMessage).toHaveBeenCalledTimes(1);
    const arg = addStaffChatMessage.mock.calls[0][0];
    expect(arg.displayName).toBe('ดร.วี');
    expect(arg.text).toBe('hello');
  });

  it('H1.5 unsubscribes listener on unmount', () => {
    const unsub = vi.fn();
    listenToStaffChatMessages.mockReturnValue(unsub);
    const { unmount } = renderHook(() => useStaffChat());
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('H1.6 unread increments for incoming non-own message when minimized', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    expect(result.current.unreadCount).toBe(0);
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: 'other-device' }]));
    expect(result.current.unreadCount).toBe(1);
  });

  it('H1.7 unread does NOT increment for own message', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: result.current.deviceId }]));
    expect(result.current.unreadCount).toBe(0);
  });
});
