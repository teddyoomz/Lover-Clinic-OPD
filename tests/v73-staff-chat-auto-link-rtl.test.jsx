// V73 T16 Feature H (2026-05-16) — Customer/appointment auto-link detection RTL tests.
// parseMessageBody helper already lands in T11; this file locks the RENDER contract
// (chips present, hrefs correct, encoded properly).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

function stateWithMessage(text) {
  return {
    messages: [
      { id: 'CHAT-AL1', branchId: 'BR-T', displayName: 'admin', text,
        deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
    ],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [],
    replyingTo: null, setReplyingTo: vi.fn(),
  };
}

describe('V73.AL1 Customer + appointment auto-link render', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AL1.1 customer chip renders with correct href when LC-12345678 present', () => {
    useStaffChat.mockReturnValue(stateWithMessage('ลูกค้า LC-26000022 รออยู่ห้อง 3'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const link = screen.getByTestId('staff-chat-customer-link-LC-26000022');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('LC-26000022'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('AL1.2 appointment chip renders when BA-1234... present', () => {
    useStaffChat.mockReturnValue(stateWithMessage('ดูนัด BA-1778868832454'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const link = screen.getByTestId('staff-chat-appt-link-BA-1778868832454');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('BA-1778868832454'));
  });

  it('AL1.3 plain text without LC/BA tokens renders as text only (no chip)', () => {
    useStaffChat.mockReturnValue(stateWithMessage('สวัสดีครับ'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByText('สวัสดีครับ')).toBeInTheDocument();
    expect(screen.queryByTestId(/staff-chat-customer-link-/)).toBeNull();
    expect(screen.queryByTestId(/staff-chat-appt-link-/)).toBeNull();
  });

  it('AL1.4 multiple tokens in same message all render as chips', () => {
    useStaffChat.mockReturnValue(stateWithMessage('ลูกค้า LC-26000022 มีนัด BA-1778868832454'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-customer-link-LC-26000022')).toBeInTheDocument();
    expect(screen.getByTestId('staff-chat-appt-link-BA-1778868832454')).toBeInTheDocument();
  });

  it('AL1.5 LC-shorter-than-8-digits does NOT match (LC-26000022 yes, LC-123 no)', () => {
    useStaffChat.mockReturnValue(stateWithMessage('LC-123 LC-26000022'));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-customer-link-LC-26000022')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-customer-link-LC-123')).toBeNull();
  });
});
