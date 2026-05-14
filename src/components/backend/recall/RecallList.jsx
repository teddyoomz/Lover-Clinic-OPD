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

  // Buckets to render based on mode
  const orderedBuckets = mode === 'compact'
    ? ['overdue', 'today']
    : ['overdue', 'today', 'tomorrow', 'thisWeek', 'later'];

  const totalShown = orderedBuckets.reduce((sum, k) => sum + (buckets[k]?.length || 0), 0);

  if (totalShown === 0) {
    return emptyState || <RecallEmptyState />;
  }

  return (
    <div
      data-testid="recall-list"
      data-mode={mode}
      // Phase 29.22 visual polish — give sections breathing room + per-row card spacing.
      className="flex flex-col gap-5 px-4 py-3"
    >
      {orderedBuckets.map((bucketKey) => {
        const items = buckets[bucketKey] || [];
        if (items.length === 0) return null;
        const doneCount = bucketKey === 'today'
          ? items.filter(r => r.status === 'done').length
          : undefined;
        return (
          <section key={bucketKey} data-bucket={bucketKey}>
            <RecallSectionHeader
              bucketKey={bucketKey}
              count={items.length}
              doneCount={doneCount}
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
