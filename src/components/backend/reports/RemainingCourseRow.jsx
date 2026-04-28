// ─── RemainingCourseRow — Phase 16.5 (2026-04-29) ──────────────────────────
// Single row + kebab dropdown for the RemainingCourseTab table.
// 8 columns: HN+name | course+type | purchase | qty t/u/r | spent |
//            last-used | status | actions kebab.
//
// Kebab menu opens 3 actions (cancel/refund/exchange) — DISABLED when row
// is in terminal state (refunded/cancelled). Calling onAction(kind, row)
// hands the click to the parent (RemainingCourseTab) which opens the
// matching modal.

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, X, Receipt, Repeat } from 'lucide-react';
import { fmtMoney } from '../../../lib/financeUtils.js';
import {
  STATUS_ACTIVE, STATUS_USED, STATUS_REFUNDED, STATUS_CANCELLED,
  isTerminalRow,
} from '../../../lib/remainingCourseUtils.js';

const STATUS_BADGE_CLASS = {
  [STATUS_ACTIVE]:    'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  [STATUS_USED]:      'bg-slate-800 text-slate-300 border-slate-700',
  [STATUS_REFUNDED]:  'bg-amber-900/40 text-amber-300 border-amber-700/50',
  [STATUS_CANCELLED]: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
};

function fmtDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '-';
  return `${d}/${m}/${y}`;
}

export default function RemainingCourseRow({ row, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const terminal = isTerminalRow(row);
  const badgeClass = STATUS_BADGE_CLASS[row.status] || STATUS_BADGE_CLASS[STATUS_ACTIVE];
  const fire = (kind) => { setOpen(false); onAction?.(kind, row); };

  return (
    <tr className="border-b border-[var(--bd)] hover:bg-[var(--bg-hover)]" data-testid={`remaining-course-row-${row.courseId}`}>
      <td className="px-3 py-2 text-xs">
        <div className="font-bold text-[var(--tx-primary)]">{row.customerHN}</div>
        <div className="text-[var(--tx-muted)]">{row.customerName}</div>
      </td>
      <td className="px-3 py-2 text-xs">
        <div className="font-bold text-[var(--tx-primary)]">{row.courseName}</div>
        {row.courseType && (
          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
            {row.courseType}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--tx-secondary)]">{fmtDate(row.purchaseDate)}</td>
      <td className="px-3 py-2 text-xs text-[var(--tx-secondary)]">
        <span className="text-[var(--tx-primary)] font-bold">{row.qtyTotal}</span>
        {' / '}
        <span className="text-[var(--tx-muted)]">{row.qtyUsed}</span>
        {' / '}
        <span className="text-emerald-400 font-bold">{row.qtyRemaining}</span>
        {row.qtyUnit ? <span className="text-[10px] text-[var(--tx-muted)] ml-1">{row.qtyUnit}</span> : null}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--tx-primary)] text-right">{fmtMoney(row.totalSpent)}</td>
      <td className="px-3 py-2 text-xs text-[var(--tx-secondary)]">{fmtDate(row.lastUsedDate)}</td>
      <td className="px-3 py-2 text-xs">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}
              data-testid={`remaining-course-status-${row.courseId}`}>
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={terminal}
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="actions"
          data-testid={`remaining-course-kebab-${row.courseId}`}
        >
          <MoreVertical size={14} />
        </button>
        {open && !terminal && (
          <div className="absolute right-0 top-full mt-1 z-10 w-40 rounded-md shadow-lg bg-[var(--bg-surface)] border border-[var(--bd)]">
            <button
              type="button"
              onClick={() => fire('cancel')}
              className="w-full text-left px-3 py-2 text-xs text-[var(--tx-primary)] hover:bg-rose-900/30 flex items-center gap-2"
              data-testid={`remaining-course-action-cancel-${row.courseId}`}
            >
              <X size={12} className="text-rose-400" /> ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => fire('refund')}
              className="w-full text-left px-3 py-2 text-xs text-[var(--tx-primary)] hover:bg-amber-900/30 flex items-center gap-2"
              data-testid={`remaining-course-action-refund-${row.courseId}`}
            >
              <Receipt size={12} className="text-amber-400" /> คืนเงิน
            </button>
            <button
              type="button"
              onClick={() => fire('exchange')}
              className="w-full text-left px-3 py-2 text-xs text-[var(--tx-primary)] hover:bg-violet-900/30 flex items-center gap-2"
              data-testid={`remaining-course-action-exchange-${row.courseId}`}
            >
              <Repeat size={12} className="text-violet-400" /> เปลี่ยนคอร์ส
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
