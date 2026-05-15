// tests/v73-staff-chat-image-rtl.test.jsx
// V73 Feature F (2026-05-16) — Image paste/upload RTL bank.
// IM2.1 attach button rendered, IM2.2 thumbnail render + lightbox open.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

function imgState(overrides = {}) {
  return {
    messages: [
      { id: 'CHAT-IMG', branchId: 'BR-T', displayName: 'me', text: '', deviceId: 'dev-me',
        attachmentUrl: 'https://example.com/img.jpg', attachmentSize: 12345,
        createdAt: { toMillis: () => Date.now() } },
    ],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [], replyingTo: null, setReplyingTo: vi.fn(),
    uploadImage: vi.fn(() => Promise.resolve({ url: 'https://example.com/x.jpg', size: 5000 })),
    ...overrides,
  };
}

describe('V73.IM2 image RTL', () => {
  beforeEach(() => useStaffChat.mockReturnValue(imgState()));

  it('IM2.1 attach button rendered in composer', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-attach')).toBeInTheDocument();
  });

  it('IM2.2 image in message renders thumbnail + click opens lightbox', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const img = screen.getByTestId('staff-chat-message-image-CHAT-IMG');
    expect(img).toBeInTheDocument();
    fireEvent.click(img);
    expect(screen.getByTestId('staff-chat-image-lightbox')).toBeInTheDocument();
  });
});
