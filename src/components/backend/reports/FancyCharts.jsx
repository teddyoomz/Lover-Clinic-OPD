// ─── FancyCharts — collection of pure-SVG zero-dep animated charts ────────
// Exports:
//   <AreaSparkline data={[{label,value}]} stroke="#06b6d4" />
//     → animated area chart; gradient fill + path draw-in + hover spotlight
//   <RadialBars data={[{label,value,color}]} />
//     → radial bars (bar length ∝ value, angular position = rank) — modern
//       alternative to pie; avoids "too many tiny slices" pie anti-pattern
//   <ProgressBullet data={{label,value,max,color}} />
//     → single KPI bullet with target line; animated fill on mount
//
// All pure SVG, no external library. Zero bundle impact vs recharts (~30KB).
// CSS-var-aware (--tx-primary / --tx-muted / --bd / --bg-card / --bg-hover)
// for dark/light theme.

import { useMemo, useState, useEffect, useRef } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   AreaSparkline — time-series area chart with draw-in + hover probe
   ───────────────────────────────────────────────────────────────────────── */
export function AreaSparkline({
  data = [],
  width = 600, height = 120,
  stroke = '#10b981',
  strokeWidth = 2,
  fillOpacity = 0.2,
  showDots = true,
  onPointHover,
  formatValue = (v) => v.toLocaleString('th-TH'),
  formatLabel = (l) => l,
  ariaLabel = 'trend chart',
}) {
  const [mounted, setMounted] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  const padX = 12, padY = 18;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const values = data.map(d => Number(d.value) || 0);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const min = 0;
  const range = Math.max(1, max - min);

  const points = useMemo(() => data.map((d, i) => {
    const x = padX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padY + chartH - ((Number(d.value) || 0) - min) / range * chartH;
    return { x, y, label: d.label, value: Number(d.value) || 0, idx: i };
  }), [data, padX, padY, chartW, chartH, min, range]);

  // Build smooth path via cubic Bezier through points
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const cx1 = p0.x + (p1.x - p0.x) / 2;
      const cx2 = p0.x + (p1.x - p0.x) / 2;
      path += ` C ${cx1} ${p0.y} ${cx2} ${p1.y} ${p1.x} ${p1.y}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (!linePath) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${padY + chartH} L ${first.x} ${padY + chartH} Z`;
  }, [linePath, points, padY, chartH]);

  // pathLength fallback for drawin animation
  const [pathLen, setPathLen] = useState(1000);
  const pathRef = useRef(null);
  useEffect(() => {
    if (pathRef.current) {
      const L = pathRef.current.getTotalLength?.() ?? 1000;
      setPathLen(L);
    }
  }, [linePath]);

  const gradId = useMemo(() => 'fsl-grad-' + Math.random().toString(36).slice(2, 8), []);

  const handleMouseMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * width;
    // find nearest point
    let nearest = 0, bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - xRel);
      if (d < bestDist) { bestDist = d; nearest = i; }
    }
    setHoverIdx(nearest);
    onPointHover?.(points[nearest]);
  };

  return (
    <div className="relative" data-testid="area-sparkline">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverIdx(null); onPointHover?.(null); }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={fillOpacity * 2} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* gridlines (subtle) */}
        {[0.25, 0.5, 0.75].map(pct => (
          <line
            key={pct}
            x1={padX}
            x2={width - padX}
            y1={padY + chartH * pct}
            y2={padY + chartH * pct}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="2 3"
          />
        ))}

        {/* area fill */}
        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradId})`}
            opacity={mounted ? 1 : 0}
            style={{ transition: 'opacity 600ms ease' }}
          />
        )}

        {/* stroke with draw-in animation */}
        {linePath && (
          <path
            ref={pathRef}
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={pathLen}
            strokeDashoffset={mounted ? 0 : pathLen}
            style={{ transition: 'stroke-dashoffset 1000ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        )}

        {/* dots */}
        {showDots && points.map(p => {
          const isHover = hoverIdx === p.idx;
          return (
            <circle
              key={p.idx}
              cx={p.x} cy={p.y}
              r={isHover ? 4 : 2}
              fill={stroke}
              stroke="var(--bg-card)"
              strokeWidth={isHover ? 2 : 1}
              opacity={mounted ? 1 : 0}
              style={{ transition: 'r 200ms, opacity 600ms ease' }}
            />
          );
        })}

        {/* hover vertical line */}
        {hoverIdx !== null && points[hoverIdx] && (
          <line
            x1={points[hoverIdx].x} x2={points[hoverIdx].x}
            y1={padY} y2={padY + chartH}
            stroke={stroke}
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}
      </svg>

      {/* hover tooltip */}
      {hoverIdx !== null && points[hoverIdx] && (
        <div
          className="absolute pointer-events-none px-2 py-1 rounded-md text-[10px] font-bold tabular-nums shadow-lg"
          style={{
            left: `${(points[hoverIdx].x / width) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-card)',
            border: '1px solid var(--bd)',
            color: 'var(--tx-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ color: stroke }}>{formatValue(points[hoverIdx].value)}</div>
          <div className="text-[9px]" style={{ color: 'var(--tx-muted)' }}>{formatLabel(points[hoverIdx].label)}</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RadialBars — radial bar chart (bar length ∝ value, angular = rank).
   More readable than pie when many categories (avoids tiny-slice noise).
   ───────────────────────────────────────────────────────────────────────── */
