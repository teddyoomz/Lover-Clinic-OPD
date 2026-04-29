// src/components/backend/reports/widgets/RankedTableWidget.jsx — Phase 16.2 / extended 16.2-bis
import { ChevronRight } from 'lucide-react';
import MetricExplanationPopover from './MetricExplanationPopover.jsx';

/**
 * Top-N ranked list. Click "ดูทั้งหมด" → existing detail tab.
 *
 * Phase 16.2-bis (2026-04-29): accepts `metricSpec` prop. Info icon renders
 * next to the title with hover/tap popover explaining the metric.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {Array<{name?: string, staffName?: string, revenue?: number, total?: number, value?: number, count?: number, qty?: number}>} p.rows
 * @param {{ value: string, qty?: string }} [p.fmtKeys] — which keys to show
 * @param {string|null} [p.drilldownTabId]
 * @param {(tabId: string) => void} [p.onNavigate]
 * @param {(n: number) => string} [p.fmtMoney]
 * @param {string} [p.testId]
 * @param {object|null} [p.metricSpec] — Phase 16.2-bis: ClinicReportMetricSpec for popover
 */
export default function RankedTableWidget({
  title, rows = [], fmtKeys = { value: 'revenue', qty: 'count' },
  drilldownTabId, onNavigate, fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH'),
  testId, metricSpec,
}) {
  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid={testId || `ranked-${title}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 inline-flex items-center gap-1">
          <span>{title}</span>
          <MetricExplanationPopover spec={metricSpec} testId={`ranked-${metricSpec?.id || title}`} />
        </h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
            data-drilldown-target={drilldownTabId}
          >
            ดูทั้งหมด <ChevronRight size={10} />
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <ol className="space-y-1">
          {rows.slice(0, 10).map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <span className="text-[var(--tx-muted)] tabular-nums w-5 text-right">{i + 1}.</span>
              <span className="flex-1 truncate text-[var(--tx-primary)]">{r.name || r.staffName || '—'}</span>
              <span className="font-bold text-amber-300 tabular-nums">{fmtMoney(r[fmtKeys.value] ?? r.total ?? 0)}</span>
              {r[fmtKeys.qty] != null && <span className="text-[10px] text-[var(--tx-muted)] tabular-nums">×{r[fmtKeys.qty]}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
