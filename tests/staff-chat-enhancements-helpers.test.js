// tests/staff-chat-enhancements-helpers.test.js
// (2026-05-26) Unit bank for the 4 staff-chat enhancements:
//   F1 day separators (staffChatDayGroups), F4 sticker field (buildMessageDoc +
//   staffChatStickers). Pure / deterministic — no Firebase, no IndexedDB.
import { describe, it, expect } from 'vitest';
import { toMs, bangkokDayKey, dayDividerLabel, groupMessagesByDay } from '../src/lib/staffChatDayGroups.js';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';
import {
  bundledStickerSrc, buildBundledStickerField, buildCustomStickerField, BUNDLED_STICKERS,
} from '../src/lib/staffChatStickers.js';

// V14 Firestore-undefined-safe: walk the doc tree for any `undefined` leaf.
function hasUndefinedLeaf(o) {
  if (o === undefined) return true;
  if (o === null || typeof o !== 'object') return false;
  return Object.values(o).some(hasUndefinedLeaf);
}

describe('F1 — staffChatDayGroups', () => {
  // 2026-05-25 14:00 Bangkok = 2026-05-25 07:00 UTC.
  const MON_25_1400 = Date.UTC(2026, 4, 25, 7, 0, 0);

  it('toMs handles number / Timestamp.toMillis / {seconds} / ISO / null', () => {
    expect(toMs(123)).toBe(123);
    expect(toMs({ toMillis: () => 456 })).toBe(456);
    expect(toMs({ seconds: 2 })).toBe(2000);
    expect(toMs('2026-05-25T07:00:00Z')).toBe(MON_25_1400);
    expect(toMs(null)).toBe(null);
    expect(toMs(undefined)).toBe(null);
    expect(toMs('not a date')).toBe(null);
  });

  it('bangkokDayKey is machine-TZ-stable (GMT+7, crosses UTC midnight correctly)', () => {
    // 23:30 UTC on the 25th → 06:30 BKK on the 26th
    expect(bangkokDayKey(Date.UTC(2026, 4, 25, 23, 30))).toBe('2026-05-26');
    // 16:00 UTC → 23:00 BKK same day
    expect(bangkokDayKey(Date.UTC(2026, 4, 25, 16, 0))).toBe('2026-05-25');
    // 17:30 UTC → 00:30 BKK next day (the boundary case)
    expect(bangkokDayKey(Date.UTC(2026, 4, 25, 17, 30))).toBe('2026-05-26');
    expect(bangkokDayKey(null)).toBe('');
    expect(bangkokDayKey('x')).toBe('');
  });

  it('dayDividerLabel: วันนี้ / เมื่อวาน / full Thai BE date', () => {
    expect(dayDividerLabel(MON_25_1400, MON_25_1400)).toBe('วันนี้');
    expect(dayDividerLabel(MON_25_1400 - 86400000, MON_25_1400)).toBe('เมื่อวาน');
    // 2 days earlier (2026-05-23) → full BE date with a Thai weekday + พ.ศ. year
    const may23 = Date.UTC(2026, 4, 23, 7, 0, 0);
    expect(dayDividerLabel(may23, MON_25_1400)).toMatch(/^(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์) 23 พฤษภาคม 2569$/);
    expect(dayDividerLabel(null)).toBe('');
  });

  it('groupMessagesByDay splits by Bangkok day, keeps contiguous same-day, isolates unknown', () => {
    const msgs = [
      { id: 'a', createdAt: Date.UTC(2026, 4, 23, 7, 0, 0) },
      { id: 'b', createdAt: Date.UTC(2026, 4, 23, 8, 0, 0) },
      { id: 'c', createdAt: MON_25_1400 },
      { id: 'd', createdAt: null },
    ];
    const g = groupMessagesByDay(msgs, MON_25_1400);
    expect(g.length).toBe(3);
    expect(g[0].items.map((m) => m.id)).toEqual(['a', 'b']);
    expect(g[0].label).toMatch(/23 พฤษภาคม 2569$/);
    expect(g[1].items.map((m) => m.id)).toEqual(['c']);
    expect(g[1].label).toBe('วันนี้');
    expect(g[2].dayKey).toBe('__unknown__');
    expect(g[2].label).toBe('');
  });

  it('groupMessagesByDay handles Firestore Timestamp shape ({toMillis})', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const msgs = [
      { id: 'a', createdAt: ts(Date.UTC(2026, 4, 24, 7, 0, 0)) },
      { id: 'b', createdAt: ts(MON_25_1400) },
    ];
    const g = groupMessagesByDay(msgs, MON_25_1400);
    expect(g.length).toBe(2);
    expect(g[1].label).toBe('วันนี้');
  });

  it('groupMessagesByDay tolerates empty / non-array', () => {
    expect(groupMessagesByDay([])).toEqual([]);
    expect(groupMessagesByDay(null)).toEqual([]);
    expect(groupMessagesByDay(undefined)).toEqual([]);
  });
});

