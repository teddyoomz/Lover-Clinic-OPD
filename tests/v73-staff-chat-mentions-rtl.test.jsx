// tests/v73-staff-chat-mentions-rtl.test.jsx
// V73 Task 11 Feature B (2026-05-16) — @-mention RTL flow tests.
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
      { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'hi', deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
      { id: 'CHAT-2', branchId: 'BR-T', displayName: 'admin', text: 'ok', deviceId: 'other2', createdAt: { toMillis: () => Date.now() } },
    ],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: ['ดร.วี', 'admin'],
    ...overrides,
  };
}

describe('V73.M1 @mention flow', () => {
  beforeEach(() => useStaffChat.mockReturnValue(baseState()));

  it('M1.1 typing @ → dropdown appears', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @' } });
    expect(screen.getByTestId('staff-chat-mention-dropdown')).toBeInTheDocument();
  });

  it('M1.2 dropdown filters by partial match', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @ad' } });
    expect(screen.getByTestId('staff-chat-mention-dropdown-item-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-mention-dropdown-item-ดร.วี')).toBeNull();
  });

  it('M1.3 click dropdown item appends @name + space', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @' } });
    fireEvent.click(screen.getByTestId('staff-chat-mention-dropdown-item-ดร.วี'));
    expect(input.value).toBe('hello @ดร.วี ');
  });

  it('M1.4 send extracts mentions into extras', () => {
    const sendMock = vi.fn();
    useStaffChat.mockReturnValue(baseState({ send: sendMock }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi @ดร.วี please' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('hi @ดร.วี please', { mentions: ['ดร.วี'] });
  });

  it('M1.5 message bubble renders mention chip', () => {
    useStaffChat.mockReturnValue(baseState({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'admin', text: 'see @ดร.วี soon', deviceId: 'other', mentions: ['ดร.วี'], createdAt: { toMillis: () => Date.now() } },
      ],
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-mention-chip-ดร.วี')).toBeInTheDocument();
  });
});
