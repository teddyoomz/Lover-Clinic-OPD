// ─── TreatmentTimelineModal — "ดูไทม์ไลน์" image-led treatment view ──────
// Phase 14.7.E (2026-04-26)
//
// Replicates ProClinic's #treatmentTimelineModal (Bootstrap modal-xxl) verified
// via opd.js scan against trial.proclinicth.com 2026-04-25. Source-of-truth
// at docs/proclinic-scan/customer-detail-treatment-history-and-timeline.md.
//
// Per-treatment row layout: 3-col / 9-col split (left meta+items, right
// 3-image grid with carousel). All treatments rendered chronologically
// (newest first) — no pagination, no filters, no AJAX (matches ProClinic).
//
// Reuses CustomerDetailView's already-loaded `treatments[]` array (no new
// fetch). Image categories map ProClinic → our schema:
//   - "OPD/อื่นๆ"  ⇒ detail.otherImages
//   - "Before"     ⇒ detail.beforeImages
//   - "After"      ⇒ detail.afterImages
// Each image is `{ dataUrl, id }` per saveTreatment writer.
//
// Phase 26.2 (2026-05-13): Refactored to consume TreatmentReadOnlyPanel
// (Task 3). The inline row JSX (~130 LOC) replaced by the extracted panel.
// Modal-level edit button remains OUTSIDE the panel (AV38 read-only contract).
// Dead code removed: local ImageGridColumn, Lightbox, Accordion, formatThaiDateFull,
// imageUrl, and lightbox state (panel has own internal lightbox state).

import { useState, useMemo, useEffect } from 'react';
import { X, Activity, Edit3, Stethoscope } from 'lucide-react';
import TreatmentReadOnlyPanel from './TreatmentReadOnlyPanel.jsx';

// ─── Main modal ─────────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {Object} props.customer
 * @param {Array} props.treatmentSummary — sorted desc (matches CustomerDetailView memo)
 * @param {Array} props.treatments — full detail array
 * @param {boolean} props.treatmentsLoading
 * @param {string} props.theme
 * @param {string} props.accentColor
 * @param {() => void} props.onClose
 * @param {(treatmentId:string) => void} [props.onEditTreatment]
 */
export default function TreatmentTimelineModal({
  customer, treatmentSummary, treatments, treatmentsLoading,
  theme, accentColor, onClose, onEditTreatment,
}) {
  const ac = accentColor || '#dc2626';

  // Esc closes the modal (panel handles its own lightbox Esc internally)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Index treatments by id once for O(1) detail lookup
  const treatmentsById = useMemo(() => {
    const map = {};
    (treatments || []).forEach(t => {
      map[t.treatmentId || t.id] = t;
    });
    return map;
  }, [treatments]);

  const customerName = customer
    ? `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim()
    : '';
  const customerHN = customer?.proClinicHN || '';
  const totalCount = treatmentSummary?.length || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-modal-title"
      data-testid="treatment-timeline-modal"
      onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-[95vw] max-w-screen-xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--bd)] flex items-center gap-3 flex-wrap">
          <Activity size={20} style={{ color: '#2EC4B6' }} />
          <div className="flex-1 min-w-0">
            <h4 id="timeline-modal-title" className="text-lg font-black text-[var(--tx-heading)] tracking-tight" style={{ color: '#2EC4B6' }}>
              Timeline การรักษา
            </h4>
            {customer && (
              <p className="text-xs text-[var(--tx-muted)] mt-0.5">
                {customerName || '-'} {customerHN && <span className="font-mono">· HN {customerHN}</span>}
                {totalCount > 0 && <span> · ทั้งหมด <span className="font-bold text-[var(--tx-secondary)]">{totalCount}</span> ครั้ง</span>}
              </p>
            )}
          </div>
          <button onClick={onClose}
            data-testid="timeline-close-btn"
            aria-label="ปิด"
            className="p-2 rounded-lg text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--tx-primary)] transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" data-testid="timeline-body">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" data-testid="timeline-empty">
              <Stethoscope size={48} className="text-[var(--tx-muted)] opacity-40 mb-4" />
              <p className="text-lg font-bold text-[var(--tx-secondary)] mb-1">ไม่พบประวัติการรักษา</p>
              <p className="text-sm text-[var(--tx-muted)]">บันทึกการรักษาแรกในหน้าหลัก</p>
            </div>
          ) : (
            <div className="space-y-6">
              {treatmentSummary.map((t, globalIndex) => {
                const fullDoc = treatmentsById[t.id] || null;
                const isLatest = globalIndex === 0;

                return (
                  <div key={t.id || globalIndex}
                    data-testid={`timeline-row-${t.id}`}
                    className={`pb-6 ${globalIndex < treatmentSummary.length - 1 ? 'border-b border-[var(--bd)]' : ''}`}>
                    {/* Modal-level edit button — OUTSIDE the panel (AV38 read-only contract) */}
                    {onEditTreatment && (
                      <div className="flex justify-end mb-2">
                        <button
                          onClick={() => { onClose?.(); onEditTreatment(t.id); }}
                          data-testid={`timeline-edit-${t.id}`}
                          className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded transition-all hover:bg-[var(--bg-hover)]"
                          style={{ color: '#2EC4B6' }}>
                          <Edit3 size={11} /> แก้ไขรูป
                        </button>
                      </div>
                    )}
                    {/* Read-only panel — handles own lightbox, images, meta, items */}
                    <TreatmentReadOnlyPanel
                      treatmentSummary={t}
                      treatmentFull={fullDoc}
                      treatmentsLoading={treatmentsLoading}
                      theme={theme}
                      accentColor={ac}
                      isLatest={isLatest}
                      showCloseButton={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer (count info) */}
        <div className="px-6 py-3 border-t border-[var(--bd)] flex items-center justify-between text-xs text-[var(--tx-muted)]">
          <span>แสดงทั้งหมด {totalCount} ครั้ง · เรียงจากใหม่ไปเก่า</span>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-bold border border-[var(--bd)] hover:bg-[var(--bg-hover)] text-[var(--tx-secondary)] transition-all">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
