import React from 'react';
import { ChevronDown, Edit3, Trash2 } from 'lucide-react';
import {
  getTreatmentLifecycle,
  getTreatmentStatusLabel,
  computeRowAction,
} from '../../../lib/treatmentDisplayResolvers.js';
import { formatBadgeTime } from '../../../lib/formatBadgeTime.js';
import { ROLE_LABEL_TH } from '../../../lib/roleLabels.js';
import { TreatmentLifecycleStepper } from './TreatmentLifecycleStepper.jsx';

/**
 * Phase 28 Task 4 (2026-05-14) — single treatment-history row.
 *
 * Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
 *   § 4.4 (Row collapsed) + chip block + § 4.7 expanded styling adjustments
 *
 * Collapsed (default): time + status + stepper + meta + cc/dx preview + chevron
 *                      + edit/delete chips (hover-fade desktop, mobile always-visible)
 * Expanded: above + fire-red left accent + tinted bg + chevron ▴ + children slot
 *           (CC/DX preview HIDDEN — callout in body slot supplements)
 *
 * Edit/delete chip click: e.stopPropagation prevents toggling expand
 * (preserves existing CDV.jsx:1197-1218 quick-action UX behavior).
 *
 * @param {object}   props
 * @param {object}   props.t                  treatmentSummary entry
 * @param {boolean}  props.isLatest           latest treatment (controls fire-red styling on time + ล่าสุด tag)
 * @param {boolean}  props.isExpanded         whether body slot is rendered
 * @param {function} props.onToggle           (treatmentId) => void; fires on row body click
 * @param {function} [props.onEditTreatment]  (treatmentId) => void; chip rendered iff present + isBackendCreated
 * @param {function} [props.onDeleteTreatment](treatmentId) => void; chip rendered iff present + isBackendCreated
 * @param {boolean}  [props.isDark=true]      theme (forwarded to stepper)
 * @param {boolean}  [props.isBackendCreated] whether row was created in our backend (gates edit/delete chips)
 * @param {React.ReactNode} [props.children]  expanded body slot (Task 5 supplies)
 */
