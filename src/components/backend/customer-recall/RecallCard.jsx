import React, { useState, useCallback, useMemo } from 'react';
import { Plus, List, PhoneCall } from 'lucide-react';
import { RecallRow } from '../recall/RecallRow.jsx';
import { RecallEmptyState } from '../recall/RecallEmptyState.jsx';
import { RecallCreateModal } from '../recall/RecallCreateModal.jsx';
import { RecallOutcomeModal } from '../recall/RecallOutcomeModal.jsx';
import { RecallSnoozeMenu } from '../recall/RecallSnoozeMenu.jsx';
import { useRecallListener } from '../../../hooks/useRecallListener.js';
import { isOverdue, getEffectiveRecallDate } from '../../../lib/recallResolvers.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — Customer Detail View Recall card.
 *
 * Per spec §4.3: mirrors the appointment card pattern + sits beside it.
 * Uses per-customer listener (universal — sanctioned BSA exception SG10:
 * recalls follow customer across branches).
 *
 * Behavior:
 *   - Lists this customer's recalls sorted overdue → today → upcoming
 *   - Limit-5 by default; "ดูทั้งหมด" expands to full list
 *   - "+ เพิ่ม Recall" opens RecallCreateModal pre-filled with this customer
 *   - Compact row variant (CDV space-constrained)
 *   - Outcome + snooze modals wired (LINE-send omitted per spec — admins
 *     use Backend tab for that)
 *   - Footer hint when total > visible
 *
 * @param {object} props
 * @param {string} props.customerId
 * @param {object} props.customer { displayName, phone, lineUserId, hn, ... }
 */
export function RecallCard({ customerId, customer }) {
  const todayISO = thaiTodayISO();
  const { recalls, loading, error } = useRecallListener({ customerId });

  const [expanded, setExpanded] = useState(false);
  const [createModal, setCreateModal] = useState(null);
  const [outcomeModal, setOutcomeModal] = useState(null);
  const [snoozeModal, setSnoozeModal] = useState(null);

  // Sort recalls: overdue first → today → upcoming → past-done
  const sortedRecalls = useMemo(() => {
    if (!Array.isArray(recalls)) return [];
    const enriched = recalls.map(r => ({
      r,
      eff: getEffectiveRecallDate(r) || '',
      isPending: r.status !== 'done' && r.status !== 'closed-no-answer',
      overdueRank: isOverdue(r, todayISO) ? 0 : 1, // overdue → 0 (first)
    }));
    enriched.sort((a, b) => {
      // Overdue first
      if (a.overdueRank !== b.overdueRank) return a.overdueRank - b.overdueRank;
      // Pending before done
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
      // By effective date ascending (soonest first)
      return a.eff.localeCompare(b.eff);
    });
    return enriched.map(e => e.r);
  }, [recalls, todayISO]);

  const visibleRecalls = expanded ? sortedRecalls : sortedRecalls.slice(0, 5);
  const hiddenCount = sortedRecalls.length - visibleRecalls.length;

  const findRecall = useCallback(
    (id) => (recalls || []).find(r => r.id === id),
    [recalls],
  );

  const handleAdd = useCallback(() => {
    setCreateModal({
      customer: {
        id: customerId,
        displayName: customer?.displayName || customer?.name || '',
        name: customer?.displayName || customer?.name || '',
        phone: customer?.phone || customer?.patientData?.phone || '',
        lineUserId: customer?.lineUserId || null,
        hn: customer?.hn || customer?.patientData?.hn || null,
      },
    });
  }, [customer, customerId]);

  const handleRowClick = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setOutcomeModal({ recall });
  }, [findRecall]);

  const handleRecordOutcome = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setOutcomeModal({ recall });
  }, [findRecall]);

  const handleSnooze = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setSnoozeModal({ recall });
  }, [findRecall]);

  const handleReschedule = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) {
      const default3d = (() => {
        const m = todayISO.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return '';
        const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
        const fd = new Date(ms + 3 * 86400000);
        return `${fd.getUTCFullYear()}-${String(fd.getUTCMonth() + 1).padStart(2, '0')}-${String(fd.getUTCDate()).padStart(2, '0')}`;
      })();
      setSnoozeModal({ recall, initialDate: default3d });
    }
  }, [findRecall, todayISO]);

  const pendingCount = useMemo(
    () => (recalls || []).filter(r => r && r.status !== 'done' && r.status !== 'closed-no-answer').length,
    [recalls],
  );

  return (
    <div
      data-testid="recall-card"
      className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden"
    >
      {/* Header — mirror appointment card pattern */}
      <div className="px-3 py-2 border-b border-[var(--bd)] flex items-center gap-2 bg-[var(--bg-card)]/50">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0">
          <PhoneCall size={11} className="text-white" />
        </div>
        <h3 className="text-xs font-bold text-[var(--tx-primary)]">Recall</h3>
        <span
          className="font-mono text-[9px] px-1.5 py-0 rounded bg-red-500/10 text-red-300 border border-red-500/30 font-bold"
          data-testid="recall-card-count"
        >
          {pendingCount}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {sortedRecalls.length > 5 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              data-testid="recall-card-view-all"
              className="px-2 py-1 rounded-md text-[10px] font-semibold text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-1"
            >
              <List size={9} />
              ดูทั้งหมด
            </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            data-testid="recall-card-add"
            className="px-2 py-1 rounded-md text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 flex items-center gap-1"
          >
            <Plus size={9} />
            เพิ่ม Recall
          </button>
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div
          className="px-3 py-2 text-[10px] text-red-300"
          data-testid="recall-card-error"
        >
          ⚠ {error}
        </div>
      ) : loading && !recalls?.length ? (
        <div
          className="py-4 text-center text-[10px] text-[var(--tx-muted)]"
          data-testid="recall-card-loading"
        >
          กำลังโหลด…
        </div>
      ) : sortedRecalls.length === 0 ? (
        <div data-testid="recall-card-empty">
          <RecallEmptyState message="ไม่มี Recall" hint="กดปุ่ม + เพื่อเพิ่ม" />
        </div>
      ) : (
        <div>
          {visibleRecalls.map(r => (
            <RecallRow
              key={r.id}
              recall={r}
              todayISO={todayISO}
              compact={true}
              onClick={handleRowClick}
              onRecordOutcome={handleRecordOutcome}
              onSnooze={handleSnooze}
              // No onLineSend in CDV (admin uses Backend tab for that per spec §4.3)
            />
          ))}
          {hiddenCount > 0 && (
            <div
              className="px-3 py-2 text-[10px] text-[var(--tx-muted)] italic bg-[var(--bg-surface)] border-t border-[var(--bd)]"
              data-testid="recall-card-footer-hint"
            >
              💡 ลูกค้าคนนี้มี recall อีก <span className="font-bold text-[var(--tx-primary)]">{hiddenCount}</span> รายการ — กด "ดูทั้งหมด" เพื่อแสดง
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <RecallCreateModal
          customer={createModal.customer}
          treatmentContext={createModal.treatmentContext}
          sourceContext={createModal.sourceContext}
          masterDataSuggestions={createModal.masterDataSuggestions || {}}
          onClose={() => setCreateModal(null)}
        />
      )}
      {outcomeModal && (
        <RecallOutcomeModal
          recall={outcomeModal.recall}
          onClose={() => setOutcomeModal(null)}
          onReschedule={handleReschedule}
        />
      )}
      {snoozeModal && (
        <RecallSnoozeMenu
          recall={snoozeModal.recall}
          initialDate={snoozeModal.initialDate}
          onClose={() => setSnoozeModal(null)}
        />
      )}
    </div>
  );
}

export default RecallCard;
