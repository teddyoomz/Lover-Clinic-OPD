// src/components/staffchat/StaffChatMessage.jsx
// V73 (2026-05-16) — Single message bubble. Own (right-aligned rose) vs other (left, neutral).
// V73 Feature B (2026-05-16) — Body rendered via StaffChatMessageBody (parses @mentions + LC- / BA- links).
// V73 Feature C (2026-05-16) — Reply button on hover + quote-card render when replyTo set.
// V73 Feature F (2026-05-16) — Attachment thumbnail + click-to-open lightbox.
// V73 color-picker (2026-05-18) — sender-chosen color drives name + bubble.
//   Past messages without senderColor → default rose (own) / sky (other).
// (2026-05-26) Feature 2 — quote text 10px → 13px (near-normal, readable).
// (2026-05-26) Feature 3 — own-only unsend: 🗑 on hover (own messages) → confirm
//   dialog (AV78 explicit-close) → onDelete(id) hard-deletes Firestore doc + Storage.
// (2026-05-26) Feature 4 — sticker bubble: bundled (by id) or custom (by url),
//   rendered chrome-less + large (no message-bubble background).
import React, { useState } from 'react';
import { Reply, Trash2 } from 'lucide-react';
import { StaffChatMessageBody } from './StaffChatMessageBody.jsx';
import { StaffChatImageLightbox } from './StaffChatImageLightbox.jsx';
import { StaffChatAttachmentCard } from './StaffChatAttachmentCard.jsx';
import { StaffChatPdfOverlay } from './StaffChatPdfOverlay.jsx';
import { StaffChatRoleBadge } from './StaffChatRoleBadge.jsx';
import { hexToRgba, resolveSenderColor } from '../../lib/staffChatColor.js';
import { gridLayoutFor, attachmentKindFor } from '../../lib/staffChatRetentionCore.js';
import { bundledStickerSrc } from '../../lib/staffChatStickers.js';

