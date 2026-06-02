// V73 Task 2 (2026-05-16) — Firestore CRUD wrappers + pure helpers for staff chat.
// Pure helper buildMessageDoc emits a Firestore-ready doc shape with:
//   - crypto-secure CHAT-<ts>-<hex> id (Rule C2: no Math.random for ids)
//   - serverTimestamp sentinel for createdAt
//   - validated branchId/displayName/deviceId required
//   - validated text non-empty (unless attachment present) + ≤500 chars
//   - optional mentions[] / replyTo / attachment fields
// Used by ChatPanel + scopedDataLayer.addStaffChatMessage.
import { serverTimestamp } from 'firebase/firestore';
import { STAFF_CHAT_MAX_ATTACHMENTS, attachmentKindFor } from './staffChatRetentionCore.js';
// (2026-05-22 EOD+2 — T2) Office MIME → stamp pdfPreviewStatus='pending' at
// send time so receiver UI shows ⏳ immediately. The officeToPdf Cloud Function
// patches to 'ready'/'failed' once the LibreOffice conversion completes.
import { isOfficeConvertible, OfficePreviewStatus } from './staffChatOfficePreviewCore.js';

// Crypto-secure CHAT-<ts>-<hex> id (Rule C2 — no Math.random). Exported so the
// upload pipeline can mint the id BEFORE uploading images (images live under
// staff-chat-attachments/{branchId}/{messageId}/ → the folder path needs the id).
export function newStaffChatMessageId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `CHAT-${Date.now()}-${hex}`;
}

// Firestore-undefined-safe normalize for one attachment (V14 lesson — no
// undefined leaves; only known fields).
function normalizeStaffChatAttachment(a) {
  const o = {
    // (2026-05-22) any-file: name = original filename (card label + download
    // name); mimeType drives the render kind. thumb/w/h are images-only and
    // omitted for non-image kinds (Firestore-undefined-safe, V14).
    name: String((a && a.name) || ''),
    fullUrl: String((a && a.fullUrl) || ''),
    fullPath: String((a && a.fullPath) || ''),
    size: Number(a && a.size) || 0,
    mimeType: String((a && a.mimeType) || 'application/octet-stream'),
  };
  if (a && a.thumbUrl) o.thumbUrl = String(a.thumbUrl);
  if (a && a.thumbPath) o.thumbPath = String(a.thumbPath);
  if (a && Number.isFinite(a.w) && a.w > 0) o.w = Math.round(a.w);
  if (a && Number.isFinite(a.h) && a.h > 0) o.h = Math.round(a.h);
  // (2026-05-22 EOD+2 — T2) Office MIME (Word/Excel/PPT/CSV, Q3=C scope) →
  // stamp pdfPreviewStatus='pending' so the receiver UI shows ⏳ immediately
  // while officeToPdf Cloud Function runs in the background. Non-Office
  // attachments preserve V73 shape exactly (no surprise field on images/PDFs).
  // pdfPreviewUrl/pdfPreviewError use null (NOT undefined) for V14
  // Firestore-undefined-safe write.
  if (isOfficeConvertible(o.mimeType)) {
    o.pdfPreviewStatus = OfficePreviewStatus.PENDING;
    o.pdfPreviewUrl = null;
    o.pdfPreviewError = null;
    // (2026-05-22 EOD+2 — Path B graceful-timeout) Client-time millis at send.
    // Card reads this to flip ⏳ → ⚠ if the Cloud Function hasn't patched after
    // 60s — graceful degradation when the conversion service is down /
    // not-yet-deployed / overloaded. Pure-visual fork; if the patch eventually
    // arrives the card flips to 👁 naturally. Raw Date.now() is fine — clock
    // skew of even ±5 min still produces a meaningful signal at the 60s threshold.
    o.pdfPreviewStampedAt = Date.now();
  }
  return o;
}

