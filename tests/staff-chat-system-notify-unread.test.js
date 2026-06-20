// AV198 Q4 lock — a "ระบบ" system card MUST count toward unread + reach the chime
// dispatch. deviceId:'system' ≠ any real device, so isMessageUnread treats it as
// unread when newer than the read cursor (→ unreadCount + the default-sound +
// auto-expand path in useStaffChat). This locks the user's Q4 choice
// ("นับ unread + มีเสียงแชทด้วย") so a future change can't silently exclude system
// cards from the cursor/chime (bug-hunt round 4 verified this is INTENDED, not a bug).
import { describe, it, expect } from 'vitest';
import { isMessageUnread } from '../src/lib/staffChatReadCursor.js';

const cursor = { lastReadId: 'CHAT-old', lastReadCreatedAtMs: 1000, updatedAt: 1000 };
const ts = (ms) => ({ toMillis: () => ms });

describe('AV198 Q4 — system card counts unread + chimes', () => {
  it('Q4.1 a system card NEWER than the cursor is UNREAD (counts + dispatches the chime)', () => {
    expect(isMessageUnread({ id: 'CHAT-SYS-x', deviceId: 'system', createdAt: ts(2000) }, cursor, 'dev-self')).toBe(true);
  });
  it('Q4.2 own (self-device) message is NOT unread — baseline proving the unread path is real', () => {
    expect(isMessageUnread({ id: 'm', deviceId: 'dev-self', createdAt: ts(2000) }, cursor, 'dev-self')).toBe(false);
  });
  it('Q4.3 a system card OLDER than the cursor is read (no re-chime once scrolled past)', () => {
    expect(isMessageUnread({ id: 'CHAT-SYS-x', deviceId: 'system', createdAt: ts(500) }, cursor, 'dev-self')).toBe(false);
  });
});
