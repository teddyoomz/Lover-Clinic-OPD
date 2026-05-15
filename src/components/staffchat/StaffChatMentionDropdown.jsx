// src/components/staffchat/StaffChatMentionDropdown.jsx
// V73 Feature B (2026-05-16) — @-trigger dropdown of recent display names.
import React from 'react';

export function StaffChatMentionDropdown({ candidates, onPick }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div
      data-testid="staff-chat-mention-dropdown"
      className="absolute bottom-full left-0 mb-1 bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-lg shadow-xl max-h-48 overflow-y-auto w-64 z-10"
    >
      {candidates.slice(0, 8).map(name => (
        <button
          key={name}
          type="button"
          onClick={() => onPick(name)}
          data-testid={`staff-chat-mention-dropdown-item-${name}`}
          className="w-full text-left px-3 py-2 hover:bg-rose-500/10 text-sm text-[var(--tx-primary)]"
        >
          @{name}
        </button>
      ))}
    </div>
  );
}

export default StaffChatMentionDropdown;
