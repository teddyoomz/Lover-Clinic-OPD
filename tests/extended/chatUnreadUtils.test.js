// ═══════════════════════════════════════════════════════════════════════════
// chatUnreadUtils — notification counting + alert trigger pure helpers
// Covers 2026-04-22 phantom-noti bug: sound rang every 30s based on TOTAL
// conversation count instead of UNREAD count. Helpers here are the single
// source of truth for ChatPanel (list badge), useChatUnread (dashboard tab
// badge), and AdminDashboard (alert sound triggers).
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  countUnreadPeople,
  shouldRingChatAlert,
  shouldRingChatInterval,
} from '../src/lib/chatUnreadUtils.js';

describe('countUnreadPeople — per-platform unread people count', () => {
  it('returns zeros for empty conversation list', () => {
    expect(countUnreadPeople([])).toEqual({ lineUnread: 0, fbUnread: 0, totalUnread: 0 });
  });

  it('returns zeros for null/undefined input (defensive)', () => {
    expect(countUnreadPeople(null)).toEqual({ lineUnread: 0, fbUnread: 0, totalUnread: 0 });
    expect(countUnreadPeople(undefined)).toEqual({ lineUnread: 0, fbUnread: 0, totalUnread: 0 });
  });

  it('PHANTOM-NOTI REPRO: all conversations READ (unreadCount=0) → totalUnread=0 even when convs exist', () => {
    // The exact bug 2026-04-22: admin opened and read all chats but did not
    // click "ตอบเรียบร้อยแล้ว" → conversations stay in collection with
    // unreadCount=0. Counter must return 0, not conv.length.
    const convs = [
      { platform: 'line', unreadCount: 0, displayName: 'A' },
      { platform: 'facebook', unreadCount: 0, displayName: 'B' },
      { platform: 'line', unreadCount: 0, displayName: 'C' },
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 0, fbUnread: 0, totalUnread: 0 });
  });

  it('counts PEOPLE (docs), not messages — 99 unread msgs from 1 person = 1', () => {
    const convs = [{ platform: 'line', unreadCount: 99 }];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 1, fbUnread: 0, totalUnread: 1 });
  });

  it('splits LINE vs Facebook correctly', () => {
    const convs = [
      { platform: 'line', unreadCount: 2 },
      { platform: 'line', unreadCount: 1 },
      { platform: 'facebook', unreadCount: 5 },
      { platform: 'line', unreadCount: 0 }, // read
      { platform: 'facebook', unreadCount: 0 }, // read
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 2, fbUnread: 1, totalUnread: 3 });
  });

  it('ignores conversations with missing unreadCount field', () => {
    const convs = [
      { platform: 'line' }, // missing
      { platform: 'facebook', unreadCount: null },
      { platform: 'line', unreadCount: 1 },
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 1, fbUnread: 0, totalUnread: 1 });
  });

  it('ignores unknown platforms (not line/facebook)', () => {
    const convs = [
      { platform: 'sms', unreadCount: 99 },
      { platform: undefined, unreadCount: 5 },
      { platform: 'line', unreadCount: 1 },
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 1, fbUnread: 0, totalUnread: 1 });
  });

  it('coerces string unreadCount to number (Firestore REST integerValue comes as string)', () => {
    const convs = [
      { platform: 'line', unreadCount: '3' },
      { platform: 'facebook', unreadCount: '0' },
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 1, fbUnread: 0, totalUnread: 1 });
  });

  it('treats negative / NaN unreadCount as zero (defensive against corrupt data)', () => {
    const convs = [
      { platform: 'line', unreadCount: -5 },
      { platform: 'line', unreadCount: NaN },
      { platform: 'facebook', unreadCount: 'abc' },
    ];
    expect(countUnreadPeople(convs)).toEqual({ lineUnread: 0, fbUnread: 0, totalUnread: 0 });
  });
});

describe('shouldRingChatAlert — one-shot ring on unread 0→N transition', () => {
  it('rings on fresh new message (prev=0 → curr=1, active, not playing)', () => {
    expect(shouldRingChatAlert({
      chatUnread: 1, prevUnread: 0, isChatActive: true, isPlaying: false,
    })).toBe(true);
  });

  it('does NOT ring when chat schedule is closed (off-hours)', () => {
    expect(shouldRingChatAlert({
      chatUnread: 5, prevUnread: 0, isChatActive: false, isPlaying: false,
    })).toBe(false);
  });

  it('does NOT ring when already playing (overlap suppression)', () => {
    expect(shouldRingChatAlert({
      chatUnread: 2, prevUnread: 0, isChatActive: true, isPlaying: true,
    })).toBe(false);
  });

  it('does NOT ring when unread is stable (prev=5 → curr=5, no new message)', () => {
    // The 30s interval handles the "still unread" case; the transition effect
    // must NOT double-ring when another conv increments existing state.
    expect(shouldRingChatAlert({
      chatUnread: 5, prevUnread: 5, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });

  it('does NOT ring when unread decreases (admin just opened a chat)', () => {
    expect(shouldRingChatAlert({
      chatUnread: 3, prevUnread: 5, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });

  it('does NOT ring when unread goes to zero (admin read last chat)', () => {
    expect(shouldRingChatAlert({
      chatUnread: 0, prevUnread: 3, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });

  it('PHANTOM-NOTI REPRO: curr=0 prev=0 (no unread, conversations exist) → silent', () => {
    // Old broken behavior: sound fired on totalConversations > 0. Helper
    // uses only unread count, so this stays quiet even when docs exist.
    expect(shouldRingChatAlert({
      chatUnread: 0, prevUnread: 0, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });

  it('rings when 0→1 after admin marks all read and a new msg arrives', () => {
    // Full cycle: admin reads all → unread=0, then new inbound → unread=1.
    expect(shouldRingChatAlert({
      chatUnread: 1, prevUnread: 0, isChatActive: true, isPlaying: false,
    })).toBe(true);
  });

  it('coerces undefined / null / string inputs (Firestore REST quirks)', () => {
    expect(shouldRingChatAlert({
      chatUnread: '2', prevUnread: '0', isChatActive: true, isPlaying: false,
    })).toBe(true);
    expect(shouldRingChatAlert({
      chatUnread: undefined, prevUnread: null, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });
});

describe('shouldRingChatInterval — 30s periodic re-ring while unread persists', () => {
  it('rings when any unread remains + active + not playing', () => {
    expect(shouldRingChatInterval({
      chatUnread: 1, isChatActive: true, isPlaying: false,
    })).toBe(true);
  });

  it('PHANTOM-NOTI REPRO: does NOT ring when unread=0 (admin cleared all)', () => {
    // Old bug: interval fired on totalConversations > 0. Helper only looks
    // at unread count, so admin reading chats kills the 30s repeat.
    expect(shouldRingChatInterval({
      chatUnread: 0, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });

  it('does NOT ring when off-hours even if unread accumulated', () => {
    expect(shouldRingChatInterval({
      chatUnread: 10, isChatActive: false, isPlaying: false,
    })).toBe(false);
  });

  it('does NOT ring when already playing (prevents overlap on long sounds)', () => {
    expect(shouldRingChatInterval({
      chatUnread: 5, isChatActive: true, isPlaying: true,
    })).toBe(false);
  });

  it('coerces undefined / null / NaN to zero (no ring on garbage data)', () => {
    expect(shouldRingChatInterval({
      chatUnread: undefined, isChatActive: true, isPlaying: false,
    })).toBe(false);
    expect(shouldRingChatInterval({
      chatUnread: NaN, isChatActive: true, isPlaying: false,
    })).toBe(false);
  });
});
