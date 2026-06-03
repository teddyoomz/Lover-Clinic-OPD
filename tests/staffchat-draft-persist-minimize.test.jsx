// tests/staffchat-draft-persist-minimize.test.jsx
// (2026-06-03) — Feature A: the staff-chat panel now stays MOUNTED (hidden via
// display:none) on minimize so the composer draft (text + staged files + reply)
// survives a minimize→reopen. Feature A-bis: the minimized bubble shows a
// dark-zinc ✏️ draft indicator (top-left) distinct from the white/red unread
// count (top-right). RTL flow-simulate + source-grep regression locks.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-1', branches: [{ id: 'BR-1', name: 'นครราชสีมา' }] }),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'u' } }, appId: 'TEST-APP' }));

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
beforeEach(() => useStaffChat.mockReturnValue(mockChat()));

describe('F1 — draft survives minimize (hide-don\'t-unmount)', () => {
  it('F1.1 panel STAYS mounted (display:none) when minimized; bubble shown', () => {
    const { rerender } = render(widget());
    expect(screen.getByTestId('staff-chat-panel')).toBeInTheDocument();
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    const panel = screen.getByTestId('staff-chat-panel');     // still in DOM
    expect(panel).toBeInTheDocument();
    expect(panel.style.display).toBe('none');                  // just hidden
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();
  });

  it('F1.2 composer text persists across minimize → reopen', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'รับทราบ กำลังจัด' } });
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('รับทราบ กำลังจัด');
    // minimize → panel hidden, composer NOT unmounted
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('รับทราบ กำลังจัด');
    // reopen → still there
    useStaffChat.mockReturnValue(mockChat({ minimized: false }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-composer-input').value).toBe('รับทราบ กำลังจัด');
  });

  it('F1.3 a STAGED IMAGE survives minimize→reopen; its object-URL is NOT revoked', () => {
    // The headline reason hide-don't-unmount beats sessionStorage: staged File
    // objects + their preview object-URLs must live through a minimize. Because
    // the composer never unmounts, its pendingFiles useState (+ the URLs)
    // persist, and the unmount-only revoke effect never fires while hidden.
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { container, rerender } = render(widget());
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'scan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByTestId('staff-chat-composer-image-thumb')).toBeInTheDocument();
    // minimize → composer hidden but NOT unmounted
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-composer-image-thumb')).toBeInTheDocument();
    expect(revokeSpy).not.toHaveBeenCalled(); // object-URL still alive (no unmount)
    // reopen → still staged
    useStaffChat.mockReturnValue(mockChat({ minimized: false }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-composer-image-thumb')).toBeInTheDocument();
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});

describe('F2 — draft indicator on the minimized bubble', () => {
  it('F2.1 typing → minimize → bubble shows draft badge AND unread (independent)', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'hi' } });
    useStaffChat.mockReturnValue(mockChat({ minimized: true, unreadCount: 2 }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-bubble-draft')).toBeInTheDocument();
    expect(screen.getByTestId('staff-chat-bubble-unread')).toBeInTheDocument();
  });

  it('F2.2 no draft content → no draft badge', () => {
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    render(widget());
    expect(screen.queryByTestId('staff-chat-bubble-draft')).toBeNull();
  });

  it('F2.3 clearing the text hides the draft badge', () => {
    const { rerender } = render(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'hi' } });
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    expect(screen.getByTestId('staff-chat-bubble-draft')).toBeInTheDocument();
    // reopen + clear
    useStaffChat.mockReturnValue(mockChat({ minimized: false }));
    rerender(widget());
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: '' } });
    useStaffChat.mockReturnValue(mockChat({ minimized: true }));
    rerender(widget());
    expect(screen.queryByTestId('staff-chat-bubble-draft')).toBeNull();
  });
});

describe('SG — source-grep regression locks', () => {
  const read = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  const W = read('../src/components/staffchat/StaffChatWidget.jsx');
  const P = read('../src/components/staffchat/StaffChatPanel.jsx');
  const C = read('../src/components/staffchat/StaffChatComposer.jsx');
  const B = read('../src/components/staffchat/StaffChatBubble.jsx');

  it('SG1 Widget always renders Panel with hidden prop (no minimized-ternary swap)', () => {
    expect(W).toMatch(/<StaffChatPanel[\s\S]*?hidden={chat\.minimized}/);
    expect(W).not.toMatch(/chat\.minimized\s*\?\s*\(?\s*<StaffChatBubble/);
  });
  it('SG2 Widget passes onDraftChange + hasDraft', () => {
    expect(W).toMatch(/onDraftChange={setHasDraft}/);
    expect(W).toMatch(/<StaffChatBubble[\s\S]*?hasDraft={hasDraft}/);
  });
  it('SG3 Panel hides via inline display:none keyed on hidden', () => {
    expect(P).toMatch(/hidden\s*\?\s*{\s*display:\s*'none'\s*}/);
    expect(P).toMatch(/if\s*\(hidden\)\s*{\s*\n?\s*document\.documentElement\.removeAttribute/);
  });
  it('SG4 Composer reports draft via onDraftChange', () => {
    expect(C).toMatch(/onDraftChange\?\.\(text\.trim\(\)\s*!==\s*''\s*\|\|\s*pendingFiles\.length\s*>\s*0\s*\|\|\s*!!replyingTo\)/);
  });
  it('SG5 Bubble has the dark-zinc draft badge top-left', () => {
    expect(B).toMatch(/data-testid="staff-chat-bubble-draft"/);
    expect(B).toMatch(/bg-zinc-900/);
    expect(B).toMatch(/-left-1\.5/);
  });
});
