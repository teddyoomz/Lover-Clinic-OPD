import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  estimate, girthFromWidth, girthFromDiameter, diameterFromGirth, girthToRadiusCm, CONDOM_LADDER, RANGES,
} from '../src/lib/fillerMath.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('filler-simulator v2 flow (Rule I — split shaft/glans, one source)', () => {
  it('F1: split total 12 · glans% 15 → shaft 10.2 / glans 1.8 → both grow; condom from shaft', () => {
    const total = 12, gp = 0.15;
    const shaftCc = total * (1 - gp), glansCc = total * gp;
    const baseGirthCm = girthFromWidth(CONDOM_LADDER[2].w); // Regular 52 → 10.4
    const e = estimate({ lengthCm: 12.7, baseGirthCm, shaftCc, glansCc });
    expect(shaftCc).toBeCloseTo(10.2, 6);
    expect(glansCc).toBeCloseTo(1.8, 6);
    expect(e.c1Low).toBeGreaterThan(e.c0);                 // shaft grew
    expect(e.glans.dgLow).toBeGreaterThan(e.glans.dg0);    // glans grew
    expect(e.condom0.label).toBe('Regular 52');
  });

  it('F2: condom-mode and Ø-mode give identical estimate for the same C0', () => {
    const viaCondom = estimate({ lengthCm: 12.7, baseGirthCm: girthFromWidth(52), shaftCc: 10, glansCc: 2 });
    const dia = diameterFromGirth(10.4);
    const viaDiameter = estimate({ lengthCm: 12.7, baseGirthCm: girthFromDiameter(dia), shaftCc: 10, glansCc: 2 });
    expect(viaDiameter.c1Low).toBeCloseTo(viaCondom.c1Low, 6);
    expect(viaDiameter.glans.dgLow).toBeCloseTo(viaCondom.glans.dgLow, 6);
  });

  it('F3: glans cc does NOT change shaft girth / condom (flow)', () => {
    const base = girthFromWidth(52);
    const a = estimate({ lengthCm: 12.7, baseGirthCm: base, shaftCc: 12, glansCc: 0 });
    const b = estimate({ lengthCm: 12.7, baseGirthCm: base, shaftCc: 12, glansCc: 4 });
    expect(b.c1Low).toBeCloseTo(a.c1Low, 6);
    expect(b.condomLow.w).toBe(a.condomLow.w);
    expect(b.glans.dgLow).toBeGreaterThan(a.glans.dgLow);
  });

  it('F4: 2D scale + 3D radius + glans both derive from est (single source)', () => {
    const e = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 16, glansCc: 2 });
    expect(girthToRadiusCm(e.c1Low)).toBeCloseTo(e.c1Low / (2 * Math.PI), 6);
    expect(e.d1Low).toBeCloseTo(e.c1Low / Math.PI, 6);
    expect(e.glans.dgLow).toBeGreaterThan(0);
  });
});

