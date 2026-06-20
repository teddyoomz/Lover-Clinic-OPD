// FillerSimulator — public, pure-client "estimate your size after filler" toy.
// No Firestore, no auth, no PII, no persistence. Single source of truth = fillerMath.
import { useMemo, useState, lazy, Suspense } from 'react';
import {
  CONDOM_LADDER, RANGES,
  girthFromWidth, girthFromDiameter,
  cmToInch, inchToCm, estimate,
} from '../lib/fillerMath.js';
import FillerGraphic2D from '../components/FillerGraphic2D.jsx';

const Filler3D = lazy(() => import('../components/Filler3D.jsx'));

const r1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function sizesLabel(low, high) {
  const lo = Math.max(0, low);
  const hi = Math.max(0, high);
  if (hi <= 0) return 'ขนาดเดิม';
  if (lo === hi) return `+${lo} ไซส์`;
  return `+${lo} ถึง +${hi} ไซส์`;
}

const TH = {
  bg: '#0a0a0a', card: '#17110f', card2: '#1f1715', line: '#2c211e',
  tx: '#ededed', tx2: '#9b938f', fire: '#ef4444', fire2: '#dc2626',
};

function ResultCard({ k, oldVal, newVal, delta }) {
  return (
    <div style={{ flex: 1, minWidth: 165, background: TH.card2, border: `1px solid ${TH.line}`, borderRadius: 11, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: TH.tx2, marginBottom: 3 }}>{k}</div>
      <div style={{ fontSize: 12.5, color: TH.tx2 }}>เดิม <b style={{ color: '#cfc6c2' }}>{oldVal}</b></div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
        → {newVal}<span style={{ fontSize: 13, fontWeight: 700, color: TH.fire, marginLeft: 8 }}>{delta}</span>
      </div>
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${TH.line}`, borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          style={{
            fontSize: 11.5, padding: '4px 11px', border: 0, cursor: 'pointer',
            background: value === o.v ? `linear-gradient(90deg, ${TH.fire2}, ${TH.fire})` : 'transparent',
            color: value === o.v ? '#fff' : TH.tx2,
          }}>{o.label}</button>
      ))}
    </span>
  );
}

export default function FillerSimulator() {
  const [lengthCm, setLengthCm] = useState(11);
  const [lengthUnit, setLengthUnit] = useState('cm');
  const [baseMode, setBaseMode] = useState('condom');
  const [baseDiameterCm, setBaseDiameterCm] = useState(3.0);
  const [condomIdx, setCondomIdx] = useState(2); // Regular 52
  const [fillerCc, setFillerCc] = useState(10);
  const [view, setView] = useState('2d');
  const [revealed, setRevealed] = useState(false);
  const [webglOk] = useState(() => webglSupported());

  const baseGirthCm = baseMode === 'condom'
    ? girthFromWidth(CONDOM_LADDER[condomIdx].w)
    : girthFromDiameter(baseDiameterCm);

  const est = useMemo(
    () => estimate({ lengthCm, baseGirthCm, fillerCc }),
    [lengthCm, baseGirthCm, fillerCc],
  );

  const isInch = lengthUnit === 'inch';
  const lenDisplay = isInch ? cmToInch(lengthCm) : lengthCm;
  const lenMin = isInch ? cmToInch(RANGES.lengthCm[0]) : RANGES.lengthCm[0];
  const lenMax = isInch ? cmToInch(RANGES.lengthCm[1]) : RANGES.lengthCm[1];
  const lenStep = isInch ? 0.25 : 0.5;
  const onLen = (v) => setLengthCm(isInch ? inchToCm(Number(v)) : Number(v));

  const showGraphic3D = view === '3d' && webglOk;

  return (
    <div style={{ background: TH.bg, minHeight: '100vh', color: TH.tx, fontFamily: "'Sarabun', -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{`
        .fs-range{ -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:3px;
          background:#2a201d; outline:none; }
        .fs-range::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%;
          background:#fff; border:2px solid ${TH.fire}; cursor:pointer; box-shadow:0 0 8px rgba(239,68,68,.6); }
        .fs-range::-moz-range-thumb{ width:18px; height:18px; border-radius:50%; background:#fff;
          border:2px solid ${TH.fire}; cursor:pointer; }
        .fs-sel{ width:100%; background:${TH.card2}; color:#fff; border:1px solid ${TH.line};
          border-radius:9px; padding:9px 12px; font-size:15px; }
      `}</style>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '22px 18px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #f97316, #dc2626)', boxShadow: '0 0 14px rgba(239,68,68,.5)' }} />
          <div style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>ลองจำลองขนาดหลังเสริมฟิลเลอร์</div>
        </div>
        <div style={{ fontSize: 12.5, color: TH.tx2, marginBottom: 18 }}>เลื่อนปรับค่าด้านล่าง แล้วดูขนาดที่ประเมินได้ — เป็นการประมาณคร่าวๆ เพื่อให้นึกภาพออก</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {/* controls */}
          <div style={{ background: TH.card, border: `1px solid ${TH.line}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, color: TH.tx2, fontWeight: 600, marginBottom: 14 }}>ปรับค่า</div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, color: '#e9e3e1' }}>ความยาว</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg options={[{ v: 'cm', label: 'ซม.' }, { v: 'inch', label: 'นิ้ว' }]} value={lengthUnit} onChange={setLengthUnit} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: TH.card2, border: `1px solid ${TH.line}`, borderRadius: 7, padding: '2px 9px' }}>
                    {isInch ? `${lenDisplay.toFixed(1)} นิ้ว` : `${lenDisplay.toFixed(1)} ซม.`}
                  </span>
                </span>
              </div>
              <input className="fs-range" type="range" min={lenMin} max={lenMax} step={lenStep} value={lenDisplay} onChange={(e) => onLen(e.target.value)} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, color: '#e9e3e1' }}>ขนาดเดิม</span>
                <Seg options={[{ v: 'condom', label: 'กดไซส์ถุงยาง' }, { v: 'diameter', label: 'เลื่อน Ø' }]} value={baseMode} onChange={setBaseMode} />
              </div>
              {baseMode === 'condom' ? (
                <select className="fs-sel" value={condomIdx} onChange={(e) => setCondomIdx(Number(e.target.value))}>
                  {CONDOM_LADDER.map((c, i) => (
                    <option key={c.w} value={i}>{`${c.label} (${c.w} มม. · รอบวง ${r1(girthFromWidth(c.w))})`}</option>
                  ))}
                </select>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#cfc6c2' }}>Ø {baseDiameterCm.toFixed(1)} · รอบวง {r1(girthFromDiameter(baseDiameterCm))} ซม.</span>
                  </div>
                  <input className="fs-range" type="range" min={RANGES.diameterCm[0]} max={RANGES.diameterCm[1]} step={0.1}
                    value={baseDiameterCm} onChange={(e) => setBaseDiameterCm(Number(e.target.value))} />
                </>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, color: '#e9e3e1' }}>ฟิลเลอร์ที่ฉีด</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: `linear-gradient(90deg, ${TH.fire2}, ${TH.fire})`, borderRadius: 7, padding: '2px 9px' }}>{fillerCc} cc</span>
              </div>
              <input className="fs-range" type="range" min={RANGES.cc[0]} max={RANGES.cc[1]} step={1} value={fillerCc} onChange={(e) => setFillerCc(Number(e.target.value))} />
            </div>
          </div>

          {/* graphic */}
          <div style={{ background: TH.card, border: `1px solid ${TH.line}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: TH.tx2, fontWeight: 600 }}>ภาพจำลอง</span>
              {webglOk && (
                <Seg options={[{ v: '2d', label: '2D เหมือนจริง' }, { v: '3d', label: '3D หมุนได้ ⟳' }]} value={view} onChange={setView} />
              )}
            </div>

            <div style={{ position: 'relative', minHeight: 232 }}>
              <div style={{ filter: revealed ? 'none' : 'blur(16px)', transition: 'filter .2s', pointerEvents: revealed ? 'auto' : 'none' }}>
                {showGraphic3D ? (
                  <Suspense fallback={<div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TH.tx2 }}>กำลังโหลดโมเดล 3 มิติ…</div>}>
                    <Filler3D est={est} lengthCm={lengthCm} />
                  </Suspense>
                ) : (
                  <FillerGraphic2D est={est} lengthCm={lengthCm} />
                )}
              </div>
              {!revealed && (
                <button type="button" onClick={() => setRevealed(true)}
                  style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(10,10,10,0.35)', border: `1px dashed ${TH.line}`, borderRadius: 11, color: TH.tx, cursor: 'pointer' }}>
                  <span style={{ fontSize: 22 }}>👁️</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>แตะเพื่อดูภาพจำลอง (18+)</span>
                  <span style={{ fontSize: 11.5, color: TH.tx2 }}>ภาพประกอบเชิงคลินิก</span>
                </button>
              )}
            </div>
            {revealed && view === '3d' && webglOk && (
              <div style={{ fontSize: 11, color: TH.tx2, marginTop: 6 }}>⟳ ลากเพื่อหมุนดูรอบ · ขยายตาม cc สด</div>
            )}
          </div>
        </div>

        {/* results */}
        <div style={{ marginTop: 18, background: TH.card, border: `1px solid ${TH.line}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: TH.tx2, fontWeight: 600, marginBottom: 14 }}>ขนาดที่ประเมินได้ (ช่วง realistic – optimistic)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 11 }}>
            <ResultCard k="รอบวง" oldVal={`${r1(est.c0)} ซม.`} newVal={`${r1(est.c1Low)} – ${r1(est.c1High)} ซม.`} delta={`+${r1(est.deltaCLow)} ถึง +${r1(est.deltaCHigh)}`} />
            <ResultCard k="เส้นผ่านศูนย์กลาง" oldVal={`${r1(est.d0)} ซม.`} newVal={`${r1(est.d1Low)} – ${r1(est.d1High)} ซม.`} delta={`+${r1(est.d1Low - est.d0)} ถึง +${r1(est.d1High - est.d0)}`} />
            <ResultCard k="ถุงยางที่ใส่ได้" oldVal={est.condom0.label} newVal={est.condomLow.index === est.condomHigh.index ? est.condomLow.label : `${est.condomLow.label} – ${est.condomHigh.label}`} delta={sizesLabel(est.sizesUpLow, est.sizesUpHigh)} />
          </div>
          <div style={{ fontSize: 11.5, color: TH.tx2, marginTop: 11, lineHeight: 1.5 }}>
            ⚠ ฟิลเลอร์เพิ่ม <b>รอบวง</b> ไม่เพิ่ม <b>ความยาว</b> · ฐานสั้นกว่า + cc เท่ากัน = รอบวงขึ้นเยอะกว่า · อยู่ได้ ~6–24 เดือน แล้วยุบลงบ้างตามเวลา · ไซส์ถุงยางเป็นค่าประมาณ (ลาเท็กซ์ยืดได้)
          </div>
        </div>

        <div style={{ marginTop: 16, background: '#160d0c', border: '1px solid #3a201c', borderRadius: 11, padding: '12px 14px', fontSize: 11.5, color: '#c9b8b4', lineHeight: 1.55 }}>
          🇹🇭 ภาพจำลองนี้เป็นการประมาณการคร่าวๆ เพื่อการศึกษาเท่านั้น ไม่ใช่การรับประกันผลลัพธ์ ผลลัพธ์จริงแตกต่างกันในแต่ละบุคคล ขึ้นกับสภาพผิวหนัง ปริมาณสารเติมเต็ม และเทคนิคการฉีด — กรุณาปรึกษาแพทย์ก่อนตัดสินใจ<br />
          🇬🇧 Rough illustrative estimate for education only — not a guarantee. Individual results vary. Please consult your physician.
        </div>
      </div>
    </div>
  );
}