// (2026-05-22) Adaptive thumbnail grid for message.attachments[] (LINE-style).
function AttachmentGrid({ attachments, onOpen }) {
  const atts = Array.isArray(attachments) ? attachments : [];
  if (atts.length === 0) return null;
  if (atts.length === 1) {
    const a = atts[0];
    return (
      <button
        type="button"
        onClick={() => onOpen(0)}
        data-testid="staff-chat-attach-tile"
        className="block max-w-[220px] rounded-lg overflow-hidden mb-1 cursor-zoom-in"
      >
        <img src={a.thumbUrl || a.fullUrl} alt="" className="w-full h-auto" />
      </button>
    );
  }
  const layout = gridLayoutFor(atts.length);
  const gridHeight = atts.length === 2 ? 118 : 158;
  return (
    <div
      data-testid="staff-chat-attach-grid"
      className="grid gap-0.5 rounded-lg overflow-hidden mb-1"
      style={{ gridTemplateColumns: layout.cols, gridTemplateRows: layout.rows || undefined, width: '100%', maxWidth: 240, height: gridHeight }}
    >
      {atts.slice(0, layout.show).map((a, i) => {
        const isLast = i === layout.show - 1;
        const overflow = isLast && layout.overflow > 0 ? layout.overflow : 0;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpen(i)}
            data-testid="staff-chat-attach-tile"
            className="relative overflow-hidden cursor-zoom-in"
            style={layout.firstBig && i === 0 ? { gridRow: 'span 2' } : undefined}
          >
            <img src={a.thumbUrl || a.fullUrl} alt="" className="w-full h-full object-cover block" />
            {overflow > 0 && (
              <span className="absolute inset-0 bg-black/55 text-white text-lg font-bold flex items-center justify-center">
                +{overflow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatMessage({ message, isOwn, onReply, onDelete }) {
  // V73 Feature F — local lightbox state. null = closed; else { images, start }.
  const [lightbox, setLightbox] = useState(null);
  // (2026-05-22) any-file: file-preview overlay state.
  const [fileViewer, setFileViewer] = useState(null);
  // (2026-05-26) Feature 3 — unsend confirm dialog state.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // V73 color-picker (2026-05-18) — resolve sender color from message doc.
  const senderColor = resolveSenderColor(message, isOwn);
  const bubbleStyle = {
    backgroundColor: hexToRgba(senderColor, 0.20),
    borderColor: hexToRgba(senderColor, 0.45),
  };
  const nameStyle = { color: senderColor };
  // (2026-05-22) any-file: split attachments by render kind.
  const atts = Array.isArray(message.attachments) ? message.attachments : [];
  const imageAtts = atts.filter((a) => attachmentKindFor(a && a.mimeType) === 'image');
  const otherAtts = atts.filter((a) => attachmentKindFor(a && a.mimeType) !== 'image');
  // (2026-05-26) Feature 4 — sticker message renders chrome-less (no bubble).
  const isSticker = !!(message.sticker && message.sticker.kind);
  return (
    <div
      data-testid="staff-chat-message"
      data-own={isOwn ? 'true' : 'false'}
      className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
    >
      {message.replyTo && (
        <div
          data-testid={`staff-chat-message-quote-${message.id}`}
          className={`text-[13px] px-2 py-1 mb-1 border-l-2 border-rose-400 bg-rose-500/[0.08] rounded max-w-[80%] ${isOwn ? 'self-end' : 'self-start'} cursor-pointer hover:bg-rose-500/15`}
        >
          <span className="font-bold text-rose-300">↩ {message.replyTo.displayName}: </span>
          <span className="text-[var(--tx-muted)] italic">{message.replyTo.snippet}</span>
        </div>
      )}
      {/* V73 L1 fix (2026-05-18) — show displayName on ALL messages incl. own.
          V82 (2026-05-17) — RoleBadge before the name when senderRole present. */}
      {message.displayName && (
        <div
          data-testid={`staff-chat-message-name-${message.id}`}
          className="text-[10px] font-bold mb-0.5 px-1"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <StaffChatRoleBadge role={message.senderRole} size="sm" />
            <span data-testid="staff-chat-sender-name" style={nameStyle}>
              {message.displayName}
            </span>
          </span>
        </div>
      )}
      <div className="flex items-end gap-1">
        {isSticker ? (
          <img
            data-testid={`staff-chat-message-sticker-${message.id}`}
            src={message.sticker.kind === 'bundled' ? bundledStickerSrc(message.sticker.id) : message.sticker.url}
            alt="sticker"
            className="w-28 h-28 object-contain"
            onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
          />
        ) : (
          <div
            className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words border text-[var(--tx-primary)] ${
              isOwn ? 'rounded-br-md' : 'rounded-bl-md'
            }`}
            style={bubbleStyle}
            data-testid={`staff-chat-message-bubble-${message.id}`}
          >
            {imageAtts.length > 0 && (
              <div data-testid={`staff-chat-message-image-${message.id}`}>
                <AttachmentGrid
                  attachments={imageAtts}
                  onOpen={(i) => setLightbox({ images: imageAtts, start: i })}
                />
              </div>
            )}
            {otherAtts.map((a, i) => {
              const kind = attachmentKindFor(a && a.mimeType);
              if (kind === 'video') {
                return (
                  <video
                    key={i}
                    src={a.fullUrl}
                    controls
                    preload="metadata"
                    data-testid="staff-chat-attach-video"
                    className="block w-full max-w-[240px] rounded-lg mb-1 bg-black"
                  />
                );
              }
              if (kind === 'audio') {
                return (
                  <audio
                    key={i}
                    src={a.fullUrl}
                    controls
                    preload="metadata"
                    data-testid="staff-chat-attach-audio"
                    className="block w-full max-w-[240px] mb-1"
                  />
                );
              }
              return (
                <StaffChatAttachmentCard
                  key={i}
                  att={a}
                  onPreview={(info) => setFileViewer(info)}
                />
              );
            })}
            {imageAtts.length === 0 && otherAtts.length === 0 && message.attachmentUrl && (
              // Legacy V73 single-image message (attachmentUrl scalar) — still renders.
              <button
                type="button"
                onClick={() => setLightbox({ images: [{ fullUrl: message.attachmentUrl, thumbUrl: message.attachmentUrl }], start: 0 })}
                data-testid={`staff-chat-message-image-${message.id}`}
                className="block max-w-[200px] rounded-lg overflow-hidden mb-1 cursor-zoom-in"
              >
                <img src={message.attachmentUrl} alt="" className="w-full h-auto" />
              </button>
            )}
            {message.text && <StaffChatMessageBody text={message.text} />}
          </div>
        )}
        {onReply && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReply(message); }}
            data-testid={`staff-chat-message-reply-${message.id}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-5 h-5 rounded text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="ตอบกลับ"
            title="ตอบกลับ"
          >
            <Reply size={11} />
          </button>
        )}
        {/* (2026-05-26) Feature 3 — own-only unsend affordance. */}
        {isOwn && onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            data-testid={`staff-chat-message-delete-${message.id}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-5 h-5 rounded text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="ลบข้อความ"
            title="ลบข้อความ"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      <div className="text-[9px] text-[var(--tx-muted)] mt-0.5 px-1">
        {formatTime(message.createdAt)}
      </div>
      {lightbox && (
        <StaffChatImageLightbox
          images={lightbox.images}
          startIndex={lightbox.start}
          onClose={() => setLightbox(null)}
        />
      )}
      {fileViewer && (
        <StaffChatPdfOverlay
          fileUrl={fileViewer.fileUrl}
          name={fileViewer.name}
          size={fileViewer.size}
          onClose={() => setFileViewer(null)}
        />
      )}
      {/* (2026-05-26) Feature 3 — unsend confirm. AV78 explicit-close: backdrop
          does NOT close; only ยกเลิก / ลบเลย. */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50"
          data-testid={`staff-chat-delete-confirm-${message.id}`}
        >
          <div
            className="bg-[var(--bg-card)] text-[var(--tx-primary)] rounded-xl p-4 w-[260px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-bold mb-1">ลบข้อความ</div>
            <div className="text-sm text-[var(--tx-muted)] mb-3">
              ลบข้อความนี้ออกจากระบบ? ลบแล้วกู้คืนไม่ได้ (ลบทั้งข้อความและไฟล์แนบ)
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded bg-black/20"
                onClick={() => setConfirmDelete(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                data-testid={`staff-chat-delete-confirm-yes-${message.id}`}
                className="px-3 py-1 rounded bg-rose-600 text-white"
                onClick={async () => { setConfirmDelete(false); try { await onDelete(message.id); } catch { /* surfaced upstream */ } }}
              >
                ลบเลย
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffChatMessage;
