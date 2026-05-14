import React, { useState, useMemo, useCallback } from 'react';
import { RecallHeader } from './RecallHeader.jsx';
import { RecallList } from './RecallList.jsx';
import { RecallCreateModal } from './RecallCreateModal.jsx';
import { RecallOutcomeModal } from './RecallOutcomeModal.jsx';
import { RecallLineTemplateModal } from './RecallLineTemplateModal.jsx';
import { RecallSnoozeMenu } from './RecallSnoozeMenu.jsx';
import { useRecallListener } from '../../../hooks/useRecallListener.js';
import { thaiTodayISO } from '../../../utils.js';

/**
 * Phase 29 (2026-05-14) — Backend RecallTab.
 *
 * Top-level composer for the Backend "Recall" sub-tab. Wires:
 *   - useRecallListener (branch-scoped real-time onSnapshot via BS-13)
 *   - RecallHeader (title + count + search + create button)
 *   - RecallList (date-grouped 5-bucket render via RecallList composer)
 *   - 4 modals (Create / Outcome / LINE template / Snooze)
 *
 * Anti-flicker discipline (spec §5.6):
 *   - useMemo for filtered/searched recalls (keyed on recalls + searchText)
 *   - Modal state changes don't trigger list re-fetch (listener stays subscribed)
 *
 * Real-time integration:
 *   - Create/Update/Snooze writes propagate to Firestore → onSnapshot fires
 *     → state updates → row re-renders without unmount
 *   - Branch switch (via BranchSelector) auto-resubscribes listener
 */
export function RecallTab() {
  const todayISO = thaiTodayISO();
  const { recalls, loading, error } = useRecallListener({ filters: {} });

  const [searchText, setSearchText] = useState('');

  // Modal state
  const [createModal, setCreateModal] = useState(null);
  const [outcomeModal, setOutcomeModal] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [snoozeModal, setSnoozeModal] = useState(null);

  // Filtered recalls (search by name / HN / reason)
  const filteredRecalls = useMemo(() => {
    if (!searchText.trim()) return recalls;
    const q = searchText.trim().toLowerCase();
    return (recalls || []).filter(r => {
      const haystack = [
        r.customerName,
        r.customerHN,
        r.reason,
        r.sourceProductName,
        r.sourceCourseName,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [recalls, searchText]);

  // Helper to find a recall in the live list (for modal pre-fill)
  const findRecall = useCallback(
    (id) => (recalls || []).find(r => r.id === id),
    [recalls],
  );

  // Action handlers — all open modals; modals dispatch backend writes
  const handleOpenCreate = useCallback(() => {
    setCreateModal({ customer: null }); // No pre-filled customer (admin picks)
  }, []);

  const handleRowClick = useCallback((id) => {
    // For MVP: row click opens outcome modal (record outcome is the primary action).
    // Future: open a richer detail modal (edit reason/date/etc.)
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

  const handleReschedule = useCallback((id) => {
    // After outcome=reschedule, open snooze menu so admin picks new date
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

  const handlePairClick = useCallback((pairedId) => {
    // Future: scroll to paired recall row in list. For now, log + no-op.
    if (typeof window !== 'undefined') {
      const el = document.querySelector(`[data-testid="recall-row-${pairedId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="w-full" data-testid="recall-tab">
      <RecallHeader
        count={filteredRecalls.length}
        search={searchText}
        onSearchChange={setSearchText}
        onOpenCreate={handleOpenCreate}
      />

      {error && (
        <div
          className="px-4 py-3 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-300"
          data-testid="recall-tab-error"
        >
          ⚠ {error}
        </div>
      )}

      {loading && !recalls?.length ? (
        <div className="py-10 text-center text-[11px] text-[var(--tx-muted)]" data-testid="recall-tab-loading">
          กำลังโหลด…
        </div>
      ) : (
        <RecallList
          recalls={filteredRecalls}
          todayISO={todayISO}
          mode="full"
          onRowClick={handleRowClick}
          onRecordOutcome={handleRecordOutcome}
          onLineSend={handleLineSend}
          onSnooze={handleSnooze}
          onPairClick={handlePairClick}
        />
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

export default RecallTab;
