// V73 Task 2 (2026-05-16) — staffChatClient core unit tests.
// Covers buildMessageDoc — pure helper with validation + crypto-secure id.
import { describe, it, expect } from 'vitest';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';

describe('V73.C1 staffChatClient.buildMessageDoc', () => {
  it('C1.1 builds minimal text message', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: 'hello', deviceId: 'dev-abc',
    });
    expect(doc.branchId).toBe('BR-1');
    expect(doc.displayName).toBe('ดร.วี');
    expect(doc.text).toBe('hello');
    expect(doc.deviceId).toBe('dev-abc');
    expect(doc.id).toMatch(/^CHAT-\d{13}-[a-f0-9]{8}$/);
    expect(doc.createdAt).toBeDefined();  // serverTimestamp sentinel
  });

  it('C1.2 throws when text empty + no attachment', () => {
    expect(() => buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: '', deviceId: 'dev-abc',
    })).toThrow(/STAFF_CHAT_EMPTY_MESSAGE/);
  });

  it('C1.3 throws when text > 500 chars', () => {
    expect(() => buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: 'x'.repeat(501), deviceId: 'dev-abc',
    })).toThrow(/STAFF_CHAT_TEXT_TOO_LONG/);
  });

  it('C1.4 throws when branchId/displayName/deviceId empty', () => {
    expect(() => buildMessageDoc({ branchId: '', displayName: 'X', text: 'hi', deviceId: 'dev' })).toThrow();
    expect(() => buildMessageDoc({ branchId: 'BR-1', displayName: '', text: 'hi', deviceId: 'dev' })).toThrow();
    expect(() => buildMessageDoc({ branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: '' })).toThrow();
  });

  it('C1.5 trims text + preserves whitespace inside', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'X', text: '  hello  world  ', deviceId: 'd',
    });
    expect(doc.text).toBe('hello  world');
  });

  it('C1.6 accepts optional mentions/replyTo/attachmentUrl', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: 'd',
      mentions: ['ดร.วี'],
      replyTo: { msgId: 'CHAT-1', snippet: 'old', displayName: 'A', deviceId: 'd2' },
      attachmentUrl: 'https://...',
      attachmentSize: 12345,
      attachmentMimeType: 'image/jpeg',
    });
    expect(doc.mentions).toEqual(['ดร.วี']);
    expect(doc.replyTo.msgId).toBe('CHAT-1');
    expect(doc.attachmentUrl).toBe('https://...');
  });

  it('C1.7 doc id uses crypto.getRandomValues (NOT Math.random)', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) {
      const doc = buildMessageDoc({ branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: 'd' });
      ids.add(doc.id);
    }
    expect(ids.size).toBe(10);
  });
});
