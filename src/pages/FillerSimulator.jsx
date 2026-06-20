// FillerSimulator v4 — public, pure-client size estimator. No Firestore, no auth, no PII.
// Shaft + GLANS split injection · realistic mushroom 2D/3D · TH/EN · light/dark · no 18+ gate.
// v4: centered hero header (premium, not edge-stuck) + real clinic logo + result colors
//     (new=green / baseline=red / delta=gold) + formal copy. Single source of truth = fillerMath.
import { useMemo, useState, lazy, Suspense } from 'react';
import {
  CONDOM_LADDER, RANGES, GLANS_BASE_RATIO,
  girthFromWidth, girthFromDiameter, diameterFromGirth,
  cmToInch, inchToCm, estimate,
} from '../lib/fillerMath.js';
import { makeT } from '../lib/fillerStrings.js';
import FillerGraphic2D from '../components/FillerGraphic2D.jsx';

const Filler3D = lazy(() => import('../components/Filler3D.jsx'));

const r1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
// exact cc display — round to 2 decimals + trim trailing zeros (2.5 stays 2.5, 5 stays 5).
const ccFmt = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

const PAL = {
  dark: { bg: '#050505', card: '#0f0f0f', card2: '#161616', line: '#262626', tx: '#ededed', tx2: '#8b9099', fire: '#ef4444', fire2: '#dc2626', amber: '#f59e0b', ember: '#f97316', disc: '#160d0c', discBd: '#3a201c', discTx: '#c9b8b4', logo: '#ffffff', logoSub: '#cbd5e1', green: '#22c55e', goldA: '#fcd34d', goldB: '#f97316' },
  light: { bg: '#f0f4f8', card: '#f8fafc', card2: '#eef2f7', line: '#d7dee7', tx: '#1e293b', tx2: '#5b6675', fire: '#dc2626', fire2: '#b91c1c', amber: '#d97706', ember: '#ea580c', disc: '#fff5f5', discBd: '#f1c7c0', discTx: '#7c4a44', logo: '#0f172a', logoSub: '#475569', green: '#16a34a', goldA: '#d97706', goldB: '#ea580c' },
};

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

// Real Lover Clinic logo — white (dark theme) / black (light theme), committed as static assets
// in public/ so the pure-client page shows the REAL logo (image fetch, NOT a Firestore read).
// Inline wordmark is the onError fallback.
function LoverMark({ c, isLight, h = 34 }) {
  const [imgErr, setImgErr] = useState(false);
  if (!imgErr) {
    return (
      <img src={isLight ? '/lover-clinic-logo-light.png' : '/lover-clinic-logo-dark.png'}
        alt="Lover Clinic" onError={() => setImgErr(true)}
        style={{ height: h, width: 'auto', maxWidth: '78vw', display: 'block', flex: 'none' }} />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
        <defs>
          <linearGradient id="lm-chev" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c.amber} /><stop offset="1" stopColor={c.fire2} />
          </linearGradient>
        </defs>
        <path d="M3 6 L12 16 L21 6" fill="none" stroke="url(#lm-chev)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.07em', color: c.logo }}>LOVER</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.42em', color: c.logoSub, marginTop: 3 }}>CLINIC</span>
      </div>
    </div>
  );
}

