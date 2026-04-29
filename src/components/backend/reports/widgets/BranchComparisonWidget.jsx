// src/components/backend/reports/widgets/BranchComparisonWidget.jsx — Phase 16.2 / extended 16.2-bis
import MetricExplanationPopover from './MetricExplanationPopover.jsx';

/**
 * Per-branch revenue bar chart. Custom inline (no chart library).
 * Sorted desc by revenue.
 *
 * Phase 16.2-bis: accepts `metricSpec` for inline explanation popover.
 *
 * @param {object} p
 * @param {{ rows: Array<{branchId: string, branchName: string, revenue: number, saleCount: number}> }} p.data
 * @param {(n: number) => string} [p.fmtMoney]
 * @param {object|null} [p.metricSpec] — Phase 16.2-bis
 */
export default function BranchComparisonWidget({ data, fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH'), metricSpec }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-branch-comparison">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2 inline-flex items-center gap-1">
          <span>เปรียบเทียบสาขา</span>
          <MetricExplanationPopover spec={metricSpec} testId={`widget-${metricSpec?.id || 'branch-comparison'}`} />
        </h3>
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      </div>
    );
  }

  const max = Math.max(...rows.map(r => r.revenue), 1);

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-branch-comparison">
      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 mb-2 inline-flex items-center gap-1">
        <span>เปรียบเทียบสาขา</span>
        <MetricExplanationPopover spec={metricSpec} testId={`widget-${metricSpec?.id || 'branch-comparison'}`} />
      </h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.branchId} className="text-[11px]" data-branch-id={r.branchId}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[var(--tx-primary)] font-bold truncate">{r.branchName}</span>
              <span className="text-sky-300 tabular-nums">{fmtMoney(r.revenue)}</span>
            </div>
            <div className="h-2 rounded bg-[var(--bg-hover)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-700 to-sky-400"
                style={{ width: `${(r.revenue / max) * 100}%` }}
              />
            </div>
            <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{r.saleCount} sales</div>
          </div>
        ))}
      </div>
    </div>
  );
}
