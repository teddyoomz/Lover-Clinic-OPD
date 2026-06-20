// FillerGraphic2D — realistic anatomical 2D (mushroom: shaft → sulcus → corona → glans).
// Clinical/medical style (non-explicit). Shaft scales from shaft girth; glans bulb scales
// SEPARATELY from glans diameter. Presentational only — numbers come from `est`. Theme-aware.
// v5.4: AUTO-SCALE — three flex sections (side-view SVG · cross-section SVG · HTML legend) that
//       DISTRIBUTE to fill the card height on every device (no dead bands). Side-view auto-stretches
//       length→width; cross-section scales with the container; legend is real HTML (never overflows).
import { diameterFromGirth, RANGES } from '../lib/fillerMath.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shaftHalfT = (d) => clamp(22 + (d - 2) * 14, 16, 64); // shaft Ø → px (fills the side band)
const glansHalfT = (d) => clamp(24 + (d - 2) * 15, 18, 78); // glans Ø → px (separate)

const SIDE_W = 480;   // side-view viewBox width
const SIDE_H = 168;   // side-view viewBox height (tight band — minimal dead space)
const SIDE_CY = 84;   // shape centered in the band
const X0 = 30;        // shaft start x
const GAP = 7;        // sulcus gap
const RIGHT_MARGIN = 14;
const MIN_SHAFT = 150; // shaft px at the shortest length

function mushPath(x0, cy, len, tShaft, tGlans, glansLen) {
  const xS = x0 + len;
  const xC = xS + GAP;
  const xT = xC + glansLen;
  return `M${x0} ${cy - tShaft}`
    + ` L${xS} ${cy - tShaft}`
    + ` Q${xS + 3} ${cy - tShaft * 0.72} ${xC} ${cy - tGlans}`
    + ` C${xC + glansLen * 0.45} ${cy - tGlans} ${xT} ${cy - tGlans * 0.5} ${xT} ${cy}`
    + ` C${xT} ${cy + tGlans * 0.5} ${xC + glansLen * 0.45} ${cy + tGlans} ${xC} ${cy + tGlans}`
    + ` Q${xS + 3} ${cy + tShaft * 0.72} ${xS} ${cy + tShaft}`
    + ` L${x0} ${cy + tShaft}`
    + ` Q${x0 - 16} ${cy} ${x0} ${cy - tShaft} Z`;
}

