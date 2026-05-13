import React from 'react';
import { Loader2, Printer } from 'lucide-react';
import { TreatmentDetailExpanded } from './TreatmentDetailComponents.jsx';

/**
 * Phase 28 Task 5 (2026-05-14) — expanded body for a treatment row.
 *
 * Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
 *   § 4.7 Expanded body
 *
 * Renders inside the children slot of an expanded TreatmentHistoryRow:
 *   1. CC/DX callout (only when at least one of cc/dx is present)
 *      — full bg + left border accent + 2-column layout
 *   2. TreatmentDetailExpanded body (existing CDV component — preserved)
 *   3. Per-treatment print buttons (cert + record)
 *
 * Does NOT render edit/delete chips — those stay on the collapsed row
 * (R-Row chip block per spec § 4.7).
 *
 * Container offset accounts for parent row's grid (-mx-[15px] bleeds the
 * background under the fire-red border accent of the row card).
 *
 * @param {object}   props
 * @param {object}   props.t                  treatmentSummary entry (id, cc, dx)
 * @param {object|null} props.detail          full treatment detail or null while loading
 * @param {string}   props.ac                 accent colour (theme)
 * @param {string}   props.acRgb              accent RGB triplet (theme)
 * @param {boolean}  props.isDark             theme flag for med-cert chip palette
 * @param {boolean}  props.treatmentsLoading  shows loading skeleton when no detail yet
 * @param {function} props.onPrintCert        (treatmentId) => void
 * @param {function} props.onPrintRecord      (treatmentId) => void
 */
export function TreatmentHistoryExpandedBody({
  t,
  detail,
  ac,
  acRgb,
  isDark,
  treatmentsLoading,
  onPrintCert,
  onPrintRecord,
}) {
  return (
    <div className="mt-3.5 p-4 pl-[78px] -mx-[15px] border-t border-dashed border-red-950/40 bg-black/20 rounded-b-md">
      {/* CC/DX callout — full bg + left fire-red accent */}
      {(t.cc || t.dx) && (
        <div className="flex gap-2 mb-3.5 px-3 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a]
          border-l-[3px] border-l-red-500/50 rounded-md">
          {t.cc && (
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-0.5">
                CC · อาการ
              </div>
              <div className="text-xs text-[var(--tx-primary)] leading-relaxed">{t.cc}</div>
            </div>
          )}
          {t.dx && (
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-red-300 mb-0.5">
                DX · วินิจฉัย
              </div>
              <div className="text-xs text-[var(--tx-primary)] leading-relaxed">{t.dx}</div>
            </div>
          )}
        </div>
      )}

      {/* Treatment detail content (existing TreatmentDetailExpanded — preserved) */}
      {treatmentsLoading && !detail ? (
        <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-2">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> กำลังโหลด...
        </div>
      ) : detail?.detail ? (
        <TreatmentDetailExpanded detail={detail.detail} ac={ac} acRgb={acRgb} isDark={isDark} />
      ) : (
        <div className="bg-[var(--bg-elevated)] rounded-lg p-3 space-y-2">
          <p className="text-xs text-[var(--tx-muted)]">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</p>
        </div>
      )}

      {/* Per-treatment print buttons */}
      <div className="flex flex-wrap gap-2 mt-3.5">
        <button
          type="button"
          onClick={() => onPrintCert?.(t.id)}
          data-testid={`treatment-print-cert-${t.id}`}
          className="text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5
            bg-sky-500/10 border border-sky-500/40 text-sky-300 hover:bg-sky-500/20 transition-all"
        >
          <Printer size={12} aria-hidden="true" /> พิมพ์ใบรับรองแพทย์ ▾
        </button>
        <button
          type="button"
          onClick={() => onPrintRecord?.(t.id)}
          data-testid={`treatment-print-record-${t.id}`}
          className="text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5
            bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 transition-all"
        >
          <Printer size={12} aria-hidden="true" /> พิมพ์การรักษา ▾
        </button>
      </div>
    </div>
  );
}
