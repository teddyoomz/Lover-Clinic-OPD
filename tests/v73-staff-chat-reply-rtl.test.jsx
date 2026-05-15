// tests/v73-staff-chat-reply-rtl.test.jsx
// V73 Feature C (T12) — Reply-to-message RTL bank.
// 6 tests R1.1-R1.6 cover hover Reply button + setReplyingTo + quote strip
// render + clear via × + send-with-replyTo extras + quote-card render.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

function baseState(overrides = {}) {
  return {
    messages: [
      { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'รอลูกค้า 5 นาที', deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
    ],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [],
    replyingTo: null, setReplyingTo: vi.fn(),
    ...overrides,
  };
}

describe('V73.R1 Reply-to-message flow', () => {
  beforeEach(() => useStaffChat.mockReturnValue(baseState()));

  it('R1.1 hover message shows Reply button', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-message-reply-CHAT-1')).toBeInTheDocument();
  });

  it('R1.2 click Reply calls setReplyingTo with shape', () => {
    const setReplyingTo = vi.fn();
    useStaffChat.mockReturnValue(baseState({ setReplyingTo }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    expect(setReplyingTo).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'CHAT-1', snippet: expect.stringContaining('รอลูกค้า'), displayName: 'ดร.วี',
    }));
  });

  it('R1.3 quote strip renders when replyingTo set', () => {
    useStaffChat.mockReturnValue(baseState({
      messages: [],
      replyingTo: { msgId: 'CHAT-1', snippet: 'รอลูกค้า', displayName: 'ดร.วี', deviceId: 'other' },
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-quote-strip')).toHaveTextContent('รอลูกค้า');
  });

  it('R1.4 click × on quote strip clears it', () => {
    const setReplyingTo = vi.fn();
    useStaffChat.mockReturnValue(baseState({
      messages: [],
      replyingTo: { msgId: 'CHAT-1', snippet: 'x', displayName: 'A', deviceId: 'd' },
      setReplyingTo,
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-composer-quote-clear'));
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('R1.5 send while replying includes replyTo in extras', () => {
    const sendMock = vi.fn();
    useStaffChat.mockReturnValue(baseState({
      messages: [],
      send: sendMock,
      replyingTo: { msgId: 'CHAT-1', snippet: 'รอ', displayName: 'ดร.วี', deviceId: 'other' },
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'got it' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('got it', expect.objectContaining({
      replyTo: { msgId: 'CHAT-1', snippet: 'รอ', displayName: 'ดร.วี', deviceId: 'other' },
    }));
  });

  it('R1.6 message with replyTo renders quote-card', () => {
    useStaffChat.mockReturnValue(baseState({
      messages: [
        { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'got it', deviceId: 'dev-me',
          replyTo: { msgId: 'CHAT-1', snippet: 'รอลูกค้า', displayName: 'ดร.วี', deviceId: 'other' },
          createdAt: { toMillis: () => Date.now() } },
      ],
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-message-quote-CHAT-2')).toHaveTextContent('รอลูกค้า');
  });
});
