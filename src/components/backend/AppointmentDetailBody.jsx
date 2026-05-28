import React from 'react';
import PhoneLink from '../PhoneLink.jsx';
import { resolveAppointmentTypeLabel } from '../../lib/appointmentTypes.js';
import {
  resolveAssistantNames,
  getApptStatusMeta,
  apptDisplayName,
  apptPhoneValue,
  apptTimeRange,
} from '../../lib/appointmentDisplay.js';

/**
 * AppointmentDetailBody (V127) — shared read-only field block for ONE appointment.
 *
 * Rendered by BOTH the click-modal (AppointmentDetailPopover, variant="modal")
 * AND the hover peek-card (AppointmentHoverPeek, variant="peek") so the two can
 * never drift (V12 multi-reader lesson). Same fields, same theme classes
 * (CSS vars + appointmentDisplay status SSOT + V124 AA text tokens).
 *
 * variant:
 *   'modal' → phone is a tappable PhoneLink (<a tel:>) — the existing modal
 *   'peek'  → phone is plain bold text + a faint "คลิกเพื่อแก้ไข" hint (read-only hover)
 *
 * Every field renders only when present (Thai-culture: name/HN never red).
 * appointment-type chip renders only when appt.appointmentType is set (so a
 * type-less appt shows no chip). recurring / deposit are present-guarded —
 * they're absent on calendar appts today and simply omit (Q3=A "when present").
 */
export default function AppointmentDetailBody({ appt, roomName, doctorMap, variant = 'modal', resolvedPhone = '' }) {
  if (!appt) return null;

  const st = getApptStatusMeta(appt.status);
  // V128 — apptPhoneValue (customerPhone denorm OR customerPhoneTemp pick-later)
  // wins; resolvedPhone is the live-resolved fallback the container supplies for
  // legacy linked appts whose doc has no denormalized phone.
  const phone = apptPhoneValue(appt) || resolvedPhone || '';
  const hn = appt.customerHN || appt.hnId || '';
  const assistants = resolveAssistantNames(appt, doctorMap);
  const metaBits = [hn, apptTimeRange(appt), roomName].filter(Boolean).join(' · ');
  const typeLabel = appt.appointmentType ? resolveAppointmentTypeLabel(appt.appointmentType) : '';
  const recurring = appt.recurring === true || appt.isRecurring === true;
  const depositAmt = typeof appt.depositAmount === 'number' ? appt.depositAmount : null;
  const isPeek = variant === 'peek';

  return (
    <>
      <div
        className={`text-base font-bold text-[var(--tx-heading)] leading-tight${isPeek ? '' : ' pr-8'}`}
        data-testid="appt-detail-name"
      >
        {apptDisplayName(appt)}
      </div>

      {metaBits && (
        <div className="text-xs text-[var(--tx-muted)] mt-0.5" data-testid="appt-detail-meta">{metaBits}</div>
      )}

      {phone && (isPeek ? (
        <div className="mt-2 text-sm font-bold text-red-600 dark:text-red-300" data-testid="appt-detail-phone">
          📞 {phone}
        </div>
      ) : (
        <PhoneLink
          value={phone}
          data-testid="appt-detail-phone"
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-red-600 dark:text-red-300"
        >
          📞 {phone}
        </PhoneLink>
      ))}

      {appt.appointmentTo && (
        <div className="mt-1 text-sm text-emerald-600 dark:text-emerald-300" data-testid="appt-detail-service">
          🎯 {appt.appointmentTo}
        </div>
      )}

      <div className="mt-1 text-xs text-[var(--tx-muted)]" data-testid="appt-detail-doctor">
        👨‍⚕️ {appt.doctorName || 'ไม่ระบุแพทย์'}{assistants.length ? ` · + ${assistants.join(', ')}` : ''}
      </div>

      {recurring && (
        <div className="mt-1 text-xs text-[var(--tx-muted)]" data-testid="appt-detail-recurring">🔁 นัดซ้ำ</div>
      )}

      {depositAmt != null && (
        <div className="mt-1 text-xs text-[var(--tx-muted)]" data-testid="appt-detail-deposit">
          💰 มัดจำ {depositAmt.toLocaleString('th-TH')} บ.
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}
          data-testid="appt-detail-status"
        >
          ● {st.label}
        </span>
        {typeLabel && (
          <span
            className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--tx-muted)]"
            data-testid="appt-detail-type"
          >
            {typeLabel}
          </span>
        )}
      </div>

      {isPeek && (
        <div className="mt-2 text-[10px] text-[var(--tx-faint)] text-right">คลิกเพื่อแก้ไข</div>
      )}
    </>
  );
}
