// Backend Menu D — Duo Pill (bottom-right). Two segments:
//   💬 chat  → dispatches 'lover:staff-chat-open' window event
//             (StaffChatWidget listens + calls chat.expand())
//   ≡  menu  → toggles bloom: tap to open, tap again to close (V91, 2026-05-18 EOD+11)
// Cosmetic — does NOT mount or replace the chat hook.
//
// V91 update (EOD+11 LATE) — menu button toggles bloom. Pre-V91 the button
// only OPENED bloom (and dismissal required backdrop tap which was hard to
// discover on mobile). User explicit: "ทำปุ่มปิด menu mobile ของเราด้วย
// อาจจะแตะที่ปุ่มเปิดนั่นแหละเพื่อปิด". Icon swaps Menu→X when bloom is
// open, aria-label flips between เปิดเมนู/ปิดเมนู.
//
// Unread count is consumed via the SAME custom event but in reverse —
// StaffChatWidget broadcasts 'lover:staff-chat-unread' with the count.

import { useEffect, useState } from 'react';
import { MessageCircle, Menu as MenuIcon, X } from 'lucide-react';

export default function BackendDuoPill({ bloomOpen = false, onToggleBloom, onOpenBloom }) {
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

  // V91 — toggle handler. Prefer onToggleBloom; fall back to onOpenBloom
  // for backward-compat with any caller that hasn't migrated yet.
  const handleMenuClick = () => {
    if (typeof onToggleBloom === 'function') {
      onToggleBloom();
    } else if (typeof onOpenBloom === 'function') {
      onOpenBloom();
    }
  };

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
        data-bloom-open={bloomOpen ? 'true' : 'false'}
        aria-label={bloomOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
        aria-expanded={bloomOpen ? 'true' : 'false'}
        onClick={handleMenuClick}
      >
        {bloomOpen ? <X size={22} color="white" /> : <MenuIcon size={22} color="white" />}
      </button>
    </div>
  );
}
