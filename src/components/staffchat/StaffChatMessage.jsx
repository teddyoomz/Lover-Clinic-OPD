// src/components/staffchat/StaffChatMessage.jsx
// V73 (2026-05-16) — Single message bubble. Own (right-aligned rose) vs other (left, neutral).
import React from 'react';

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatMessage({ message, isOwn }) {
  return (
    <div
      data-testid="staff-chat-message"
      data-own={isOwn ? 'true' : 'false'}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
    >
      {!isOwn && (
        <div className="text-[10px] font-bold text-sky-700 dark:text-sky-300 mb-0.5 px-1">
          {message.displayName}
        </div>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isOwn
            ? 'bg-rose-600/20 border border-rose-500/40 text-rose-900 dark:text-rose-100 rounded-br-md'
            : 'bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] rounded-bl-md'
        }`}
      >
        {message.text}
      </div>
      <div className="text-[9px] text-[var(--tx-muted)] mt-0.5 px-1">
        {formatTime(message.createdAt)}
      </div>
    </div>
  );
}

export default StaffChatMessage;
