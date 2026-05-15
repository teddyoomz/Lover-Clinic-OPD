// src/components/staffchat/StaffChatMessage.jsx
// V73 (2026-05-16) — Single message bubble. Own (right-aligned rose) vs other (left, neutral).
// V73 Feature B (2026-05-16) — Body rendered via StaffChatMessageBody (parses @mentions + LC- / BA- links).
// V73 Feature C (2026-05-16) — Reply button on hover + quote-card render when replyTo set.
import React from 'react';
import { Reply } from 'lucide-react';
import { StaffChatMessageBody } from './StaffChatMessageBody.jsx';

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatMessage({ message, isOwn, onReply }) {
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
      {!isOwn && (
        <div className="text-[10px] font-bold text-sky-700 dark:text-sky-300 mb-0.5 px-1">
          {message.displayName}
        </div>
      )}
      <div className="flex items-end gap-1">
        <div
          className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-rose-600/20 border border-rose-500/40 text-rose-900 dark:text-rose-100 rounded-br-md'
              : 'bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] rounded-bl-md'
          }`}
        >
          <StaffChatMessageBody text={message.text} />
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
    </div>
  );
}

export default StaffChatMessage;
