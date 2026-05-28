import React, { useMemo } from 'react';
import PhoneLink from '../PhoneLink.jsx';
import {
  getApptStatusMeta,
  apptDisplayName,
  apptPhoneValue,
  apptTimeRange,
} from '../../lib/appointmentDisplay.js';

/**
 * AppointmentAgendaView — chronological full-detail cards for a single day.
 *
 * Calendar-density (2026-05-20) — the mobile-first alternative to the 2D
 * room×time grid. Renders one card per appointment sorted by start time, each
 * showing the full detail set (time · room · status · name+HN · service ·
 * doctor · tap-to-call). Card tap → onSelect(appt) (opens the detail popover).
 *
 * Props:
 *   appts       — flat array of appointment docs for the day
 *   onSelect    — (appt) => void, fired on card click / Enter / Space
 *   resolveRoom — optional (appt) => roomLabel string; the grid passes its
 *                 effectiveRoom() so legacy roomId/roomName resolve to the
 *                 master room label. Falls back to appt.roomName.
 *
 * Card is a <div role="button"> (not <button>) so the nested PhoneLink <a>
 * is valid HTML (interactive-content-in-button is illegal). Thai-culture:
 * name + HN never red.
 */
export function AppointmentAgendaView({ appts, onSelect, resolveRoom, getHoverProps = () => ({}) }) {
  const sorted = useMemo(
    () => [...(appts || [])].sort((a, b) =>
      String(a.startTime || '').localeCompare(String(b.startTime || '')),
    ),
    [appts],
  );

  if (!sorted.length) {
    return (
      <div data-testid="appt-agenda-empty" className="py-8 text-center text-xs text-[var(--tx-muted)]">
        ไม่มีนัดหมายในวันนี้
      </div>
    );
  }

  return (
    <div data-testid="appt-agenda-view" className="flex flex-col gap-2 p-2">
      {sorted.map((appt) => {
        const st = getApptStatusMeta(appt.status);
        const phone = apptPhoneValue(appt);
        const hn = appt.customerHN || appt.hnId || '';
        const roomLabel = resolveRoom ? resolveRoom(appt) : (appt.roomName || '');
        const key = appt.appointmentId || appt.id;
        const select = () => onSelect?.(appt);
        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={select}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } }}
            {...getHoverProps(appt)}
            data-testid={`appt-agenda-card-${key}`}
            className="text-left rounded-xl bg-[var(--bg-input)] border border-[var(--bd-strong)] border-l-[3px] p-3 hover:shadow-lg transition-all cursor-pointer"
            style={{ borderLeftColor: st.accent }}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--tx-muted)]">
              <span>{apptTimeRange(appt)}</span>
              {roomLabel && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-sky-400 text-[9px]" data-testid="appt-agenda-room">
                  {roomLabel}
                </span>
              )}
              <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                ● {st.label}
              </span>
            </div>
            <div className="text-sm font-bold text-[var(--tx-heading)] mt-0.5" data-testid="appt-agenda-name">
              {apptDisplayName(appt)}
              {hn ? <span className="ml-1.5 text-[10px] font-normal text-[var(--tx-muted)]">{hn}</span> : null}
            </div>
            {appt.appointmentTo && (
              <div className="text-xs text-emerald-600 dark:text-emerald-300" data-testid="appt-agenda-service">
                🎯 {appt.appointmentTo}
              </div>
            )}
            <div className="text-[11px] text-[var(--tx-muted)] mt-0.5">
              👨‍⚕️ {appt.doctorName || 'ไม่ระบุแพทย์'}
              {phone && (
                <>
                  {' · '}
                  <PhoneLink
                    value={phone}
                    data-testid="appt-agenda-phone"
                    className="text-red-600 dark:text-red-300 font-bold"
                  >
                    📞 {phone}
                  </PhoneLink>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AppointmentAgendaView;
