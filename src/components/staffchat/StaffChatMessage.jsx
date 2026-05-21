// src/components/staffchat/StaffChatMessage.jsx
// V73 (2026-05-16) — Single message bubble. Own (right-aligned rose) vs other (left, neutral).
// V73 Feature B (2026-05-16) — Body rendered via StaffChatMessageBody (parses @mentions + LC- / BA- links).
// V73 Feature C (2026-05-16) — Reply button on hover + quote-card render when replyTo set.
// V73 Feature F (2026-05-16) — Attachment thumbnail + click-to-open lightbox.
// V73 color-picker (2026-05-18) — sender-chosen color drives name + bubble.
//   Past messages without senderColor → default rose (own) / sky (other).
import React, { useState } from 'react';
import { Reply } from 'lucide-react';
import { StaffChatMessageBody } from './StaffChatMessageBody.jsx';
import { StaffChatImageLightbox } from './StaffChatImageLightbox.jsx';
import { StaffChatAttachmentCard } from './StaffChatAttachmentCard.jsx';
import { StaffChatPdfOverlay } from './StaffChatPdfOverlay.jsx';
import { StaffChatRoleBadge } from './StaffChatRoleBadge.jsx';
import { hexToRgba, resolveSenderColor } from '../../lib/staffChatColor.js';
import { gridLayoutFor, attachmentKindFor } from '../../lib/staffChatRetentionCore.js';

// (2026-05-22) Adaptive thumbnail grid for message.attachments[] (LINE-style).
// 1 image renders at natural aspect; 2+ render as a fixed-height grid of square
// cover tiles; the 4th tile shows "+N" when there are more than 4. Click a tile
// → onOpen(index) opens the lightbox at that image.
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

export function StaffChatMessage({ message, isOwn, onReply }) {
  // V73 Feature F — local lightbox state. (2026-05-22) null = closed; else
  // { images, start } so the swipe lightbox opens at the clicked image.
  const [lightbox, setLightbox] = useState(null);
  // (2026-05-22) any-file: PDF preview overlay state ({ url, name, size }).
  const [pdfOverlay, setPdfOverlay] = useState(null);
  // V73 color-picker (2026-05-18) — resolve sender color from message doc.
  const senderColor = resolveSenderColor(message, isOwn);
  const bubbleStyle = {
    backgroundColor: hexToRgba(senderColor, 0.20),
    borderColor: hexToRgba(senderColor, 0.45),
  };
  const nameStyle = { color: senderColor };
  // (2026-05-22) any-file: split attachments by render kind. Images group into
  // the existing grid (+ lightbox); every other kind renders in order below
  // (inline video/audio players · pdf/file download cards). Legacy multi-image
  // records carry image/* mimeType → land in imageAtts unchanged.
  const atts = Array.isArray(message.attachments) ? message.attachments : [];
  const imageAtts = atts.filter((a) => attachmentKindFor(a && a.mimeType) === 'image');
  const otherAtts = atts.filter((a) => attachmentKindFor(a && a.mimeType) !== 'image');
  return (
    <div
      data-testid="staff-chat-message"
      data-own={isOwn ? 'true' : 'false'}
      className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
    >
      {message.replyTo && (
        <div
          data-testid={`staff-chat-message-quote-${message.id}`}
          className={`text-[10px] px-2 py-1 mb-1 border-l-2 border-rose-400 bg-rose-500/[0.08] rounded max-w-[80%] ${isOwn ? 'self-end' : 'self-start'} cursor-pointer hover:bg-rose-500/15`}
        >
          <span className="font-bold text-rose-300">↩ {message.replyTo.displayName}: </span>
          <span className="text-[var(--tx-muted)] italic">{message.replyTo.snippet}</span>
        </div>
      )}
      {/* V73 L1 fix (2026-05-18) — show displayName on ALL messages incl. own.
          V73 color-picker (2026-05-18) — name color uses sender-chosen hex
          (resolved via resolveSenderColor with fallback to default rose/sky).
          Inline style required since hex is dynamic (cannot pre-generate
          Tailwind classes for arbitrary user-picked colors).
          V82 (2026-05-17) — RoleBadge rendered inline-flex BEFORE the name
          when message.senderRole present; returns null gracefully for legacy
          messages (no senderRole field) so no layout reflow. */}
      {message.displayName && (
        <div
          data-testid={`staff-chat-message-name-${message.id}`}
          className="text-[10px] font-bold mb-0.5 px-1"
        >
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <StaffChatRoleBadge role={message.senderRole} size="sm" />
            <span data-testid="staff-chat-sender-name" style={nameStyle}>
              {message.displayName}
            </span>
          </span>
        </div>
      )}
      <div className="flex items-end gap-1">
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
                onPreview={kind === 'pdf' ? () => setPdfOverlay({ url: a.fullUrl, name: a.name, size: a.size }) : undefined}
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
      {pdfOverlay && (
        <StaffChatPdfOverlay
          url={pdfOverlay.url}
          name={pdfOverlay.name}
          size={pdfOverlay.size}
          onClose={() => setPdfOverlay(null)}
        />
      )}
    </div>
  );
}

export default StaffChatMessage;
