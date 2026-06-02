// tests/staff-chat-reply-attachment-preview.test.js
// (2026-06-02, AV174) Reply preview must capture non-text content (image / file /
// sticker) + persist it Firestore-undefined-safe. Pure-unit bank for
// buildReplySnapshot + replyPreviewMeta + the buildMessageDoc replyTo schema.
// Rule P Tier 2 regression: pre-AV174 the reply snapshot was msg.text only →
// image-only replies rendered a blank quote.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  buildReplySnapshot,
  replyPreviewMeta,
  buildMessageDoc,
} from '../src/lib/staffChatClient.js';
import { OFFICE_CONVERTIBLE_MIMES } from '../src/lib/staffChatOfficePreviewCore.js';

const src = (rel) => readFileSync(path.resolve('src', rel), 'utf8');

const OFFICE_MIME = [...OFFICE_CONVERTIBLE_MIMES][0];

// V14 — walk a (plain) object asserting no undefined leaf (Firestore-undefined-safe).
function walkNoUndefined(obj, path = 'replyTo') {
  if (obj === undefined) throw new Error(`undefined leaf at ${path}`);
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) walkNoUndefined(obj[k], `${path}.${k}`);
  }
}

describe('AV174 buildReplySnapshot', () => {
  it('text-only → snippet, no attachment descriptor', () => {
    const s = buildReplySnapshot({ id: 'CHAT-1', text: 'รอลูกค้า 5 นาที', displayName: 'ดร.วี', deviceId: 'd1' });
    expect(s).toMatchObject({ msgId: 'CHAT-1', snippet: 'รอลูกค้า 5 นาที', displayName: 'ดร.วี', deviceId: 'd1' });
    expect(s.attachmentKind).toBeUndefined();
    expect(s.attachmentThumbUrl).toBeUndefined();
    expect(s.isSticker).toBeUndefined();
  });

  it('image-only (empty text) → kind image + thumb + count; snippet stays empty', () => {
    const s = buildReplySnapshot({
      id: 'CHAT-2', text: '', displayName: 'admin', deviceId: 'd2',
      attachments: [{ mimeType: 'image/png', thumbUrl: 'T://thumb', fullUrl: 'T://full' }],
    });
    expect(s.snippet).toBe('');
    expect(s.attachmentKind).toBe('image');
    expect(s.attachmentThumbUrl).toBe('T://thumb');
    expect(s.attachmentCount).toBe(1);
  });

  it('image falls back to fullUrl when no thumbUrl', () => {
    const s = buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'image/jpeg', fullUrl: 'F://x' }] });
    expect(s.attachmentThumbUrl).toBe('F://x');
  });

  it('image + text keeps both', () => {
    const s = buildReplySnapshot({ id: 'C', text: 'ดูรูปนี้', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'image/png', thumbUrl: 'T' }] });
    expect(s.snippet).toBe('ดูรูปนี้');
    expect(s.attachmentKind).toBe('image');
  });

  it('multi-image → count = N, preview from first image', () => {
    const s = buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [
      { mimeType: 'image/png', thumbUrl: 'T1' }, { mimeType: 'image/png', thumbUrl: 'T2' }, { mimeType: 'image/png', thumbUrl: 'T3' },
    ] });
    expect(s.attachmentCount).toBe(3);
    expect(s.attachmentThumbUrl).toBe('T1');
  });

  it('mixed (file + image) → prefers image preview, count = total', () => {
    const s = buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [
      { mimeType: 'application/zip', fullUrl: 'Z' }, { mimeType: 'image/png', thumbUrl: 'T' },
    ] });
    expect(s.attachmentKind).toBe('image');
    expect(s.attachmentThumbUrl).toBe('T');
    expect(s.attachmentCount).toBe(2);
  });

  it('file-only (zip) → kind file, no thumb', () => {
    const s = buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'application/zip', fullUrl: 'Z', name: 'a.zip' }] });
    expect(s.attachmentKind).toBe('file');
    expect(s.attachmentThumbUrl).toBeUndefined();
  });

  it('pdf / video / audio / office kinds', () => {
    expect(buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'application/pdf', fullUrl: 'P' }] }).attachmentKind).toBe('pdf');
    expect(buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'video/mp4', fullUrl: 'V' }] }).attachmentKind).toBe('video');
    expect(buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: 'audio/mpeg', fullUrl: 'A' }] }).attachmentKind).toBe('audio');
    expect(buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachments: [{ mimeType: OFFICE_MIME, fullUrl: 'O' }] }).attachmentKind).toBe('office');
  });

  it('sticker → isSticker, no attachment descriptor', () => {
    const s = buildReplySnapshot({ id: 'C', text: '', displayName: 'a', deviceId: 'd', sticker: { kind: 'bundled', id: 'smile' } });
    expect(s.isSticker).toBe(true);
    expect(s.attachmentKind).toBeUndefined();
  });

  it('legacy attachmentUrl scalar → image + thumb + count 1', () => {
    const s = buildReplySnapshot({ id: 'C', displayName: 'a', deviceId: 'd', attachmentUrl: 'http://legacy/img.jpg' });
    expect(s.attachmentKind).toBe('image');
    expect(s.attachmentThumbUrl).toBe('http://legacy/img.jpg');
    expect(s.attachmentCount).toBe(1);
  });

  it('null / missing id → null', () => {
    expect(buildReplySnapshot(null)).toBeNull();
    expect(buildReplySnapshot({})).toBeNull();
    expect(buildReplySnapshot({ text: 'x' })).toBeNull();
  });

  it('snippet capped at 80 chars', () => {
    const long = 'ก'.repeat(200);
    expect(buildReplySnapshot({ id: 'C', text: long, displayName: 'a', deviceId: 'd' }).snippet.length).toBe(80);
  });
});

