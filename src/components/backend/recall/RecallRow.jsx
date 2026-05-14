import React from 'react';
import { Phone, MessageCircle, Clock } from 'lucide-react';
import {
  getRecallStatusLabel,
  getRecallStatusColor,
  isOverdue,
} from '../../../lib/recallResolvers.js';
import { RecallPairBadge } from './RecallPairBadge.jsx';

/**
 * Phase 29 (2026-05-14) — single recall row.
 * Shared atom used by all 3 surfaces:
 *   - Backend RecallTab → RecallList → RecallRow
 *   - Frontend AdminDashboard recall mode → RecallRow
 *   - CDV RecallCard → RecallRow
 *
 * Anti-flicker discipline (per spec §5.6):
 *   - Stable `key={recall.id}` set by parent (NEVER index — SG3)
 *   - Click body → onClick(recall.id) opens detail modal
 *   - Action chips use e.stopPropagation so click doesn't bubble to body
 *
 * Phase 28 design DNA: dot-stepper aesthetic + status chip + fire-red overdue.
 *
 * @param {object} props
 * @param {object} props.recall full recall doc
 * @param {string} props.todayISO 'YYYY-MM-DD' (Bangkok-local)
 * @param {object} [props.pairedRecall] full paired recall (parent resolves from list)
 * @param {function} [props.onClick] (recallId) → open detail modal
 * @param {function} [props.onRecordOutcome] (recallId) → open outcome modal
 * @param {function} [props.onLineSend] (recallId) → open LINE template modal
 * @param {function} [props.onSnooze] (recallId) → open snooze date picker
 * @param {function} [props.onPairClick] (pairedRecallId) → scroll/open paired
 * @param {boolean} [props.compact] hide source row + reduce padding (CDV variant)
 */
export function RecallRow({
  recall,
  todayISO,
  pairedRecall,
  onClick,
  onRecordOutcome,
  onLineSend,
  onSnooze,
  onPairClick,
  compact = false,
}) {
  if (!recall) return null;

  const statusColor = getRecallStatusColor(recall);
  const statusLabel = getRecallStatusLabel(recall, todayISO);
  const over = isOverdue(recall, todayISO);
  const snoozed = !!recall.snoozedUntil && recall.status === 'pending';

  // Format dd/mm from recallDate 'YYYY-MM-DD'
  const dateDisplay = recall.recallDate
    ? (() => {
        const m = String(recall.recallDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}` : '--';
      })()
    : '--';

  const rowClass = [
    'group grid grid-cols-[56px_1fr_auto] gap-2.5 transition-colors cursor-pointer',
    'border-b border-[var(--bd)] last:border-b-0',
    snoozed ? 'opacity-65' : '',
    over ? 'border-l-2 border-l-red-500' : '',
    compact ? 'px-2 py-2' : 'px-3 py-2.5',
    'hover:bg-white/[0.015]',
  ].filter(Boolean).join(' ');

  return (
    <div
      data-testid={`recall-row-${recall.id}`}
      data-overdue={over ? 'true' : 'false'}
      data-snoozed={snoozed ? 'true' : 'false'}
      data-status={recall.status}
      className={rowClass}
      onClick={() => onClick?.(recall.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(recall.id);
        }
      }}
    >
      {/* Time column */}
      <div className={`font-mono text-[11px] font-bold pt-0.5 ${over ? 'text-red-300' : 'text-[var(--tx-muted)]'}`}>
        {dateDisplay}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-[var(--tx-primary)]">{recall.customerName || '—'}</span>
          {recall.customerLineUserId && (
            <span
              className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold"
              aria-label="LINE linked"
              title="ลูกค้าผูก LINE แล้ว"
            >L</span>
          )}
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-bold border"
            style={{ background: statusColor.bg, borderColor: statusColor.border, color: statusColor.text }}
            data-testid={`recall-status-chip-${recall.id}`}
          >
            {statusLabel}
          </span>
          {recall.requiresManualReview && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-red-500/15 text-red-300 border border-red-500/30"
              title="ติดต่อไม่ได้ครบ 3 ครั้ง — ต้องตรวจสอบด้วยตนเอง"
            >🚨 ตรวจสอบ</span>
          )}
        </div>
        <div className="text-[10px] text-[var(--tx-muted)] mt-1 line-clamp-1">{recall.reason || ''}</div>
        {!compact && recall.sourceProductName && (
          <div className="text-[9px] text-[var(--tx-muted)] opacity-70 mt-0.5">{recall.sourceProductName}</div>
        )}
        {recall.outcomeNote && recall.status === 'done' && (
          <div
            className="mt-1.5 px-2 py-1 bg-emerald-500/5 border-l-2 border-emerald-500 text-[9.5px] text-emerald-300 italic rounded"
            data-testid={`recall-outcome-callout-${recall.id}`}
          >
            "{recall.outcomeNote}" — {recall.outcomeBy?.name || ''}
          </div>
        )}
        {recall.lineMessageSent && (
          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/25 rounded text-[9px] text-green-300">
            💬 ส่ง LINE แล้ว
          </div>
        )}
        {pairedRecall && (
          <RecallPairBadge paired={pairedRecall} todayISO={todayISO} onClick={onPairClick} />
        )}
      </div>

      {/* Action chips */}
      <div className="flex gap-1 self-start opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        {onRecordOutcome && recall.status !== 'done' && recall.status !== 'closed-no-answer' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRecordOutcome(recall.id); }}
            data-testid={`recall-record-${recall.id}`}
            className="w-6 h-6 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:bg-[var(--bg-elevated)] flex items-center justify-center"
            aria-label="บันทึกผลการโทร"
            title="📞 บันทึกผลการโทร"
          >
            <Phone size={11} />
          </button>
        )}
        {onLineSend && recall.customerLineUserId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLineSend(recall.id); }}
            data-testid={`recall-line-${recall.id}`}
            className="w-6 h-6 rounded bg-green-500/10 border border-green-500/30 text-green-300 hover:bg-green-500/20 flex items-center justify-center"
            aria-label="ส่งข้อความ LINE"
            title="💬 ส่ง LINE template"
          >
            <MessageCircle size={11} />
          </button>
        )}
        {onSnooze && recall.status !== 'done' && recall.status !== 'closed-no-answer' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSnooze(recall.id); }}
            data-testid={`recall-snooze-${recall.id}`}
            className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 flex items-center justify-center"
            aria-label="เลื่อน Recall"
            title="⏰ เลื่อน"
          >
            <Clock size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export default RecallRow;
