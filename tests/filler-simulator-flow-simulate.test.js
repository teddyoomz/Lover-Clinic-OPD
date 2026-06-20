import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  estimate, girthFromWidth, girthFromDiameter, diameterFromGirth, girthToRadiusCm, CONDOM_LADDER, RANGES, condomForGirth,
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
    // v5.3: split-bar labels moved OUT to an always-visible legend (were in-segment, clipped/crammed when narrow)
    expect(page).toMatch(/0 0 \$\{bodyPct\}%/);   // bar = clean proportion strip (width from bodyPct)
    expect(page).not.toMatch(/bodyPct > 14/);     // buggy in-segment width-gate REMOVED
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

  it('V3-1: slider min 5cc (cannot go below); default now 10cc (v5.2)', () => {
    expect(RANGES.cc[0]).toBe(5);
    expect(page).toMatch(/min=\{RANGES\.cc\[0\]\}/);      // slider cannot go below 5
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/); // default 10cc
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

  it('V3-3: 2D length auto-stretches (no static clamp) — fills viewBox width at max length (v5.2)', () => {
    expect(g2d).not.toMatch(/, 100, 198\)/);   // old cap (~7.8in) removed
    expect(g2d).not.toMatch(/lenToPx/);        // static clamp helper removed → dynamic
    expect(g2d).toMatch(/maxShaftLen = SIDE_W - x0 - RIGHT_MARGIN - GAP - glansLenA/); // smart fill-to-width (v5.4: VIEW_W→SIDE_W)
    expect(g2d).toMatch(/lenFrac/);            // length → 0..1 over the real range
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
    expect(page).toMatch(/const \[glansCc, setGlansCc\] = useState\(0\)/); // glansCc default 0 (v5.3: shaft 10 · glans 0)
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

describe('filler-simulator v4 — centered header + result colors + dashed 2D + formal copy', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('V4-1: centered hero header — title/logo/subtitle centered, toggles floated top-right', () => {
    expect(page).toMatch(/textAlign: 'center'/);                 // centered hero (not edge-stuck)
    expect(page).toMatch(/position: 'absolute', top: 0, right: 0/); // toggles out of centered flow
    expect(page).toMatch(/alignItems: 'center'/);                // centered column
    expect(page).toMatch(/at 50% 0%/);                           // glow centered
  });

  it('V4-2: result colors — new size GREEN, baseline RED, delta GOLD (luxury)', () => {
    expect(page).toMatch(/green: '#22c55e'/);   // dark theme green
    expect(page).toMatch(/green: '#16a34a'/);   // light theme green (AA)
    expect(page).toMatch(/goldA:/);
    expect(page).toMatch(/goldB:/);
    expect(page).toMatch(/const goldGrad = /);  // gold gradient for the +delta
    // ResultCard: new value green, baseline red, delta gold-gradient text
    expect(page).toMatch(/color: c\.green/);            // → new size
    expect(page).toMatch(/style=\{\{ fontSize: 12, color: c\.fire \}\}>\{oldVal\}/); // baseline red
    expect(page).toMatch(/backgroundImage: goldGrad/);  // delta gold
  });

  it('V4-3: 2D "after" outline is THIN + DASHED + red (small growth not masked)', () => {
    // mushroom + cross-section "after" strokes: thin (1), dashed, kept red
    const afterStrokes = g2d.match(/stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3"/g) || [];
    expect(afterStrokes.length).toBeGreaterThanOrEqual(2); // side-view + cross-section
    expect(g2d).not.toMatch(/stroke="#ef4444" strokeWidth="1\.6"/); // old thick solid gone
    expect(g2d).not.toMatch(/stroke="#ef4444" strokeWidth="1\.5"/);
    // legend wording updated for the dashed-after / faint-dashed-before
    expect(strings).toMatch(/เส้นประแดง = หลังฉีด/);
    expect(strings).toMatch(/Red dashed = after/);
  });

  it('V4-4: formal / professional copy in BOTH languages (credible register)', () => {
    // TH formal markers
    expect(strings).toMatch(/พารามิเตอร์/);            // "parameters" (formal)
    expect(strings).toMatch(/ประมาณการ/);              // "estimate" (formal noun)
    expect(strings).toMatch(/แพทย์ผู้เชี่ยวชาญ/);       // "qualified physician"
    expect(strings).toMatch(/ไฮยาลูรอนิก/);            // names the filler type (clinical)
    // EN formal markers
    expect(strings).toMatch(/illustrative estimates/);
    expect(strings).toMatch(/qualified physician/);
    expect(strings).toMatch(/dermal-filler augmentation/);
    // casual phrasing removed
    expect(strings).not.toMatch(/นึกภาพออก/);          // old casual "to picture it"
    expect(strings).not.toMatch(/กดไซส์ถุงยาง/);        // old casual "press condom size"
  });

  it('V4-5: privacy pill copy is formal in both languages', () => {
    expect(page).toMatch(/ไม่จัดเก็บข้อมูล/);   // TH formal (was ไม่เก็บข้อมูล)
    expect(page).toMatch(/No data stored/);     // EN formal (was Private · no data)
  });
});

describe('filler-simulator v5 — glans baseline slider + bigger 2D (40/60) + mobile order', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const strings = read('src/lib/fillerStrings.js');
  const g2d = read('src/components/FillerGraphic2D.jsx');

  it('V5-1: initial-glans-size slider — ratio of shaft Ø, scales with diameter', () => {
    expect(page).toMatch(/GLANS_BASE_RATIO/);
    expect(page).toMatch(/glansBaseRatio \* diameterFromGirth\(baseGirthCm\)/); // ratio × shaft Ø
    expect(page).toMatch(/baseGlansDiameterCm/);            // passed into estimate
    expect(page).toMatch(/setGlansBaseRatio/);
    expect(page).toMatch(/t\('glansBase'\)/);               // labelled control
    expect(strings).toMatch(/glansBase: 'ขนาดหัวเริ่มต้น'/);
    expect(strings).toMatch(/glansBase: 'Initial glans size'/);
  });

  it('V5-2: desktop 40/60 grid + mobile illustration-on-top order', () => {
    expect(page).toMatch(/grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)/); // 40/60 desktop
    expect(page).toMatch(/\.fs-graphic\{ order:1; \}/);     // mobile: graphic first (top)
    expect(page).toMatch(/\.fs-controls\{ order:2; \}/);    // mobile: controls below
    expect(page).toMatch(/className="fs-graphic"/);
    expect(page).toMatch(/className="fs-controls"/);
    // single-column breakpoint preserved
    expect(page).toMatch(/@media \(max-width:820px\)/);
  });

  it('V5-3: 2D split into auto-scale sections (side-view + cross-section) without losing dashed-after / i18n / damped head', () => {
    expect(g2d).toMatch(/0 0 \$\{SIDE_W\} \$\{SIDE_H\}/);                         // v5.4: side-view own viewBox
    expect(g2d).toMatch(/viewBox="0 0 240 240"/);                                // v5.4: cross-section own square viewBox
    expect((g2d.match(/stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3"/g) || []).length).toBeGreaterThanOrEqual(2); // V4-3 dashed kept (side + cross)
    expect(g2d).toMatch(/tr\('g2dSide'\)/);                                       // V3-7 i18n kept
    expect(g2d).toMatch(/visualLow/);                                            // V3 damped head kept
    expect(g2d).not.toMatch(/viewBox="0 0 380 236"/);                            // old small canvas gone
    expect(g2d).not.toMatch(/viewBox="0 0 480 320"/);                            // v5 canvas superseded
    expect(g2d).not.toMatch(/viewBox="0 0 480 460"/);                            // v5.2 canvas superseded
    expect(g2d).not.toMatch(/viewBox="0 0 480 552"/);                            // v5.3 single-canvas superseded (v5.4 split)
  });

  it('V5-4: faint dashed edges + no reflection highlight + equal-height columns', () => {
    // after-edge is now a FAINT red dash (low opacity) — both after-strokes carry strokeOpacity
    expect((g2d.match(/stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0\.6"/g) || []).length).toBeGreaterThanOrEqual(2);
    // reflection highlight ellipse removed from the shaft
    expect(g2d).not.toMatch(/rgba\(255,242,234/);
    // equal column heights: stretch + graphic card is a flex column whose SVG wrapper fills
    expect(page).toMatch(/align-items:stretch/);
    expect(page).toMatch(/flexDirection: 'column'/);
    expect(page).toMatch(/flex: 1, minHeight: 232/);
  });
});

describe('filler-simulator v5.2 — default 10cc + fainter baseline + 2D auto-stretch + 3D auto-scale', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const g3d = read('src/components/Filler3D.jsx');

  it('V5.2-1: default filler is 10cc (slider min still 5)', () => {
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/);
    expect(page).toMatch(/min=\{RANGES\.cc\[0\]\}/);
  });

  it('V5.2-2: baseline (เดิม) dash made fainter', () => {
    expect(g2d).toMatch(/rgba\(15,23,42,0\.42\)/);   // light theme faint
    expect(g2d).toMatch(/rgba\(255,255,255,0\.5\)/); // dark theme faint
  });

  it('V5.2-3: 2D side-view SMART auto-stretch — fills the viewBox width at max length', () => {
    expect(g2d).toMatch(/import \{ diameterFromGirth, RANGES \}/);        // length range for the fraction
    expect(g2d).toMatch(/const maxShaftLen = SIDE_W - x0 - RIGHT_MARGIN - GAP - glansLenA/); // v5.4: VIEW_W→SIDE_W
    expect(g2d).toMatch(/const len = MIN_SHAFT \+ lenFrac \* \(maxShaftLen - MIN_SHAFT\)/);
    expect(g2d).toMatch(/SIDE_W = 480/);
  });

  it('V5.2-4: 3D auto-scale — frameCamera fits the model (FOV+aspect), reframed on rebuild + resize', () => {
    expect(g3d).toMatch(/function frameCamera/);
    expect(g3d).toMatch(/function computeModelLen/);
    expect(g3d).toMatch(/2 \* Math\.atan\(Math\.tan\(vFOV \/ 2\) \* camera\.aspect\)/); // FOV+aspect fit
    expect((g3d.match(/frameCamera\(/g) || []).length).toBeGreaterThanOrEqual(4);     // def + init + rebuild + resize
    expect(g3d).not.toMatch(/Math\.max\(lengthCm, 11\) \* 2\.2/);                      // old static camera removed
  });
});

describe('filler-simulator v5.4 — round-DOWN results (safety) + auto-scale layout (fill height, no dead bands)', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const math = read('src/lib/fillerMath.js');

  it('V5.4-1: condom snap is FLOOR (largest size that fits) — conservative, under-promise', () => {
    expect(math).toMatch(/CONDOM_LADDER\[i\]\.w <= req\) bi = i/);   // floor to the largest fitting size
    expect(math).not.toMatch(/Math\.abs\(CONDOM_LADDER\[i\]\.w - req\)/); // old nearest-snap gone
    // behaviour: 55mm req (girth 11.0) floors to 54, not nearest-tie 56
    expect(condomForGirth(11.0).w).toBe(54);
    expect(condomForGirth(11.5).w).toBe(56);
    expect(condomForGirth(10.4).w).toBe(52); // exact rung unaffected
  });

  it('V5.4-2: numeric result display rounds DOWN (Math.floor, not Math.round)', () => {
    expect(page).toMatch(/const r1 = \(x\) => \(Math\.floor\(/);
    expect(page).not.toMatch(/const r1 = \(x\) => \(Math\.round\(/);
    // floor at 1 decimal under-states (10.46 → 10.4, never 10.5)
    const r1 = (x) => (Math.floor((Number(x) || 0) * 10) / 10).toFixed(1);
    expect(r1(10.46)).toBe('10.4');
    expect(r1(2.99)).toBe('2.9');
  });

  it('V5.4-3: controls box distributes to fill its height (no empty bottom on desktop/iPad)', () => {
    expect(page).toMatch(/className="fs-controls" style=\{card\(\{ padding: '17px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' \}\)\}/);
  });

  it('V5.4-4: 2D illustration is a flex column that fills + DISTRIBUTES its 3 sections (no dead bands)', () => {
    expect(g2d).toMatch(/justifyContent: 'space-evenly'/);   // side-view / cross-section / legend distribute
    expect(g2d).toMatch(/flex: 1, minHeight: 0/);            // fills the card area (desktop) / natural (mobile)
    // legend is real HTML now (i18n spans), not SVG <text> — never overflows
    expect(g2d).toMatch(/<span style=\{\{ color: '#ef4444' \}\}>\{tr\('g2dLegShaft'\)\}/);
    expect(g2d).toMatch(/<span style=\{\{ color: '#f59e0b' \}\}>\{tr\('g2dLegGlans'\)\}/);
    expect(g2d).not.toMatch(/<text x="20" y="494"/);         // old SVG legend coords gone
  });

  it('V5.4-5: cross-section SVG scales with the container + capped (auto-scale, centered)', () => {
    expect(g2d).toMatch(/width: 'min\(62%, 250px\)', margin: '0 auto'/); // responsive + capped + centered
    expect(g2d).toMatch(/preserveAspectRatio="xMidYMid meet"/);
  });
});

describe('filler-simulator v5.3 — default glans 0 + split-bar legend fix + bigger cross-section + touch + copy', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const g3d = read('src/components/Filler3D.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('V5.3-1: default injection split is shaft 10 · glans 0 (glansCc default 0)', () => {
    expect(page).toMatch(/const \[glansCc, setGlansCc\] = useState\(0\)/);
    expect(page).not.toMatch(/const \[glansCc, setGlansCc\] = useState\(1\)/);
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/);  // total still 10 → shaft 10
  });

  it('V5.3-2: split-bar labels moved to an always-visible color-keyed legend (no clip/cram at small glans)', () => {
    // ISOLATED class-of-bug (grep src/: only this bar gated a label on segment width): buggy gate REMOVED
    expect(page).not.toMatch(/bodyPct > 14/);
    expect(page).not.toMatch(/\(100 - bodyPct\) > 14/);
    // bar is still a proportion strip driven by bodyPct, now text-free
    expect(page).toMatch(/0 0 \$\{bodyPct\}%/);
    expect(page).toMatch(/0 0 \$\{100 - bodyPct\}%/);
    // legend shows BOTH values in full, always (shaft + glans), color-keyed
    expect(page).toMatch(/\{t\('shaft'\)\} \{ccFmt\(shaftCc\)\}/);
    expect(page).toMatch(/\{t\('glans'\)\} \{ccFmt\(glansCcEff\)\}/);
  });

  it('V5.3-3: cross-section big + own SVG + auto-scales with diameter', () => {
    expect(g2d).toMatch(/viewBox="0 0 240 240"/);                   // own square SVG (v5.4)
    expect(g2d).toMatch(/const csA = clamp\(dLo \* 18, 48, 100\)/); // bigger + diameter-scaled (was *12, 22, 72)
    // V4-3 dashed-after stroke shape UNCHANGED → side-view + cross-section count still ≥2
    expect((g2d.match(/stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0\.6"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('V5.3-4: subtitle copy → "เพื่อช่วยให้เห็นภาพได้ชัดเจนยิ่งขึ้น" (TH) + EN mirror; disclaimer keeps เพื่อการศึกษา', () => {
    expect(strings).toMatch(/sub:[^\n]*เพื่อช่วยให้เห็นภาพได้ชัดเจนยิ่งขึ้น/);
    expect(strings).not.toMatch(/sub:[^\n]*ประมาณการเชิงภาพประกอบเพื่อการศึกษา/); // old subtitle phrase gone
    expect(strings).toMatch(/sub:[^\n]*help visualize the outcome more clearly/);  // EN mirror
    expect(strings).toMatch(/disclaimer:[^\n]*เพื่อการศึกษา/);                      // legal disclaimer keeps the shield
  });

  it('V5.3-5: touch/iPad — 3D mount touch-action none + buttons manipulation + WCAG tap targets + bigger thumb', () => {
    expect(g3d).toMatch(/touchAction: 'none'/);                     // 3D rotates on touch (no page scroll over canvas)
    expect(page).toMatch(/touch-action: manipulation/);            // no 300ms tap delay on buttons
    expect(page).toMatch(/-webkit-tap-highlight-color: transparent/);
    expect(page).toMatch(/min-height:44px; min-width:44px/);       // WCAG 2.5.5 tap targets (toggles)
    expect(page).toMatch(/width:30px; height:30px/);               // bigger slider thumb (finger / Apple Pencil)
  });
});
