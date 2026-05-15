// src/components/staffchat/StaffChatHeader.jsx
// V73 (2026-05-16) — Header bar: branch name + mute toggle + minimize ×.
import React, { useState } from 'react';
import { Bell, BellOff, Minus } from 'lucide-react';
import { getMuted, setMuted } from '../../lib/staffChatIdentity.js';

export function StaffChatHeader({ branchName, onMinimize }) {
  const [muted, setMutedState] = useState(getMuted());

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div
      data-testid="staff-chat-header"
      className="flex items-center justify-between gap-2 px-3 py-2 bg-rose-600 text-white border-b border-rose-700"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold truncate">💬 แชทสาขา · {branchName || '—'}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          data-testid="staff-chat-header-mute"
          className="w-8 h-8 rounded hover:bg-rose-700 flex items-center justify-center transition-colors"
          aria-label={muted ? 'เปิดเสียงแจ้งเตือน' : 'ปิดเสียงแจ้งเตือน'}
          title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
        >
          {muted ? <BellOff size={16} /> : <Bell size={16} />}
        </button>
        <button
          type="button"
          onClick={onMinimize}
          data-testid="staff-chat-header-minimize"
          className="w-8 h-8 rounded hover:bg-rose-700 flex items-center justify-center transition-colors"
          aria-label="ย่อแชท"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatHeader;