describe('AV174 replyPreviewMeta', () => {
  it('text-only (no descriptor) / null → null', () => {
    expect(replyPreviewMeta({ msgId: 'C', snippet: 'hi' })).toBeNull();
    expect(replyPreviewMeta(null)).toBeNull();
  });
  it('image → 📷 รูปภาพ; count>1 shows (n); count===1 no suffix', () => {
    expect(replyPreviewMeta({ attachmentKind: 'image' })).toEqual({ icon: '📷', label: 'รูปภาพ' });
    expect(replyPreviewMeta({ attachmentKind: 'image', attachmentCount: 3 }).label).toBe('รูปภาพ (3)');
    expect(replyPreviewMeta({ attachmentKind: 'image', attachmentCount: 1 }).label).toBe('รูปภาพ');
  });
  it('file / pdf / video / audio / office labels', () => {
    expect(replyPreviewMeta({ attachmentKind: 'file' })).toEqual({ icon: '📎', label: 'ไฟล์แนบ' });
    expect(replyPreviewMeta({ attachmentKind: 'pdf' })).toEqual({ icon: '📄', label: 'ไฟล์ PDF' });
    expect(replyPreviewMeta({ attachmentKind: 'video' })).toEqual({ icon: '🎬', label: 'วิดีโอ' });
    expect(replyPreviewMeta({ attachmentKind: 'audio' })).toEqual({ icon: '🎵', label: 'ไฟล์เสียง' });
    expect(replyPreviewMeta({ attachmentKind: 'office' })).toEqual({ icon: '📑', label: 'เอกสาร' });
  });
  it('sticker wins over kind', () => {
    expect(replyPreviewMeta({ isSticker: true, attachmentKind: 'image' })).toEqual({ icon: '🎟', label: 'สติกเกอร์' });
  });
});

