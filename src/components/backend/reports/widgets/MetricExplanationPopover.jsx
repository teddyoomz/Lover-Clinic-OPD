// src/components/backend/reports/widgets/MetricExplanationPopover.jsx
// Phase 16.2-bis (2026-04-29 session 33)
//
// Shared Info-icon + hover popover used by every metric on tab=clinic-report
// (and reusable for Phase 16.7 ExpenseReportTab once it ships).
//
// Trigger: hover (desktop) or tap (mobile) the ⓘ icon. Popover renders inline,
// absolutely positioned to the right of the icon. Esc + click-outside close.
//
// Iron-clad refs:
//   C1 — Rule of 3: shared component reused 3+ surfaces (KpiTile,
//        RankedTableWidget, ChartTile + future ExpenseSectionTable)
//   V21 — popover content rendered in DOM (not just title attribute) so RTL
//        can assert the actual explanation text, not just the trigger shape
//   V14 — when spec is null/undefined, render NOTHING (no Info icon, no empty
//        popover) — caller treats null spec as "no explanation available"
//
// Usage:
//   <MetricExplanationPopover spec={spec} testId="kpi-revenueYtd" />
// where `spec` is a ClinicReportMetricSpec from clinicReportMetricSpecs.js.

import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

/**
 * @param {object} p
 * @param {import('../../../../lib/clinicReportMetricSpecs.js').ClinicReportMetricSpec | null} p.spec
 * @param {string} [p.testId]  — passed through to the trigger button
 */
export default function MetricExplanationPopover({ spec, testId }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  // Esc + click-outside close
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Graceful no-render when spec is null/undefined
  if (!spec) return null;

  const { label, explanation, dataSource, computation, branchAware } = spec;
  // Defensive: if spec exists but core fields are empty, still no-render
  if (!explanation && !dataSource && !computation) return null;

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`คำอธิบาย ${label || ''}`}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-[var(--tx-muted)] hover:text-cyan-300 inline-flex items-center"
        data-testid={testId ? `${testId}-info-trigger` : 'metric-info-trigger'}
        data-metric-id={spec.id || ''}
      >
        <Info size={11} />
      </button>
      {open && (
        <div
          ref={popRef}
          role="tooltip"
          className="absolute left-full top-0 ml-1 z-50 w-64 p-2 rounded-md border border-[var(--bd)] bg-[var(--bg-card)] shadow-lg text-[10px] leading-relaxed pointer-events-auto"
          data-testid={testId ? `${testId}-info-popover` : 'metric-info-popover'}
          data-metric-id={spec.id || ''}
          data-branch-aware={branchAware ? 'true' : 'false'}
        >
          {label && (
            <div className="text-[11px] font-bold text-cyan-300 mb-1">{label}</div>
          )}
          {explanation && (
            <div className="text-[var(--tx-primary)] mb-1.5" data-field="explanation">
              {explanation}
            </div>
          )}
          {dataSource && (
            <div className="text-[var(--tx-muted)] mb-0.5" data-field="dataSource">
              <span className="font-bold">แหล่งข้อมูล:</span> {dataSource}
            </div>
          )}
          {computation && (
            <div className="text-[var(--tx-muted)] mb-0.5" data-field="computation">
              <span className="font-bold">วิธีคำนวณ:</span> {computation}
            </div>
          )}
          {branchAware != null && (
            <div className="text-[9px] text-[var(--tx-muted)] mt-1 pt-1 border-t border-[var(--bd)]" data-field="branchAware">
              {branchAware
                ? '✓ เคารพ filter สาขา (multi-branch aware)'
                : '⚠ ไม่ filter ตามสาขา (รวมทุกสาขา)'}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
