import React from 'react';
import { Phone, MessageCircle, Clock } from 'lucide-react';
import {
  getRecallStatusLabel,
  getRecallStatusColor,
  getRecallOutcomeMeta,
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

  // Phase 29.22 visual polish (round 2) — light theme readability.
  // Previous round used bg-[var(--bg-hover)] which in light mode is #f1f5f9
  // — barely distinct from the page bg #f8fafc. Round 2: switch to
  // bg-[var(--bg-card)] (still subtle in dark, more distinct in light when
  // page bg is even lighter) + always-on shadow-sm for elevation +
  // bd-strong for crisper outline. Hover: shadow-md + rose accent.
  //
  // User report (round 2): "ตาราง recall ใน be ก็ยังไม่ชัด โดยเฉพาะตีม
  // light ยิ่งไม่ชัด ไปหา skill หรือใช้เครื่องมือ design ระดับโลกมาช่วยด่วน".
  // bg-[var(--bg-input)] (light=#fff, dark=#141414) gives stronger contrast
  // against page bg [light=#f0f4f8 (slate-100), dark=#050505] than --bg-card
  // would. Coupled with --bd-strong border + shadow-md for clear elevation.
  const rowClass = [
    'group grid grid-cols-[56px_1fr_auto] gap-3 transition-all cursor-pointer',
    'rounded-lg border bg-[var(--bg-input)] shadow-md',
    'hover:shadow-lg hover:border-rose-500/50 hover:-translate-y-[1px]',
    snoozed ? 'opacity-65 border-dashed border-[var(--bd-strong)]' : 'border-[var(--bd-strong)]',
    over ? '!border-l-[3px] !border-l-red-500 bg-red-500/[0.06]' : '',
    compact ? 'px-3 py-2.5' : 'px-4 py-3',
  ].filter(Boolean).join(' ');

  // Outcome meta — only relevant when status is done OR closed-no-answer.
  // User request: "ใน list ที่ขึ้นว่า เสร็จแล้ว ให้แสดงเหตุผลที่ลูกค้าเลือก
  // ไว้ด้วย" — surface what the customer chose at-a-glance, not just "เสร็จแล้ว".
  const outcomeMeta = (recall.status === 'done' || recall.status === 'closed-no-answer')
    ? getRecallOutcomeMeta(recall.outcome)
    : null;

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
          {/* Phase 29.22 (2026-05-14) — outcome badge on done/closed rows.
              Shows the customer's chosen outcome (will-come / not-interested /
              ขอเลื่อน / etc.) alongside the generic "เสร็จแล้ว" status chip
              so admins can scan list without opening each entry. */}
          {outcomeMeta && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold border inline-flex items-center gap-0.5"
              style={{
                background: outcomeMeta.color.bg,
                borderColor: outcomeMeta.color.border,
                color: outcomeMeta.color.text,
              }}
              data-testid={`recall-outcome-meta-${recall.id}`}
              title={`เหตุผล: ${outcomeMeta.label}`}
            >
              <span aria-hidden="true">{outcomeMeta.emoji}</span>
              <span>{outcomeMeta.label}</span>
            </span>
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
