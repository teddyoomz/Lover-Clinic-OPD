import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil } from 'lucide-react';
import PhoneLink from '../PhoneLink.jsx';
import {
  resolveAssistantNames,
  getApptStatusMeta,
  apptDisplayName,
  apptPhoneValue,
  apptTimeRange,
} from '../../lib/appointmentDisplay.js';

/**
 * AppointmentDetailPopover — read-only quick-view for one appointment.
 *
 * Calendar-density (2026-05-20) — the grid block + agenda card open THIS
 * popover (not the edit modal directly) so admin sees full details at any
 * cell density. แก้ไข → onEdit (the existing edit modal); 📞 → tap-to-call.
 *
 * Props: appt, roomName, doctorMap, onEdit, onClose.
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

  const st = getApptStatusMeta(appt.status);
  const phone = apptPhoneValue(appt);
  const hn = appt.customerHN || appt.hnId || '';
  const assistants = resolveAssistantNames(appt, doctorMap);
  // HN · time · room — only the present bits, joined with · (HN non-red).
  const metaBits = [hn, apptTimeRange(appt), roomName].filter(Boolean).join(' · ');

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 bg-black/50 backdrop-blur-sm"
      data-testid="appt-detail-popover"
    >
      {/* AV78: no onClick on the backdrop — explicit close only. */}
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--bd)] shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-base font-bold text-[var(--tx-heading)] leading-tight" data-testid="appt-detail-name">
            {apptDisplayName(appt)}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="appt-detail-close"
            aria-label="ปิด"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)] flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {metaBits && (
          <div className="text-xs text-[var(--tx-muted)] mt-0.5" data-testid="appt-detail-meta">{metaBits}</div>
        )}

        {phone && (
          <PhoneLink
            value={phone}
            data-testid="appt-detail-phone"
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-red-600 dark:text-red-300"
          >
            📞 {phone}
          </PhoneLink>
        )}

        {appt.appointmentTo && (
          <div className="mt-1 text-sm text-emerald-600 dark:text-emerald-300" data-testid="appt-detail-service">
            🎯 {appt.appointmentTo}
          </div>
        )}

        <div className="mt-1 text-xs text-[var(--tx-muted)]" data-testid="appt-detail-doctor">
          👨‍⚕️ {appt.doctorName || 'ไม่ระบุแพทย์'}{assistants.length ? ` · + ${assistants.join(', ')}` : ''}
        </div>

        <div className="mt-2">
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}
            data-testid="appt-detail-status"
          >
            ● {st.label}
          </span>
        </div>

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