describe('F4 — buildMessageDoc sticker field', () => {
  const base = { branchId: 'BR1', displayName: 'หมอ', deviceId: 'dev1' };

  it('bundled sticker-only message (empty text) builds + carries the field', () => {
    const doc = buildMessageDoc({ ...base, text: '', sticker: { kind: 'bundled', id: 'fluent/fire' } });
    expect(doc.sticker).toEqual({ kind: 'bundled', id: 'fluent/fire' });
    expect(doc.text).toBe('');
    expect(hasUndefinedLeaf(doc)).toBe(false);
  });

  it('custom sticker carries url + storagePath (undefined-safe, omits w/h)', () => {
    const doc = buildMessageDoc({
      ...base, text: '',
      sticker: { kind: 'custom', url: 'https://x/y.png', storagePath: 'staff-chat-attachments/BR1/CHAT-1/sticker.png' },
    });
    expect(doc.sticker.kind).toBe('custom');
    expect(doc.sticker.url).toBe('https://x/y.png');
    expect(doc.sticker.storagePath).toContain('sticker.png');
    expect('w' in doc.sticker).toBe(false);
    expect(hasUndefinedLeaf(doc)).toBe(false);
  });

  it('custom sticker keeps positive w/h when provided', () => {
    const doc = buildMessageDoc({ ...base, text: '', sticker: { kind: 'custom', url: 'u', storagePath: 'p', w: 120.6, h: 80 } });
    expect(doc.sticker.w).toBe(121);
    expect(doc.sticker.h).toBe(80);
  });

  it('empty message (no text / attachment / sticker) throws', () => {
    expect(() => buildMessageDoc({ ...base, text: '' })).toThrow('STAFF_CHAT_EMPTY_MESSAGE');
    expect(() => buildMessageDoc({ ...base, text: '', sticker: { kind: '' } })).toThrow('STAFF_CHAT_EMPTY_MESSAGE');
  });

  it('text message without a sticker has no sticker field', () => {
    const doc = buildMessageDoc({ ...base, text: 'hi' });
    expect('sticker' in doc).toBe(false);
  });
});

describe('F4 — sticker field builders + bundled accessors', () => {
  it('buildBundledStickerField shape', () => {
    expect(buildBundledStickerField('fluent/ok')).toEqual({ kind: 'bundled', id: 'fluent/ok' });
  });

  it('buildCustomStickerField omits w/h when absent', () => {
    expect(buildCustomStickerField({ url: 'u', storagePath: 'p' })).toEqual({ kind: 'custom', url: 'u', storagePath: 'p' });
  });

  it('bundled pack is non-empty + bundledStickerSrc resolves a real id', () => {
    expect(BUNDLED_STICKERS.length).toBeGreaterThan(0);
    const first = BUNDLED_STICKERS[0];
    expect(bundledStickerSrc(first.id)).toBe(`/stickers/fluent/${first.file}`);
  });

  it('bundledStickerSrc returns empty string for an unknown id', () => {
    expect(bundledStickerSrc('fluent/__does_not_exist__')).toBe('');
  });
});
