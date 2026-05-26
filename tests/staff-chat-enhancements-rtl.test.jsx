// tests/staff-chat-enhancements-rtl.test.jsx
// (2026-05-26) RTL for the NEW staff-chat UI behaviors (the sibling V73/V82 RTL
// tests don't cover these): F1 day dividers · F3 own-only unsend + confirm · F4
// sticker render. Presentational components mounted directly (no providers).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StaffChatMessage } from '../src/components/staffchat/StaffChatMessage.jsx';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';
import { BUNDLED_STICKERS } from '../src/lib/staffChatStickers.js';

describe('F3 RTL — own-only unsend + AV78 confirm', () => {
  const baseMsg = { id: 'm1', branchId: 'BR1', displayName: 'เอ', deviceId: 'dev1', text: 'hi', createdAt: Date.now() };

  it('own message → 🗑 → confirm dialog → ลบเลย calls onDelete(id)', () => {
    const onDelete = vi.fn();
    render(<StaffChatMessage message={baseMsg} isOwn={true} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('staff-chat-message-delete-m1'));
    expect(screen.getByTestId('staff-chat-delete-confirm-m1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('staff-chat-delete-confirm-yes-m1'));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  it('other-user message → NO delete affordance', () => {
    const onDelete = vi.fn();
    render(<StaffChatMessage message={baseMsg} isOwn={false} onDelete={onDelete} />);
    expect(screen.queryByTestId('staff-chat-message-delete-m1')).toBeNull();
  });

  it('own message but no onDelete prop → NO delete affordance', () => {
    render(<StaffChatMessage message={baseMsg} isOwn={true} />);
    expect(screen.queryByTestId('staff-chat-message-delete-m1')).toBeNull();
  });

  it('ยกเลิก closes the dialog without deleting', () => {
    const onDelete = vi.fn();
    render(<StaffChatMessage message={baseMsg} isOwn={true} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('staff-chat-message-delete-m1'));
    fireEvent.click(screen.getByText('ยกเลิก'));
    expect(screen.queryByTestId('staff-chat-delete-confirm-m1')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('F4 RTL — sticker render (chrome-less img)', () => {
  it('bundled sticker → <img> src from the manifest', () => {
    const sid = BUNDLED_STICKERS[0].id;
    const msg = { id: 's1', deviceId: 'dev1', createdAt: Date.now(), sticker: { kind: 'bundled', id: sid } };
    render(<StaffChatMessage message={msg} isOwn={true} />);
    expect(screen.getByTestId('staff-chat-message-sticker-s1').getAttribute('src')).toContain('/stickers/fluent/');
  });

  it('custom sticker → <img> src = the Storage url', () => {
    const msg = { id: 's2', deviceId: 'dev1', createdAt: Date.now(), sticker: { kind: 'custom', url: 'https://x/y.png' } };
    render(<StaffChatMessage message={msg} isOwn={false} />);
    expect(screen.getByTestId('staff-chat-message-sticker-s2').getAttribute('src')).toBe('https://x/y.png');
  });

  it('a sticker message renders NO text bubble', () => {
    const msg = { id: 's3', deviceId: 'dev1', createdAt: Date.now(), sticker: { kind: 'bundled', id: BUNDLED_STICKERS[0].id } };
    render(<StaffChatMessage message={msg} isOwn={true} />);
    expect(screen.queryByTestId('staff-chat-message-bubble-s3')).toBeNull();
  });
});

describe('F1 RTL — day dividers', () => {
  it('renders one divider per Bangkok day group', () => {
    const now = Date.now();
    const day = 86400000;
    const messages = [
      { id: 'a', deviceId: 'd', text: 'x', createdAt: now - 2 * day },
      { id: 'b', deviceId: 'd', text: 'y', createdAt: now - day },
      { id: 'c', deviceId: 'd', text: 'z', createdAt: now },
    ];
    render(<StaffChatMessageList messages={messages} ownDeviceId="d" />);
    expect(screen.getAllByTestId('staff-chat-day-divider').length).toBe(3);
  });
});
