import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil } from 'lucide-react';
import AppointmentDetailBody from './AppointmentDetailBody.jsx';

/**
 * AppointmentDetailPopover — read-only quick-view for one appointment (click).
 *
 * Calendar-density (2026-05-20) — the grid block + agenda card open THIS
 * popover (not the edit modal directly) so admin sees full details at any
 * cell density. แก้ไข → onEdit (the existing edit modal); 📞 → tap-to-call.
 *
 * V127 (2026-05-28): the field block is extracted to the shared
 * <AppointmentDetailBody variant="modal" /> so the hover peek-card
 * (AppointmentHoverPeek) renders identical fields with zero drift. This
 * component keeps the modal chrome only (backdrop + close + แก้ไข).
 *
 * AV98 (V80): portal to document.body so a transformed ancestor (V86 glow
 * card) can't confine this fixed overlay.
 * AV78 (V83): backdrop click does NOT close — explicit close only
 * (X / ปิด / ESC). Thai-culture: name + HN never red.
 */
export function AppointmentDetailPopover({ appt, roomName, doctorMap, onEdit, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!appt) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 bg-black/50 backdrop-blur-sm"
      data-testid="appt-detail-popover"
    >
      {/* AV78: no onClick on the backdrop — explicit close only. */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--bd)] shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          data-testid="appt-detail-close"
          aria-label="ปิด"
          className="absolute top-3 right-3 w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
        >
          <X size={14} />
        </button>

        <AppointmentDetailBody appt={appt} roomName={roomName} doctorMap={doctorMap} variant="modal" />

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={onEdit}
            data-testid="appt-detail-edit"
            className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 inline-flex items-center gap-1"
          >
            <Pencil size={12} /> แก้ไข
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AppointmentDetailPopover;
