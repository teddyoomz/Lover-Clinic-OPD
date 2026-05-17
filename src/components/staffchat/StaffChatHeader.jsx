// src/components/staffchat/StaffChatHeader.jsx
// V73 (2026-05-16) — Header bar: branch name + mute toggle + minimize ×.
// V73 name-edit (2026-05-18) — shows current displayName as a clickable chip
//   "👤 <name> ✏️" that opens NamePicker in edit mode. Hidden when no name set
//   (first-send modal handles that path).
import React, { useState } from 'react';
import { Bell, BellOff, Minus, Pencil } from 'lucide-react';
import { getMuted, setMuted, getDisplayName } from '../../lib/staffChatIdentity.js';

export function StaffChatHeader({ branchName, onMinimize, onEditName, displayName, canMinimize = true }) {
  const [muted, setMutedState] = useState(getMuted());

  // Re-read displayName on every render so the chip refreshes after edit.
  // Prefer prop (passed by widget after edit) → localStorage → null.
  const currentName =
    (typeof displayName === 'string' && displayName.trim()) || getDisplayName();

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
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-bold truncate">💬 แชทสาขา · {branchName || '—'}</span>
        {currentName && onEditName && (
          <button
            type="button"
            onClick={onEditName}
            data-testid="staff-chat-header-edit-name"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-700/60 hover:bg-rose-800/80 text-[11px] font-bold transition-colors min-w-0"
            aria-label={`แก้ชื่อ (ตอนนี้: ${currentName})`}
            title="คลิกเพื่อแก้ชื่อในแชท"
          >
            <span className="truncate max-w-[100px]">👤 {currentName}</span>
            <Pencil size={11} className="flex-shrink-0 opacity-80" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
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
        {/* V82-fix7 (2026-05-18) — minimize ALWAYS works. Force-open
            (V82 contract) is preserved via auto-reopen on new messages, but
            user explicitly clicking "—" is treated as "acknowledge all read"
            (useStaffChat.minimize advances the cursor to the latest msg
            before setMinimized(true)). canMinimize is now a VISUAL hint
            only — tooltip + opacity reflect unread state but button works.
            Origin: User mobile bug "กดปิดแชทไม่ได้" — force-open trapped
            users on mobile where bottom dock was covered. V82 force-open
            stays useful (next new msg reopens chat) without trapping. */}
        <button
          type="button"
          onClick={onMinimize}
          data-testid="staff-chat-minimize-btn"
          data-can-minimize={canMinimize ? 'true' : 'false'}
          aria-label={canMinimize ? 'ย่อแชท' : 'ย่อแชท (และทำเครื่องหมายว่าอ่านครบ)'}
          title={canMinimize ? 'ย่อหน้าต่าง' : 'ย่อ + ทำเครื่องหมายว่าอ่านครบ'}
          className="w-8 h-8 rounded hover:bg-rose-700 flex items-center justify-center transition-colors"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatHeader;