export function buildMessageDoc({
  id: providedId,
  branchId, displayName, text, deviceId,
  mentions, replyTo, attachmentUrl, attachmentSize, attachmentMimeType,
  // (2026-05-22) multi-image: attachments[] (≤10). Legacy attachmentUrl scalar
  // still accepted for backward-compat.
  attachments,
  // V73 color-picker (2026-05-18) — optional sender hex color
  senderColor,
  // V82 (2026-05-17) — optional sender role label
  senderRole,
  // (2026-05-26) optional sticker { kind:'bundled'|'custom', id|url, storagePath, w, h }
  sticker,
} = {}) {
  if (!branchId || typeof branchId !== 'string') throw new Error('STAFF_CHAT_BRANCH_REQUIRED');
  if (!displayName || typeof displayName !== 'string') throw new Error('STAFF_CHAT_NAME_REQUIRED');
  if (!deviceId || typeof deviceId !== 'string') throw new Error('STAFF_CHAT_DEVICE_REQUIRED');
  const trimmed = (typeof text === 'string' ? text : '').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  // (2026-05-26) sticker counts as content (a sticker-only message has empty text).
  const hasSticker = !!(sticker && typeof sticker === 'object' && typeof sticker.kind === 'string' && sticker.kind);
  if (!trimmed && !attachmentUrl && !hasAttachments && !hasSticker) throw new Error('STAFF_CHAT_EMPTY_MESSAGE');
  if (trimmed.length > 500) throw new Error('STAFF_CHAT_TEXT_TOO_LONG');

  // Use the caller-minted id when provided (upload pipeline mints it before
  // uploading so images land under {branchId}/{id}/), else generate. Rule C2.
  const id = (typeof providedId === 'string' && providedId) ? providedId : newStaffChatMessageId();

  const doc = {
    id, branchId, displayName, deviceId,
    text: trimmed,
    createdAt: serverTimestamp(),
  };
  if (hasAttachments) {
    doc.attachments = attachments.slice(0, STAFF_CHAT_MAX_ATTACHMENTS).map(normalizeStaffChatAttachment);
  }
  if (Array.isArray(mentions) && mentions.length > 0) doc.mentions = mentions.slice(0, 5);
  if (replyTo && replyTo.msgId) {
    // (2026-06-02, AV174) The reply snapshot now carries a non-text content
    // descriptor so a reply to an image / file / sticker is visible in the quote
    // (V73 captured only msg.text → image-only replies rendered blank). Keep
    // Firestore-undefined-safe (V14): only write sub-fields that are present.
    const rt = {
      msgId: replyTo.msgId,
      snippet: String(replyTo.snippet || '').slice(0, 80),
      displayName: String(replyTo.displayName || ''),
      deviceId: String(replyTo.deviceId || ''),
    };
    if (replyTo.attachmentKind) rt.attachmentKind = String(replyTo.attachmentKind);
    if (replyTo.attachmentThumbUrl) rt.attachmentThumbUrl = String(replyTo.attachmentThumbUrl);
    if (Number.isFinite(replyTo.attachmentCount) && replyTo.attachmentCount > 0) {
      rt.attachmentCount = Math.round(replyTo.attachmentCount);
    }
    if (replyTo.isSticker) rt.isSticker = true;
    doc.replyTo = rt;
  }
  if (attachmentUrl) {
    doc.attachmentUrl = attachmentUrl;
    doc.attachmentSize = Number(attachmentSize) || 0;
    doc.attachmentMimeType = String(attachmentMimeType || 'image/jpeg');
  }
  // V73 color-picker (2026-05-18) — optional senderColor (hex). Receivers
  // render bubble + name with this color. Omit if invalid (defensive — keep
  // Firestore-undefined-safe per V14 lesson). Past messages w/o this field
  // fall back to default rose/sky via resolveSenderColor on the reader side.
  if (typeof senderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(senderColor)) {
    doc.senderColor = senderColor;
  }
  // V82 (2026-05-17) — optional senderRole label (e.g. "หมอ", "ผู้ช่วย").
  // Receivers may render alongside displayName. Omit if falsy/non-string to
  // keep Firestore-undefined-safe per V14 lesson. Past messages w/o this
  // field render without role suffix on the reader side.
  if (senderRole) {
    doc.senderRole = String(senderRole);
  }
  // (2026-05-26) sticker — bundled (id ref, 0 Storage) or custom (Storage url).
  // Undefined-safe (V14): only known sub-fields, no undefined leaves.
  if (hasSticker) {
    const s = { kind: String(sticker.kind) };
    if (sticker.kind === 'bundled' && sticker.id) s.id = String(sticker.id);
    if (sticker.kind === 'custom') {
      s.url = String(sticker.url || '');
      s.storagePath = String(sticker.storagePath || '');
      if (Number.isFinite(sticker.w) && sticker.w > 0) s.w = Math.round(sticker.w);
      if (Number.isFinite(sticker.h) && sticker.h > 0) s.h = Math.round(sticker.h);
    }
    doc.sticker = s;
  }
  return doc;
}

// Sender — calls scopedDataLayer.addStaffChatMessage. Lazy import to avoid
// circular deps.
export async function sendStaffChatMessage(payload) {
  const doc = buildMessageDoc(payload);
  const { addStaffChatMessage } = await import('./scopedDataLayer.js');
  return addStaffChatMessage(doc);
}

// V73 Feature B (2026-05-16) — Extract @mentions from text.
// Returns array of unique display-name candidates (max 5) without the '@' prefix.
export function extractMentions(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(/@([^\s@]+)/g) || [];
  const unique = [];
  for (const m of matches) {
    const name = m.slice(1);  // strip leading @
    if (name && !unique.includes(name)) unique.push(name);
    if (unique.length >= 5) break;
  }
  return unique;
}

