// FillerGraphic2D — realistic anatomical 2D (mushroom: shaft → sulcus → corona → glans).
// Clinical/medical style (non-explicit). Shaft scales from shaft girth; glans bulb scales
// SEPARATELY from glans diameter. Presentational only — numbers come from `est`. Theme-aware.
// v5.4: AUTO-SCALE — three flex sections (side-view SVG · cross-section SVG · HTML legend) that
//       DISTRIBUTE to fill the card height on every device (no dead bands). Side-view auto-stretches
//       length→width; cross-section scales with the container; legend is real HTML (never overflows).
import { useState } from 'react';
import { diameterFromGirth, RANGES } from '../lib/fillerMath.js';

const GLANS_LEN_RATIO = 1.25; // glans length ÷ glans HALF-thickness (mushroom shape — unchanged from old)
const S_VPAD = 6;             // px vertical padding inside the band

const SIDE_W = 480;   // side-view viewBox width
const SIDE_H = 168;   // side-view viewBox height (tight band — minimal dead space)
const SIDE_CY = 84;   // shape centered in the band
const X0 = 30;        // shaft start x
const GAP = 7;        // sulcus gap
const RIGHT_MARGIN = 14;
const DASH_OUT = 3;    // px the red "หลังฉีด" dashed outline sits OUTSIDE the body edge (hugs the outer edge, never overlaps the real silhouette)
const MIN_SHAFT = 150; // shaft px at the shortest length (length auto-fill floor — short isn't tiny)
const THICK_BASE = 26; // base px-per-cm for thickness — generous (typical Ø3.3 → ~86px full, the old beloved look)
const CS_MAX_R = 100;  // cross-section: the AFTER circle radius that FILLS the 240 viewBox (at large girth)
const CS_BASE = 44;    // cross-section px-per-cm — grows with girth; caps-at-fill near Ø4.5 (typical Ø3.3 → r≈73)

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

// dashed-line toggle chip — doubles as the legend (dashed swatch + label); ≥44px tap target.
function DashToggle({ on, onClick, line, dash, label, accent, labStrong, lab }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '8px 12px',
        borderRadius: 9, cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        border: `1px solid ${on ? accent + '66' : 'rgba(255,255,255,0.12)'}`,
        background: on ? accent + '14' : 'transparent',
        color: on ? labStrong : lab, opacity: on ? 1 : 0.5, fontSize: 12, lineHeight: 1,
        transition: 'opacity .15s, border-color .15s, background .15s',
      }}>
      <svg width="22" height="6" aria-hidden="true" style={{ flex: 'none' }}>
        <line x1="1" y1="3" x2="21" y2="3" stroke={line} strokeWidth="2" strokeDasharray={dash} strokeOpacity={on ? 1 : 0.55} />
      </svg>
      {label}
    </button>
  );
}

