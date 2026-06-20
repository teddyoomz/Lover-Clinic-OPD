// FillerSimulator v2 — public, pure-client size estimator. No Firestore, no auth, no PII.
// Shaft + GLANS split injection · realistic mushroom 2D/3D · TH/EN · light/dark · no 18+ gate.
// Single source of truth = fillerMath.
import { useMemo, useState, lazy, Suspense } from 'react';
import {
  CONDOM_LADDER, RANGES,
  girthFromWidth, girthFromDiameter,
  cmToInch, inchToCm, estimate,
} from '../lib/fillerMath.js';
import { makeT } from '../lib/fillerStrings.js';
import FillerGraphic2D from '../components/FillerGraphic2D.jsx';

const Filler3D = lazy(() => import('../components/Filler3D.jsx'));

const r1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);

const PAL = {
  dark: { bg: '#050505', card: '#0f0f0f', card2: '#161616', line: '#262626', tx: '#ededed', tx2: '#8b9099', fire: '#ef4444', fire2: '#dc2626', amber: '#f59e0b', ember: '#f97316', disc: '#160d0c', discBd: '#3a201c', discTx: '#c9b8b4' },
  light: { bg: '#f0f4f8', card: '#f8fafc', card2: '#eef2f7', line: '#d7dee7', tx: '#1e293b', tx2: '#5b6675', fire: '#dc2626', fire2: '#b91c1c', amber: '#d97706', ember: '#ea580c', disc: '#fff5f5', discBd: '#f1c7c0', discTx: '#7c4a44' },
};

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

function Seg({ options, value, onChange, c }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          style={{ fontSize: 11.5, padding: '4px 11px', border: 0, cursor: 'pointer',
            background: value === o.v ? `linear-gradient(90deg, ${c.fire2}, ${c.fire})` : 'transparent',
            color: value === o.v ? '#fff' : c.tx2 }}>{o.label}</button>
      ))}
    </span>
  );
}

function ResultCard({ k, oldVal, newVal, delta, c, glans, glansNote }) {
  return (
    <div style={{ flex: 1, minWidth: 158, background: c.card2, border: `1px solid ${glans ? c.amber : c.line}`, borderRadius: 11, padding: '11px 13px' }}>
      <div style={{ fontSize: 12, color: c.tx2, marginBottom: 2 }}>{k}</div>
      <div style={{ fontSize: 12, color: c.tx2 }}>{oldVal}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c.tx }}>
        → {newVal}<span style={{ fontSize: 12.5, fontWeight: 700, color: glans ? c.amber : c.fire, marginLeft: 7 }}>{delta}</span>
      </div>
      {glansNote && <div style={{ fontSize: 10.5, color: c.amber, marginTop: 2 }}>{glansNote}</div>}
    </div>
  );
}

