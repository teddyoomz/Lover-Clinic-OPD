// src/components/staffchat/StaffChatBubble.jsx
// V73 (2026-05-16) — Minimized chat bubble at bottom-right, 56×56, fire-red.
import React from 'react';
import { MessageCircle } from 'lucide-react';

export function StaffChatBubble({ unreadCount, onClick }) {
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="staff-chat-bubble"
      className="fixed bottom-3 right-3 md:bottom-4 md:right-4 w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105 flex items-center justify-center z-[9000]"
      aria-label="เปิดแชทในสาขา"
    >
      <MessageCircle size={24} />
      {unreadCount > 0 && (
        <span
          data-testid="staff-chat-bubble-unread"
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-rose-700 text-[10px] font-black flex items-center justify-center border-2 border-rose-600"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
}

export default StaffChatBubble;
