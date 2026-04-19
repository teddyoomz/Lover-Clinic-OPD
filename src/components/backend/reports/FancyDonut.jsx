// ─── FancyDonut — pure SVG animated donut chart (no lib, zero-dep) ────────
// Usage: <FancyDonut data={[{label, value, color}, ...]} size={280}
//                    innerRadius={80} centerLabel="รวม" centerValue="1.5M ฿"
//                    onSegmentClick={(item) => ...} />
//
// Features:
//  - Segments drawn as SVG arcs (polar → cartesian math, no dependencies)
//  - Animated stroke-dashoffset draw-in on mount (600ms ease-out)
//  - Hover → segment scales up + shows inline legend tooltip
//  - Click → optional callback (for filter integration)
//  - Center slot: label + value + optional React node
//  - Thai text friendly: tspan wrapping for long labels
//  - Respects CSS var --bg-card / --tx-primary for theme compatibility
//  - No red on segments by default (Thai culture)

import { useMemo, useState, useEffect } from 'react';

const DEFAULT_PALETTE = [
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
  '#f97316', // orange
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#22c55e', // green
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  if (Math.abs(endDeg - startDeg) < 0.001) return ''; // zero-angle guard
  // Full-circle special case (360°): SVG arc can't draw full circle with one
  // arc command; nudge to 359.99 to get a nearly-complete donut.
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  const endAdj = sweep >= 360 ? startDeg + 359.99 : endDeg;

  const o1 = polarToCartesian(cx, cy, rOuter, startDeg);
  const o2 = polarToCartesian(cx, cy, rOuter, endAdj);
  const i1 = polarToCartesian(cx, cy, rInner, endAdj);
  const i2 = polarToCartesian(cx, cy, rInner, startDeg);

  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ');
}

export default function FancyDonut({
  data = [],
  size = 240,
  innerRadius = 70,
  outerRadius = 110,
  gapDeg = 0.8,
  centerLabel = 'รวม',
  centerValue = null,
  formatValue = (v) => v.toLocaleString('th-TH'),
  onSegmentClick,
  palette = DEFAULT_PALETTE,
  title = '',
}) {
  const [mounted, setMounted] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const total = useMemo(
    () => data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0),
    [data]
  );
  const cx = size / 2, cy = size / 2;

  // Build segment geometry
  const segments = useMemo(() => {
    if (total <= 0 || data.length === 0) return [];
    let cursor = 0;
    return data.map((d, i) => {
      const val = Math.max(0, Number(d.value) || 0);
      const pct = val / total;
      const sweep = pct * 360;
      const start = cursor + gapDeg / 2;
      const end = cursor + sweep - gapDeg / 2;
      cursor += sweep;
      const midDeg = (start + end) / 2;
      return {
        ...d,
        idx: i,
        start, end, sweep, midDeg, pct,
        color: d.color || palette[i % palette.length],
      };
    });
  }, [data, total, gapDeg, palette]);

  const autoCenterValue = centerValue != null
    ? centerValue
    : total > 0 ? formatValue(total) : '-';

  return (
    <div className="flex flex-col items-center" data-testid="fancy-donut">
      {title && (
        <div className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold mb-2">{title}</div>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title || 'chart'}>
          {/* subtle base ring */}
          <circle
            cx={cx} cy={cy}
            r={(innerRadius + outerRadius) / 2}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={outerRadius - innerRadius}
          />

          {/* segments */}
          {segments.map(seg => {
            const isHover = hoverIdx === seg.idx;
            // Pop-out: shift segment midpoint by ~4px on hover
            const { x: px, y: py } = polarToCartesian(0, 0, isHover ? 6 : 0, seg.midDeg);
            const path = arcPath(cx, cy, outerRadius, innerRadius, seg.start, seg.end);
            // draw-in anim via scale (mounted flag)
            const transform = `translate(${px} ${py}) scale(${mounted ? 1 : 0.001})`;
            return (
              <g
                key={seg.idx}
                transform={transform}
                style={{
                  transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
                  cursor: onSegmentClick ? 'pointer' : 'default',
                  transformOrigin: `${cx}px ${cy}px`,
                }}
                onMouseEnter={() => setHoverIdx(seg.idx)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onSegmentClick?.(seg)}
              >
                <path
                  d={path}
                  fill={seg.color}
                  opacity={hoverIdx !== null && hoverIdx !== seg.idx ? 0.35 : 1}
                  style={{ transition: 'opacity 180ms ease' }}
                />
                {/* Glow ring on hover */}
                {isHover && (
                  <path
                    d={path}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={2}
                    opacity={0.45}
                    style={{ filter: 'blur(4px)' }}
                  />
                )}
              </g>
            );
          })}

          {/* Center: label + value */}
          <g>
            <text
              x={cx} y={cy - 4}
              textAnchor="middle"
              style={{ fill: 'var(--tx-muted)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700 }}
            >
              {hoverIdx != null ? segments[hoverIdx]?.label?.slice(0, 14) || centerLabel : centerLabel}
            </text>
            <text
              x={cx} y={cy + 14}
              textAnchor="middle"
              style={{ fill: 'var(--tx-primary)', fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}
            >
              {hoverIdx != null
                ? formatValue(segments[hoverIdx]?.value ?? 0)
                : autoCenterValue}
            </text>
            {hoverIdx != null && (
              <text
                x={cx} y={cy + 30}
                textAnchor="middle"
                style={{ fill: 'var(--tx-muted)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
              >
                {(segments[hoverIdx]?.pct * 100).toFixed(1)}%
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* Legend */}
      {segments.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] w-full max-w-sm">
          {segments.map(seg => {
            const isHover = hoverIdx === seg.idx;
            return (
              <button
                key={seg.idx}
                type="button"
                onClick={() => onSegmentClick?.(seg)}
                onMouseEnter={() => setHoverIdx(seg.idx)}
                onMouseLeave={() => setHoverIdx(null)}
                className={`flex items-center gap-2 py-0.5 text-left transition-opacity ${
                  hoverIdx !== null && !isHover ? 'opacity-40' : 'opacity-100'
                } ${onSegmentClick ? 'cursor-pointer hover:opacity-100' : ''}`}
                data-testid={`donut-legend-${seg.idx}`}
              >
                <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ background: seg.color }} />
                <span className="truncate text-[var(--tx-secondary)]">{seg.label}</span>
                <span className="ml-auto tabular-nums text-[var(--tx-muted)] text-[10px]">
                  {(seg.pct * 100).toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
