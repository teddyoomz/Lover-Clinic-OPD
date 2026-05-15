// V71 (2026-05-15) — Inline sub-pill bar rendered ONLY when activeTab==='today'.
// Splits today's queue into "กำลังรอ" (default) and "เสร็จแล้ว" (manually marked
// complete via the row button). Caller owns the activeSubPill state +
// onSubPillChange handler.

import React from 'react';

const PILL_BASE =
  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2';

const PILL_ACTIVE = {
  waiting: 'bg-amber-600 border-amber-600 text-white',
  completed: 'bg-emerald-700 border-emerald-700 text-white',
};

const PILL_INACTIVE =
  'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)]';

function pillClass(key, active) {
  return `${PILL_BASE} ${active ? PILL_ACTIVE[key] : PILL_INACTIVE}`;
}

export default function AppointmentHubTodaySubPillBar({
  activeSubPill = 'waiting',
  waitingCount = 0,
  completedCount = 0,
  onSubPillChange,
}) {
  return (
    <div
      role="tablist"
      aria-label="วันนี้ — แบ่งสถานะรับบริการ"
      className="flex gap-2 mb-3 pl-2"
      data-testid="appt-hub-today-sub-pill-bar"
    >
      <button
        type="button"
        role="tab"
        data-testid="sub-pill-waiting"
        aria-selected={activeSubPill === 'waiting' ? 'true' : 'false'}
        onClick={() => onSubPillChange?.('waiting')}
        className={pillClass('waiting', activeSubPill === 'waiting')}
      >
        <span>⏳ กำลังรอ</span>
        <span className="font-mono">{waitingCount}</span>
      </button>
      <button
        type="button"
        role="tab"
        data-testid="sub-pill-completed"
        aria-selected={activeSubPill === 'completed' ? 'true' : 'false'}
        onClick={() => onSubPillChange?.('completed')}
        className={pillClass('completed', activeSubPill === 'completed')}
      >
        <span>✓ เสร็จแล้ว</span>
        <span className="font-mono">{completedCount}</span>
      </button>
    </div>
  );
}
