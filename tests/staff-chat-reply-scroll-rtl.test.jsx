// tests/staff-chat-reply-scroll-rtl.test.jsx
// (2026-06-02, AV174) RTL bank for the reply-attachment preview + click-to-scroll
// + bounce highlight. Covers: composer strip shows image/file preview; message
// quote-card shows it; handleReply captures the descriptor; clicking a quote
// scrolls to the original + bounces it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));
vi.mock('../src/firebase.js', () => ({ db: {}, auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

const ts = { toMillis: () => Date.now() };

function baseState(overrides = {}) {
  return {
    messages: [],
    minimized: false, unreadCount: 0, deviceId: 'dev-me',
    error: null, loading: false, canMinimize: true,
    namePickerOpen: false, setNamePickerOpen: vi.fn(),
    send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    recentMentionCandidates: [],
    replyingTo: null, setReplyingTo: vi.fn(),
    deleteMessage: vi.fn(), markScrolledToBottom: vi.fn(),
    prepareAndUpload: vi.fn(), sendSticker: vi.fn(),
    displayName: 'me', color: '#f43f5e', role: null,
    openNameEdit: vi.fn(), closeNameEdit: vi.fn(),
    ...overrides,
  };
}

describe('AV174 reply preview — composer strip + quote-card', () => {
  beforeEach(() => useStaffChat.mockReturnValue(baseState()));

  it('A1 composer strip shows image thumb + "รูปภาพ" for an image reply', () => {
    useStaffChat.mockReturnValue(baseState({
      replyingTo: { msgId: 'CHAT-1', snippet: '', displayName: 'ดร.วี', deviceId: 'other', attachmentKind: 'image', attachmentThumbUrl: 'T://thumb', attachmentCount: 1 },
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const strip = screen.getByTestId('staff-chat-composer-quote-strip');
    expect(within(strip).getByTestId('staff-chat-reply-thumb')).toBeInTheDocument();
    expect(strip).toHaveTextContent('รูปภาพ');
    expect(strip).toHaveTextContent('ดร.วี');
  });

  it('A2 composer strip shows file icon + "ไฟล์ PDF" for a pdf reply (no thumb)', () => {
    useStaffChat.mockReturnValue(baseState({
      replyingTo: { msgId: 'CHAT-1', snippet: '', displayName: 'admin', deviceId: 'other', attachmentKind: 'pdf', attachmentCount: 1 },
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const strip = screen.getByTestId('staff-chat-composer-quote-strip');
    expect(strip).toHaveTextContent('ไฟล์ PDF');
    expect(within(strip).queryByTestId('staff-chat-reply-thumb')).toBeNull();
  });

  it('A3 message quote-card shows image thumb + "รูปภาพ" so the recipient sees it', () => {
    useStaffChat.mockReturnValue(baseState({
      messages: [
        { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'ตามนี้ครับ', deviceId: 'dev-me', createdAt: ts,
          replyTo: { msgId: 'CHAT-1', snippet: '', displayName: 'ดร.วี', deviceId: 'other', attachmentKind: 'image', attachmentThumbUrl: 'T://thumb', attachmentCount: 2 } },
      ],
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const quote = screen.getByTestId('staff-chat-message-quote-CHAT-2');
    expect(within(quote).getByTestId('staff-chat-reply-thumb')).toBeInTheDocument();
    expect(quote).toHaveTextContent('รูปภาพ (2)');
  });

  it('A4 handleReply on an image message captures the image descriptor (not blank)', () => {
    const setReplyingTo = vi.fn();
    useStaffChat.mockReturnValue(baseState({
      setReplyingTo,
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: '', deviceId: 'other', createdAt: ts,
          attachments: [{ mimeType: 'image/png', thumbUrl: 'T://thumb', fullUrl: 'T://full' }] },
      ],
    }));
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    expect(setReplyingTo).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'CHAT-1', attachmentKind: 'image', attachmentThumbUrl: 'T://thumb', attachmentCount: 1,
    }));
  });
});

describe('AV174 click reply quote → scroll to original + bounce', () => {
  beforeEach(() => {
    // jsdom has no scrollIntoView — provide a spy so we can assert it fired.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('B1 clicking the quote scrolls to the original message + adds the bounce class', () => {
    const messages = [
      { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: '', deviceId: 'other', createdAt: ts,
        attachments: [{ mimeType: 'image/png', thumbUrl: 'T://thumb' }] },
      { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'ok', deviceId: 'dev-me', createdAt: ts,
        replyTo: { msgId: 'CHAT-1', snippet: '', displayName: 'ดร.วี', deviceId: 'other', attachmentKind: 'image', attachmentThumbUrl: 'T://thumb', attachmentCount: 1 } },
    ];
    render(<StaffChatMessageList messages={messages} ownDeviceId="dev-me" />);

    // before click → no bounce on the original bubble
    expect(screen.getByTestId('staff-chat-message-bubble-CHAT-1').className).not.toContain('staff-chat-reply-bounce');

    fireEvent.click(screen.getByTestId('staff-chat-message-quote-CHAT-2'));

    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId('staff-chat-message-bubble-CHAT-1').className).toContain('staff-chat-reply-bounce');
  });

  it('B2 clicking a quote whose target is off-window is a graceful no-op (no throw)', () => {
    const messages = [
      { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'ok', deviceId: 'dev-me', createdAt: ts,
        replyTo: { msgId: 'CHAT-GONE', snippet: 'old', displayName: 'ดร.วี', deviceId: 'other' } },
    ];
    render(<StaffChatMessageList messages={messages} ownDeviceId="dev-me" />);
    expect(() => fireEvent.click(screen.getByTestId('staff-chat-message-quote-CHAT-2'))).not.toThrow();
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('B3 keyboard (Enter) on the quote also triggers scroll', () => {
    const messages = [
      { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'รอ', deviceId: 'other', createdAt: ts },
      { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'ok', deviceId: 'dev-me', createdAt: ts,
        replyTo: { msgId: 'CHAT-1', snippet: 'รอ', displayName: 'ดร.วี', deviceId: 'other' } },
    ];
    render(<StaffChatMessageList messages={messages} ownDeviceId="dev-me" />);
    fireEvent.keyDown(screen.getByTestId('staff-chat-message-quote-CHAT-2'), { key: 'Enter' });
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId('staff-chat-message-bubble-CHAT-1').className).toContain('staff-chat-reply-bounce');
  });
});
