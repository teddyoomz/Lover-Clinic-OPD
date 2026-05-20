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

  // V72 (2026-05-16) — Mobile-first Editorial card redesign.
  // User report: "โครตน่าเกลียด Recall ใน Version mobile ช่วยทำให้สวยระดับโปร".
  // Pre-V72 layout: rigid `grid-cols-[56px_1fr_auto]` squeezed content into
  // ~200px on a 375px viewport → status chips wrap to 2+ lines, PairBadge
  // wraps to 4-5 lines, action icons STACK vertically (24×24 tap targets,
  // unusable on mobile), row height 225px.
  //
  // V72 fix: responsive flex-col on mobile → grid on md+. Mobile gets an
  // editorial vertical stack — date+name header, big reason text, slim
  // truncated PairBadge chip, full-width bottom action bar with 36×36 tap
  // targets. Desktop keeps the existing 3-column density (proven for backend
  // RecallTab list scanning). Phase 28 stepper-DNA aesthetic continued.
  //
  // Previous round (Phase 29.22 round 2 — light-theme readability):
  // bg-[var(--bg-input)] (light=#fff, dark=#141414) gives strong contrast
  // against page bg. Coupled with --bd-strong border + shadow-md for clear
  // elevation.
  const rowClass = [
    'group flex flex-col md:grid md:grid-cols-[56px_1fr_auto] md:gap-3 transition-all cursor-pointer',
    'rounded-xl border bg-[var(--bg-input)] shadow-md',
    'hover:shadow-lg hover:border-rose-500/50 hover:-translate-y-[1px]',
    snoozed ? 'opacity-65 border-dashed border-[var(--bd-strong)]' : 'border-[var(--bd-strong)]',
    over ? '!border-l-[3px] !border-l-red-500 bg-red-500/[0.06]' : '',
    compact ? 'p-3 md:px-3 md:py-2.5' : 'p-3.5 md:px-4 md:py-3',
  ].filter(Boolean).join(' ');

  // Outcome meta — only relevant when status is done OR closed-no-answer.
  // User request: "ใน list ที่ขึ้นว่า เสร็จแล้ว ให้แสดงเหตุผลที่ลูกค้าเลือก
  // ไว้ด้วย" — surface what the customer chose at-a-glance, not just "เสร็จแล้ว".
  const outcomeMeta = (recall.status === 'done' || recall.status === 'closed-no-answer')
    ? getRecallOutcomeMeta(recall.outcome)
    : null;

  // 2026-05-20 — tap-to-call phone (denormalized customerPhone on the recall doc).
  const phoneRaw = recall.customerPhone ? String(recall.customerPhone).trim() : '';
  const phoneDigits = phoneRaw.replace(/[^0-9+]/g, '');

  // 2026-05-20 (Q1=A) — prominent note: outcomeNote when present, else the recall reason.
  const hasOutcomeNote = !!(recall.outcomeNote && String(recall.outcomeNote).trim());
  const noteText = hasOutcomeNote ? recall.outcomeNote : (recall.reason || '');
  const noteLabel = hasOutcomeNote ? '📝 ผลการติดต่อ' : '📝 เหตุผลนัด recall';
  const loggedByName = (recall.status === 'done' || recall.status === 'no-answer' || recall.status === 'closed-no-answer')
    ? (recall.outcomeBy?.name || '')
    : '';

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
      {/* HEADER ROW (mobile-only) — date chip + name + LINE + status pill,
          all in a single tight row. On md+ this is hidden because the desktop
          grid uses the standalone Date column at left. */}
      <div className="flex md:hidden items-start gap-2 mb-2">
        <span
          className={`shrink-0 font-mono text-[11px] font-black px-2 py-0.5 rounded-md tracking-tight ${
            over
              ? 'bg-red-500/15 text-red-200 border border-red-500/40'
              : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)]'
          }`}
          data-testid={`recall-date-chip-${recall.id}`}
        >
          {dateDisplay}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          {recall.customerId ? (
            <a
              href={`/?backend=1&customer=${encodeURIComponent(String(recall.customerId))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-black text-sky-700 dark:text-sky-300 hover:underline underline-offset-2 leading-tight truncate"
              title={`เปิดข้อมูล ${recall.customerName || ''} ในแท็บใหม่`}
              data-testid={`recall-customer-link-mobile-${recall.id}`}
            >
              {recall.customerName || '—'}
            </a>
          ) : (
            <span className="text-sm font-black text-sky-700 dark:text-sky-300 leading-tight truncate">
              {recall.customerName || '—'}
            </span>
          )}
          {recall.customerLineUserId && (
            <span
              className="shrink-0 text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold"
              aria-label="LINE linked"
              title="ลูกค้าผูก LINE แล้ว"
            >L</span>
          )}
          {phoneDigits && (
            <a
              href={`tel:${phoneDigits}`}
              onClick={(e) => e.stopPropagation()}
              data-testid={`recall-phone-${recall.id}`}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/30 hover:bg-red-500/20 active:scale-95 transition-transform"
              title={`โทรหา ${recall.customerName || ''}`}
              aria-label={`โทร ${phoneRaw}`}
            >
              <Phone className="w-3 h-3" /> {phoneRaw}
            </a>
          )}
        </div>
        <span
          className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap"
          style={{ background: statusColor.bg, borderColor: statusColor.border, color: statusTextColor }}
          data-testid={`recall-status-chip-mobile-${recall.id}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* DESKTOP date column — hidden on mobile (mobile uses inline header chip above). */}
      <div className={`hidden md:block font-mono text-[11px] font-bold pt-0.5 ${over ? 'text-red-300' : 'text-[var(--tx-muted)]'}`}>
        {dateDisplay}
      </div>

      {/* CONTENT */}
      <div className="min-w-0">
        {/* DESKTOP header (md+ only) — keeps the proven dense list aesthetic for
            backend RecallTab scanning. Mobile already rendered its own header above. */}
        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
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
          {phoneDigits && (
            <a
              href={`tel:${phoneDigits}`}
              onClick={(e) => e.stopPropagation()}
              data-testid={`recall-phone-desktop-${recall.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/30 hover:bg-red-500/20 active:scale-95 transition-transform"
              title={`โทรหา ${recall.customerName || ''}`}
              aria-label={`โทร ${phoneRaw}`}
            >
              <Phone className="w-3 h-3" /> {phoneRaw}
            </a>
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

        {/* MOBILE secondary chips row — outcome meta + manual review.
            Renders only when at least one applies (else collapses entirely). */}
        {(recall.requiresManualReview || outcomeMeta) && (
          <div className="flex md:hidden items-center gap-1.5 flex-wrap mb-1.5">
            {recall.requiresManualReview && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-500/15 text-red-300 border border-red-500/30"
                title="ติดต่อไม่ได้ครบ 3 ครั้ง — ต้องตรวจสอบด้วยตนเอง"
              >🚨 ตรวจสอบ</span>
            )}
            {outcomeMeta && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold border inline-flex items-center gap-1"
                style={{
                  background: outcomeMeta.color.bg,
                  borderColor: outcomeMeta.color.border,
                  color: isLight ? outcomeMeta.color.lightText : outcomeMeta.color.darkText,
                }}
                data-testid={`recall-outcome-meta-mobile-${recall.id}`}
                title={`เหตุผล: ${outcomeMeta.label}`}
              >
                <span aria-hidden="true">{outcomeMeta.emoji}</span>
                <span>{outcomeMeta.label}</span>
              </span>
            )}
          </div>
        )}

        {/* PROMINENT NOTE (2026-05-20, Q1=A) — outcomeNote when present, else the recall reason.
            Larger + boxed so it's the visual anchor. User: "User จะใส่เหตุผลเสมอ". */}
        {noteText && (
          <div
            className="mt-1 md:mt-1.5 rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] px-2.5 py-2"
            data-testid={`recall-note-${recall.id}`}
            data-note-source={hasOutcomeNote ? 'outcome' : 'reason'}
          >
            <div className="text-[9px] uppercase tracking-wide text-[var(--tx-muted)] mb-0.5">{noteLabel}</div>
            <div className="text-[13px] md:text-sm font-semibold text-[var(--tx-primary)] leading-snug line-clamp-3">
              {noteText}
            </div>
          </div>
        )}
        {!compact && recall.sourceProductName && (
          <div className="text-[9px] text-[var(--tx-muted)] opacity-70 mt-0.5">{recall.sourceProductName}</div>
        )}
        {loggedByName && (
          <div className="mt-1 text-[10px] text-[var(--tx-muted)]" data-testid={`recall-logged-by-${recall.id}`}>
            บันทึกโดย: <span className="font-semibold text-[var(--tx-primary)]">{loggedByName}</span>
          </div>
        )}
        {recall.lineMessageSent && (
          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/25 rounded text-[10px] md:text-[9px] text-green-300">
            💬 ส่ง LINE แล้ว
          </div>
        )}
        {pairedRecall && (
          <RecallPairBadge paired={pairedRecall} todayISO={todayISO} onClick={onPairClick} />
        )}
      </div>

      {/* ACTION BAR — mobile: full-width bottom row with 36×36 tap targets,
          evenly spaced. Desktop (md+): right-rail compact row, current density. */}
      <div className="flex gap-2 md:gap-1.5 mt-3 md:mt-0 md:self-start pt-3 md:pt-0 border-t md:border-t-0 border-[var(--bd)]/40 justify-around md:justify-start">
        {onRecordOutcome && recall.status !== 'done' && recall.status !== 'closed-no-answer' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRecordOutcome(recall.id); }}
            data-testid={`recall-record-${recall.id}`}
            className="w-9 h-9 md:w-6 md:h-6 rounded-lg md:rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:bg-[var(--bg-elevated)] active:scale-95 transition-transform flex items-center justify-center"
            aria-label="บันทึกผลการโทร"
            title="📞 บันทึกผลการโทร"
          >
            <Phone className="w-4 h-4 md:w-[11px] md:h-[11px]" />
          </button>
        )}
        {onLineSend && recall.customerLineUserId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLineSend(recall.id); }}
            data-testid={`recall-line-${recall.id}`}
            className="w-9 h-9 md:w-6 md:h-6 rounded-lg md:rounded bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-300 hover:bg-green-500/20 active:scale-95 transition-transform flex items-center justify-center"
            aria-label="ส่งข้อความ LINE"
            title="💬 ส่ง LINE template"
          >
            <MessageCircle className="w-4 h-4 md:w-[11px] md:h-[11px]" />
          </button>
        )}
        {onSnooze && recall.status !== 'done' && recall.status !== 'closed-no-answer' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSnooze(recall.id); }}
            data-testid={`recall-snooze-${recall.id}`}
            className="w-9 h-9 md:w-6 md:h-6 rounded-lg md:rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 active:scale-95 transition-transform flex items-center justify-center"
            aria-label="เลื่อน Recall"
            title="⏰ เลื่อน"
          >
            <Clock className="w-4 h-4 md:w-[11px] md:h-[11px]" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(recall.id); }}
            data-testid={`recall-edit-${recall.id}`}
            className="w-9 h-9 md:w-6 md:h-6 rounded-lg md:rounded bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/60 active:scale-95 transition-transform flex items-center justify-center"
            aria-label="แก้ไข Recall"
            title="✏️ แก้ไข Recall"
          >
            <Pencil className="w-4 h-4 md:w-[11px] md:h-[11px]" />
          </button>
        )}
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
            className="w-9 h-9 md:w-6 md:h-6 rounded-lg md:rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/25 hover:border-red-500/60 active:scale-95 transition-transform flex items-center justify-center"
            aria-label="ลบ Recall"
            title="🗑️ ลบ Recall"
          >
            <Trash2 className="w-4 h-4 md:w-[11px] md:h-[11px]" />
          </button>
        )}
      </div>
    </div>
  );
}

export default RecallRow;
