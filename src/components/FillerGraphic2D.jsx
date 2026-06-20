// FillerGraphic2D — realistic anatomical 2D (mushroom: shaft → sulcus → corona → glans).
// Clinical/medical style (non-explicit). Shaft scales from shaft girth; glans bulb scales
// SEPARATELY from glans diameter. Presentational only — numbers come from `est`. Theme-aware.
// v5.3: bigger side-view (SMART auto-stretch to width) · fainter baseline dash · no reflection
//       highlight · BIG centered cross-section (auto-scales with diameter) + legend below.
import { diameterFromGirth, RANGES } from '../lib/fillerMath.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shaftHalfT = (d) => clamp(18 + (d - 2) * 12, 14, 60); // shaft Ø → px (bigger)
const glansHalfT = (d) => clamp(20 + (d - 2) * 13, 15, 76); // glans Ø → px (separate, bigger)

const VIEW_W = 480;   // viewBox width
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
  // baseline (เดิม) edge — FAINT pale dash (user: จางลงอีกหน่อย)
  const beforeStroke = theme === 'light' ? 'rgba(15,23,42,0.42)' : 'rgba(255,255,255,0.5)';

  const cy = 152;
  const x0 = X0;
  const tShaftA = shaftHalfT(dLo);
  const tShaftB = shaftHalfT(d0);
  const tGlansA = glansHalfT(dgLo);
  const tGlansB = glansHalfT(dg0);
  const glansLenA = tGlansA * 1.25;
  const glansLenB = tGlansB * 1.25;

  // SMART auto-stretch: length maps 0..1 over the real range; at MAX length the glans tip
  // lands exactly at the right margin (full viewBox width). Aspect kept by the SVG scaling.
  const lenFrac = clamp((lengthCm - RANGES.lengthCm[0]) / (RANGES.lengthCm[1] - RANGES.lengthCm[0]), 0, 1);
  const maxShaftLen = VIEW_W - x0 - RIGHT_MARGIN - GAP - glansLenA;
  const len = MIN_SHAFT + lenFrac * (maxShaftLen - MIN_SHAFT);

  // cross-section — BIG + centered, auto-scales with diameter (doctor explains girth gain to patient)
  const csA = clamp(dLo * 18, 48, 100);
  const csB = clamp(d0 * 18, 48, 100);
  const ccx = 240;
  const ccy = 372;

  return (
    <svg viewBox="0 0 480 552" width="100%" role="img"
         aria-label={tr('g2dAria')}>
      <defs>
        <linearGradient id="fg-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.45" stopColor="#c2825f" />
          <stop offset="1" stopColor="#7b4b37" />
        </linearGradient>
        <radialGradient id="fg-cs" cx="0.4" cy="0.34" r="0.75">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.6" stopColor="#bd7c5b" />
          <stop offset="1" stopColor="#7b4b37" />
        </radialGradient>
      </defs>

      <text x="8" y="26" fontSize="14" fill={lab}>{tr('g2dSide')}</text>

      {/* after — skin body (mushroom). Thin DASHED red, FAINT (low opacity) so the added band shows. */}
      <path d={mushPath(x0, cy, len, tShaftA, tGlansA, glansLenA)} fill="url(#fg-skin)" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
      {/* corona ridge */}
      <path d={`M${x0 + len} ${cy - tShaftA + 2} Q${x0 + len + 5} ${cy} ${x0 + len} ${cy + tShaftA - 2}`} fill="none" stroke="#6e4030" strokeWidth="1.4" opacity="0.5" />

      {/* before (baseline) — fainter pale dashed mushroom */}
      <path d={mushPath(x0 + 2, cy, len - 4, tShaftB, tGlansB, glansLenB)} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />

      {/* cross-section (shaft) — BIG centered circle; legend BELOW (full-width, never overflows) */}
      <text x="8" y="254" fontSize="14" fill={lab}>{tr('g2dCross')}</text>
      <circle cx={ccx} cy={ccy} r={csA} fill="url(#fg-cs)" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.6" />
      <circle cx={ccx} cy={ccy} r={csB} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />
      <text x="20" y="494" fontSize="13" fill="#ef4444">{tr('g2dLegShaft')}</text>
      <text x="20" y="516" fontSize="13" fill="#f59e0b">{tr('g2dLegGlans')}</text>
      <text x="20" y="538" fontSize="13" fill={labStrong}>{tr('g2dLegKey')}</text>
    </svg>
  );
}
