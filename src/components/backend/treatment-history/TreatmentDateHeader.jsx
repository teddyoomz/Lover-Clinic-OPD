// Phase 28 (2026-05-14) — Task 3: TreatmentDateHeader.
// Date-grouped section header for the redesigned treatment history list.
// - Today rows: fire-red border-left + gradient bg + "วันนี้" pill (heading text).
// - Past rows: gray border-left + muted gradient + relative pill (เมื่อวาน /
//   N วัน / สัปดาห์ / เดือน / ปี — from computeRelativeThaiDateLabel).
// - Right: count "N รายการ" font-mono.
// - Date label: formatThaiDateFull (added to src/utils.js this task — uses
//   the canonical THAI_MONTHS [{value,label}] shape via .label).
// - Future dates: skip relative pill (helper returns '').
// - data-testid="date-header-{date}" for selector stability.
import React from 'react';
import { computeRelativeThaiDateLabel } from '../../../lib/treatmentDisplayResolvers.js';
import { formatThaiDateFull } from '../../../utils.js';

export function TreatmentDateHeader({ date, todayISO, count }) {
  const isToday = !!date && date === todayISO;
  const relativeLabel = date && todayISO ? computeRelativeThaiDateLabel(date, todayISO) : '';
  const dateLabel = date ? formatThaiDateFull(date) : '';

  const wrapperClass = isToday
    ? 'flex items-center justify-between px-[18px] py-2.5 border-l-[3px] border-l-red-500 bg-gradient-to-r from-red-500/[0.06] to-transparent'
    : 'flex items-center justify-between px-[18px] py-2.5 border-l-[3px] border-l-slate-700 bg-gradient-to-r from-slate-700/[0.04] to-transparent';

  const pillClass = isToday
    ? 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/[0.12] border border-red-500/25 text-red-300'
    : 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/15 border border-slate-700/30 text-slate-400';

  const dateClass = isToday
    ? 'text-xs font-bold text-[var(--tx-heading)]'
    : 'text-xs font-bold text-[var(--tx-primary)]';

  return (
    <div className={wrapperClass} data-testid={`date-header-${date}`}>
      <div className="flex items-baseline gap-2.5">
        <span className={dateClass}>{dateLabel}</span>
        {relativeLabel && <span className={pillClass}>{relativeLabel}</span>}
      </div>
      <span className="text-[10px] text-[var(--tx-muted)] font-mono font-semibold">{count} รายการ</span>
    </div>
  );
}
