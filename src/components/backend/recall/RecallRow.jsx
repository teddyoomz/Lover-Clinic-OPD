import React from 'react';
import { Phone, MessageCircle, Clock, Trash2, Pencil } from 'lucide-react';
import {
  getRecallStatusLabel,
  getRecallStatusColor,
  getRecallOutcomeMeta,
  isOverdue,
} from '../../../lib/recallResolvers.js';
import { useTheme } from '../../../hooks/useTheme.js';
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
 * @param {function} [props.onDelete] (recallId) → hard-delete with confirm
 * @param {function} [props.onEdit] (recallId) → open edit modal
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
  onDelete,
  onEdit,
  compact = false,
}) {
  if (!recall) return null;

  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const statusColor = getRecallStatusColor(recall);
  const statusTextColor = isLight ? statusColor.lightText : statusColor.darkText;
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
          {recall.customerId ? (
            <a
              href={`/?backend=1&customer=${encodeURIComponent(String(recall.customerId))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[12px] font-bold text-[var(--tx-primary)] hover:underline underline-offset-2 hover:text-sky-300"
              title={`เปิดข้อมูล ${recall.customerName || ''} ในแท็บใหม่`}
              data-testid={`recall-customer-link-${recall.id}`}
            >
              {recall.customerName || '—'}
            </a>
          ) : (
            <span
              className="text-[12px] font-bold text-[var(--tx-primary)]"
              data-testid={`recall-customer-name-plain-${recall.id}`}
            >
              {recall.customerName || '—'}
            </span>
          )}
          {recall.customerLineUserId && (
            <span
              className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold"
              aria-label="LINE linked"
              title="ลูกค้าผูก LINE แล้ว"
            >L</span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded-md font-bold border"
            style={{ background: statusColor.bg, borderColor: statusColor.border, color: statusTextColor }}
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
              className="text-[10px] px-2 py-0.5 rounded-md font-bold border inline-flex items-center gap-1"
              style={{
                background: outcomeMeta.color.bg,
                borderColor: outcomeMeta.color.border,
                color: isLight ? outcomeMeta.color.lightText : outcomeMeta.color.darkText,
              }}
              data-testid={`recall-outcome-meta-${recall.id}`}
              title={`เหตุผล: ${outcomeMeta.label}`}
            >
              <span aria-hidden="true">{outcomeMeta.emoji}</span>
              <span>{outcomeMeta.label}</span>
            </span>
          )}
        </div>
        {/* Phase 29.22 round-3 — reason text prominence bumped per user
            request: "ไอ้สาเหตุ ... ในแต่ละ list ทุกที่ มึงต้องเด่นกว่านี้มากๆ
            มันคือสิ่งสำคัญเสือกตัวเล็กบาง". Was text-[10px] text-tx-muted
            (10px faint) → now text-[13px] font-medium text-tx-primary
            (13px, full primary color). Keeps line-clamp-2 for overflow control. */}
        <div className="text-[13px] font-medium text-[var(--tx-primary)] mt-1.5 line-clamp-2" data-testid={`recall-reason-${recall.id}`}>
          {recall.reason || ''}
        </div>
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

      {/* Action chips — always visible (round-3 fix: hover-only pattern was
          too discoverability-poor; user couldn't find delete/edit buttons). */}
      <div className="flex gap-1.5 self-start">
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
            className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 flex items-center justify-center"
            aria-label="เลื่อน Recall"
            title="⏰ เลื่อน"
          >
            <Clock size={11} />
          </button>
        )}
        {/* Phase 29.23 — edit button (sky-500). Always shown (admin can fix typos
            on done/closed recalls too — same discoverability rationale as the
            delete button per round-3 lesson). */}
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(recall.id); }}
            data-testid={`recall-edit-${recall.id}`}
            className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/60 flex items-center justify-center"
            aria-label="แก้ไข Recall"
            title="✏️ แก้ไข Recall"
          >
            <Pencil size={11} />
          </button>
        )}
        {/* Phase 29.22 round-3 — delete button. User report: "ลบ Recall ไม่ได้
            user จะลบยังไงวะ ไม่มีปุ่มลบ ปุ่มแก้ไขเลย".  Hard-delete via
            deleteRecall (clears paired-partner pointer too). Always shown
            (admin can delete done/closed recalls too — e.g. wrong customer). */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const name = recall.customerName || recall.customerHN || recall.id;
              if (window.confirm(`ลบ Recall ของ "${name}" ?\n(การกระทำนี้ถาวร; หากจับคู่ไว้กับ Recall อื่น คู่จะถูกปลดด้วย)`)) {
                onDelete(recall.id);
              }
            }}
            data-testid={`recall-delete-${recall.id}`}
            className="w-6 h-6 rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/25 hover:border-red-500/60 flex items-center justify-center"
            aria-label="ลบ Recall"
            title="🗑️ ลบ Recall"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export default RecallRow;
