// src/components/backend/reports/widgets/RetentionHeatmapWidget.jsx — Phase 16.2
import { ChevronRight } from 'lucide-react';

/**
 * Cohort retention heatmap. Custom inline SVG (no chart library).
 *
 * @param {object} p
 * @param {{ rows: Array<{cohort: string, cohortSize: number, cells: number[]}>, overallRate: number }} p.data
 * @param {string|null} [p.drilldownTabId]
 * @param {(tabId: string) => void} [p.onNavigate]
 */
export default function RetentionHeatmapWidget({ data, drilldownTabId, onNavigate }) {
  const rows = data?.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-retention-cohort">
        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2">Retention cohort</h3>
        <p className="text-[10px] text-[var(--tx-muted)]">ไม่มีข้อมูลในช่วงเวลานี้</p>
      </div>
    );
  }

  const maxCols = Math.max(...rows.map(r => r.cells.length));
  const cellSize = 28;
  const padX = 80, padY = 24;
  const widthPx = padX + maxCols * cellSize + 8;
  const heightPx = padY + rows.length * cellSize + 8;

  // Color from value 0..100: red (low) → amber → cyan → emerald (high)
  const cellColor = (v) => {
    if (v == null || isNaN(v)) return 'rgba(120,120,120,0.1)';
    if (v < 20) return `rgba(200,80,80,${0.2 + v / 100})`;
    if (v < 50) return `rgba(255,170,80,${0.3 + v / 200})`;
    if (v < 80) return `rgba(80,180,200,${0.4 + v / 250})`;
    return `rgba(60,200,140,${0.5 + v / 300})`;
  };

  return (
    <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3" data-testid="widget-retention-cohort">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
          Retention cohort
          <span className="ml-2 text-[10px] font-normal text-[var(--tx-muted)]">overall {data.overallRate ?? 0}%</span>
        </h3>
        {drilldownTabId && (
          <button
            type="button"
            onClick={() => onNavigate?.(drilldownTabId)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
            data-drilldown-target={drilldownTabId}
          >
            ดูรายละเอียด <ChevronRight size={10} />
          </button>
        )}
      </div>
      <svg width={widthPx} height={heightPx} role="img" aria-label="Retention cohort heatmap" style={{ overflow: 'visible' }}>
        {/* Column headers (offsets) */}
        {Array.from({ length: maxCols }).map((_, ci) => (
          <text key={ci} x={padX + ci * cellSize + cellSize / 2} y={padY - 8} textAnchor="middle" fontSize="9" fill="var(--tx-muted)">+{ci}</text>
        ))}
        {rows.map((row, ri) => (
          <g key={row.cohort}>
            <text x={padX - 6} y={padY + ri * cellSize + cellSize / 2 + 3} textAnchor="end" fontSize="10" fill="var(--tx-primary)">{row.cohort}</text>
            <text x={padX - 6} y={padY + ri * cellSize + cellSize / 2 + 12} textAnchor="end" fontSize="8" fill="var(--tx-muted)">n={row.cohortSize}</text>
            {row.cells.map((v, ci) => (
              <g key={ci}>
                <rect
                  x={padX + ci * cellSize + 1}
                  y={padY + ri * cellSize + 1}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  rx={3}
                  fill={cellColor(v)}
                  stroke="rgba(255,255,255,0.05)"
                />
                <text
                  x={padX + ci * cellSize + cellSize / 2}
                  y={padY + ri * cellSize + cellSize / 2 + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill={v > 50 ? '#fff' : 'var(--tx-primary)'}
                  fontWeight={ci === 0 ? '700' : '400'}
                >{v}%</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
