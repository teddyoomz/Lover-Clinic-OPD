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

const r1 = (x) => (Math.floor((Number(x) || 0) * 10) / 10).toFixed(1); // round DOWN (conservative — under-promise results)
// exact cc display — round to 2 decimals + trim trailing zeros (2.5 stays 2.5, 5 stays 5).
const ccFmt = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

// Clinic contact — public marketing info, hardcoded (page is pure-client, no Firestore).
const CLINIC_CONTACT = { tel: '0975251525', telDisplay: '097-525-1525', line: 'https://lin.ee/mFFsDkG', fb: 'https://www.facebook.com/loverclinickorat' };
const IconPhone = ({ fill, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
);
const IconLine = ({ fill, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} aria-hidden="true"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
);
const IconFb = ({ fill, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
);
// theme-aware brand tokens — dark: filled brand + white icon · light: soft tint + deepened brand icon/label + border
const CONTACT_BRAND = {
  call: { href: `tel:${CLINIC_CONTACT.tel}`, ext: false, Icon: IconPhone,
    dark: { bg: 'linear-gradient(90deg,#dc2626,#ef4444)', fg: '#fff', bd: 'transparent' }, light: { bg: '#fef2f2', fg: '#be123c', bd: '#fbcfcf' } },
  line: { href: CLINIC_CONTACT.line, ext: true, Icon: IconLine, label: 'LINE',
    dark: { bg: '#06C755', fg: '#fff', bd: 'transparent' }, light: { bg: '#ecfdf3', fg: '#047a43', bd: '#a7f0c6' } },
  fb: { href: CLINIC_CONTACT.fb, ext: true, Icon: IconFb, label: 'Facebook',
    dark: { bg: '#1877F2', fg: '#fff', bd: 'transparent' }, light: { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bcd7fb' } },
};
const CONTACT_KEYS = ['call', 'line', 'fb'];

// header (compact icon) + footer (full) reuse this — Rule of 3.
function ContactButtons({ variant, isLight, lang }) {
  const compact = variant === 'icon';
  return (
    <div style={{ display: 'flex', gap: compact ? 8 : 10, ...(compact ? {} : { width: '100%' }) }}>
      {CONTACT_KEYS.map((k) => {
        const b = CONTACT_BRAND[k];
        const sk = isLight ? b.light : b.dark;
        const Icon = b.Icon;
        const label = k === 'call' ? (lang === 'th' ? 'โทร' : 'Call') : b.label;
        return (
          <a key={k} href={b.href} {...(b.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="fs-contact" aria-label={label}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none',
              background: sk.bg, color: sk.fg, border: `1px solid ${sk.bd}`,
              ...(compact ? { width: 42, height: 42, borderRadius: 11 } : { flex: 1, padding: '13px 0', borderRadius: 12, fontWeight: 800, fontSize: 14 }) }}>
            <Icon fill={sk.fg} s={compact ? 20 : 17} />
            {!compact && <span>{label}</span>}
          </a>
        );
      })}
    </div>
  );
}

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
          style={{ fontSize: 12, padding: '10px 14px', border: 0, cursor: 'pointer', minHeight: 44,
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
  const [totalCc, setTotalCc] = useState(10); // default 10cc (min RANGES.cc[0]=5 — cannot go below)
  const [glansCc, setGlansCc] = useState(0); // default split: shaft 10 · glans 0 — EXACT 0.5cc steps (same at every total)
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
        .fs-grid{ display:grid; grid-template-columns:minmax(0,2fr) minmax(0,3fr); gap:18px; align-items:stretch; }
        .fs-controls{ order:1; } .fs-graphic{ order:2; }
        .fs-pill{ padding:4px 13px; border-radius:999px; font-size:11px; letter-spacing:.04em; text-transform:uppercase; font-weight:700;
          border:1px solid ${c.discBd}; background:${c.disc}; color:${c.discTx}; display:inline-flex; align-items:center; gap:5px; }
        .fs-tgl{ min-height:44px; min-width:44px; display:inline-flex; align-items:center; justify-content:center; gap:5px;
          font-size:13px; font-weight:600; border:1px solid ${c.line}; background:${c.card2}; color:${c.tx2};
          border-radius:10px; padding:0 11px; cursor:pointer; transition:border-color .15s, color .15s; }
        .fs-tgl:hover{ border-color:${c.fire}; color:${c.tx}; }
        /* iPad / touch / stylus: kill tap-delay + grey tap-highlight + long-press text-select on controls */
        .fs-btn, .fs-tgl, .fs-sel{ touch-action: manipulation; -webkit-tap-highlight-color: transparent; -webkit-user-select:none; user-select:none; }
        .fs-contact{ touch-action:manipulation; -webkit-tap-highlight-color:transparent; transition:transform .1s, filter .15s; }
        .fs-contact:hover{ filter:brightness(1.07); }
        .fs-contact:active{ transform:scale(.95); }
        .fs-btn:focus-visible, .fs-tgl:focus-visible, .fs-sel:focus-visible, .fs-range:focus-visible{
          outline:none; box-shadow:0 0 0 3px ${c.fire}55; }
        .fs-range{ -webkit-appearance:none; appearance:none; width:100%; height:7px; border-radius:4px; background:${c.line}; outline:none; touch-action:pan-y; cursor:pointer; }
        .fs-range::-webkit-slider-thumb{ -webkit-appearance:none; width:30px; height:30px; border-radius:50%; background:#fff; border:3px solid ${c.fire}; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.4), 0 0 0 5px ${c.fire}26; }
        .fs-range::-moz-range-thumb{ width:30px; height:30px; border-radius:50%; background:#fff; border:3px solid ${c.fire}; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.4); }
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
              {/* contact (header) — centered row, robust on mobile vs the wide logo */}
              <ContactButtons variant="icon" isLight={isLight} lang={lang} />
            </div>
          </div>
        </div>

        <div className="fs-grid">
          {/* controls */}
          <div className="fs-controls" style={card({ padding: '17px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' })}>
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

              <div style={{ margin: '15px 0 8px' }}>
                <span style={{ fontSize: 14, color: c.tx }}>{t('splitLabel')}</span>
              </div>
              <input className="fs-range glans" type="range" min={0} max={totalCc} step={0.5} value={glansCcEff} onChange={(e) => setGlansCc(Number(e.target.value))} aria-label={t('splitLabel')} />
              {/* clean proportion strip — NO in-segment text. Labels live in the legend below so they
                  NEVER clip/cram when a segment is narrow (small-glans display bug fix). */}
              <div style={{ height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex', border: `1px solid ${c.line}`, marginTop: 10 }}>
                <div style={{ flex: `0 0 ${bodyPct}%`, background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})`, transition: 'flex-basis .12s' }} />
                <div style={{ flex: `0 0 ${100 - bodyPct}%`, background: `linear-gradient(90deg, ${c.amber}, ${c.ember})`, transition: 'flex-basis .12s' }} />
              </div>
              {/* legend — ALWAYS full text, color-keyed to the bar (readable at any split) */}
              <div className="fs-num" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.tx }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, flex: 'none', background: `linear-gradient(90deg, ${c.fire2}, ${c.fire})` }} />
                  {t('shaft')} {ccFmt(shaftCc)} {t('cc')}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.tx }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, flex: 'none', background: `linear-gradient(90deg, ${c.amber}, ${c.ember})` }} />
                  {t('glans')} {ccFmt(glansCcEff)} {t('cc')}
                </span>
              </div>
            </div>
          </div>

          {/* graphic (no gate) */}
          <div className="fs-graphic" style={card({ padding: '17px 18px', display: 'flex', flexDirection: 'column' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 13, flexWrap: 'wrap' }}>
              <span style={sectionLabel}>{t('graphic')}</span>
              {webglOk && (
                <Seg c={c} value={view} onChange={setView} options={[{ v: '2d', label: t('view2d') }, { v: '3d', label: t('view3d') }]} />
              )}
            </div>
            <div style={{ flex: 1, minHeight: 232, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {showGraphic3D ? (
                <Suspense fallback={<div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.tx2 }}>…</div>}>
                  <Filler3D est={est} lengthCm={lengthCm} theme={theme} t={t} />
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
            <ResultCard c={c} card={cardInner} goldGrad={goldGrad} k={t('resCondom')} oldVal={`${t('before')} ${est.condom0.label}`} newVal={est.condomLow.index === est.condomHigh.index ? est.condomLow.label : `${est.condomLow.label} – ${est.condomHigh.label}`} delta={(est.condomLow.beyond || est.condomHigh.beyond) ? t('beyondStd') : sizesUp(est.sizesUpLow, est.sizesUpHigh)} />
          </div>
          <div style={{ fontSize: 11.5, color: c.tx2, marginTop: 12, lineHeight: 1.5 }}>{t('note')}</div>
        </div>

        {/* footer — contact buttons (call · LINE OA · Facebook) */}
        <div style={card({ marginTop: 18, padding: '15px 18px' })}>
          <ContactButtons variant="full" isLight={isLight} lang={lang} />
          <div className="fs-num" style={{ textAlign: 'center', fontSize: 11, color: c.tx2, marginTop: 11 }}>
            {CLINIC_CONTACT.telDisplay} · LINE OA · facebook.com/loverclinickorat
          </div>
        </div>

        <div style={{ marginTop: 16, background: c.disc, border: `1px solid ${c.discBd}`, borderRadius: 12, padding: '12px 15px', fontSize: 11.5, color: c.discTx, lineHeight: 1.55 }}>
          {lang === 'th' ? '🇹🇭 ' : '🇬🇧 '}{t('disclaimer')}
        </div>
      </div>
    </div>
  );
}
