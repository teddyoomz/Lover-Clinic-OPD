// tests/staffchat-draft-branch-scope.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop) on the hide-don't-unmount draft-
// persist feature. The staff chat is PER-BRANCH (different colleagues per branch),
// but the StaffChatWidget is mounted ONCE inside BranchProvider (App.jsx) and the
// Composer is now ALWAYS mounted (hide-don't-unmount). Switching the top-right
// BranchSelector changes `selectedBranchId` WITHOUT remounting the Widget → the
// composer's text + staged files all SURVIVE the branch switch → a draft composed
// for branch A can be SENT to branch B (wrong audience). Violates the per-branch
// purpose. hide-don't-unmount made it worse: now even a MINIMIZED draft leaks.
//
// Desired (this test): the draft (text + staged files) is scoped to its branch —
// it clears when the branch (audience) changes. It still survives a minimize→reopen
// WITHIN the same branch (the feature; covered by staffchat-draft-persist-minimize).
//
// Fix: <StaffChatComposer key={selectedBranchId}> in the Widget (remount on
// branch change → text/files reset + object-URLs revoked via unmount cleanup).
// (The hook's `replyingTo` clear is covered by staffchat-reply-branch-scope-hook.)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// --- Mutable branch so we can simulate a BranchSelector switch between renders ---
let currentBranchId = 'BR-A';
const BRANCHES = [
  { id: 'BR-A', name: 'นครราชสีมา' },
  { id: 'BR-B', name: 'พระราม 3' },
];
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: currentBranchId, branches: BRANCHES }),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'u' } }, appId: 'TEST-APP' }));
vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

function mockChat(over = {}) {
  return {
    messages: [], minimized: false, unreadCount: 0, deviceId: 'd1', error: null, loading: false,
    namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [], replyingTo: null, setReplyingTo: vi.fn(),
    uploadImage: vi.fn(), prepareAndUpload: vi.fn(),
    displayName: 'เอ', nameEditMode: false, openNameEdit: vi.fn(), closeNameEdit: vi.fn(), color: '#e11d48',
    canMinimize: true, markScrolledToBottom: vi.fn(), role: null,
    deleteMessage: vi.fn(), sendSticker: vi.fn(),
    ...over,
  };
}
const widget = () => <StaffChatWidget user={{ uid: 'u' }} needsPublicAuth={false} />;

describe('BR1 — composer draft is scoped to its branch (no cross-branch leak)', () => {
  beforeEach(() => {
    currentBranchId = 'BR-A';
    useStaffChat.mockReturnValue(mockChat());
  });

  it('BR1.1 typed text does NOT carry from branch A → branch B', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'หมอ A ว่างไหมครับ' } });
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('หมอ A ว่างไหมครับ');
    // switch branch via the BranchSelector (selectedBranchId A → B)
    currentBranchId = 'BR-B';
    rerender(widget());
    // draft for branch A's colleagues must NOT appear in branch B's composer
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('');
  });

  it('BR1.2 text DOES survive a minimize→reopen within the SAME branch (feature intact)', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'รับทราบ กำลังจัด' } });
    // minimize (same branch) → hidden, NOT unmounted
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    // reopen (same branch) → draft restored
    useStaffChat.mockReturnValue(mockChat({ minimized: false }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('รับทราบ กำลังจัด');
  });

  it('BR1.3 a STAGED image clears + its object-URL is revoked on branch switch', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-A');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { container, rerender } = render(widget());
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'scanA.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByTestId('staff-chat-composer-image-thumb')).toBeInTheDocument();
    // switch branch → staged file from branch A must clear + URL revoked (no leak)
    currentBranchId = 'BR-B';
    rerender(widget());
    expect(screen.queryByTestId('staff-chat-composer-image-thumb')).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-A');
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('BR1.4 the minimized bubble ✏️ draft badge clears after a branch switch', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'ค้างไว้' } });
    // minimize in branch A → bubble shows ✏️
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-bubble-draft')).toBeInTheDocument();
    // switch branch while minimized → draft is for branch A → badge must clear
    currentBranchId = 'BR-B';
    rerender(widget());
    expect(screen.queryByTestId('staff-chat-bubble-draft')).toBeNull();
  });
});

// ── source-grep regression locks ─────────────────────────────────────────────
describe('SG — branch-scope regression locks', () => {
  const read = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  const W = read('../src/components/staffchat/StaffChatWidget.jsx');
  const H = read('../src/hooks/useStaffChat.js');

  it('SG1 Widget keys the Composer by selectedBranchId (remount → reset draft on branch change)', () => {
    const block = W.match(/<StaffChatComposer[\s\S]*?\/>/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/key=\{selectedBranchId\}/);
  });
  it('SG2 hook clears replyingTo when the branch changes', () => {
    // setReplyingTo(null) must appear in the hook (resubscribe effect, deps include selectedBranchId)
    expect(H).toMatch(/setReplyingTo\(null\)/);
  });
});
