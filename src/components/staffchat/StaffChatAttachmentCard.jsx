// src/components/staffchat/StaffChatAttachmentCard.jsx
// (2026-05-22) Any-file attachments — download card for non-media kinds (pdf +
// generic 'file' + the NEW EOD+2 'office' kind). video/audio render as inline
// players (in StaffChatMessage), so they never reach this card.
//
// (2026-05-22 EOD+2 — T3) Office (Word/Excel/PPT/CSV) gets a 4-state UI driven
// by pdfPreviewStateOf(att) — pending/ready/failed/unsupported. ⏳ during
// conversion, 👁 once the officeToPdf Cloud Function caches the PDF, ⚠ with
// Thai tooltip on failure, plain card on the unsupported reservation. ⬇ always
// works. AV108 — the 👁 opens the EXISTING StaffChatPdfOverlay with our cached
// PDF; NO 3rd-party doc viewer is invoked.
import React from 'react';
import { Download, Eye, Loader2, AlertTriangle } from 'lucide-react';
import { attachmentKindFor } from '../../lib/staffChatRetentionCore.js';
import { pdfPreviewStateOf } from '../../lib/staffChatOfficePreviewCore.js';
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
  const kind = attachmentKindFor(att.mimeType);
  const isPdf = kind === 'pdf';
  const isOffice = kind === 'office';
  // pdfPreviewStateOf returns 'na' for non-Office; for Office one of
  // 'pending' / 'ready' / 'failed' / 'unsupported' (with defensive fallback).
  const officeState = isOffice ? pdfPreviewStateOf(att) : 'na';

  const name = att.name || 'ไฟล์';

  // PDF: existing behaviour — 👁 opens overlay with the original URL.
  // Office (ready): 👁 opens overlay with the CACHED PDF URL (in-project Gotenberg).
  const handlePreviewClick = () => {
    if (isPdf) {
      onPreview?.({ fileUrl: att.fullUrl, name: att.name, size: att.size });
    } else if (isOffice && officeState === 'ready') {
      onPreview?.({ fileUrl: att.pdfPreviewUrl, name: att.name, size: att.size });
    }
  };

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
        {/* PDF: 👁 always present (when onPreview wired) — V73 behaviour. */}
        {isPdf && onPreview && (
          <button
            type="button"
            onClick={handlePreviewClick}
            data-testid="staff-chat-attach-preview"
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="ดูตัวอย่าง"
            title="ดูตัวอย่าง"
          >
            <Eye size={15} />
          </button>
        )}
        {/* Office state machine — affordance depends on officeState. */}
        {isOffice && officeState === 'ready' && onPreview && (
          <button
            type="button"
            onClick={handlePreviewClick}
            data-testid="staff-chat-attach-preview"
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500 hover:bg-rose-500/10"
            aria-label="ดูตัวอย่าง"
            title="ดูตัวอย่าง"
          >
            <Eye size={15} />
          </button>
        )}
        {isOffice && officeState === 'pending' && (
          <span
            data-testid="staff-chat-attach-pending"
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--tx-muted)] opacity-60"
            aria-label="กำลังแปลง"
            title="กำลังแปลงไฟล์เพื่อดูตัวอย่าง..."
          >
            <Loader2 size={15} className="animate-spin" />
          </span>
        )}
        {isOffice && officeState === 'failed' && (
          <span
            data-testid="staff-chat-attach-failed"
            className="w-8 h-8 rounded-md flex items-center justify-center text-amber-500"
            aria-label="แปลงไฟล์ไม่ได้"
            title={att.pdfPreviewError || 'แปลงไฟล์ไม่ได้'}
          >
            <AlertTriangle size={15} />
          </span>
        )}
        {/* officeState === 'unsupported' OR 'na' → no preview affordance.       */}
        {/* ⬇ download always present (last child in the action row).            */}
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
