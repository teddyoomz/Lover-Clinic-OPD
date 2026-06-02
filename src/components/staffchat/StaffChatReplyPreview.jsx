// src/components/staffchat/StaffChatReplyPreview.jsx
// (2026-06-02, AV174) Shared reply-quote preview. Renders WHAT was replied to:
// optional image thumbnail + a Thai icon+label for the content kind (image /
// file / pdf / video / audio / สติกเกอร์) + the text snippet. Used by BOTH the
// message quote-card (StaffChatMessage) and the composer reply strip
// (StaffChatComposer) so the two surfaces can never drift (V12 lesson).
//
// Pre-AV174 both surfaces rendered only `snippet`, so a reply to an image-only
// message rendered a blank quote — the recipient couldn't tell what was replied
// to. The descriptor fields (attachmentKind / attachmentThumbUrl /
// attachmentCount / isSticker) come from buildReplySnapshot + buildMessageDoc.
import React from 'react';
import { replyPreviewMeta } from '../../lib/staffChatClient.js';

export function StaffChatReplyPreview({ reply, prefixLabel = '', truncateSnippet = false, className = '' }) {
  if (!reply) return null;
  const meta = replyPreviewMeta(reply);
  const hasThumb = reply.attachmentKind === 'image' && !!reply.attachmentThumbUrl;
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 align-middle ${className}`}>
      <span className="font-bold text-rose-300 shrink-0">↩ {prefixLabel}{reply.displayName}: </span>
      {hasThumb && (
        <img
          src={reply.attachmentThumbUrl}
          alt=""
          data-testid="staff-chat-reply-thumb"
          className="w-5 h-5 rounded object-cover shrink-0 border border-rose-400/30"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      {meta && (
        <span data-testid="staff-chat-reply-meta" className="shrink-0 text-rose-300">
          {meta.icon} {meta.label}
        </span>
      )}
      {reply.snippet && (
        <span className={`text-[var(--tx-muted)] italic ${truncateSnippet ? 'truncate' : 'break-words'}`}>
          {reply.snippet}
        </span>
      )}
    </span>
  );
}

export default StaffChatReplyPreview;