export default function FillerGraphic2D({ est, lengthCm = 12.7, theme = 'dark', t }) {
  const tr = typeof t === 'function' ? t : (k) => k; // i18n — EN mode translates all labels
  const d0 = est?.d0 ?? diameterFromGirth(10.4);
  const dLo = est?.d1Low ?? d0;
  const dg0 = est?.glans?.dg0 ?? d0;
  const dgLo = est?.glans?.visualLow ?? est?.glans?.dgLow ?? dg0;

  const lab = theme === 'light' ? '#5b6675' : '#9b938f';
  const labStrong = theme === 'light' ? '#1e293b' : '#ededed';
  // baseline (เดิม) edge — FAINT pale dash
  const beforeStroke = theme === 'light' ? 'rgba(15,23,42,0.21)' : 'rgba(255,255,255,0.25)';
  // centered-faint clinic watermark (theme-aware logo) — travels with any screenshot / SVG copy
  const wmLogo = theme === 'light' ? '/lover-clinic-logo-light.png' : '/lover-clinic-logo-dark.png';

  // side-view thicknesses + auto-stretch length→width (10in fills the band width)
  const cy = SIDE_CY;
  const x0 = X0;
  const tShaftA = shaftHalfT(dLo);
  const tShaftB = shaftHalfT(d0);
  const tGlansA = glansHalfT(dgLo);
  const tGlansB = glansHalfT(dg0);
  const glansLenA = tGlansA * 1.25;
  const glansLenB = tGlansB * 1.25;
  const lenFrac = clamp((lengthCm - RANGES.lengthCm[0]) / (RANGES.lengthCm[1] - RANGES.lengthCm[0]), 0, 1);
  const maxShaftLen = SIDE_W - x0 - RIGHT_MARGIN - GAP - glansLenA;
  const len = MIN_SHAFT + lenFrac * (maxShaftLen - MIN_SHAFT);

  // cross-section — BIG, auto-scales with diameter; own square viewBox, centered, container-scaled
  const csA = clamp(dLo * 18, 48, 100);
  const csB = clamp(d0 * 18, 48, 100);
  const ccx = 120;
  const ccy = 120;

  const sectionLabel = { fontSize: 14, color: lab };

  return (
    <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: 12 }}>
      <style>{`
        @keyframes fgRevBreathe { 0%{opacity:1} 38%{opacity:1} 62%{opacity:0} 72%{opacity:0} 100%{opacity:1} }
        @keyframes fgRevGlow { 0%{filter:drop-shadow(0 0 3px #ef4444) drop-shadow(0 0 6px #ef4444)} 38%{filter:drop-shadow(0 0 3px #ef4444) drop-shadow(0 0 6px #ef4444)} 55%{filter:none} 72%{filter:none} 100%{filter:drop-shadow(0 0 3px #ef4444) drop-shadow(0 0 6px #ef4444)} }
        .fg-revBreathe { animation: fgRevBreathe 3.6s ease-in-out infinite, fgRevGlow 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .fg-revBreathe { animation: none; } }
      `}</style>
      {/* side view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionLabel}>{tr('g2dSide')}</span>
        <svg viewBox={`0 0 ${SIDE_W} ${SIDE_H}`} width="100%" role="img" aria-label={tr('g2dAria')} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="fg-skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e0a98d" />
              <stop offset="0.45" stopColor="#c2825f" />
              <stop offset="1" stopColor="#7b4b37" />
            </linearGradient>
          </defs>
          {/* after — skin body (mushroom), SOLID + static (never animates) */}
          <path d={mushPath(x0, cy, len, tShaftA, tGlansA, glansLenA)} fill="url(#fg-skin)" />
          {/* after — red DASHED outline ONLY (fill:none) → breathe+glow animates the LINE, not the body */}
          <path d={mushPath(x0, cy, len, tShaftA, tGlansA, glansLenA)} fill="none" className="fg-revBreathe" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
          {/* corona ridge */}
          <path d={`M${x0 + len} ${cy - tShaftA + 2} Q${x0 + len + 5} ${cy} ${x0 + len} ${cy + tShaftA - 2}`} fill="none" stroke="#6e4030" strokeWidth="1.4" opacity="0.5" />
          {/* before (baseline) — fainter pale dashed mushroom */}
          <path d={mushPath(x0 + 2, cy, len - 4, tShaftB, tGlansB, glansLenB)} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />
          {/* clinic watermark — centered, faint, non-interactive */}
          <image href={wmLogo} x="192" y="66" width="96" height="36" opacity="0.1" preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>

      {/* cross-section (shaft) — own square SVG, container-scaled + centered */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={sectionLabel}>{tr('g2dCross')}</span>
        <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: 'min(62%, 250px)', margin: '0 auto' }}>
          <defs>
            <radialGradient id="fg-cs" cx="0.4" cy="0.34" r="0.75">
              <stop offset="0" stopColor="#e0a98d" />
              <stop offset="0.6" stopColor="#bd7c5b" />
              <stop offset="1" stopColor="#7b4b37" />
            </radialGradient>
          </defs>
          <circle cx={ccx} cy={ccy} r={csA} fill="url(#fg-cs)" />
          <circle cx={ccx} cy={ccy} r={csA} fill="none" className="fg-revBreathe" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
          <circle cx={ccx} cy={ccy} r={csB} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />
          {/* clinic watermark — centered, faint, non-interactive */}
          <image href={wmLogo} x="78" y="104" width="84" height="32" opacity="0.1" preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>

      {/* legend — HTML (i18n, color-keyed, never overflows on any device) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.4 }}>
        <span style={{ color: '#ef4444' }}>{tr('g2dLegShaft')}</span>
        <span style={{ color: '#f59e0b' }}>{tr('g2dLegGlans')}</span>
        <span style={{ color: labStrong }}>{tr('g2dLegKey')}</span>
      </div>
    </div>
  );
}
