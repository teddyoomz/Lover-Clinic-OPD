// src/components/staffchat/StaffChatPdfOverlay.jsx
// (2026-05-22) Any-file attachments — fullscreen PDF preview overlay.
// Opened from a PDF attachment card's 👁 button. Renders the PDF via a native
// browser <iframe> (CORS-exempt) + a ⬇ download. Closes via the ✕ button + Esc
// ONLY — a backdrop click does NOT close (AV78 normal-modal discipline). z-9700.
//
// PDF-only by design: in-browser Word/Excel/PPT preview was reverted (the only
// browser-feasible route was a 3rd-party viewer that failed for Firebase URLs +
// would transmit patient files off-site). Office files are download-only.
import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { downloadUrlAsFile } from '../../lib/staffChatDownload.js';

export function StaffChatPdfOverlay({ fileUrl, name, size, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!fileUrl) return null;

  return (
    <div
      data-testid="staff-chat-pdf-overlay"
      className="fixed inset-0 bg-black/90 flex flex-col z-[9700]"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white bg-gradient-to-b from-black/70 to-transparent">
        <span className="text-sm truncate pr-3" title={name}>{name || 'ไฟล์'}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadUrlAsFile(fileUrl, name, size)}
            data-testid="staff-chat-pdf-download"
            className="px-2.5 py-1.5 rounded bg-white/15 hover:bg-white/25 text-xs flex items-center gap-1"
            aria-label="ดาวน์โหลด"
          >
            <Download size={14} /> ดาวน์โหลด
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="staff-chat-pdf-close"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <iframe
        src={fileUrl}
        title={name || 'ไฟล์'}
        data-testid="staff-chat-pdf-frame"
        className="flex-1 w-full bg-white border-0"
      />
    </div>
  );
}

export default StaffChatPdfOverlay;