export default function FillerGraphic2D({ est, lengthCm = 12.7, theme = 'dark', t }) {
  const tr = typeof t === 'function' ? t : (k) => k; // i18n — EN mode translates all labels
  const [showAfter, setShowAfter] = useState(true);     // default ON — red dashed "หลังฉีด" outline shown by default (toggle to hide)
  const [showBaseline, setShowBaseline] = useState(true); // toggle faint dashed "เดิม" outline
  const d0 = est?.d0 ?? diameterFromGirth(10.4);
  const dLo = est?.d1Low ?? d0;
  const dg0 = est?.glans?.dg0 ?? d0;
  const dgLo = est?.glans?.visualLow ?? dg0;

  const lab = theme === 'light' ? '#5b6675' : '#9b938f';
  const labStrong = theme === 'light' ? '#1e293b' : '#ededed';
  // baseline (เดิม) edge — soft pale dash (alpha 0.35, both themes)
  const beforeStroke = theme === 'light' ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.75)';
  // dashed-line thickness — theme-tuned (user 2026-06-21): dark baseline −10%, light "หลังฉีด" +15%
  const baselineStrokeW = 1.2375;                             // both themes −10% (light reduced to match dark)
  const afterStrokeW = theme === 'light' ? 1.07525 : 0.85;    // light +15% then +10% (0.85 × 1.265) · dark 0.85
  // centered-faint clinic watermark (theme-aware logo) — travels with any screenshot / SVG copy
  const wmLogo = theme === 'light' ? '/lover-clinic-logo-light.png' : '/lover-clinic-logo-dark.png';

  // Model B (space-maximised): LENGTH auto-fills the box width (10in = full); THICKNESS grows with the
  // value at ONE proportional scale (→ glans Ø : shaft Ø EXACT), auto-shrinking BOTH together only if the
  // biggest Ø would overflow the band (so it never clips, ratio preserved); glans length ∝ glans
  // HALF-thickness (old mushroom shape). Cross-section auto-fills its box. (spec 2026-06-21 — Model B)
  const cy = SIDE_CY;
  const x0 = X0;
  // thickness — one scale for BOTH Ø; grows with value, never clips the band
  const maxHalf = SIDE_H / 2 - (S_VPAD + DASH_OUT);                     // band half-budget (room for the dashed outset)
  const thickScale = Math.min(THICK_BASE, (maxHalf * 2) / Math.max(dLo, dgLo, 0.1)); // px per cm (thickness)
  const tShaftA = (dLo / 2) * thickScale;
  const tGlansA = (dgLo / 2) * thickScale;
  const glansLenA = tGlansA * GLANS_LEN_RATIO;                          // old mushroom shape (length ∝ half-thickness)
  const tShaftB = (d0 / 2) * thickScale;
  const tGlansB = (dg0 / 2) * thickScale;
  const glansLenB = tGlansB * GLANS_LEN_RATIO;
  // length — auto-fill the box width (10in fills; short floors at MIN_SHAFT)
  const lenFrac = Math.max(0, Math.min(1, (lengthCm - RANGES.lengthCm[0]) / (RANGES.lengthCm[1] - RANGES.lengthCm[0])));
  const maxShaftLen = SIDE_W - x0 - RIGHT_MARGIN - GAP - glansLenA;
  const len = MIN_SHAFT + lenFrac * (maxShaftLen - MIN_SHAFT);
  const lenB = len;

  // cross-section (shaft only) — GROWS with girth (one scale, caps at the box); after:before radius == dLo:d0 exact
  const csScale = Math.min(CS_BASE, (CS_MAX_R * 2) / Math.max(dLo, 0.1));
  const csA = (dLo / 2) * csScale;
  const csB = (d0 / 2) * csScale;
  const ccx = 120;
  const ccy = 120;

  const sectionLabel = { fontSize: 14, color: lab };

  return (
    <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: 12 }}>
      <style>{`
        @keyframes fgRevBreathe { 0%,35%{opacity:1} 50%{opacity:0} 79%{opacity:0} 90%,100%{opacity:1} }
        .fg-revBreathe { animation: fgRevBreathe 3.4s ease-in-out infinite; }
        @keyframes fgAnts { to { stroke-dashoffset: -9; } }
        .fg-ants { animation: fgAnts 0.6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .fg-revBreathe, .fg-ants { animation: none; } }
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
          {/* after — red DASHED outline, OUTSET by DASH_OUT so it hugs the OUTER edge (never overlaps the body); breathe = opacity pulse on the LINE */}
          {showAfter && <path d={mushPath(x0 - DASH_OUT, cy, len + DASH_OUT, tShaftA + DASH_OUT, tGlansA + DASH_OUT, glansLenA + DASH_OUT)} fill="none" className="fg-revBreathe" stroke="#ef4444" strokeWidth={afterStrokeW} strokeDasharray="7 4" strokeOpacity="1" />}
          {/* corona ridge */}
          <path d={`M${x0 + len} ${cy - tShaftA + 2} Q${x0 + len + 5} ${cy} ${x0 + len} ${cy + tShaftA - 2}`} fill="none" stroke="#6e4030" strokeWidth="1.4" opacity="0.5" />
          {/* before (baseline) — fainter pale dashed mushroom */}
          {showBaseline && <path className="fg-ants" d={mushPath(x0, cy, lenB, tShaftB, tGlansB, glansLenB)} fill="none" stroke={beforeStroke} strokeWidth={baselineStrokeW} strokeDasharray="5 4" />}
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
          {showAfter && <circle cx={ccx} cy={ccy} r={csA + DASH_OUT} fill="none" className="fg-revBreathe" stroke="#ef4444" strokeWidth={afterStrokeW} strokeDasharray="7 4" strokeOpacity="1" />}
          {showBaseline && <circle className="fg-ants" cx={ccx} cy={ccy} r={csB} fill="none" stroke={beforeStroke} strokeWidth={baselineStrokeW} strokeDasharray="5 4" />}
          {/* clinic watermark — centered, faint, non-interactive */}
          <image href={wmLogo} x="78" y="104" width="84" height="32" opacity="0.1" preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>

      {/* legend + dash toggles — balanced row: color-keys (left) · dashed-line toggles (right,
          the circled corner) that DOUBLE as the เส้นประ legend. Auto-scales: flex-wrap on narrow,
          ≥44px tap targets on desktop/iPad/mobile. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, rowGap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, lineHeight: 1.4, minWidth: 0 }}>
          <span style={{ color: '#ef4444' }}>{tr('g2dLegShaft')}</span>
          <span style={{ color: '#f59e0b' }}>{tr('g2dLegGlans')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 10.5, color: lab, letterSpacing: '0.3px' }}>{tr('g2dDashToggleHint')}</span>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <DashToggle on={showAfter} onClick={() => setShowAfter((v) => !v)} line="#ef4444" accent="#ef4444" dash="4 3" label={tr('g2dToggleAfter')} labStrong={labStrong} lab={lab} />
            <DashToggle on={showBaseline} onClick={() => setShowBaseline((v) => !v)} line="#9b938f" accent="#9b938f" dash="5 4" label={tr('g2dToggleBaseline')} labStrong={labStrong} lab={lab} />
          </div>
        </div>
      </div>
    </div>
  );
}
