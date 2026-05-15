// src/components/staffchat/StaffChatMentionChip.jsx
// V73 Feature B (2026-05-16) — Rose-tinted @name chip in message bubble.
import React from 'react';

export function StaffChatMentionChip({ name }) {
  return (
    <span
      data-testid={`staff-chat-mention-chip-${name}`}
      className="inline-block px-1.5 py-0.5 rounded font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
    >
      @{name}
    </span>
  );
}

export default StaffChatMentionChip;
