// tests/staffchat-reply-branch-scope-hook.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop). Companion to
// staffchat-draft-branch-scope.test.jsx. The hook's `replyingTo` (a snapshot of
// the branch-A message being replied to) is NOT cleared when the branch changes
// → switching to branch B leaves a dangling reply pointing at a branch-A message
// id; sending then files a reply whose target isn't in branch B. Violates the
// per-branch purpose.
//
// Desired: the hook clears `replyingTo` on a selectedBranchId change (the
// resubscribe effect already runs on that change). Real hook, mocked data layer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let currentBranchId = 'BR-A';
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: currentBranchId }),
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(() => () => {}),
  addStaffChatMessage: vi.fn(() => Promise.resolve('CHAT-x')),
  deleteStaffChatMessage: vi.fn(() => Promise.resolve()),
}));

import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('RB — replyingTo is scoped to its branch', () => {
  beforeEach(() => { currentBranchId = 'BR-A'; localStorage.clear(); });

  it('RB1 replyingTo set in branch A clears when the branch switches to B', () => {
    const { result, rerender } = renderHook(() => useStaffChat());
    act(() => result.current.setReplyingTo({ id: 'CHAT-A-1', text: 'msg in branch A', displayName: 'A' }));
    expect(result.current.replyingTo).toBeTruthy();
    // BranchSelector switch A → B
    currentBranchId = 'BR-B';
    rerender();
    expect(result.current.replyingTo).toBeNull();
  });

  it('RB2 replyingTo set in branch A SURVIVES a re-render that stays in branch A', () => {
    const { result, rerender } = renderHook(() => useStaffChat());
    act(() => result.current.setReplyingTo({ id: 'CHAT-A-2', text: 'still A', displayName: 'A' }));
    expect(result.current.replyingTo).toBeTruthy();
    rerender(); // same branch — reply must persist (so a normal re-render doesn't drop it)
    expect(result.current.replyingTo).toBeTruthy();
  });
});
