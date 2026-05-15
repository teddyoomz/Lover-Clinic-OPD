// src/components/staffchat/StaffChatPanel.jsx
// V73 (2026-05-16) — Expanded chat panel. Desktop: 360×480 corner-anchored.
// Mobile (<md): fullscreen 95vw × 60vh modal-style overlay.
import React from 'react';
import { StaffChatHeader } from './StaffChatHeader.jsx';

export function StaffChatPanel({ branchName, onMinimize, children }) {
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
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

export default StaffChatPanel;
