// FillerGraphic2D — realistic anatomical 2D illustration for the filler simulator.
// Clinical/medical style (non-explicit). Scales live from the fillerMath estimate.
// Presentational only — all numbers come from `est`.
import { diameterFromGirth } from '../lib/fillerMath.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Ø (cm) -> side-profile half-thickness (px)
const halfT = (d) => clamp(13 + (d - 2) * 8, 9, 46);
// Ø (cm) -> cross-section radius (px)
const rad = (d) => clamp(d * 8.6, 15, 54);
// length (cm) -> shaft length (px)
const shaftLen = (L) => clamp(146 + (L - 8) * 11, 120, 270);

export default function FillerGraphic2D({ est, lengthCm = 11 }) {
  const d0 = est?.d0 ?? diameterFromGirth(10.4);
  const dLo = est?.d1Low ?? d0;
  const dHi = est?.d1High ?? d0;

  const cy = 74;
  const x0 = 22;
  const len = shaftLen(lengthCm);
  const tA = halfT(dLo); // realistic after
  const tB = halfT(d0); // before
  const glansR = tA * 1.16;
  const gx = x0 + len; // glans centre x
  const shaftRight = gx - glansR * 0.45;

  // cross-section radii
  const r0 = rad(d0);
  const rLo = rad(dLo);
  const rHi = rad(dHi);
  const ccx = 64;
  const ccy = 178;

  return (
    <svg viewBox="0 0 380 232" width="100%" role="img"
         aria-label="ภาพจำลองกายวิภาคด้านข้างและหน้าตัด ก่อนและหลังฉีดฟิลเลอร์">
      <defs>
        <linearGradient id="fg-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.45" stopColor="#c2825f" />
          <stop offset="1" stopColor="#7b4b37" />
        </linearGradient>
        <radialGradient id="fg-glans" cx="0.62" cy="0.34" r="0.72">
          <stop offset="0" stopColor="#edb89f" />
          <stop offset="0.55" stopColor="#bd7c5b" />
          <stop offset="1" stopColor="#7a4936" />
        </radialGradient>
        <radialGradient id="fg-cs" cx="0.4" cy="0.34" r="0.75">
          <stop offset="0" stopColor="#e0a98d" />
          <stop offset="0.6" stopColor="#bd7c5b" />
          <stop offset="1" stopColor="#7b4b37" />
        </radialGradient>
      </defs>

      <text x="6" y="13" fontSize="11" fill="#9b938f">ด้านข้าง — รูปทรงกายวิภาค (ความยาวคงเดิม)</text>

      {/* after: skin body (shaft) */}
      <rect x={x0} y={cy - tA} width={shaftRight - x0} height={tA * 2} rx={tA}
            fill="url(#fg-skin)" stroke="#ef4444" strokeWidth="1.6" />
      {/* glans */}
      <ellipse cx={gx} cy={cy} rx={glansR * 0.92} ry={glansR}
               fill="url(#fg-glans)" stroke="#ef4444" strokeWidth="1.4" />
      {/* corona ridge */}
      <path d={`M${shaftRight} ${cy - tA + 2} C ${shaftRight + 7} ${cy - tA * 0.5}, ${shaftRight + 7} ${cy + tA * 0.5}, ${shaftRight} ${cy + tA - 2}`}
            fill="none" stroke="#6e4030" strokeWidth="1.3" opacity="0.65" />
      {/* top highlight */}
      <path d={`M${x0 + 14} ${cy - tA + 5} C ${x0 + len * 0.45} ${cy - tA + 1}, ${shaftRight - 30} ${cy - tA + 1}, ${shaftRight - 6} ${cy - tA + 5}`}
            fill="none" stroke="rgba(255,238,228,0.4)" strokeWidth="3.2" strokeLinecap="round" />
      <ellipse cx={gx - glansR * 0.25} cy={cy - glansR * 0.4} rx="8" ry="5" fill="rgba(255,242,234,0.5)" />

      {/* before (dashed, centred) */}
      <rect x={x0 + 2} y={cy - tB} width={shaftRight - x0 - 6} height={tB * 2} rx={tB}
            fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1" strokeDasharray="5 4" />

      {/* cross-section */}
      <text x="6" y="128" fontSize="11" fill="#9b938f">หน้าตัด</text>
      <circle cx={ccx} cy={ccy} r={rHi} fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      <circle cx={ccx} cy={ccy} r={rLo} fill="url(#fg-cs)" stroke="#ef4444" strokeWidth="1.5" />
      <circle cx={ccx} cy={ccy} r={r0} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.1" strokeDasharray="5 4" />
      <text x={ccx + rHi + 12} y={ccy - 16} fontSize="11" fill="#ededed">ขอบแดง = หลังฉีด</text>
      <text x={ccx + rHi + 12} y={ccy + 2} fontSize="11" fill="#9b938f">เส้นประขาว = ขนาดเดิม</text>
      <text x={ccx + rHi + 12} y={ccy + 20} fontSize="11" fill="#9b938f">โตขึ้นสดตามจำนวน cc</text>
    </svg>
  );
}