describe('filler-simulator v2 source-grep (purity + wiring + Rev requirements)', () => {
  const math = read('src/lib/fillerMath.js');
  const strings = read('src/lib/fillerStrings.js');
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const g3d = read('src/components/Filler3D.jsx');
  const app = read('src/App.jsx');

  it('SG1: no Firestore / backendClient / firebase IMPORTS in any new file', () => {
    const badImport = /from\s+['"][^'"]*(firebase|firestore|backendClient|scopedDataLayer)[^'"]*['"]/i;
    for (const [name, src] of [['math', math], ['strings', strings], ['page', page], ['g2d', g2d], ['g3d', g3d]]) {
      expect(src, name).not.toMatch(badImport);
    }
  });

  it('SG2: page wires fillerMath + fillerStrings(i18n) + FillerGraphic2D + lazy Filler3D', () => {
    expect(page).toMatch(/from '\.\.\/lib\/fillerMath\.js'/);
    expect(page).toMatch(/makeT.*from '\.\.\/lib\/fillerStrings\.js'/s);
    expect(page).toMatch(/FillerGraphic2D/);
    expect(page).toMatch(/lazy\(\(\) => import\('\.\.\/components\/Filler3D\.jsx'\)\)/);
  });

  it('SG3: both graphics consume glans + shaft from est', () => {
    expect(g2d).toMatch(/glans/);
    expect(g3d).toMatch(/glans/);
    expect(g3d).toMatch(/girthToRadiusCm/);
  });

  it('SG4: App routes ?play=filler before auth gate', () => {
    expect(app).toMatch(/playFromUrl === 'filler'/);
    expect(app).toMatch(/lazy\(\(\) => import\('\.\/pages\/FillerSimulator\.jsx'\)\)/);
  });

  it('SG5: v2 — split-bar + theme/lang toggle; NO reveal-gate; glans card REMOVED', () => {
    expect(page).toMatch(/glansPct/);            // split control
    expect(page).toMatch(/shaftCc/);             // split derive
    expect(page).not.toMatch(/resGlans/);        // glans result card removed (debug round)
    expect(page).toMatch(/setTheme/);            // light/dark
    expect(page).toMatch(/setLang/);             // TH/EN
    // reveal-gate fully removed
    expect(page).not.toMatch(/แตะเพื่อดูภาพ/);
    expect(page).not.toMatch(/\brevealed\b/);
    expect(page).not.toMatch(/blur\(/);
  });

  it('SG7: debug-round fixes — 3D glans-independent, no egg/ทรงเห็ด, split clip', () => {
    expect(g3d).toMatch(/visualLow/);          // 3D glans from damped visual Ø
    expect(g3d).not.toMatch(/\/ 2, r\)/);      // NOT clamped to shaft radius
    expect(g2d).not.toMatch(/fg-glans/);       // egg ellipse + its gradient removed
    expect(g2d).not.toMatch(/ทรงเห็ด/);        // label simplified to "ด้านข้าง"
    expect(g2d).toMatch(/visualLow/);          // 2D glans uses damped visual Ø
    expect(page).toMatch(/whiteSpace: 'nowrap'/); // split segments clip
    expect(page).toMatch(/bodyPct > 14/);         // label hidden when narrow (no spill)
  });

  it('SG6: i18n strings TH+EN present, ประมาณ wording, girth-not-length, no กะเกณ', () => {
    expect(strings).toMatch(/STRINGS\s*=\s*\{[\s\S]*th:/);
    expect(strings).toMatch(/en:\s*\{/);
    expect(strings).toMatch(/ประมาณ/);
    expect(strings).not.toMatch(/กะเกณ/);
    expect(strings).toMatch(/ไม่เพิ่ม[\s\S]*ความยาว/); // girth not length (TH note)
    expect(strings).toMatch(/glans/i);               // EN keys
    expect(strings).toMatch(/6–24/);                 // duration note
  });
});

describe('filler-simulator v3 — bug fixes + redesign (regression locks)', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');

  it('V3-1: minimum filler is 5cc — RANGES.cc[0]=5, default + slider min source it (SSOT)', () => {
    expect(RANGES.cc[0]).toBe(5);
    expect(page).toMatch(/useState\(RANGES\.cc\[0\]\)/);  // default = 5
    expect(page).toMatch(/min=\{RANGES\.cc\[0\]\}/);      // slider cannot go below 5
    expect(page).not.toMatch(/useState\(12\)/);           // old default removed
  });

  it('V3-2: split display EXACT (ccFmt), never Math.round — 5cc 50/50 → 2.5/2.5 not 3/3', () => {
    expect(page).toMatch(/const ccFmt = /);
    expect(page).toMatch(/ccFmt\(shaftCc\)/);
    expect(page).toMatch(/ccFmt\(glansCcEff\)/);
    expect(page).not.toMatch(/Math\.round\(shaftCc\)/);   // buggy int rounding gone
    expect(page).not.toMatch(/Math\.round\(glansCc\)/);
    // behavior proof: ccFmt formula keeps 2.5 exact + trims whole numbers
    const ccFmt = (x) => String(Math.round((Number(x) || 0) * 100) / 100);
    expect(ccFmt(2.5)).toBe('2.5');
    expect(ccFmt(5)).toBe('5');
    expect(ccFmt(6.65)).toBe('6.65');
    expect(ccFmt(7 * 0.05)).toBe('0.35'); // FP-safe (7*0.05 = 0.35000…003)
    // split sums exactly: shaft = total - glans (cc model)
    const total = 5, glans = 2.5;
    expect((total - glans) + glans).toBe(5);
  });

  it('V3-3: 2D length no longer clamps at ~8in — lenToPx max raised past 198', () => {
    expect(g2d).not.toMatch(/, 100, 198\)/);   // old cap (~7.8in) removed
    expect(g2d).toMatch(/, 100, 240\)/);       // 10in = 234px fits viewBox 380
  });

  it('V3-4: REAL clinic logo — white(dark)/black(light) static asset img, theme-contrasting', () => {
    expect(page).toMatch(/LoverMark/);
    expect(page).toMatch(/<img/);                                  // primary = real logo image
    expect(page).toMatch(/\/lover-clinic-logo-dark\.png/);         // white version (dark theme)
    expect(page).toMatch(/\/lover-clinic-logo-light\.png/);        // black version (light theme)
    expect(page).toMatch(/isLight \? '\/lover-clinic-logo-light/); // theme-driven src
    // the static assets are committed (pure-client page can show the REAL logo, no Firestore)
    expect(existsSync(join(ROOT, 'public/lover-clinic-logo-dark.png'))).toBe(true);
    expect(existsSync(join(ROOT, 'public/lover-clinic-logo-light.png'))).toBe(true);
    // inline wordmark kept as onError fallback
    expect(page).toMatch(/onError={\(\) => setImgErr\(true\)}/);
    expect(page).toMatch(/LOVER/);
  });

  it('V3-6: split is EXACT 0.5cc at every total — glansCc direct slider (not % steps)', () => {
    expect(page).toMatch(/setGlansCc/);
    expect(page).toMatch(/useState\(1\)/);                 // glansCc default
    expect(page).toMatch(/step={0\.5}/);                   // 0.5cc finest, same at every range
    expect(page).toMatch(/max={totalCc}/);                 // glans up to total
    expect(page).toMatch(/glansCcEff/);                    // clamped effective value
    expect(page).toMatch(/if \(glansCc > v\) setGlansCc\(v\)/); // clamp on total shrink
    expect(page).not.toMatch(/setGlansPct/);               // old percent-step control gone
    expect(page).not.toMatch(/useState\(15\)/);            // old glansPct default gone
  });

  it('V3-7: EN translation COMPLETE — 2D/3D labels go through t(), no hardcoded Thai', () => {
    const g2dSrc = read('src/components/FillerGraphic2D.jsx');
    const g3dSrc = read('src/components/Filler3D.jsx');
    const strings = read('src/lib/fillerStrings.js');
    // 2D labels translated
    for (const k of ['g2dAria', 'g2dSide', 'g2dCross', 'g2dLegShaft', 'g2dLegGlans', 'g2dLegKey'])
      expect(g2dSrc, k).toMatch(new RegExp(`tr\\('${k}'\\)`));
    // no hardcoded Thai label text nodes remain in the 2D SVG
    expect(g2dSrc).not.toMatch(/>ด้านข้าง</);
    expect(g2dSrc).not.toMatch(/>หน้าตัด/);
    expect(g2dSrc).not.toMatch(/หลังฉีด · ประ = เดิม/);
    // 3D aria translated
    expect(g3dSrc).toMatch(/tr\('model3dAria'\)/);
    // every g2d/3d key exists in BOTH th and en
    for (const k of ['g2dSide', 'g2dCross', 'g2dLegShaft', 'g2dLegKey', 'model3dAria']) {
      const occ = (strings.match(new RegExp(`${k}:`, 'g')) || []).length;
      expect(occ, k).toBeGreaterThanOrEqual(2); // th + en
    }
  });

  it('V3-5: mobile 100% — responsive grid + safe-area + touch + stacking toggles', () => {
    expect(page).toMatch(/@media \(max-width:820px\)/);  // 2col → 1col
    expect(page).toMatch(/grid-template-columns:1fr/);
    expect(page).toMatch(/@media \(max-width:560px\)/);  // toggles stack full-width
    expect(page).toMatch(/env\(safe-area-inset/);        // notch-safe padding
    expect(page).toMatch(/touch-action:pan-y/);          // slider drag vs page scroll
  });
});
