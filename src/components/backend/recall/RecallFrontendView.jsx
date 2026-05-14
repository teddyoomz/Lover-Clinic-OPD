import React, { useState, useCallback } from 'react';
import { Plus, PhoneCall } from 'lucide-react';
import { RecallList } from './RecallList.jsx';
import { RecallCreateModal } from './RecallCreateModal.jsx';
import { RecallOutcomeModal } from './RecallOutcomeModal.jsx';
import { RecallLineTemplateModal } from './RecallLineTemplateModal.jsx';
import { RecallSnoozeMenu } from './RecallSnoozeMenu.jsx';
import { useRecallListener } from '../../../hooks/useRecallListener.js';
import { useRecallCases } from '../../../hooks/useRecallCases.js';
import { deleteRecall } from '../../../lib/scopedDataLayer.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — Frontend Recall view (Admin's main daily-work page).
 *
 * Per spec §4.2 — simplified version of Backend RecallTab:
 *   - Shows ONLY overdue + today sections (mode='compact' on RecallList)
 *   - No search, no filter (focused-action view)
 *   - Bottom "+ ตั้ง Recall ใหม่" button (vs backend's top button)
 *   - Footer hint: "ดู recall อนาคต / ทั้งหมด → ไป Backend → Recall"
 *
 * Renders inside AdminDashboard.jsx when apptViewMode === 'recall'.
 * Uses the same useRecallListener (branch-scoped real-time onSnapshot).
 */
export function RecallFrontendView() {
  const todayISO = thaiTodayISO();
  const { recalls, loading, error } = useRecallListener({ filters: {} });
  // Phase 29.22 (2026-05-14) — be_recall_cases shared hook for typeahead.
  const { recallCases, onSaveAsRecallCase } = useRecallCases();

  const [createModal, setCreateModal] = useState(null);
  const [outcomeModal, setOutcomeModal] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [snoozeModal, setSnoozeModal] = useState(null);

  const findRecall = useCallback(
    (id) => (recalls || []).find(r => r.id === id),
    [recalls],
  );

  const handleRowClick = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setOutcomeModal({ recall });
  }, [findRecall]);

  const handleRecordOutcome = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setOutcomeModal({ recall });
  }, [findRecall]);

  const handleLineSend = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) {
      setLineModal({
        recall,
        customer: {
          id: recall.customerId,
          displayName: recall.customerName,
          firstName: recall.customerName,
          lineUserId: recall.customerLineUserId,
        },
      });
    }
  }, [findRecall]);

  const handleSnooze = useCallback((id) => {
    const recall = findRecall(id);
    if (recall) setSnoozeModal({ recall });
  }, [findRecall]);

  // Phase 29.22 round-3 — hard-delete handler (confirm lives in RecallRow).
  const handleDelete = useCallback(async (id) => {
    try {
      await deleteRecall(id);
    } catch (e) {
      console.error('[RecallFrontendView] deleteRecall failed:', e);
      window.alert('ลบ Recall ไม่สำเร็จ: ' + (e?.message || 'unknown error'));
    }
  }, []);

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

  return (
    <div data-testid="recall-frontend-view" className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden">
      {error && (
        <div
          className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-300"
          data-testid="recall-frontend-error"
        >
          ⚠ {error}
        </div>
      )}

      {loading && !recalls?.length ? (
        <div className="py-8 text-center text-[11px] text-[var(--tx-muted)]" data-testid="recall-frontend-loading">
          กำลังโหลด…
        </div>
      ) : (
        <RecallList
          recalls={recalls}
          todayISO={todayISO}
          mode="compact"
          onRowClick={handleRowClick}
          onRecordOutcome={handleRecordOutcome}
          onLineSend={handleLineSend}
          onSnooze={handleSnooze}
          onPairClick={() => {}}
          onDelete={handleDelete}
        />
      )}

      {/* Bottom action + hint */}
      <div className="border-t border-[var(--bd)] px-3 py-3 flex items-center justify-between gap-2 bg-[var(--bg-surface)]">
        <button
          type="button"
          onClick={() => setCreateModal({ customer: null })}
          data-testid="recall-frontend-create"
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 flex items-center gap-1"
        >
          <Plus size={11} />
          ตั้ง Recall ใหม่
        </button>
        <div className="text-[10px] text-[var(--tx-muted)] italic flex items-center gap-1">
          <PhoneCall size={10} />
          ดู recall อนาคต / ทั้งหมด → ไป Backend → Recall
        </div>
      </div>

      {/* Modals */}
      {createModal && (
        <RecallCreateModal
          customer={createModal.customer}
          treatmentContext={createModal.treatmentContext}
          sourceContext={createModal.sourceContext}
          masterDataSuggestions={createModal.masterDataSuggestions || {}}
          recallCases={recallCases}
          onSaveAsRecallCase={onSaveAsRecallCase}
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
      {lineModal && (
        <RecallLineTemplateModal
          recall={lineModal.recall}
          customer={lineModal.customer}
          onClose={() => setLineModal(null)}
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

// RecallTogglePill + useRecallFrontendBadgeCount moved to RecallTogglePill.jsx
// (split to keep the AdminDashboard import lightweight + work around a
// Rolldown panic that surfaced when both were co-located in this file)

export default RecallFrontendView;
