import React from 'react';
import { formatPairBadge } from '../../../lib/recallResolvers.js';

/**
 * Phase 29 (2026-05-14) — pair link badge rendered below a recall row's meta line.
 * Format: "🔗 จับคู่กับ: <icon> <reason> · <date> · <status-suffix>"
 *
 * Always shows status suffix (5 cases): รอ Recall / เสร็จแล้ว / ติดต่อไม่ได้ครั้งที่ N /
 * เลื่อนไป <date> / เกินกำหนด N วัน.
 *
 * Clickable — `onClick(paired.id)` lets the parent scroll to / open the paired recall.
 * stopPropagation prevents the parent row's click handler from firing.
 *
 * @param {object} props
 * @param {object} props.paired the paired recall (full recall doc)
 * @param {string} props.todayISO 'YYYY-MM-DD' (Bangkok)
 * @param {function} [props.onClick]
 */
export function RecallPairBadge({ paired, todayISO, onClick }) {
  if (!paired) return null;
  const data = formatPairBadge(paired, todayISO);
  if (!data) return null;
  // V72 (2026-05-16): mobile-first compact pill — single-line truncation
  // instead of wrap-to-5-lines. Reason text gets max-w via flex-1 + truncate;
  // date+status suffix stays right-anchored and shrink-0 so it never wraps.
  // Desktop unchanged (still inline-flex; on wider cards the truncate is a
  // no-op because content fits).
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(paired.id); }}
      data-testid={`recall-pair-badge-${paired.id}`}
      className="mt-1.5 flex w-full md:w-auto md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md md:rounded
        bg-indigo-500/[0.08] border border-indigo-400/25 border-l-2 border-l-indigo-500
        text-[10px] text-indigo-300 hover:bg-indigo-500/[0.14] hover:border-indigo-400/40
        transition-colors cursor-pointer min-w-0"
      aria-label={`จับคู่กับ ${data.icon} ${data.reason} ${data.date} ${data.statusSuffix}`}
    >
      <span aria-hidden="true" className="shrink-0">🔗</span>
      <span className="shrink-0 opacity-85 font-bold">จับคู่กับ:</span>
      <span aria-hidden="true" className="shrink-0">{data.icon}</span>
      <span className="text-white font-bold flex-1 min-w-0 truncate text-left">{data.reason}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-gray-400 font-semibold whitespace-nowrap">· {data.date} · {data.statusSuffix}</span>
    </button>
  );
}

export default RecallPairBadge;