function Seg({ options, value, onChange, c }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${c.line}`, borderRadius: 9, overflow: 'hidden', background: c.card2 }}>
      {options.map((o) => (
        <button key={o.v} type="button" className="fs-btn" onClick={() => onChange(o.v)}
          style={{ fontSize: 12, padding: '8px 13px', border: 0, cursor: 'pointer', minHeight: 36,
            background: value === o.v ? `linear-gradient(90deg, ${c.fire2}, ${c.fire})` : 'transparent',
            color: value === o.v ? '#fff' : c.tx2, fontWeight: value === o.v ? 700 : 500 }}>{o.label}</button>
      ))}
    </span>
  );
}

// Result card — baseline size in RED, estimated NEW size in GREEN, the +delta in GOLD (luxury).
function ResultCard({ k, oldVal, newVal, delta, c, card, goldGrad }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 160, padding: '13px 15px' }}>
      <div style={{ fontSize: 12, color: c.tx2, marginBottom: 5, fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 12, color: c.fire }}>{oldVal}</div>
      <div style={{ fontSize: 18.5, fontWeight: 800, color: c.green, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
        → {newVal}
        <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 8, backgroundImage: goldGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', letterSpacing: '0.01em' }}>{delta}</span>
      </div>
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
  const [totalCc, setTotalCc] = useState(RANGES.cc[0]); // min 5cc — cannot go below
  const [glansCc, setGlansCc] = useState(1); // glans split in EXACT 0.5cc steps (same at every total)
  const [glansBaseRatio, setGlansBaseRatio] = useState(GLANS_BASE_RATIO.default); // head baseline = ratio × shaft Ø
  const [view, setView] = useState('2d');
  const [webglOk] = useState(() => webglSupported());

  const t = useMemo(() => makeT(lang), [lang]);
  const c = PAL[theme] || PAL.dark;
  const isLight = theme === 'light';

  const baseGirthCm = baseMode === 'condom'
    ? girthFromWidth(CONDOM_LADDER[condomIdx].w)
    : girthFromDiameter(baseDiameterCm);

  // split: glansCc is the direct 0.5-step control; shaft gets the rest. Clamp glans ≤ total.
  const glansCcEff = Math.min(glansCc, totalCc);
  const shaftCc = totalCc - glansCcEff;
  // baseline head Ø = ratio × shaft Ø → scales with the chosen diameter (default 1.0 = shaft Ø)
  const baseGlansDiameterCm = glansBaseRatio * diameterFromGirth(baseGirthCm);

  const est = useMemo(
    () => estimate({ lengthCm, baseGirthCm, shaftCc, glansCc: glansCcEff, baseGlansDiameterCm }),
    [lengthCm, baseGirthCm, shaftCc, glansCcEff, baseGlansDiameterCm],
  );

  const isInch = lengthUnit === 'inch';
  const lenDisplay = isInch ? cmToInch(lengthCm) : lengthCm;
  const lenMin = isInch ? 2.5 : RANGES.lengthCm[0];
  const lenMax = isInch ? 10 : RANGES.lengthCm[1];
  const lenStep = isInch ? 0.1 : 0.5;
  const onLen = (v) => setLengthCm(isInch ? inchToCm(Number(v)) : Number(v));

  const glansPct = totalCc > 0 ? (glansCcEff / totalCc) * 100 : 0; // split-bar widths (derived)
  const bodyPct = 100 - glansPct;
  const showGraphic3D = view === '3d' && webglOk;

  const sizesUp = (lo, hi) => {
    const a = Math.max(0, lo), b = Math.max(0, hi);
    if (b <= 0) return t('sameSize');
    if (a === b) return `+${a} ${t('sizesUnit')}`;
    return `+${a} ${lang === 'th' ? 'ถึง' : 'to'} +${b} ${t('sizesUnit')}`;
  };
  const rangeTo = lang === 'th' ? 'ถึง' : 'to';

  // theme-driven visual tokens
  const titleGrad = isLight
    ? 'linear-gradient(135deg,#d97706,#dc2626,#b91c1c)'
    : 'linear-gradient(135deg,#f59e0b,#ef4444,#dc2626)';
  const glow = isLight
    ? 'radial-gradient(60% 130% at 50% 0%, rgba(220,38,38,.08), transparent 72%)'
    : 'radial-gradient(60% 130% at 50% 0%, rgba(239,68,68,.18), transparent 72%)';
  const softShadow = isLight
    ? '0 4px 16px rgba(15,23,42,.08)'
    : '0 1px 2px rgba(0,0,0,.5), 0 10px 28px rgba(0,0,0,.30)';
  const goldGrad = `linear-gradient(90deg, ${c.goldA}, ${c.goldB})`; // luxury delta
  // card with gradient hairline border (padding-box solid + border-box ember gradient)
  const card = (extra = {}) => ({
    border: '1px solid transparent',
    borderRadius: 16,
    background: `linear-gradient(${c.card},${c.card}) padding-box, linear-gradient(135deg,${c.fire}55,${c.amber}22) border-box`,
    boxShadow: softShadow,
    ...extra,
  });
  const cardInner = card({ background: `linear-gradient(${c.card2},${c.card2}) padding-box, linear-gradient(135deg,${c.fire}55,${c.amber}22) border-box`, boxShadow: 'none' });
  const sectionLabel = { fontSize: 13, color: c.tx2, fontWeight: 600 };

  return (
    <div style={{ background: c.bg, minHeight: '100vh', color: c.tx, overflowX: 'hidden', fontFamily: "'Sarabun', -apple-system, 'Segoe UI', sans-serif", transition: 'background-color .3s, color .3s' }}>
      <style>{`
        .fs-shell{ max-width:1040px; margin:0 auto; padding:max(18px,env(safe-area-inset-top)) 18px 48px; }
        .fs-grid{ display:grid; grid-template-columns:minmax(0,2fr) minmax(0,3fr); gap:18px; align-items:start; }
        .fs-controls{ order:1; } .fs-graphic{ order:2; }
        .fs-pill{ padding:4px 13px; border-radius:999px; font-size:11px; letter-spacing:.04em; text-transform:uppercase; font-weight:700;
          border:1px solid ${c.discBd}; background:${c.disc}; color:${c.discTx}; display:inline-flex; align-items:center; gap:5px; }
        .fs-tgl{ min-height:38px; min-width:42px; display:inline-flex; align-items:center; justify-content:center; gap:5px;
          font-size:13px; font-weight:600; border:1px solid ${c.line}; background:${c.card2}; color:${c.tx2};
          border-radius:10px; padding:0 11px; cursor:pointer; transition:border-color .15s, color .15s; }
        .fs-tgl:hover{ border-color:${c.fire}; color:${c.tx}; }
        .fs-btn:focus-visible, .fs-tgl:focus-visible, .fs-sel:focus-visible, .fs-range:focus-visible{
          outline:none; box-shadow:0 0 0 3px ${c.fire}55; }
        .fs-range{ -webkit-appearance:none; appearance:none; width:100%; height:7px; border-radius:4px; background:${c.line}; outline:none; touch-action:pan-y; cursor:pointer; }
        .fs-range::-webkit-slider-thumb{ -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:#fff; border:3px solid ${c.fire}; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.4), 0 0 0 5px ${c.fire}26; }
        .fs-range::-moz-range-thumb{ width:26px; height:26px; border-radius:50%; background:#fff; border:3px solid ${c.fire}; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.4); }
        .fs-range.glans::-webkit-slider-thumb{ border-color:${c.amber}; box-shadow:0 2px 6px rgba(0,0,0,.4), 0 0 0 5px ${c.amber}26; }
        .fs-range.glans::-moz-range-thumb{ border-color:${c.amber}; }
        .fs-sel{ width:100%; min-height:44px; background:${c.card2}; color:${c.tx}; border:1px solid ${c.line}; border-radius:10px; padding:10px 13px; font-size:15px; cursor:pointer; }
        .fs-num{ font-variant-numeric:tabular-nums; }
        @media (max-width:820px){ .fs-grid{ grid-template-columns:1fr; } .fs-graphic{ order:1; } .fs-controls{ order:2; } }
        @media (max-width:560px){ .fs-shell{ padding:max(14px,env(safe-area-inset-top)) 13px 40px; } }
        @media (prefers-reduced-motion:reduce){ *{ transition:none !important; } }
      `}</style>

      <div className="fs-shell">
        {/* ── centered hero header ─────────────────────────────── */}
        <div style={{ position: 'relative', marginBottom: 22 }}>
          <div style={{ position: 'absolute', inset: '-10px 0 auto 0', height: 220, background: glow, pointerEvents: 'none', zIndex: 0 }} />
          {/* lang / theme — floated top-right, out of the centered flow */}
          <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2, display: 'flex', gap: 8 }}>
            <button type="button" className="fs-tgl" aria-label="Language" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>{lang === 'th' ? 'EN' : 'ไทย'}</button>
            <button type="button" className="fs-tgl" aria-label="Theme" onClick={() => setTheme(isLight ? 'dark' : 'light')}>{isLight ? '🌙' : '☀'}</button>
          </div>
          {/* centered column */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: 8 }}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: 660 }}>
              <LoverMark c={c} isLight={isLight} h={46} />
              <h1 style={{ margin: 0, fontSize: 'clamp(23px,5.2vw,35px)', fontWeight: 800, lineHeight: 1.22, letterSpacing: '-0.01em', backgroundImage: titleGrad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', display: 'inline-block' }}>{t('title')}</h1>
              <div style={{ fontSize: 14, color: c.tx2, maxWidth: 560, lineHeight: 1.55 }}>{t('sub')}</div>
              <span className="fs-pill">🔒 {lang === 'th' ? 'ไม่จัดเก็บข้อมูล' : 'No data stored'}</span>
            </div>
          </div>
        </div>

        <div className="fs-grid">
          {/* controls */}
          <div className="fs-controls" style={card({ padding: '17px 18px' })}>
            <div style={{ ...sectionLabel, marginBottom: 15 }}>{t('adjust')}</div>

            {/* length */}
            <div style={{ marginBottom: 19 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: c.tx }}>{t('length')}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Seg c={c} value={lengthUnit} onChange={setLengthUnit} options={[{ v: 'inch', label: t('unitIn') }, { v: 'cm', label: t('unitCm') }]} />
                  <span className="fs-num" style={{ fontSize: 14, fontWeight: 700, color: c.tx, background: c.card2, border: `1px solid ${c.line}`, borderRadius: 8, padding: '5px 10px' }}>
                    {lenDisplay.toFixed(1)} {isInch ? t('unitIn') : t('unitCm')}
                  </span>
                </span>
              </div>
              <input className="fs-range" type="range" min={lenMin} max={lenMax} step={lenStep} value={lenDisplay} onChange={(e) => onLen(e.target.value)} aria-label={t('length')} />
            </div>

            {/* baseline */}
            <div style={{ marginBottom: 19 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: c.tx }}>{t('baseSize')}</span>
                <Seg c={c} value={baseMode} onChange={setBaseMode} options={[{ v: 'condom', label: t('condomMode') }, { v: 'diameter', label: t('diaMode') }]} />
              </div>
              {baseMode === 'condom' ? (
                <select className="fs-sel" value={condomIdx} onChange={(e) => setCondomIdx(Number(e.target.value))} aria-label={t('baseSize')}>
                  {CONDOM_LADDER.map((cd, i) => (
                    <option key={cd.w} value={i}>{`${cd.label} (${cd.w} ${lang === 'th' ? 'มม.' : 'mm'} · ${t('resGirth').split(' ')[0]} ${r1(girthFromWidth(cd.w))})`}</option>
                  ))}
                </select>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 7 }}>
                    <span className="fs-num" style={{ fontSize: 13.5, color: c.tx }}>Ø {baseDiameterCm.toFixed(1)} · {r1(girthFromDiameter(baseDiameterCm))} {t('unitCm')}</span>
                  </div>
                  <input className="fs-range" type="range" min={RANGES.diameterCm[0]} max={RANGES.diameterCm[1]} step={0.1} value={baseDiameterCm} onChange={(e) => setBaseDiameterCm(Number(e.target.value))} aria-label={t('baseSize')} />
                </>
              )}
            </div>

            {/* initial glans (head) size — ratio of shaft Ø, default centered, scales with diameter */}
            <div style={{ marginBottom: 19 }}>
              <div style={{ fontSize: 14, color: c.tx, marginBottom: 7 }}>{t('glansBase')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: c.tx2, marginBottom: 7 }}>
                <span>{t('gSmall')}</span><span>{t('gNormal')}</span><span>{t('gLarge')}</span>
              </div>
              <input className="fs-range glans" type="range" min={GLANS_BASE_RATIO.min} max={GLANS_BASE_RATIO.max} step={GLANS_BASE_RATIO.step} value={glansBaseRatio} onChange={(e) => setGlansBaseRatio(Number(e.target.value))} aria-label={t('glansBase')} />
            </div>

            {/* filler split */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: c.tx }}>{t('totalFiller')}</span>
                <span className="fs-num" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})`, borderRadius: 8, padding: '5px 11px' }}>{totalCc} {t('cc')}</span>
              </div>
              <input className="fs-range" type="range" min={RANGES.cc[0]} max={RANGES.cc[1]} step={1} value={totalCc} onChange={(e) => { const v = Number(e.target.value); setTotalCc(v); if (glansCc > v) setGlansCc(v); }} aria-label={t('totalFiller')} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, margin: '15px 0 8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: c.tx }}>{t('splitLabel')}</span>
                <span className="fs-num" style={{ fontSize: 12.5, color: c.tx2 }}>{t('shaft')} {ccFmt(shaftCc)} · {t('glans')} {ccFmt(glansCcEff)}</span>
              </div>
              <input className="fs-range glans" type="range" min={0} max={totalCc} step={0.5} value={glansCcEff} onChange={(e) => setGlansCc(Number(e.target.value))} aria-label={t('splitLabel')} />
              <div style={{ height: 30, borderRadius: 9, overflow: 'hidden', display: 'flex', border: `1px solid ${c.line}`, marginTop: 8 }}>
                <div style={{ flex: `0 0 ${bodyPct}%`, background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'flex-basis .12s' }}>{bodyPct > 14 ? `${t('shaft')} ${ccFmt(shaftCc)}${t('cc')}` : ''}</div>
                <div style={{ flex: `0 0 ${100 - bodyPct}%`, background: `linear-gradient(90deg, ${c.amber}, ${c.ember})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'flex-basis .12s' }}>{(100 - bodyPct) > 14 ? `${t('glans')} ${ccFmt(glansCcEff)}` : ''}</div>
              </div>
            </div>
          </div>

          {/* graphic (no gate) */}
          <div className="fs-graphic" style={card({ padding: '17px 18px' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 13, flexWrap: 'wrap' }}>
              <span style={sectionLabel}>{t('graphic')}</span>
              {webglOk && (
                <Seg c={c} value={view} onChange={setView} options={[{ v: '2d', label: t('view2d') }, { v: '3d', label: t('view3d') }]} />
              )}
            </div>
            <div style={{ minHeight: 232 }}>
              {showGraphic3D ? (
                <Suspense fallback={<div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.tx2 }}>…</div>}>
                  <Filler3D est={est} lengthCm={lengthCm} t={t} />
                </Suspense>
              ) : (
                <FillerGraphic2D est={est} lengthCm={lengthCm} theme={theme} t={t} />
              )}
            </div>
            {view === '3d' && webglOk && (
              <div style={{ fontSize: 11.5, color: c.tx2, marginTop: 7 }}>{t('rotateHint')}</div>
            )}
          </div>
        </div>

        {/* results */}
        <div style={card({ marginTop: 18, padding: '17px 18px' })}>
          <div style={{ ...sectionLabel, marginBottom: 14 }}>{t('resultsHeader')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 11 }}>
            <ResultCard c={c} card={cardInner} goldGrad={goldGrad} k={t('resGirth')} oldVal={`${t('before')} ${r1(est.c0)} ${t('unitCm')}`} newVal={`${r1(est.c1Low)} – ${r1(est.c1High)} ${t('unitCm')}`} delta={`+${r1(est.deltaCLow)} ${rangeTo} +${r1(est.deltaCHigh)}`} />
            <ResultCard c={c} card={cardInner} goldGrad={goldGrad} k={t('resDia')} oldVal={`${t('before')} ${r1(est.d0)} ${t('unitCm')}`} newVal={`${r1(est.d1Low)} – ${r1(est.d1High)} ${t('unitCm')}`} delta={`+${r1(est.d1Low - est.d0)} ${rangeTo} +${r1(est.d1High - est.d0)}`} />
            <ResultCard c={c} card={cardInner} goldGrad={goldGrad} k={t('resCondom')} oldVal={`${t('before')} ${est.condom0.label}`} newVal={est.condomLow.index === est.condomHigh.index ? est.condomLow.label : `${est.condomLow.label} – ${est.condomHigh.label}`} delta={sizesUp(est.sizesUpLow, est.sizesUpHigh)} />
          </div>
          <div style={{ fontSize: 11.5, color: c.tx2, marginTop: 12, lineHeight: 1.5 }}>{t('note')}</div>
        </div>

        <div style={{ marginTop: 16, background: c.disc, border: `1px solid ${c.discBd}`, borderRadius: 12, padding: '12px 15px', fontSize: 11.5, color: c.discTx, lineHeight: 1.55 }}>
          {lang === 'th' ? '🇹🇭 ' : '🇬🇧 '}{t('disclaimer')}
        </div>
      </div>
    </div>
  );
}
