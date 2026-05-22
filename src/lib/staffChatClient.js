// V73 Task 2 (2026-05-16) — Firestore CRUD wrappers + pure helpers for staff chat.
// Pure helper buildMessageDoc emits a Firestore-ready doc shape with:
//   - crypto-secure CHAT-<ts>-<hex> id (Rule C2: no Math.random for ids)
//   - serverTimestamp sentinel for createdAt
//   - validated branchId/displayName/deviceId required
//   - validated text non-empty (unless attachment present) + ≤500 chars
//   - optional mentions[] / replyTo / attachment fields
// Used by ChatPanel + scopedDataLayer.addStaffChatMessage.
import { serverTimestamp } from 'firebase/firestore';
import { STAFF_CHAT_MAX_ATTACHMENTS } from './staffChatRetentionCore.js';
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
} = {}) {
  if (!branchId || typeof branchId !== 'string') throw new Error('STAFF_CHAT_BRANCH_REQUIRED');
  if (!displayName || typeof displayName !== 'string') throw new Error('STAFF_CHAT_NAME_REQUIRED');
  if (!deviceId || typeof deviceId !== 'string') throw new Error('STAFF_CHAT_DEVICE_REQUIRED');
  const trimmed = (typeof text === 'string' ? text : '').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!trimmed && !attachmentUrl && !hasAttachments) throw new Error('STAFF_CHAT_EMPTY_MESSAGE');
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
  if (replyTo && replyTo.msgId) doc.replyTo = {
    msgId: replyTo.msgId,
    snippet: String(replyTo.snippet || '').slice(0, 80),
    displayName: String(replyTo.displayName || ''),
    deviceId: String(replyTo.deviceId || ''),
  };
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
// Returns array of { type: 'text' | 'mention' | 'customer' | 'appt', content/refId }.
export function parseMessageBody(text) {
  if (typeof text !== 'string' || !text) return [{ type: 'text', content: '' }];
  const out = [];
  const re = /(@[^\s@]+)|(\bLC-\d{8}\b)|(\bBA-\d+\b)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push({ type: 'text', content: text.slice(lastIndex, m.index) });
    if (m[1]) out.push({ type: 'mention', content: m[1].slice(1) });
    else if (m[2]) out.push({ type: 'customer', content: m[2], refId: m[2] });
    else if (m[3]) out.push({ type: 'appt', content: m[3], refId: m[3] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push({ type: 'text', content: text.slice(lastIndex) });
  return out;
}