export function TreatmentHistoryRow({
  t,
  isLatest = false,
  isExpanded = false,
  onToggle,
  onEditTreatment,
  onDeleteTreatment,
  isDark = true,
  isBackendCreated = false,
  children,
}) {
  const lifecycle = getTreatmentLifecycle(t);
  const status = getTreatmentStatusLabel(t, isLatest);
  const action = computeRowAction(lifecycle);

  // Time displayed in left column = earliest stage time (or '--:--' if none).
  // Lifecycle is sorted ascending by getTreatmentLifecycle, so [0] is the
  // earliest stage. For the test fixture (vitalsignsRecordedAt=04:13Z),
  // headerTime = 11:13 Bangkok.
  const headerTime = lifecycle[0]?.time ? formatBadgeTime(lifecycle[0].time) : '--:--';

  // Row container — gridded for consistent column alignment.
  // When expanded: fire-red left accent (3px) + tinted bg + adjusted padding-left
  // so total horizontal offset stays equal to collapsed (15+3=18 px).
  const rowClass = [
    'group grid grid-cols-[64px_1fr_24px] py-3 transition-colors cursor-pointer',
    isExpanded
      ? 'bg-gradient-to-b from-red-500/[0.025] to-red-500/[0.01] border-l-[3px] border-l-red-500 pl-[15px] pr-[18px]'
      : 'hover:bg-white/[0.015] px-[18px]',
    'border-b border-[#1a1a1a] last:border-b-0',
  ].join(' ');

  // Latest: fire-red glow on time. Default: secondary text.
  const timeClass = isLatest
    ? 'font-mono text-[13px] font-bold text-red-300 [text-shadow:_0_0_8px_rgba(239,68,68,0.4)] tracking-wider pt-px'
    : 'font-mono text-[13px] font-bold text-[var(--tx-secondary)] tracking-wider pt-px';

  const showActions = isBackendCreated && (onEditTreatment || onDeleteTreatment);

  return (
    <div data-testid={`treatment-row-${t.id}`} className={rowClass}>
      {/* Time column */}
      <div className={timeClass} data-testid="treatment-time">{headerTime}</div>

      {/* Content column — clickable to toggle expand */}
      <button
        type="button"
        onClick={() => onToggle?.(t.id)}
        data-testid={`treatment-toggle-${t.id}`}
        aria-expanded={isExpanded}
        className="text-left min-w-0 bg-transparent border-0 p-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[13px] font-bold text-[var(--tx-heading)] tracking-tight">{status}</span>
          {isLatest && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                bg-gradient-to-br from-red-500/25 to-red-500/15 text-red-300
                border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]"
            >
              ล่าสุด
            </span>
          )}
          <span
            className={`ml-auto font-mono text-[10px] font-semibold ${
              action.kind === 'completed' ? 'text-emerald-300' : 'text-[var(--tx-muted)]'
            }`}
            data-testid="treatment-row-action"
          >
            {action.label}
          </span>
        </div>

        <TreatmentLifecycleStepper lifecycle={lifecycle} isDark={isDark} isLatest={isLatest} />

        {/* Meta line */}
        {(t.doctor || t.branch || (t.assistants && t.assistants.length > 0) || t.editedByName) && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--tx-muted)]">
            {t.doctor && <span className="text-[var(--tx-primary)] font-semibold">{t.doctor}</span>}
            {t.branch && <span>· {t.branch}</span>}
            {t.assistants && t.assistants.length > 0 && <span>· {t.assistants.join(', ')}</span>}
            {t.editedByName && (
              <span
                className="italic opacity-70"
                data-testid={`treatment-edited-by-${t.id}`}
              >
                · แก้ไขโดย: {t.editedByName}
                {t.editedByRole && ROLE_LABEL_TH[t.editedByRole] && ` (${ROLE_LABEL_TH[t.editedByRole]})`}
              </span>
            )}
          </div>
        )}

        {/* CC/DX inline preview — collapsed state only.
            Expanded body (Task 5) renders the full callout with same data. */}
        {!isExpanded && (t.cc || t.dx) && (
          <div className="mt-1 flex flex-col gap-px text-[11px] text-[var(--tx-secondary)]">
            {t.cc && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--tx-muted)] mr-1">CC</span>
                <span>{t.cc}</span>
              </div>
            )}
            {t.dx && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--tx-muted)] mr-1">DX</span>
                <span>{t.dx}</span>
              </div>
            )}
          </div>
        )}
      </button>

      {/* Right column: chevron + edit/delete chips */}
      <div className="flex flex-col items-end gap-1">
        <div
          data-testid="treatment-chevron"
          className={`text-[var(--tx-muted)] text-xs font-bold transition-transform duration-200 ${
            isExpanded ? 'rotate-180 text-red-300' : ''
          }`}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        {showActions && (
          <div className="flex flex-col gap-1 opacity-70 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            {onEditTreatment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditTreatment(t.id); }}
                data-testid={`treatment-edit-${t.id}`}
                title="แก้ไข"
                aria-label="แก้ไขการรักษา"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center
                  bg-sky-500/[0.08] border border-sky-500/30 text-sky-300
                  hover:bg-sky-500/[0.18] transition-all"
              >
                <Edit3 size={11} aria-hidden="true" />
              </button>
            )}
            {onDeleteTreatment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteTreatment(t.id); }}
                data-testid={`treatment-delete-${t.id}`}
                title="ยกเลิก / ลบ"
                aria-label="ลบการรักษา"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center
                  bg-red-500/[0.08] border border-red-500/30 text-red-300
                  hover:bg-red-500/[0.18] transition-all"
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded body slot — passed by parent via children (Task 5 supplies) */}
      {isExpanded && children && (
        <div className="col-span-full">{children}</div>
      )}
    </div>
  );
}
