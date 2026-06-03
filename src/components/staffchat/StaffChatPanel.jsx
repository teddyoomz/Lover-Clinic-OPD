// src/components/staffchat/StaffChatPanel.jsx
// V73 (2026-05-16) — Expanded chat panel. Desktop: 360×480 corner-anchored.
// Mobile (<md): fullscreen 95vw × 60vh modal-style overlay.
// V73 L1 fix (2026-05-18) — Surface error + loading state from useStaffChat
// per AV51 (Bug D: silent listener errors hid index-not-built / permission-
// denied / branch-mismatch causes). User sees rose-tinted banner + retry hint.
// V82-fix7-bis (2026-05-18) — Mobile body-scroll lock + touchAction:pan-y +
// overscroll-contain to prevent scroll-bleed: user touch inside chat list
// was scrolling the page BEHIND the panel instead of the list. Body-class
// trick (data-staff-chat-open) + CSS @media targets mobile only.
import React, { useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { StaffChatHeader } from './StaffChatHeader.jsx';
import { useStaffChatPanelResize } from '../../hooks/useStaffChatPanelResize.js';

export function StaffChatPanel({ hidden = false, branchName, onMinimize, onEditName, displayName, error, loading, canMinimize, children }) {
  // (2026-05-31) Desktop-only resize: drag the top-left grip to resize
  // (bottom-right anchored); size persisted per-device + restored on remount
  // (minimize-reopen / auto-popup). Mobile (<768px) → isDesktop=false →
  // existing fullscreen overlay unchanged (no grip, no inline size).
  const { isDesktop, size, panelRef, gripProps } = useStaffChatPanelResize();
  // Desktop only: inline size overrides md:w-[360px] md:h-[480px]. Mobile:
  // null → the bottom-2/right-2/left-2/top-[20vh] overlay classes apply.
  const desktopSize = isDesktop ? { width: size.width + 'px', height: size.height + 'px' } : null;

  // V82-fix7-bis — body scroll lock on mount, restore on unmount. CSS rule
  // in src/index.css `@media (max-width: 767px) { html[data-staff-chat-open] { overflow: hidden; touch-action: none; } }`
  // ensures the lock applies ONLY on mobile (desktop panel is 360×480 corner-anchored, doesn't need lock).
  // (2026-06-03) — the Panel now stays MOUNTED (hidden via display:none) on
  // minimize so the composer draft (text + staged files + object-URLs) survives.
  // The mobile body-scroll-lock must therefore follow the VISIBLE state, not the
  // mount: release it while hidden, re-apply when shown.
  useEffect(() => {
    if (hidden) {
      document.documentElement.removeAttribute('data-staff-chat-open');
      return;
    }
    document.documentElement.setAttribute('data-staff-chat-open', 'true');
    return () => {
      document.documentElement.removeAttribute('data-staff-chat-open');
    };
  }, [hidden]);

  return (
    <div
      ref={panelRef}
      data-testid="staff-chat-panel"
      className="fixed
        bottom-2 right-2 left-2 top-[20vh] md:top-auto md:left-auto md:bottom-4 md:right-4
        md:w-[360px] md:h-[480px]
        bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-xl shadow-2xl
        flex flex-col overflow-hidden overscroll-contain z-[9000]"
      style={{ touchAction: 'pan-y', ...desktopSize, ...(hidden ? { display: 'none' } : {}) }}
    >
      {/* (2026-05-31) Desktop resize grip — top-left corner. Drag = resize
          (bottom-right anchored); double-click = reset to 360×480. Mobile: not
          rendered (isDesktop=false). z-10 so it sits above the rose header. */}
      {isDesktop && (
        <div
          {...gripProps}
          className="absolute top-0 left-0 w-[18px] h-[18px] z-[10] group"
          title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต"
        >
          <span className="absolute top-[4px] left-[4px] w-[9px] h-[9px] border-t-2 border-l-2 border-white/70 group-hover:border-white rounded-tl-sm pointer-events-none" />
        </div>
      )}
      <StaffChatHeader
        branchName={branchName}
        onMinimize={onMinimize}
        onEditName={onEditName}
        displayName={displayName}
        canMinimize={canMinimize}
      />
      {error && (
        <div
          data-testid="staff-chat-error-banner"
          className="flex items-start gap-2 px-3 py-2 bg-rose-500/15 border-b border-rose-500/40 text-[11px] text-rose-300"
        >
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">ไม่สามารถโหลดข้อความได้</div>
            <div className="text-rose-200/80 break-words">{error}</div>
            <div className="text-rose-200/60 text-[10px] mt-0.5">ลองรีเฟรชหน้านี้ หรือเปลี่ยนสาขาแล้วเปลี่ยนกลับ</div>
          </div>
        </div>
      )}
      {loading && !error && (
        <div
          data-testid="staff-chat-loading-banner"
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-input)] border-b border-[var(--bd)] text-[11px] text-[var(--tx-muted)]"
        >
          <Loader2 size={12} className="animate-spin" />
          <span>กำลังโหลดข้อความ...</span>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

export default StaffChatPanel;
