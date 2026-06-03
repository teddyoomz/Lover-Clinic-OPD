// tests/staffchat-cursor-same-ms-tie.test.js
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), cursor #2. isMessageUnread used a
// strict `msgMs > cursorMs` on createdAt-ms ONLY and IGNORED the stored
// lastReadId. Two messages sharing the EXACT same server-timestamp millisecond
// (one already read, one not) → the second was silently marked READ (createdAt
// not > cursor) → a message could be missed (no unread badge / no force-open).
//
// Fix: same-ms tiebreak by message.id. The listener queries
// orderBy('createdAt','desc') then .reverse() → same-ms docs end up id-ASCENDING
// in the displayed array (doc id === message.id; addStaffChatMessage setDoc by id).
// So a same-ms message whose id sorts AFTER cursor.lastReadId is unread. An empty
// lastReadId is the first-load seed ("all up to seedMs is read") → same-ms is read.
import { describe, it, expect } from 'vitest';
import { isMessageUnread } from '../src/lib/staffChatReadCursor.js';

const cursor = (lastReadId, ms) => ({ lastReadId, lastReadCreatedAtMs: ms, updatedAt: ms });

describe('TIE — same-ms read-cursor tiebreak by message id', () => {
  it('T1 a same-ms message whose id sorts AFTER lastReadId is UNREAD (no silent miss)', () => {
    const c = cursor('CHAT-100-aa', 100);
    expect(isMessageUnread({ id: 'CHAT-100-bb', createdAt: 100, deviceId: 'other' }, c, 'me')).toBe(true);
  });

  it('T2 a same-ms message whose id is AT/BEFORE lastReadId is READ', () => {
    const c = cursor('CHAT-100-bb', 100);
    expect(isMessageUnread({ id: 'CHAT-100-aa', createdAt: 100, deviceId: 'other' }, c, 'me')).toBe(false); // before
    expect(isMessageUnread({ id: 'CHAT-100-bb', createdAt: 100, deviceId: 'other' }, c, 'me')).toBe(false); // is the last-read
  });

  it('T3 seed cursor (empty lastReadId) → same-ms is READ (first-load backlog stays silent)', () => {
    const c = cursor('', 100);
    expect(isMessageUnread({ id: 'CHAT-100-zz', createdAt: 100, deviceId: 'other' }, c, 'me')).toBe(false);
  });

  it('T4 own same-ms message is never unread', () => {
    const c = cursor('CHAT-100-aa', 100);
    expect(isMessageUnread({ id: 'CHAT-100-bb', createdAt: 100, deviceId: 'me' }, c, 'me')).toBe(false);
  });

  it('T5 strictly-newer / strictly-older unchanged (no regression to the common path)', () => {
    const c = cursor('CHAT-100-aa', 100);
    expect(isMessageUnread({ id: 'CHAT-101-aa', createdAt: 101, deviceId: 'other' }, c, 'me')).toBe(true);  // newer
    expect(isMessageUnread({ id: 'CHAT-099-zz', createdAt: 99,  deviceId: 'other' }, c, 'me')).toBe(false); // older
  });

  it('T6 dual-shape Firestore Timestamp at the same ms still tiebreaks by id', () => {
    const c = cursor('CHAT-100-aa', 100);
    expect(isMessageUnread({ id: 'CHAT-100-bb', createdAt: { toMillis: () => 100 }, deviceId: 'other' }, c, 'me')).toBe(true);
  });
});
