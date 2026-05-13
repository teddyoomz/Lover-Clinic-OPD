// src/components/backend/treatment-history/TreatmentHistoryCard.jsx
//
// Phase 28 Task 8 (2026-05-14) — top-level treatment-history card composer.
//
// Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
//   § 4.1 (card frame) + § 5 (behavior) + § 7 (architecture)
//
// Composes:
//   - TreatmentHistoryHeader (Task 6) — icon + title + count + 3 CTA buttons
//   - TreatmentDateHeader    (Task 3) — fire-red today / muted past + relative pill
//   - TreatmentHistoryRow    (Task 4) — collapsed row + chevron + edit/delete chips
//   - TreatmentHistoryExpandedBody (Task 5) — CC/DX callout + detail + print buttons
//   - TreatmentHistoryPagination   (Task 7) — page numbers + prev/next
//   - groupTreatmentsByDate helper (Task 1) — interleaved [{type, ...}] structure
//
// Replaces the inline ~290-line treatment-history block in CustomerDetailView.jsx.
// Pure presentational — all state hooks live in parent CDV. No Firestore writes,
// no schema changes. Pure render-layer migration.

import React, { useMemo } from 'react';
import { AlertCircle, Stethoscope } from 'lucide-react';
import { TreatmentHistoryHeader } from './TreatmentHistoryHeader.jsx';
import { TreatmentDateHeader } from './TreatmentDateHeader.jsx';
import { TreatmentHistoryRow } from './TreatmentHistoryRow.jsx';
import { TreatmentHistoryExpandedBody } from './TreatmentHistoryExpandedBody.jsx';
import { TreatmentHistoryPagination } from './TreatmentHistoryPagination.jsx';
import { groupTreatmentsByDate } from '../../../lib/treatmentDisplayResolvers.js';

const TREATMENT_PAGE_SIZE = 5;

export function TreatmentHistoryCard({
  customer,
  treatmentSummary,
  treatments,
  expandedTreatment,
  setExpandedTreatment,
  onCreateTreatment,
  onEditTreatment,
  onDeleteTreatment,
  treatmentPage,
  setTreatmentPage,
  treatmentsLoading,
  treatmentsError,
  setPrintDocOpen,
  setShowTimeline,
  setPrintPerTreatment,
  ac,
  acRgb,
  isDark,
  todayISO,
}) {
  const totalItems = treatmentSummary?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / TREATMENT_PAGE_SIZE));

  // Phase 28 (2026-05-14) — slice paginated rows; mirrors prior CDV memo.
  const paginatedTreatments = useMemo(() => {
    if (!Array.isArray(treatmentSummary)) return [];
    const start = (treatmentPage - 1) * TREATMENT_PAGE_SIZE;
    return treatmentSummary.slice(start, start + TREATMENT_PAGE_SIZE);
  }, [treatmentSummary, treatmentPage]);

  // Phase 28 (2026-05-14) — group rows by date for date-grouped sections.
  // groupTreatmentsByDate returns interleaved [{type:'header'}, {type:'row'}, ...].
  const groups = useMemo(
    () => groupTreatmentsByDate(paginatedTreatments),
    [paginatedTreatments]
  );

  // Phase 28 (2026-05-14) — compact pageNumbers for pagination footer.
  // ≤7 pages → show all; otherwise show 1, current±1, totalPages
  // (dedup via Set + sort). Ellipsis is computed at render-time inside
  // TreatmentHistoryPagination by inspecting gaps between adjacent entries.
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const candidates = [1, treatmentPage - 1, treatmentPage, treatmentPage + 1, totalPages]
      .filter((p) => p >= 1 && p <= totalPages);
    return Array.from(new Set(candidates)).sort((a, b) => a - b);
  }, [treatmentPage, totalPages]);

  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-xl overflow-hidden relative
        before:absolute before:left-0 before:right-0 before:top-0 before:h-px
        before:bg-gradient-to-r before:from-transparent before:via-red-500/40 before:to-transparent
        before:content-['']"
      data-testid="treatment-history-card"
    >
      <TreatmentHistoryHeader
        count={customer?.treatmentCount || totalItems}
        ac={ac}
        acRgb={acRgb}
        onPrintDoc={() => setPrintDocOpen(true)}
        onShowTimeline={() => setShowTimeline(true)}
        onCreateTreatment={onCreateTreatment}
      />

      {treatmentsError && (
        <div
          className={`px-[18px] py-3 text-xs flex items-center gap-2 border-b border-[var(--bd)] ${
            isDark ? 'text-orange-400 bg-orange-900/10' : 'text-orange-700 bg-orange-50'
          }`}
        >
          <AlertCircle size={13} aria-hidden="true" /> {treatmentsError}
        </div>
      )}

      {totalItems === 0 && !treatmentsError ? (
        <div className="p-12 text-center" data-testid="treatment-history-empty">
          <Stethoscope
            size={32}
            className="mx-auto mb-3 text-[var(--tx-muted)] opacity-40"
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-[var(--tx-secondary)]">ยังไม่มีประวัติการรักษา</p>
          <p className="text-xs text-[var(--tx-muted)] mt-1">
            กดปุ่ม "บันทึกการรักษา" เพื่อสร้างรายการแรก
          </p>
        </div>
      ) : (
        <>
          <div data-testid="treatment-history-list">
            {groups.map((node) => {
              if (node.type === 'header') {
                return (
                  <TreatmentDateHeader
                    key={`h-${node.date}`}
                    date={node.date}
                    todayISO={todayISO}
                    count={node.count}
                  />
                );
              }
              const t = node.t;
              // globalIndex = position within full treatmentSummary list
              // (used to determine "ล่าสุด" tag — only first row of page 1).
              const localIndex = paginatedTreatments.findIndex((p) => p.id === t.id);
              const globalIndex = localIndex + (treatmentPage - 1) * TREATMENT_PAGE_SIZE;
              const isLatest = globalIndex === 0 && treatmentPage === 1;
              const isExpanded = expandedTreatment === t.id;
              const detail = treatments?.find(
                (tr) => tr.treatmentId === t.id || tr.id === t.id
              );
              const isBackendCreated =
                detail?.createdBy === 'backend' || t.createdBy === 'backend';
              return (
                <TreatmentHistoryRow
                  key={t.id}
                  t={t}
                  isLatest={isLatest}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedTreatment(isExpanded ? null : t.id)}
                  onEditTreatment={isBackendCreated ? onEditTreatment : undefined}
                  onDeleteTreatment={isBackendCreated ? onDeleteTreatment : undefined}
                  isDark={isDark}
                  isBackendCreated={isBackendCreated}
                >
                  {isExpanded && (
                    <TreatmentHistoryExpandedBody
                      t={t}
                      detail={detail}
                      ac={ac}
                      acRgb={acRgb}
                      isDark={isDark}
                      treatmentsLoading={treatmentsLoading}
                      onPrintCert={(id) =>
                        setPrintPerTreatment({ treatmentId: id, type: 'cert' })
                      }
                      onPrintRecord={(id) =>
                        setPrintPerTreatment({ treatmentId: id, type: 'record' })
                      }
                    />
                  )}
                </TreatmentHistoryRow>
              );
            })}
          </div>

          <TreatmentHistoryPagination
            currentPage={treatmentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={TREATMENT_PAGE_SIZE}
            pageNumbers={pageNumbers}
            onPageChange={setTreatmentPage}
          />
        </>
      )}
    </div>
  );
}
