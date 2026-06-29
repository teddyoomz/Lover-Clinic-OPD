import React, { useMemo } from 'react';
import { useRecallListener } from '../../../hooks/useRecallListener.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — derive the badge count for the 3-state toggle pill.
 * Counts pending + overdue (effectively: today-or-earlier-not-done).
 * Used inside RecallTogglePill so the Firestore listener subscribes only
 * when the pill is rendered (i.e., when adminMode === 'appointment').
 */
function useRecallFrontendBadgeCountInternal() {
  const { recalls } = useRecallListener({ filters: {} });
  const todayISO = thaiTodayISO();
  return useMemo(() => {
    if (!Array.isArray(recalls)) return 0;
    let count = 0;
    for (const r of recalls) {
      if (!r) continue;
      const status = r.status;
      if (status === 'done' || status === 'closed-no-answer') continue;
      const eff = r.snoozedUntil || r.recallDate;
      if (!eff) continue;
      if (eff <= todayISO) count += 1;
    }
    return count;
  }, [recalls, todayISO]);
}

/**
 * Phase 29 — 3-state view-toggle pill button for the AdminDashboard
 * recall mode. Hosts the badge-count listener so it only subscribes
 * when the pill is on screen.
 *
 * @param {object} props
 * @param {boolean} props.active
 * @param {function} props.onClick
 */
export function RecallTogglePill({ active, onClick }) {
  const count = useRecallFrontendBadgeCountInternal();
  // V164 — blink non-stop while pending recalls remain today (count > 0);
  // stops when all called (count → 0). reduced-motion handled in index.css.
  const blink = count > 0;
  return (
    <button
      type="button"
      data-testid="appt-view-toggle-recall"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
        active
          ? 'bg-red-600 border-red-600 text-white'
          : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-red-400'
      } ${blink ? (active ? 'recall-pill-blink-active' : 'recall-pill-blink') : ''}`}
    >
      🔔 Recall วันนี้
      {count > 0 && (
        <span
          className={`ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-bold ${
            active ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-300'
          }`}
          data-testid="appt-view-toggle-recall-badge"
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default RecallTogglePill;