export function RadialBars({
  data = [],
  size = 260,
  gap = 4,
  maxBarWidth = 14,
  palette = ['#06b6d4','#10b981','#8b5cf6','#f59e0b','#ec4899','#14b8a6','#6366f1','#84cc16','#f97316','#0ea5e9','#d946ef','#22c55e'],
  onBarClick,
  title = '',
  formatValue = (v) => v.toLocaleString('th-TH'),
}) {
  const [mounted, setMounted] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  const cx = size / 2, cy = size / 2;
  const count = Math.min(data.length, 10); // cap at 10 for visual clarity
  const maxValue = data.length > 0 ? Math.max(...data.map(d => Number(d.value) || 0), 1) : 1;
  const maxR = size / 2 - 20; // leave padding for labels
  const innerR = Math.max(20, maxR - count * (maxBarWidth + gap));

  const items = useMemo(() => data.slice(0, count).map((d, i) => {
    const val = Math.max(0, Number(d.value) || 0);
    const pct = val / maxValue;
    const r = innerR + (count - 1 - i) * (maxBarWidth + gap) + maxBarWidth / 2;
    return {
      ...d,
      idx: i,
      value: val,
      pct,
      radius: r,
      color: d.color || palette[i % palette.length],
    };
  }), [data, count, maxValue, innerR, maxBarWidth, gap, palette]);

  // Each bar is an arc from 135° start, sweep = pct * 270°
  const startDeg = 135;
  const maxSweep = 270;

  return (
    <div className="flex flex-col items-center" data-testid="radial-bars">
      {title && (
        <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">{title}</div>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title || 'radial bars'}>
        {/* Track rings (subtle, full sweep) */}
        {items.map(it => {
          const trackPath = arcLinePath(cx, cy, it.radius, startDeg, startDeg + maxSweep);
          return (
            <path
              key={`track-${it.idx}`}
              d={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={maxBarWidth}
              strokeLinecap="round"
            />
          );
        })}
        {/* Bars */}
        {items.map(it => {
          const sweepNow = mounted ? maxSweep * it.pct : 0;
          const barPath = arcLinePath(cx, cy, it.radius, startDeg, startDeg + sweepNow);
          const isHover = hoverIdx === it.idx;
          return (
            <g key={it.idx}
               onMouseEnter={() => setHoverIdx(it.idx)}
               onMouseLeave={() => setHoverIdx(null)}
               onClick={() => onBarClick?.(it)}
               style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
              <path
                d={barPath || 'M 0 0'}
                fill="none"
                stroke={it.color}
                strokeWidth={maxBarWidth}
                strokeLinecap="round"
                opacity={hoverIdx !== null && !isHover ? 0.4 : 1}
                style={{
                  transition: 'd 800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
                }}
              />
              {/* Invisible wider hit region */}
              <path
                d={arcLinePath(cx, cy, it.radius, startDeg, startDeg + maxSweep)}
                fill="none"
                stroke="transparent"
                strokeWidth={maxBarWidth + 6}
                strokeLinecap="round"
                style={{ pointerEvents: 'stroke' }}
              />
            </g>
          );
        })}
        {/* Center label */}
        {hoverIdx !== null && items[hoverIdx] && (
          <g>
            <text x={cx} y={cy - 4} textAnchor="middle"
              style={{ fill: 'var(--tx-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {items[hoverIdx].label?.slice(0, 20) || ''}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle"
              style={{ fill: 'var(--tx-primary)', fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(items[hoverIdx].value)}
            </text>
            <text x={cx} y={cy + 30} textAnchor="middle"
              style={{ fill: 'var(--tx-muted)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
              {(items[hoverIdx].pct * 100).toFixed(1)}% ของสูงสุด
            </text>
          </g>
        )}
        {hoverIdx === null && items.length > 0 && (
          <g>
            <text x={cx} y={cy + 4} textAnchor="middle"
              style={{ fill: 'var(--tx-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              สูงสุด
            </text>
            <text x={cx} y={cy + 24} textAnchor="middle"
              style={{ fill: 'var(--tx-primary)', fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(items[0]?.value ?? 0)}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] w-full max-w-xs">
        {items.map(it => {
          const isHover = hoverIdx === it.idx;
          return (
            <button key={it.idx} type="button"
              onClick={() => onBarClick?.(it)}
              onMouseEnter={() => setHoverIdx(it.idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className={`flex items-center gap-2 py-0.5 text-left transition-opacity ${
                hoverIdx !== null && !isHover ? 'opacity-40' : 'opacity-100'
              } ${onBarClick ? 'cursor-pointer' : ''}`}
              data-testid={`radial-legend-${it.idx}`}>
              <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: it.color }} />
              <span className="truncate text-[var(--tx-secondary)]">{it.label}</span>
              <span className="ml-auto tabular-nums text-[var(--tx-muted)] text-[10px]">
                {(it.pct * 100).toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ProgressBullet — KPI bar with target indicator. Drops in place of
   plain horizontal-bar section; animated fill on mount.
   ───────────────────────────────────────────────────────────────────────── */
export function ProgressBullet({
  label, value, max, target = null, color = '#10b981',
  formatValue = (v) => v.toLocaleString('th-TH'),
  height = 24,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const safeMax = Math.max(1, Number(max) || 0);
  const safeValue = Math.min(safeMax, Math.max(0, Number(value) || 0));
  const pct = (safeValue / safeMax) * 100;
  const targetPct = target != null ? Math.min(100, Math.max(0, (target / safeMax) * 100)) : null;

  return (
    <div className="w-full" data-testid="progress-bullet">
      <div className="flex items-baseline justify-between text-[10px] mb-1">
        <span className="text-[var(--tx-secondary)] font-bold truncate">{label}</span>
        <span className="tabular-nums text-[var(--tx-primary)] font-black ml-2">{formatValue(safeValue)}</span>
      </div>
      <div className="relative rounded-full overflow-hidden" style={{ height, background: 'var(--bg-hover)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: mounted ? `${pct}%` : '0%',
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 0 12px -2px ${color}99`,
          }}
        />
        {targetPct != null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white/70"
            style={{ left: `${targetPct}%` }}
            title={`เป้าหมาย: ${formatValue(target)}`}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Internal helpers ───────────────────────────────────────────────────── */

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Arc as a stroke path (not filled) — used for radial bars.
function arcLinePath(cx, cy, r, startDeg, endDeg) {
  const sweep = endDeg - startDeg;
  if (Math.abs(sweep) < 0.001) return '';
  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, r, startDeg);
  const p2 = polarToCartesian(cx, cy, r, endDeg);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}
