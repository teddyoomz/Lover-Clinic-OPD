// V73 Task 2 (2026-05-16) — Firestore CRUD wrappers + pure helpers for staff chat.
// Pure helper buildMessageDoc emits a Firestore-ready doc shape with:
//   - crypto-secure CHAT-<ts>-<hex> id (Rule C2: no Math.random for ids)
//   - serverTimestamp sentinel for createdAt
//   - validated branchId/displayName/deviceId required
//   - validated text non-empty (unless attachment present) + ≤500 chars
//   - optional mentions[] / replyTo / attachment fields
// Used by ChatPanel + scopedDataLayer.addStaffChatMessage.
import { serverTimestamp } from 'firebase/firestore';

export function buildMessageDoc({
  branchId, displayName, text, deviceId,
  mentions, replyTo, attachmentUrl, attachmentSize, attachmentMimeType,
} = {}) {
  if (!branchId || typeof branchId !== 'string') throw new Error('STAFF_CHAT_BRANCH_REQUIRED');
  if (!displayName || typeof displayName !== 'string') throw new Error('STAFF_CHAT_NAME_REQUIRED');
  if (!deviceId || typeof deviceId !== 'string') throw new Error('STAFF_CHAT_DEVICE_REQUIRED');
  const trimmed = (typeof text === 'string' ? text : '').trim();
  if (!trimmed && !attachmentUrl) throw new Error('STAFF_CHAT_EMPTY_MESSAGE');
  if (trimmed.length > 500) throw new Error('STAFF_CHAT_TEXT_TOO_LONG');

  // Crypto-secure random id (Rule C2 — no Math.random for ids)
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const id = `CHAT-${Date.now()}-${hex}`;

  const doc = {
    id, branchId, displayName, deviceId,
    text: trimmed,
    createdAt: serverTimestamp(),
  };
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
  return doc;
}

// Sender — calls scopedDataLayer.addStaffChatMessage. Lazy import to avoid
// circular deps.
export async function sendStaffChatMessage(payload) {
  const doc = buildMessageDoc(payload);
  const { addStaffChatMessage } = await import('./scopedDataLayer.js');
  return addStaffChatMessage(doc);
}
