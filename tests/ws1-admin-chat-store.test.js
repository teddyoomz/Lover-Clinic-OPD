// WS1 H1 (2026-06-10) — admin-SDK chat store converter round-trip.
// The webhook chat migration (REST → admin SDK) keeps the handlers' REST-typed field
// literals + their `existingConv.fields.X.stringValue` reads UNCHANGED, relying on the
// converters to translate. A field-shape bug here would silently corrupt every inbound
// chat message, so this proves the round-trip BEFORE any deploy (Rule Q — the converter
// is the risk point; a real webhook test follows at the deploy gate).
import { describe, it, expect, vi } from 'vitest';
import {
  restFieldsToPlain,
  plainToRestFields,
  adminChatGet,
  adminChatSet,
} from '../api/webhook/_lib/adminChatStore.js';

describe('restFieldsToPlain', () => {
  it('converts each REST scalar type to a plain JS value', () => {
    expect(restFieldsToPlain({
      text: { stringValue: 'hello' },
      unreadCount: { integerValue: '5' },
      isFromCustomer: { booleanValue: true },
      score: { doubleValue: 1.5 },
      cleared: { nullValue: null },
    })).toEqual({ text: 'hello', unreadCount: 5, isFromCustomer: true, score: 1.5, cleared: null });
  });
  it('integerValue becomes a real number (not a string)', () => {
    expect(restFieldsToPlain({ n: { integerValue: '42' } }).n).toBe(42);
    expect(typeof restFieldsToPlain({ n: { integerValue: '42' } }).n).toBe('number');
  });
  it('tolerates empty / null input', () => {
    expect(restFieldsToPlain(null)).toEqual({});
    expect(restFieldsToPlain({})).toEqual({});
  });
});

describe('plainToRestFields', () => {
  it('wraps plain values back into the REST {fields} shape the read code expects', () => {
    expect(plainToRestFields({ text: 'hi', unreadCount: 3, isFromCustomer: false })).toEqual({
      text: { stringValue: 'hi' },
      unreadCount: { integerValue: '3' },
      isFromCustomer: { booleanValue: false },
    });
  });
  it('non-integer number → doubleValue', () => {
    expect(plainToRestFields({ x: 2.5 }).x).toEqual({ doubleValue: 2.5 });
  });
});

describe('round-trip preserves the webhook read contract', () => {
  // The exact line.js conversation field literal.
  const convFields = {
    platform: { stringValue: 'line' },
    odriverId: { stringValue: 'U123' },
    displayName: { stringValue: 'คุณลูกค้า' },
    pictureUrl: { stringValue: 'https://x/p.jpg' },
    lastMessage: { stringValue: 'สวัสดี' },
    lastMessageAt: { stringValue: '2026-06-10T03:00:00.000Z' },
    unreadCount: { integerValue: '6' },
    branchId: { stringValue: 'BR-A' },
    branchIdSource: { stringValue: 'webhook-line' },
    createdAt: { stringValue: '2026-06-10T02:59:00.000Z' },
  };

  it('write(plain) then read(rest) yields the SAME shape the handler reads', () => {
    // What admin .set() stores:
    const stored = restFieldsToPlain(convFields);
    expect(stored.unreadCount).toBe(6);
    expect(stored.displayName).toBe('คุณลูกค้า');
    // What adminChatGet returns (read code does existingConv.fields.X.stringValue):
    const readBack = { fields: plainToRestFields(stored) };
    expect(readBack.fields.displayName.stringValue).toBe('คุณลูกค้า');
    expect(readBack.fields.pictureUrl.stringValue).toBe('https://x/p.jpg');
    expect(readBack.fields.branchId.stringValue).toBe('BR-A');
    // The unreadCount read path: existingConv.fields.unreadCount.integerValue → parseInt
    expect(parseInt(readBack.fields.unreadCount.integerValue)).toBe(6);
  });
});

describe('adminChatGet / adminChatSet with a mock admin db', () => {
  it('adminChatGet returns null when the doc does not exist', async () => {
    const db = { doc: () => ({ get: async () => ({ exists: false }) }) };
    expect(await adminChatGet(db, 'p')).toBeNull();
  });
  it('adminChatGet returns the REST {fields} shape from a real (plain) doc', async () => {
    const db = { doc: () => ({ get: async () => ({ exists: true, data: () => ({ displayName: 'A', unreadCount: 2 }) }) }) };
    const r = await adminChatGet(db, 'p');
    expect(r.fields.displayName.stringValue).toBe('A');
    expect(parseInt(r.fields.unreadCount.integerValue)).toBe(2);
  });
  it('adminChatSet writes plain values with merge:true', async () => {
    const set = vi.fn(async () => {});
    const db = { doc: vi.fn(() => ({ set })) };
    await adminChatSet(db, 'chat_conversations/line_U/messages/m1', {
      text: { stringValue: 'ฮัลโหล' },
      isFromCustomer: { booleanValue: true },
    });
    expect(db.doc).toHaveBeenCalledWith('chat_conversations/line_U/messages/m1');
    expect(set).toHaveBeenCalledWith({ text: 'ฮัลโหล', isFromCustomer: true }, { merge: true });
  });
});
