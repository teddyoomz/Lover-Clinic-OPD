// src/components/staffchat/StaffChatPanel.jsx
// V73 (2026-05-16) — Expanded chat panel. Desktop: 360×480 corner-anchored.
// Mobile (<md): fullscreen 95vw × 60vh modal-style overlay.
// V73 L1 fix (2026-05-18) — Surface error + loading state from useStaffChat
// per AV51 (Bug D: silent listener errors hid index-not-built / permission-
// denied / branch-mismatch causes). User sees rose-tinted banner + retry hint.
import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { StaffChatHeader } from './StaffChatHeader.jsx';

export function StaffChatPanel({ branchName, onMinimize, error, loading, children }) {
  return (
    <div
      data-testid="staff-chat-panel"
      className="fixed
        bottom-2 right-2 left-2 top-[20vh] md:top-auto md:left-auto md:bottom-4 md:right-4
        md:w-[360px] md:h-[480px]
        bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-xl shadow-2xl
        flex flex-col overflow-hidden z-[9000]"
    >
      <StaffChatHeader branchName={branchName} onMinimize={onMinimize} />
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