// V73 Features B + H (2026-05-16) — Parse message text into renderable segments.
// V137 (2026-05-31) — added 'url' segment so http/https links render clickable.
// Returns array of { type: 'text' | 'url' | 'mention' | 'customer' | 'appt',
// content/href/refId }.
//
// The URL branch is FIRST in the alternation: a URL like
// `https://host/?customer=LC-26000022` must be captured WHOLE (not split into a
// url + a customer chip), so the http(s) match must win at the URL's start
// position and consume through to the next whitespace. Only http/https schemes
// match (`javascript:` / `data:` / `vbscript:` can't → no XSS via href; the
// renderer also pins target=_blank + rel=noopener noreferrer).
export function parseMessageBody(text) {
  if (typeof text !== 'string' || !text) return [{ type: 'text', content: '' }];
  const out = [];
  const re = /(https?:\/\/[^\s]+)|(@[^\s@]+)|(\bLC-\d{8}\b)|(\bBA-\d+\b)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push({ type: 'text', content: text.slice(lastIndex, m.index) });
    if (m[1]) {
      // Strip trailing sentence punctuation so "ดูที่ https://x.com/a." →
      // link `https://x.com/a` + text ".". Closing bracket/quote/period etc.
      // are far more likely sentence punctuation than part of the URL.
      let url = m[1];
      const trail = url.match(/[.,;:!?)\]}'"»]+$/);
      let tail = '';
      if (trail) { tail = trail[0]; url = url.slice(0, url.length - tail.length); }
      out.push({ type: 'url', content: url, href: url });
      if (tail) out.push({ type: 'text', content: tail });
    }
    else if (m[2]) out.push({ type: 'mention', content: m[2].slice(1) });
    else if (m[3]) out.push({ type: 'customer', content: m[3], refId: m[3] });
    else if (m[4]) out.push({ type: 'appt', content: m[4], refId: m[4] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push({ type: 'text', content: text.slice(lastIndex) });
  return out;
}

// ── (2026-06-02, AV174) Reply-preview helpers ───────────────────────────────
// A reply to an image / file / sticker MUST show WHAT was replied to. The V73
// reply snapshot captured only msg.text, so an image-only reply rendered a blank
// quote (the recipient couldn't tell what was replied to). These pure helpers
// build the snapshot (text snippet + a content descriptor) and map it to a Thai
// icon + label. Consumers: StaffChatWidget.handleReply + StaffChatReplyPreview.

// Build the reply snapshot stashed into `replyingTo` (composer strip) and later
// persisted under the next message's `replyTo`. Captures the text snippet AND a
// content descriptor for attachments / stickers so the quote is never blank.
export function buildReplySnapshot(msg) {
  if (!msg || !msg.id) return null;
  const snap = {
    msgId: String(msg.id),
    snippet: String(msg.text || '').slice(0, 80),
    displayName: String(msg.displayName || ''),
    deviceId: String(msg.deviceId || ''),
  };
  // Sticker message — chrome-less, no attachments. Flag + return early.
  if (msg.sticker && typeof msg.sticker === 'object' && msg.sticker.kind) {
    snap.isSticker = true;
    return snap;
  }
  const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
  if (atts.length > 0) {
    const imageAtts = atts.filter(a => attachmentKindFor(a && a.mimeType) === 'image');
    snap.attachmentCount = atts.length;
    if (imageAtts.length > 0) {
      // Prefer an image preview: thumb (cheap) → full → none.
      snap.attachmentKind = 'image';
      const first = imageAtts[0];
      const thumb = (first && (first.thumbUrl || first.fullUrl)) || '';
      if (thumb) snap.attachmentThumbUrl = String(thumb);
    } else {
      // Non-image set — label by the first attachment's kind (file/pdf/video/…).
      snap.attachmentKind = attachmentKindFor(atts[0] && atts[0].mimeType);
    }
    return snap;
  }
  // Legacy V73 single-image scalar (attachmentUrl) — treat as one image.
  if (msg.attachmentUrl) {
    snap.attachmentKind = 'image';
    snap.attachmentCount = 1;
    snap.attachmentThumbUrl = String(msg.attachmentUrl);
  }
  return snap;
}

// Map a reply snapshot's content descriptor to a Thai icon + label for the quote
// preview. Returns null for a pure-text reply (the snippet itself is the preview).
export function replyPreviewMeta(reply) {
  if (!reply || typeof reply !== 'object') return null;
  if (reply.isSticker) return { icon: '🎟', label: 'สติกเกอร์' };
  const kind = reply.attachmentKind;
  if (!kind) return null;
  const n = Number.isFinite(reply.attachmentCount) && reply.attachmentCount > 1
    ? ` (${reply.attachmentCount})` : '';
  switch (kind) {
    case 'image':  return { icon: '📷', label: `รูปภาพ${n}` };
    case 'video':  return { icon: '🎬', label: `วิดีโอ${n}` };
    case 'audio':  return { icon: '🎵', label: `ไฟล์เสียง${n}` };
    case 'pdf':    return { icon: '📄', label: `ไฟล์ PDF${n}` };
    case 'office': return { icon: '📑', label: `เอกสาร${n}` };
    default:       return { icon: '📎', label: `ไฟล์แนบ${n}` };
  }
}
