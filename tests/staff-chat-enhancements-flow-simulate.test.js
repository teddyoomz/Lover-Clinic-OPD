// tests/staff-chat-enhancements-flow-simulate.test.js
// (2026-05-26) Rule I full-flow simulate for the 4 staff-chat enhancements +
// source-grep wiring locks (AV134). Pure — chains the REAL helpers the UI uses
// (no Firebase / IndexedDB needed; the rule-gated client paths are L1 post-deploy).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { groupMessagesByDay } from '../src/lib/staffChatDayGroups.js';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';
import { buildBundledStickerField, buildCustomStickerField } from '../src/lib/staffChatStickers.js';
import { storagePrefixForMessage } from '../src/lib/staffChatRetentionCore.js';

const read = (p) => readFileSync(p, 'utf8');

describe('F1 — day-separator render chain (listener DESC → reverse → group)', () => {
  it('reverses to chronological then buckets into per-day groups with labels', () => {
    const now = Date.UTC(2026, 4, 25, 7, 0, 0); // Mon 2026-05-25 14:00 BKK
    const desc = [
      { id: 'c', createdAt: now },                             // today
      { id: 'b', createdAt: Date.UTC(2026, 4, 24, 8, 0, 0) },  // yesterday
      { id: 'a', createdAt: Date.UTC(2026, 4, 24, 7, 0, 0) },  // yesterday
    ];
    const chronological = [...desc].reverse();                 // the hook does docs.reverse()
    const groups = groupMessagesByDay(chronological, now);
    expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([['a', 'b'], ['c']]);
    expect(groups[0].label).toBe('เมื่อวาน');
    expect(groups[1].label).toBe('วันนี้');
  });
});

describe('F4 — bundled sticker send chain (picker → sendSticker → buildMessageDoc)', () => {
  it('bundled = ID-ref doc, empty text, zero attachments (0 Storage)', () => {
    const id = 'fluent/congrats';
    // useStaffChat.sendSticker(string) → send('', { sticker: buildBundledStickerField(id) })
    const doc = buildMessageDoc({ branchId: 'BR1', displayName: 'น้องเอ', deviceId: 'dev1', text: '', sticker: buildBundledStickerField(id) });
    expect(doc.sticker).toEqual({ kind: 'bundled', id });
    expect(doc.attachments).toBeUndefined();
    expect(doc.attachmentUrl).toBeUndefined();
    expect(doc.text).toBe('');
  });
});

describe('F4 — custom sticker send chain (IndexedDB rec → upload → buildMessageDoc)', () => {
  it('custom: storagePath under the per-message attachment folder + carries url', () => {
    const branchId = 'BR1';
    const messageId = 'CHAT-1779-abcd';
    // sendSticker(rec): mint id → upload to <prefix>sticker.<ext> → url → send('', {id, sticker})
    const path = storagePrefixForMessage(branchId, messageId) + 'sticker.png';
    expect(path).toBe(`staff-chat-attachments/${branchId}/${messageId}/sticker.png`);
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/' + encodeURIComponent(path) + '?alt=media';
    const doc = buildMessageDoc({
      branchId, displayName: 'น้องเอ', deviceId: 'dev1', id: messageId, text: '',
      sticker: buildCustomStickerField({ url, storagePath: path }),
    });
    expect(doc.id).toBe(messageId);
    expect(doc.sticker.kind).toBe('custom');
    expect(doc.sticker.url).toBe(url);
    expect(doc.sticker.storagePath).toBe(path);
  });
});

describe('F3 — unsend delete contract (folder swept == per-message prefix)', () => {
  it('deleteStaffChatMessage sweeps exactly staff-chat-attachments/{branch}/{msg}/', () => {
    expect(storagePrefixForMessage('BR1', 'CHAT-9').replace(/\/$/, '')).toBe('staff-chat-attachments/BR1/CHAT-9');
  });
});

describe('source-grep — wiring locks (AV134)', () => {
  it('StaffChatMessage: own-only delete gate + sticker render + 13px quote (no 10px quote)', () => {
    const s = read('src/components/staffchat/StaffChatMessage.jsx');
    expect(s).toMatch(/isOwn && onDelete/);
    expect(s).toMatch(/staff-chat-message-delete-/);
    expect(s).toMatch(/message\.sticker/);
    expect(s).toMatch(/staff-chat-message-sticker-/);
    expect(s).toMatch(/text-\[13px\] px-2 py-1 mb-1 border-l-2/);
    expect(s).not.toMatch(/text-\[10px\] px-2 py-1 mb-1 border-l-2/);
  });
  it('StaffChatMessageList: day grouping + divider + onDelete thread', () => {
    const s = read('src/components/staffchat/StaffChatMessageList.jsx');
    expect(s).toMatch(/groupMessagesByDay/);
    expect(s).toMatch(/staff-chat-day-divider/);
    expect(s).toMatch(/onDelete/);
  });
  it('useStaffChat: deleteMessage + sendSticker (bundled + custom branches)', () => {
    const s = read('src/hooks/useStaffChat.js');
    expect(s).toMatch(/const deleteMessage = useCallback/);
    expect(s).toMatch(/const sendSticker = useCallback/);
    expect(s).toMatch(/buildBundledStickerField/);
    expect(s).toMatch(/buildCustomStickerField/);
    expect(s).toMatch(/uploadBytes/);
  });
  it('backendClient: deleteStaffChatMessage sweeps Storage folder then deletes doc', () => {
    const s = read('src/lib/backendClient.js');
    expect(s).toMatch(/export async function deleteStaffChatMessage/);
    expect(s).toMatch(/storagePrefixForMessage/);
    expect(s).toMatch(/listAll/);
    expect(s).toMatch(/deleteObject/);
  });
  it('Composer: sticker/emoji picker button + insertEmoji + onSendSticker', () => {
    const s = read('src/components/staffchat/StaffChatComposer.jsx');
    expect(s).toMatch(/staff-chat-composer-sticker/);
    expect(s).toMatch(/insertEmoji/);
    expect(s).toMatch(/onSendSticker/);
    expect(s).toMatch(/StaffChatStickerPicker/);
  });
  it('rules: firestore sticker create clause + storage clinic-staff delete', () => {
    const fr = read('firestore.rules');
    expect(fr).toMatch(/get\('sticker', \{\}\) is map/);
    expect(fr).toMatch(/sticker\.get\('kind', ''\)/);
    const sr = read('storage.rules');
    expect(sr).toMatch(/allow delete: if request\.auth != null/);
  });
});
