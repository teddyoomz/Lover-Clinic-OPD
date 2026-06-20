// FillerGraphic2D — realistic anatomical 2D (mushroom: shaft → sulcus → corona → glans).
// Clinical/medical style (non-explicit). Shaft scales from shaft girth; glans bulb scales
// SEPARATELY from glans diameter. Presentational only — numbers come from `est`. Theme-aware.
import { diameterFromGirth } from '../lib/fillerMath.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shaftHalfT = (d) => clamp(12 + (d - 2) * 8, 8, 40); // shaft Ø → px
const glansHalfT = (d) => clamp(13 + (d - 2) * 9, 9, 50); // glans Ø → px (separate)
const lenToPx = (L) => clamp(108 + (L - 6) * 6.5, 100, 198); // length cm → shaft px

function mushPath(x0, cy, len, tShaft, tGlans, glansLen) {
  const xS = x0 + len;
  const xC = xS + 7;
  const xT = xC + glansLen;
  return `M${x0} ${cy - tShaft}`
    + ` L${xS} ${cy - tShaft}`
    + ` Q${xS + 3} ${cy - tShaft * 0.72} ${xC} ${cy - tGlans}`
    + ` C${xC + glansLen * 0.45} ${cy - tGlans} ${xT} ${cy - tGlans * 0.5} ${xT} ${cy}`
    + ` C${xT} ${cy + tGlans * 0.5} ${xC + glansLen * 0.45} ${cy + tGlans} ${xC} ${cy + tGlans}`
    + ` Q${xS + 3} ${cy + tShaft * 0.72} ${xS} ${cy + tShaft}`
    + ` L${x0} ${cy + tShaft}`
    + ` Q${x0 - 13} ${cy} ${x0} ${cy - tShaft} Z`;
}

export default function FillerGraphic2D({ est, lengthCm = 12.7, theme = 'dark', t }) {
  const d0 = est?.d0 ?? diameterFromGirth(10.4);
  const dLo = est?.d1Low ?? d0;
  const dg0 = est?.glans?.dg0 ?? d0;
  const dgLo = est?.glans?.dgLow ?? dg0;

  const lab = theme === 'light' ? '#5b6675' : '#9b938f';
  const labStrong = theme === 'light' ? '#1e293b' : '#ededed';
  const beforeStroke = theme === 'light' ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.55)';

  const cy = 76;
  const x0 = 24;
  const len = lenToPx(lengthCm);
  const tShaftA = shaftHalfT(dLo);
  const tShaftB = shaftHalfT(d0);
  const tGlansA = glansHalfT(dgLo);
  const tGlansB = glansHalfT(dg0);
  const glansLenA = tGlansA * 1.25;
  const glansLenB = tGlansB * 1.25;

  const csA = clamp(dLo * 8.6, 15, 52);
  const csB = clamp(d0 * 8.6, 15, 52);
  const ccx = 62;
  const ccy = 192;

  return (
    <svg viewBox="0 0 380 236" width="100%" role="img"
         aria-label="ภาพจำลองทรงเห็ด (ลำตัว+หัว) ด้านข้างและหน้าตัด ก่อนและหลังฉีดฟิลเลอร์">
      <defs>
        <linearGradient id="fg-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.45" stopColor="#c2825f" />
          <stop offset="1" stopColor="#7b4b37" />
        </linearGradient>
        <radialGradient id="fg-glans" cx="0.62" cy="0.34" r="0.72">
          <stop offset="0" stopColor="#edb89f" />
          <stop offset="0.55" stopColor="#c07a58" />
          <stop offset="1" stopColor="#7a4936" />
        </radialGradient>
        <radialGradient id="fg-cs" cx="0.4" cy="0.34" r="0.75">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.6" stopColor="#bd7c5b" />
          <stop offset="1" stopColor="#7b4b37" />
        </radialGradient>
      </defs>

      <text x="6" y="13" fontSize="11" fill={lab}>ด้านข้าง — ทรงเห็ด (corona + หัว)</text>

      {/* after — skin body (mushroom) */}
      <path d={mushPath(x0, cy, len, tShaftA, tGlansA, glansLenA)} fill="url(#fg-skin)" stroke="#ef4444" strokeWidth="1.6" />
      {/* glans tint overlay for a fuller head */}
      <ellipse cx={x0 + len + 7 + glansLenA * 0.4} cy={cy} rx={glansLenA * 0.6} ry={tGlansA * 0.92} fill="url(#fg-glans)" opacity="0.6" />
      {/* corona ridge */}
      <path d={`M${x0 + len} ${cy - tShaftA + 2} Q${x0 + len + 4} ${cy} ${x0 + len} ${cy + tShaftA - 2}`} fill="none" stroke="#6e4030" strokeWidth="1.2" opacity="0.55" />
      {/* highlight */}
      <ellipse cx={x0 + len * 0.4} cy={cy - tShaftA + 6} rx="9" ry="5" fill="rgba(255,242,234,0.45)" />

      {/* before — dashed mushroom */}
      <path d={mushPath(x0 + 2, cy, len - 4, tShaftB, tGlansB, glansLenB)} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />

      {/* cross-section (shaft) */}
      <text x="6" y="150" fontSize="11" fill={lab}>หน้าตัด (ลำตัว)</text>
      <circle cx={ccx} cy={ccy} r={csA} fill="url(#fg-cs)" stroke="#ef4444" strokeWidth="1.5" />
      <circle cx={ccx} cy={ccy} r={csB} fill="none" stroke={beforeStroke} strokeWidth="1.1" strokeDasharray="5 4" />
      <text x={ccx + csA + 14} y={ccy - 14} fontSize="11" fill="#ef4444">🔴 ลำตัวโตตามฟิลเลอร์ลำตัว</text>
      <text x={ccx + csA + 14} y={ccy + 6} fontSize="11" fill="#f59e0b">🟠 หัวโตตามฟิลเลอร์หัว</text>
      <text x={ccx + csA + 14} y={ccy + 26} fontSize="11" fill={labStrong}>ขอบแดง = หลังฉีด · ประ = เดิม</text>
    </svg>
  );
}
