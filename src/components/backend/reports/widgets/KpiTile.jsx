// src/components/backend/reports/widgets/KpiTile.jsx — Phase 16.2 / extended 16.2-bis
import { ChevronRight } from 'lucide-react';
import MetricExplanationPopover from './MetricExplanationPopover.jsx';

/**
 * Single-number KPI tile with optional sublabel + drilldown link.
 *
 * Phase 16.2-bis (2026-04-29): accepts `metricSpec` prop and renders an Info
 * icon next to the label. Hover/tap surfaces a popover explaining what the
 * metric means + how it's computed + whether it respects branch filter.
 * Spec lookup is `getMetricSpec(id)` from clinicReportMetricSpecs.js — caller
 * passes the resolved spec object (or null to suppress the icon).
 *
 * @param {object} p
 * @param {string} p.label
 * @param {number|string|null} p.value         — formatted value (caller does fmt)
 * @param {string} [p.sublabel]                — small secondary line
 * @param {string} [p.tone='default']          — 'default'|'positive'|'negative'|'warn'
 * @param {string|null} [p.drilldownTabId]     — non-null → ดูรายละเอียด link
 * @param {(tabId: string) => void} [p.onNavigate]
 * @param {object|null} [p.metricSpec]         — Phase 16.2-bis: ClinicReportMetricSpec for popover
 */
export default function KpiTile({ label, value, sublabel, tone = 'default', drilldownTabId, onNavigate, metricSpec }) {
  const toneCls = ({
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warn:     'text-amber-300',
    default:  'text-cyan-300',
  })[tone] || 'text-cyan-300';

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3 flex flex-col gap-1" data-testid={`kpi-tile-${label}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] flex items-center gap-1">
        <span>{label}</span>
        <MetricExplanationPopover spec={metricSpec} testId={`kpi-${metricSpec?.id || label}`} />
      </div>
      <div className={`text-xl font-black tabular-nums ${toneCls}`}>{value === null || value === undefined ? '—' : value}</div>
      {sublabel && <div className="text-[10px] text-[var(--tx-muted)]">{sublabel}</div>}
      {drilldownTabId && (
        <button
          type="button"
          onClick={() => onNavigate?.(drilldownTabId)}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 mt-1"
          data-drilldown-target={drilldownTabId}
        >
          ดูรายละเอียด <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}