describe('AV174 buildMessageDoc replyTo schema', () => {
  const base = { branchId: 'BR-T', displayName: 'me', deviceId: 'd1', text: 'reply text' };

  it('persists attachmentKind / thumb / count when present', () => {
    const doc = buildMessageDoc({ ...base, replyTo: { msgId: 'C1', snippet: '', displayName: 'a', deviceId: 'd2', attachmentKind: 'image', attachmentThumbUrl: 'T', attachmentCount: 2 } });
    expect(doc.replyTo).toMatchObject({ msgId: 'C1', attachmentKind: 'image', attachmentThumbUrl: 'T', attachmentCount: 2 });
  });

  it('text reply → no attachment subfields + NO undefined leaves (V14)', () => {
    const doc = buildMessageDoc({ ...base, replyTo: { msgId: 'C1', snippet: 'hi', displayName: 'a', deviceId: 'd2' } });
    expect('attachmentKind' in doc.replyTo).toBe(false);
    expect('attachmentThumbUrl' in doc.replyTo).toBe(false);
    expect('isSticker' in doc.replyTo).toBe(false);
    walkNoUndefined(doc.replyTo);
  });

  it('persists isSticker', () => {
    const doc = buildMessageDoc({ ...base, replyTo: { msgId: 'C1', snippet: '', displayName: 'a', deviceId: 'd2', isSticker: true } });
    expect(doc.replyTo.isSticker).toBe(true);
  });

  it('omits thumb when absent (file reply)', () => {
    const doc = buildMessageDoc({ ...base, replyTo: { msgId: 'C1', snippet: '', displayName: 'a', deviceId: 'd2', attachmentKind: 'file', attachmentCount: 1 } });
    expect('attachmentThumbUrl' in doc.replyTo).toBe(false);
    expect(doc.replyTo.attachmentKind).toBe('file');
    walkNoUndefined(doc.replyTo);
  });

  it('attachmentCount <= 0 not persisted', () => {
    const doc = buildMessageDoc({ ...base, replyTo: { msgId: 'C1', snippet: '', displayName: 'a', deviceId: 'd2', attachmentKind: 'image', attachmentCount: 0 } });
    expect('attachmentCount' in doc.replyTo).toBe(false);
  });

  it('round-trip: buildReplySnapshot → buildMessageDoc persists descriptor', () => {
    const snap = buildReplySnapshot({ id: 'C9', text: '', displayName: 'ดร.วี', deviceId: 'd2', attachments: [{ mimeType: 'image/png', thumbUrl: 'TT' }] });
    const doc = buildMessageDoc({ ...base, replyTo: snap });
    expect(doc.replyTo).toMatchObject({ msgId: 'C9', attachmentKind: 'image', attachmentThumbUrl: 'TT', attachmentCount: 1 });
  });
});

describe('AV174 source-grep — wiring contract (anti-drift)', () => {
  it('G1 handleReply uses buildReplySnapshot, NOT an inline text-only snapshot', () => {
    const w = src('components/staffchat/StaffChatWidget.jsx');
    expect(w).toContain('buildReplySnapshot');
    // pre-AV174 inline shape must not return
    expect(w).not.toMatch(/snippet:\s*\(msg\.text/);
  });

  it('G2 staffChatClient exports the two pure helpers', () => {
    const c = src('lib/staffChatClient.js');
    expect(c).toMatch(/export function buildReplySnapshot/);
    expect(c).toMatch(/export function replyPreviewMeta/);
  });

  it('G3 message quote-card + composer render via the shared StaffChatReplyPreview', () => {
    const msg = src('components/staffchat/StaffChatMessage.jsx');
    const comp = src('components/staffchat/StaffChatComposer.jsx');
    expect(msg).toContain('StaffChatReplyPreview');
    expect(comp).toContain('StaffChatReplyPreview');
    // neither renders the raw snippet via a bare span anymore
    expect(msg).not.toMatch(/\{message\.replyTo\.snippet\}/);
    expect(comp).not.toMatch(/\{replyingTo\.snippet\}/);
  });

  it('G4 quote-card is click-to-scroll (role=button + onClick → onQuoteClick)', () => {
    const msg = src('components/staffchat/StaffChatMessage.jsx');
    expect(msg).toContain('onQuoteClick');
    expect(msg).toMatch(/role="button"/);
  });

  it('G5 MessageList wires scrollToMessage + registerNode + bounce highlight', () => {
    const list = src('components/staffchat/StaffChatMessageList.jsx');
    expect(list).toContain('scrollToMessage');
    expect(list).toContain('registerNode');
    expect(list).toMatch(/scrollIntoView/);
    expect(list).toContain('onQuoteClick');
  });

  it('G6 message bubble + sticker apply the bounce class when highlighted', () => {
    const msg = src('components/staffchat/StaffChatMessage.jsx');
    expect(msg).toContain('staff-chat-reply-bounce');
    expect(msg).toMatch(/isHighlighted/);
  });

  it('G7 the bounce keyframe + class exist in index.css', () => {
    const css = src('index.css');
    expect(css).toMatch(/@keyframes staff-chat-reply-bounce/);
    expect(css).toMatch(/\.staff-chat-reply-bounce\s*\{/);
  });
});
