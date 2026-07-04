import React, { useMemo } from 'react';
import { groupRecallsByTimeBucket } from '../../../lib/recallResolvers.js';
import { RecallRow } from './RecallRow.jsx';
import { RecallSectionHeader } from './RecallSectionHeader.jsx';
import { RecallEmptyState } from './RecallEmptyState.jsx';

/**
 * Phase 29 (2026-05-14) — Recall list composer.
 *
 * Groups recalls into 5 buckets (overdue / today / tomorrow / thisWeek / later),
 * skips empty sections, and renders each row with its paired-recall resolved
 * via a single-pass lookup map.
 *
 * Anti-flicker discipline (per spec §5.6):
 *   - useMemo for bucket grouping + pair map (keyed on recalls array reference)
 *   - Stable `key={r.id}` on every row (NEVER index — SG3)
 *
 * @param {object} props
 * @param {Array} props.recalls full recall list (already filtered / searched)
 * @param {string} props.todayISO 'YYYY-MM-DD' Bangkok-local
 * @param {'full'|'compact'} [props.mode='full'] 'compact' = Frontend tab (only overdue + today)
 * @param {function} [props.onRowClick] (recallId) → open detail modal
 * @param {function} [props.onRecordOutcome] (recallId)
 * @param {function} [props.onLineSend] (recallId)
 * @param {function} [props.onSnooze] (recallId)
 * @param {function} [props.onPairClick] (pairedRecallId)
 * @param {function} [props.onEdit] (recallId) → open edit modal
 * @param {React.ReactNode} [props.emptyState] custom empty state (default RecallEmptyState)
 */
export function RecallList({
  recalls,
  todayISO,
  mode = 'full',
  onRowClick,
  onRecordOutcome,
  onLineSend,
  onSnooze,
  onPairClick,
  onDelete,
  onEdit,
  emptyState = null,
}) {
  // Bucket grouping — Bangkok-stable, recalls array reference is the key
  const buckets = useMemo(
    () => groupRecallsByTimeBucket(recalls, todayISO),
    [recalls, todayISO],
  );

  // Pair-id → recall lookup (single pass over recalls)
  const pairMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(recalls)) {
      for (const r of recalls) {
        if (r && r.id) m.set(r.id, r);
      }
    }
    return m;
  }, [recalls]);

  // Buckets to render based on mode.
  // 2026-05-20 — Frontend "Recall วันนี้" (compact): TODAY on top (most
  // prominent), then ค้าง/เลยกำหนด (all overdue, Q3=A), then พรุ่งนี้.
  const orderedBuckets = mode === 'compact'
    ? ['today', 'overdue', 'tomorrow']
    : ['overdue', 'today', 'tomorrow', 'thisWeek', 'later'];

  const totalShown = orderedBuckets.reduce((sum, k) => sum + (buckets[k]?.length || 0), 0);

  // 2026-07-05 Q2=A (user report IMG_8920 — a skipped-empty "วันนี้" made the
  // พรุ่งนี้ group read as today's list): compact mode renders ALL 3 sections
  // ALWAYS; an empty section shows an explicit green "✓ ไม่มี" box instead of
  // vanishing. Full mode keeps the original skip-empty behavior.
  if (totalShown === 0 && mode !== 'compact') {
    return emptyState || <RecallEmptyState />;
  }

  const EMPTY_BUCKET_LABEL = {
    today: '✓ ไม่มี Recall วันนี้',
    overdue: '✓ ไม่มีรายการค้าง',
    tomorrow: '✓ ไม่มี Recall พรุ่งนี้',
  };
  // Q1=B — today/tomorrow headers carry the REAL full date.
  const tomorrowISO = (() => {
    const m = String(todayISO || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) + 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  })();
  const BUCKET_DATE_ISO = { today: todayISO || '', tomorrow: tomorrowISO };

  return (
    <div
      data-testid="recall-list"
      data-mode={mode}
      // Phase 29.22 visual polish — give sections breathing room + per-row card spacing.
      className="flex flex-col gap-5 px-4 py-3"
    >
      {orderedBuckets.map((bucketKey) => {
        const items = buckets[bucketKey] || [];
        const alwaysRender = mode === 'compact';
        if (items.length === 0 && !alwaysRender) return null;
        if (items.length === 0 && alwaysRender) {
          return (
            <section key={bucketKey} data-bucket={bucketKey}>
              <RecallSectionHeader
                bucketKey={bucketKey}
                count={0}
                prominent={bucketKey === 'today'}
                dateISO={BUCKET_DATE_ISO[bucketKey] || ''}
                alwaysRender
              />
              <div
                data-testid={`recall-bucket-empty-${bucketKey}`}
                className="mt-2 rounded-lg border border-dashed border-green-500/40 bg-green-500/[0.06] py-3 text-center text-[12px] font-extrabold text-green-600 dark:text-green-400"
              >
                {EMPTY_BUCKET_LABEL[bucketKey]}
              </div>
            </section>
          );
        }
        const doneCount = bucketKey === 'today'
          ? items.filter(r => r.status === 'done').length
          : undefined;
        return (
          <section key={bucketKey} data-bucket={bucketKey}>
            <RecallSectionHeader
              bucketKey={bucketKey}
              count={items.length}
              doneCount={doneCount}
              prominent={mode === 'compact' && bucketKey === 'today'}
              dateISO={BUCKET_DATE_ISO[bucketKey] || ''}
            />
            <div className="flex flex-col gap-2 mt-2">
              {items.map((r) => (
                <RecallRow
                  key={r.id}
                  recall={r}
                  todayISO={todayISO}
                  pairedRecall={r.pairedRecallId ? pairMap.get(r.pairedRecallId) || null : null}
                  onClick={onRowClick}
                  onRecordOutcome={onRecordOutcome}
                  onLineSend={onLineSend}
                  onSnooze={onSnooze}
                  onPairClick={onPairClick}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default RecallList;
