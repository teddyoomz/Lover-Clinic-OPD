// src/components/backend/reports/widgets/KpiTile.jsx — Phase 16.2
import { ChevronRight } from 'lucide-react';

/**
 * Single-number KPI tile with optional sublabel + drilldown link.
 *
 * @param {object} p
 * @param {string} p.label
 * @param {number|string|null} p.value         — formatted value (caller does fmt)
 * @param {string} [p.sublabel]                — small secondary line
 * @param {string} [p.tone='default']          — 'default'|'positive'|'negative'|'warn'
 * @param {string|null} [p.drilldownTabId]     — non-null → ดูรายละเอียด link
 * @param {(tabId: string) => void} [p.onNavigate]
 */
export default function KpiTile({ label, value, sublabel, tone = 'default', drilldownTabId, onNavigate }) {
  const toneCls = ({
    positive: 'text-emerald-300',
    negative: 'text-rose-300',
    warn:     'text-amber-300',
    default:  'text-cyan-300',
  })[tone] || 'text-cyan-300';

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3 flex flex-col gap-1" data-testid={`kpi-tile-${label}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">{label}</div>
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