export default function FillerSimulator() {
  const [lang, setLang] = useState('th');
  const [theme, setTheme] = useState('dark');
  const [lengthCm, setLengthCm] = useState(12.7); // 5 inch default
  const [lengthUnit, setLengthUnit] = useState('inch');
  const [baseMode, setBaseMode] = useState('condom');
  const [baseDiameterCm, setBaseDiameterCm] = useState(3.0);
  const [condomIdx, setCondomIdx] = useState(2); // Regular 52
  const [totalCc, setTotalCc] = useState(12);
  const [glansPct, setGlansPct] = useState(15);
  const [view, setView] = useState('2d');
  const [webglOk] = useState(() => webglSupported());

  const t = useMemo(() => makeT(lang), [lang]);
  const c = PAL[theme] || PAL.dark;

  const baseGirthCm = baseMode === 'condom'
    ? girthFromWidth(CONDOM_LADDER[condomIdx].w)
    : girthFromDiameter(baseDiameterCm);

  const shaftCc = totalCc * (1 - glansPct / 100);
  const glansCc = totalCc * (glansPct / 100);

  const est = useMemo(
    () => estimate({ lengthCm, baseGirthCm, shaftCc, glansCc }),
    [lengthCm, baseGirthCm, shaftCc, glansCc],
  );

  const isInch = lengthUnit === 'inch';
  const lenDisplay = isInch ? cmToInch(lengthCm) : lengthCm;
  const lenMin = isInch ? 2.5 : RANGES.lengthCm[0];
  const lenMax = isInch ? 10 : RANGES.lengthCm[1];
  const lenStep = isInch ? 0.1 : 0.5;
  const onLen = (v) => setLengthCm(isInch ? inchToCm(Number(v)) : Number(v));

  const bodyPct = 100 - glansPct;
  const showGraphic3D = view === '3d' && webglOk;

  const sizesUp = (lo, hi) => {
    const a = Math.max(0, lo), b = Math.max(0, hi);
    if (b <= 0) return t('sameSize');
    if (a === b) return `+${a} ${t('sizesUnit')}`;
    return `+${a} ${lang === 'th' ? 'ถึง' : 'to'} +${b} ${t('sizesUnit')}`;
  };
  const rangeTo = lang === 'th' ? 'ถึง' : 'to';

  return (
    <div style={{ background: c.bg, minHeight: '100vh', color: c.tx, fontFamily: "'Sarabun', -apple-system, 'Segoe UI', sans-serif", transition: 'background .2s' }}>
      <style>{`
        .fs-range{ -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:3px; background:${c.line}; outline:none; }
        .fs-range::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#fff; border:2px solid ${c.fire}; cursor:pointer; box-shadow:0 0 8px rgba(220,38,38,.45); }
        .fs-range::-moz-range-thumb{ width:18px; height:18px; border-radius:50%; background:#fff; border:2px solid ${c.fire}; cursor:pointer; }
        .fs-range.glans::-webkit-slider-thumb{ border-color:${c.amber}; }
        .fs-sel{ width:100%; background:${c.card2}; color:${c.tx}; border:1px solid ${c.line}; border-radius:9px; padding:9px 12px; font-size:15px; }
      `}</style>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 18px 44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${c.ember}, ${c.fire2})`, boxShadow: '0 0 14px rgba(220,38,38,.4)' }} />
          <div style={{ fontSize: 19, fontWeight: 700, color: c.tx }}>{t('title')}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
              style={{ fontSize: 11.5, border: `1px solid ${c.line}`, background: c.card2, color: c.tx2, borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>{lang === 'th' ? 'EN' : 'TH'}</button>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ fontSize: 11.5, border: `1px solid ${c.line}`, background: c.card2, color: c.tx2, borderRadius: 8, padding: '5px 11px', cursor: 'pointer' }}>{theme === 'dark' ? '☀ Light' : '🌙 Dark'}</button>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: c.tx2, marginBottom: 18 }}>{t('sub')}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {/* controls */}
          <div style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, color: c.tx2, fontWeight: 600, marginBottom: 14 }}>{t('adjust')}</div>

            {/* length */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, color: c.tx }}>{t('length')}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg c={c} value={lengthUnit} onChange={setLengthUnit} options={[{ v: 'inch', label: t('unitIn') }, { v: 'cm', label: t('unitCm') }]} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: c.tx, background: c.card2, border: `1px solid ${c.line}`, borderRadius: 7, padding: '2px 9px' }}>
                    {lenDisplay.toFixed(1)} {isInch ? t('unitIn') : t('unitCm')}
                  </span>
                </span>
              </div>
              <input className="fs-range" type="range" min={lenMin} max={lenMax} step={lenStep} value={lenDisplay} onChange={(e) => onLen(e.target.value)} />
            </div>

            {/* baseline */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, color: c.tx }}>{t('baseSize')}</span>
                <Seg c={c} value={baseMode} onChange={setBaseMode} options={[{ v: 'condom', label: t('condomMode') }, { v: 'diameter', label: t('diaMode') }]} />
              </div>
              {baseMode === 'condom' ? (
                <select className="fs-sel" value={condomIdx} onChange={(e) => setCondomIdx(Number(e.target.value))}>
                  {CONDOM_LADDER.map((cd, i) => (
                    <option key={cd.w} value={i}>{`${cd.label} (${cd.w} ${lang === 'th' ? 'มม.' : 'mm'} · ${t('resGirth').split(' ')[0]} ${r1(girthFromWidth(cd.w))})`}</option>
                  ))}
                </select>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: c.tx }}>Ø {baseDiameterCm.toFixed(1)} · {r1(girthFromDiameter(baseDiameterCm))} {t('unitCm')}</span>
                  </div>
                  <input className="fs-range" type="range" min={RANGES.diameterCm[0]} max={RANGES.diameterCm[1]} step={0.1} value={baseDiameterCm} onChange={(e) => setBaseDiameterCm(Number(e.target.value))} />
                </>
              )}
            </div>

            {/* filler split */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 13.5, color: c.tx }}>{t('totalFiller')}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})`, borderRadius: 7, padding: '2px 9px' }}>{totalCc} {t('cc')}</span>
              </div>
              <input className="fs-range" type="range" min={0} max={50} step={1} value={totalCc} onChange={(e) => setTotalCc(Number(e.target.value))} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 7px' }}>
                <span style={{ fontSize: 13.5, color: c.tx }}>{t('splitLabel')}</span>
                <span style={{ fontSize: 12.5, color: c.tx2 }}>{t('shaft')} {Math.round(shaftCc)} · {t('glans')} {Math.round(glansCc)}</span>
              </div>
              <input className="fs-range glans" type="range" min={0} max={50} step={5} value={glansPct} onChange={(e) => setGlansPct(Number(e.target.value))} />
              <div style={{ height: 28, borderRadius: 8, overflow: 'hidden', display: 'flex', border: `1px solid ${c.line}`, marginTop: 7 }}>
                <div style={{ width: `${bodyPct}%`, background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, minWidth: 0, transition: 'width .12s' }}>{t('shaft')} {Math.round(shaftCc)}{t('cc')}</div>
                <div style={{ width: `${100 - bodyPct}%`, background: `linear-gradient(90deg, ${c.amber}, ${c.ember})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, minWidth: 0, transition: 'width .12s' }}>{t('glans')} {Math.round(glansCc)}</div>
              </div>
            </div>
          </div>

          {/* graphic (no gate) */}
          <div style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: c.tx2, fontWeight: 600 }}>{t('graphic')}</span>
              {webglOk && (
                <Seg c={c} value={view} onChange={setView} options={[{ v: '2d', label: t('view2d') }, { v: '3d', label: t('view3d') }]} />
              )}
            </div>
            <div style={{ minHeight: 232 }}>
              {showGraphic3D ? (
                <Suspense fallback={<div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.tx2 }}>…</div>}>
                  <Filler3D est={est} lengthCm={lengthCm} />
                </Suspense>
              ) : (
                <FillerGraphic2D est={est} lengthCm={lengthCm} theme={theme} t={t} />
              )}
            </div>
            {view === '3d' && webglOk && (
              <div style={{ fontSize: 11, color: c.tx2, marginTop: 6 }}>{t('rotateHint')}</div>
            )}
          </div>
        </div>

        {/* results */}
        <div style={{ marginTop: 18, background: c.card, border: `1px solid ${c.line}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: c.tx2, fontWeight: 600, marginBottom: 14 }}>{t('resultsHeader')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <ResultCard c={c} k={t('resGirth')} oldVal={`${t('before')} ${r1(est.c0)} ${t('unitCm')}`} newVal={`${r1(est.c1Low)} – ${r1(est.c1High)} ${t('unitCm')}`} delta={`+${r1(est.deltaCLow)} ${rangeTo} +${r1(est.deltaCHigh)}`} />
            <ResultCard c={c} k={t('resDia')} oldVal={`${t('before')} ${r1(est.d0)} ${t('unitCm')}`} newVal={`${r1(est.d1Low)} – ${r1(est.d1High)} ${t('unitCm')}`} delta={`+${r1(est.d1Low - est.d0)} ${rangeTo} +${r1(est.d1High - est.d0)}`} />
            <ResultCard c={c} k={t('resCondom')} oldVal={`${t('before')} ${est.condom0.label}`} newVal={est.condomLow.index === est.condomHigh.index ? est.condomLow.label : `${est.condomLow.label} – ${est.condomHigh.label}`} delta={sizesUp(est.sizesUpLow, est.sizesUpHigh)} />
            <ResultCard c={c} glans glansNote={t('noCondomEffect')} k={t('resGlans')} oldVal={`${t('before')} ${r1(est.glans.dg0)} ${t('unitCm')}`} newVal={`${r1(est.glans.dgLow)} – ${r1(est.glans.dgHigh)} ${t('unitCm')}`} delta={`+${r1(est.glans.deltaLow)} ${rangeTo} +${r1(est.glans.deltaHigh)}`} />
          </div>
          <div style={{ fontSize: 11.5, color: c.tx2, marginTop: 11, lineHeight: 1.5 }}>{t('note')}</div>
        </div>

        <div style={{ marginTop: 16, background: c.disc, border: `1px solid ${c.discBd}`, borderRadius: 11, padding: '12px 14px', fontSize: 11.5, color: c.discTx, lineHeight: 1.55 }}>
          {lang === 'th' ? '🇹🇭 ' : '🇬🇧 '}{t('disclaimer')}
        </div>
      </div>
    </div>
  );
}
