// Backend Menu D — Duo Pill (bottom-right). Two segments:
//   💬 chat  → dispatches 'lover:staff-chat-open' window event
//             (StaffChatWidget listens + calls chat.expand())
//   ≡  menu  → calls onOpenBloom() prop
// Cosmetic — does NOT mount or replace the chat hook.
//
// Unread count is consumed via the SAME custom event but in reverse —
// StaffChatWidget broadcasts 'lover:staff-chat-unread' with the count.

import { useEffect, useState } from 'react';
import { MessageCircle, Menu as MenuIcon } from 'lucide-react';

export default function BackendDuoPill({ onOpenBloom }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const onUnread = (e) => {
      const next = Number(e.detail?.count ?? 0);
      if (Number.isFinite(next)) setUnread(next);
    };
    window.addEventListener('lover:staff-chat-unread', onUnread);
    // Request initial count on mount
    window.dispatchEvent(new CustomEvent('lover:staff-chat-unread-request'));
    return () => window.removeEventListener('lover:staff-chat-unread', onUnread);
  }, []);

  return (
    <div className="duo-pill" data-testid="backend-duo-pill">
      <button
        type="button"
        className="duo-pill-btn"
        data-testid="duo-pill-chat"
        aria-label={`เปิดแชทพนักงาน${unread > 0 ? ` (${unread} ข้อความใหม่)` : ''}`}
        onClick={() => window.dispatchEvent(new CustomEvent('lover:staff-chat-open'))}
      >
        <MessageCircle size={22} color="white" />
        {unread > 0 && (
          <span
            data-testid="duo-pill-unread-badge"
            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-rose-700 text-[10px] font-black flex items-center justify-center border-2 border-rose-600"
          >
            {unread > 99 ? '99+' : String(unread)}
          </span>
        )}
      </button>
      <button
        type="button"
        className="duo-pill-btn"
        data-testid="duo-pill-menu"
        aria-label="เปิดเมนู"
        onClick={onOpenBloom}
      >
        <MenuIcon size={22} color="white" />
      </button>
    </div>
  );
}
