// src/components/staffchat/StaffChatAttachmentCard.jsx
// (2026-05-22) Any-file attachments — download card for non-media kinds (pdf +
// generic 'file'). video/audio render as inline players (in StaffChatMessage),
// so they never reach this card. A PDF shows a 👁 preview button (opens the
// StaffChatPdfOverlay) in addition to ⬇ download.
import React from 'react';
import { Download, Eye } from 'lucide-react';
import { attachmentKindFor } from '../../lib/staffChatRetentionCore.js';
import { downloadUrlAsFile } from '../../lib/staffChatDownload.js';

function iconFor(att) {
  const kind = attachmentKindFor(att && att.mimeType);
  if (kind === 'pdf') return '📄';
  if (kind === 'audio') return '🎵';
  if (kind === 'video') return '🎬';
  const ext = (String((att && att.name) || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return '📊';
  if (['doc', 'docx', 'txt', 'rtf', 'pages', 'md'].includes(ext)) return '📝';
  if (['ppt', 'pptx', 'key'].includes(ext)) return '📽️';
  return '📎';
}

export function humanFileSize(n) {
  let v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export function StaffChatAttachmentCard({ att, onPreview }) {
  if (!att) return null;
  const isPdf = attachmentKindFor(att.mimeType) === 'pdf';
  const name = att.name || 'ไฟล์';
  return (
    <div
      data-testid="staff-chat-attach-card"
      className="flex items-center gap-2.5 w-full max-w-[240px] rounded-lg border border-[var(--bd)] bg-[var(--bg-surface)] px-2.5 py-2 mb-1"
    >
      <span className="text-2xl shrink-0" aria-hidden="true">{iconFor(att)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-[var(--tx-primary)] truncate" title={name}>{name}</div>
        <div className="text-[10px] text-[var(--tx-muted)]">{humanFileSize(att.size)}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isPdf && onPreview && (
          <button
            type="button"
            onClick={onPreview}
            data-testid="staff-chat-attach-preview"
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="ดูตัวอย่าง"
            title="ดูตัวอย่าง"
          >
            <Eye size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadUrlAsFile(att.fullUrl, name, att.size)}
          data-testid="staff-chat-attach-download"
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
          aria-label="ดาวน์โหลด"
          title="ดาวน์โหลด"
        >
          <Download size={15} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatAttachmentCard;
