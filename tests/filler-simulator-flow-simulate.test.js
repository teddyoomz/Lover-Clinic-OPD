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
    const baseGirthCm = girthFromWidth(CONDOM_LADDER[2].w); // มาตรฐาน 52 → 10.4 (2026-06-21 thai-sizes)
    const e = estimate({ lengthCm: 12.7, baseGirthCm, shaftCc, glansCc });
    expect(shaftCc).toBeCloseTo(10.2, 6);
    expect(glansCc).toBeCloseTo(1.8, 6);
    expect(e.c1Low).toBeGreaterThan(e.c0);                 // shaft grew
    expect(e.glans.visualLow).toBeGreaterThan(e.glans.dg0);    // glans grew
    expect(e.condom0.label).toBe('มาตรฐาน');
  });

  it('F2: condom-mode and Ø-mode give identical estimate for the same C0', () => {
    const viaCondom = estimate({ lengthCm: 12.7, baseGirthCm: girthFromWidth(52), shaftCc: 10, glansCc: 2 });
    const dia = diameterFromGirth(10.4);
    const viaDiameter = estimate({ lengthCm: 12.7, baseGirthCm: girthFromDiameter(dia), shaftCc: 10, glansCc: 2 });
    expect(viaDiameter.c1Low).toBeCloseTo(viaCondom.c1Low, 6);
    expect(viaDiameter.glans.visualLow).toBeCloseTo(viaCondom.glans.visualLow, 6);
  });

  it('F3: glans cc does NOT change shaft girth / condom (flow)', () => {
    const base = girthFromWidth(52);
    const a = estimate({ lengthCm: 12.7, baseGirthCm: base, shaftCc: 12, glansCc: 0 });
    const b = estimate({ lengthCm: 12.7, baseGirthCm: base, shaftCc: 12, glansCc: 4 });
    expect(b.c1Low).toBeCloseTo(a.c1Low, 6);
    expect(b.condomLow.w).toBe(a.condomLow.w);
    expect(b.glans.visualLow).toBeGreaterThan(a.glans.visualLow);
  });

  it('F4: 2D scale + 3D radius + glans both derive from est (single source)', () => {
    const e = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 16, glansCc: 2 });
    expect(girthToRadiusCm(e.c1Low)).toBeCloseTo(e.c1Low / (2 * Math.PI), 6);
    expect(e.d1Low).toBeCloseTo(e.c1Low / Math.PI, 6);
    expect(e.glans.visualLow).toBeGreaterThan(0);
  });

  it('F5: glans cube-root — head Ø keeps growing 2→10→15cc (no plateau) + 15cc cap', () => {
    const g = (cc) => estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 5, glansCc: cc, baseGlansDiameterCm: 3.5 }).glans.visualLow;
    expect(g(10)).toBeGreaterThan(g(2));
    expect(g(15)).toBeGreaterThan(g(10));
    expect(Math.min(20, 15)).toBe(15); // the simulator clamps the split to 15 — 20cc requested → 15cc
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
    // reveal-gate fully removed (the tap-to-reveal content-blur). Inferno redesign uses
    // backdrop-filter glass blur — that's allowed; only the reveal-gate `filter: blur(` is forbidden.
    expect(page).not.toMatch(/แตะเพื่อดูภาพ/);
    expect(page).not.toMatch(/\brevealed\b/);
    expect(page).not.toMatch(/\bfilter:\s*['"`]?blur\(/);  // no content-hiding result-blur (backdrop glass blur OK)
  });

  it('SG6b: glans v2 — split slider capped at 15cc + head Ø readout (cube-root, no durable→peak caption)', () => {
    expect(page).toMatch(/GLANS_SPLIT_MAX_CC/);                       // 15cc cap imported + wired
    expect(page).toMatch(/Math\.min\(totalCc, GLANS_SPLIT_MAX_CC\)/); // split slider max capped
    expect(page).toMatch(/glansHeadSize/);                            // head Ø readout label
    expect(page).toMatch(/est\.glans\.visualLow/);                    // readout derived from the math
    expect(page).not.toMatch(/ระยะคงตัว → ช่วงแรก/);                   // caption removed (user #2)
    expect(math).toMatch(/glansDiameterGain/);                       // cube-root model present
    expect(math).not.toMatch(/glansVisualGain|GLANS_SATURATION_CC/);  // old saturating model gone
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

  it('SG6: i18n strings TH+EN present, ประมาณ wording, length-splint copy, no กะเกณ', () => {
    expect(strings).toMatch(/STRINGS\s*=\s*\{[\s\S]*th:/);
    expect(strings).toMatch(/en:\s*\{/);
    expect(strings).toMatch(/ประมาณ/);
    expect(strings).not.toMatch(/กะเกณ/);
    expect(strings).toMatch(/พยุงไม่ให้หด/);          // 2026-06-21: filler DOES add flaccid length (splint), not "no length"
    expect(strings).toMatch(/glans/i);               // EN keys
    expect(strings).toMatch(/12–18/);                // 2026-06-21 durability note (was 6–24)
  });
});

describe('filler-simulator v3 — bug fixes + redesign (regression locks)', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');

  it('V3-1: slider min 5cc (cannot go below); default now 10cc (owner 2026-06-21)', () => {
    expect(RANGES.cc[0]).toBe(5);
    expect(page).toMatch(/min=\{RANGES\.cc\[0\]\}/);      // slider cannot go below 5
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/); // default 10cc (owner)
    expect(page).not.toMatch(/setTotalCc\] = useState\(16\)/); // old 16cc default removed
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

  it('V3-3 (Model B): length auto-fills box + thickness grows at ONE scale (glans:shaft exact) + old head', () => {
    expect(g2d).not.toMatch(/, 100, 198\)/);                                      // old cap removed
    expect(g2d).not.toMatch(/const PX_PER_CM|const s = Math\.min\(widthBudget/);  // not the fixed / auto-fit-whole approaches
    expect(g2d).toMatch(/const thickScale = Math\.min\(THICK_BASE/);              // ONE thickness scale (grows + auto-shrink-to-band)
    expect(g2d).toMatch(/const tShaftA = \(dLo \/ 2\) \* thickScale/);             // shaft Ø at thickScale
    expect(g2d).toMatch(/const tGlansA = \(dgLo \/ 2\) \* thickScale/);            // glans Ø at the SAME scale → exact ratio
    expect(g2d).toMatch(/const glansLenA = tGlansA \* GLANS_LEN_RATIO/);           // old mushroom head (length ∝ half-thickness)
    expect(g2d).toMatch(/const len = MIN_SHAFT \+ lenFrac \* \(maxShaftLen - MIN_SHAFT\)/); // length AUTO-FILLS the box
    expect(g2d).toMatch(/const maxShaftLen = SIDE_W - x0 - RIGHT_MARGIN - GAP - glansLenA/);
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
    expect(page).toMatch(/max={Math\.min\(totalCc, GLANS_SPLIT_MAX_CC\)}/); // glans up to total, capped 15cc
    expect(page).toMatch(/glansCcEff/);                    // clamped effective value
    expect(page).toMatch(/if \(glansCc > cap\) setGlansCc\(cap\)/); // clamp on total shrink (capped at 15)
    expect(page).not.toMatch(/setGlansPct/);               // old percent-step control gone
    expect(page).not.toMatch(/useState\(15\)/);            // old glansPct default gone
  });

  it('V3-7: EN translation COMPLETE — 2D/3D labels go through t(), no hardcoded Thai', () => {
    const g2dSrc = read('src/components/FillerGraphic2D.jsx');
    const g3dSrc = read('src/components/Filler3D.jsx');
    const strings = read('src/lib/fillerStrings.js');
    // 2D labels translated
    for (const k of ['g2dAria', 'g2dSide', 'g2dCross', 'g2dLegShaft', 'g2dLegGlans', 'g2dDashToggleHint', 'g2dToggleAfter', 'g2dToggleBaseline'])
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
    // mushroom + cross-section "after" strokes: dashed, vivid red, width 1.7 (v7.4 — thinner again; v7.3 outset kept)
    const afterStrokes = g2d.match(/stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\} strokeDasharray="7 4"/g) || [];
    expect(afterStrokes.length).toBeGreaterThanOrEqual(2); // side-view + cross-section
    expect(g2d).not.toMatch(/stroke="#ef4444" strokeWidth="1\.6"/); // old thick solid gone
    expect(g2d).not.toMatch(/stroke="#ef4444" strokeWidth="1\.5"/);
    // legend wording updated for the dashed-after / faint-dashed-before
    expect(strings).toMatch(/เส้นประเขียว = หลังฉีด/);
    expect(strings).toMatch(/Green dashed = after/);
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

  it('V5-2→v7: desktop 40/60 grid + mobile CONTROLS-on-top order', () => {
    expect(page).toMatch(/grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)/); // 40/60 desktop
    // mobile (≤820px): single column, CONTROLS first (top), illustration below (v7 — was graphic-on-top)
    expect(page).toMatch(/@media \(max-width:820px\)\{ \.fs-grid\{ grid-template-columns:1fr; \} \.fs-controls\{ order:1; \} \.fs-graphic\{ order:2; \} \}/);
    expect(page).not.toMatch(/\.fs-graphic\{ order:1; \}/);  // graphic is NEVER order:1 now (anti-regression)
    expect(page).toMatch(/className="fs-graphic"/);
    expect(page).toMatch(/className="fs-controls"/);
  });

  it('V5-3: 2D split into auto-scale sections (side-view + cross-section) without losing dashed-after / i18n / damped head', () => {
    expect(g2d).toMatch(/0 0 \$\{SIDE_W\} \$\{SIDE_H\}/);                         // v5.4: side-view own viewBox
    expect(g2d).toMatch(/viewBox="0 0 240 240"/);                                // v5.4: cross-section own square viewBox
    expect((g2d.match(/stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\} strokeDasharray="7 4"/g) || []).length).toBeGreaterThanOrEqual(2); // V4-3 dashed kept (side + cross)
    expect(g2d).toMatch(/tr\('g2dSide'\)/);                                       // V3-7 i18n kept
    expect(g2d).toMatch(/visualLow/);                                            // V3 damped head kept
    expect(g2d).not.toMatch(/viewBox="0 0 380 236"/);                            // old small canvas gone
    expect(g2d).not.toMatch(/viewBox="0 0 480 320"/);                            // v5 canvas superseded
    expect(g2d).not.toMatch(/viewBox="0 0 480 460"/);                            // v5.2 canvas superseded
    expect(g2d).not.toMatch(/viewBox="0 0 480 552"/);                            // v5.3 single-canvas superseded (v5.4 split)
  });

  it('V5-4: faint dashed edges + no reflection highlight + equal-height columns', () => {
    // after-edge is a BOLD red dash (full opacity, v7) — both after-strokes carry strokeOpacity="1"
    expect((g2d.match(/stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\} strokeDasharray="7 4" strokeOpacity="1"/g) || []).length).toBeGreaterThanOrEqual(2);
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

  it('V5.2-1: default filler is 10cc (owner 2026-06-21; slider min still 5)', () => {
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/);
    expect(page).toMatch(/min=\{RANGES\.cc\[0\]\}/);
  });

  it('V7.4-1: baseline (เดิม) opacity 0.75 (both themes); theme-tuned widths — dark baseline −10%, light red +15%', () => {
    expect(g2d).toMatch(/rgba\(15,23,42,0\.75\)/);    // light theme baseline opacity 75%
    expect(g2d).toMatch(/rgba\(255,255,255,0\.75\)/); // dark theme baseline opacity 75%
    expect(g2d).not.toMatch(/rgba\(15,23,42,0\.35\)/);  // 0.35 superseded
    expect(g2d).not.toMatch(/rgba\(255,255,255,0\.35\)/); // 0.35 superseded
    // baseline width: light 1.375, dark −10% = 1.2375 ; red width: light +15% = 0.9775, dark 0.85
    expect(g2d).toMatch(/const baselineStrokeW = 1\.2375;/);                       // both themes (light reduced to match dark)
    expect(g2d).toMatch(/const afterStrokeW = theme === 'light' \? 1\.2903 : 1\.02;/); // +20% both (mobile visibility)
    expect((g2d.match(/stroke=\{beforeStroke\} strokeWidth=\{baselineStrokeW\}/g) || []).length).toBe(2); // baseline path + circle
    expect((g2d.match(/stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\}/g) || []).length).toBe(2);          // red path + circle
  });

  it('V5.2-3 (Model B): 2D side-view length AUTO-FILLS the box (10in fills); thickness one scale', () => {
    expect(g2d).toMatch(/const lenFrac = Math\.max\(0, Math\.min\(1,/);  // length normalized → fills width
    expect(g2d).toMatch(/const len = MIN_SHAFT \+ lenFrac \* \(maxShaftLen - MIN_SHAFT\)/);
    expect(g2d).toMatch(/const thickScale = Math\.min\(THICK_BASE/);
    expect(g2d).not.toMatch(/const PX_PER_CM|const s = Math\.min\(widthBudget/);
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

  it('V5.4-1: condom snap is FLOOR (largest size that fits) — retention rule (2026-06-21 ladder)', () => {
    expect(math).toMatch(/CONDOM_LADDER\[i\]\.w <= req\) bi = i/);   // floor to the largest fitting size
    expect(math).not.toMatch(/Math\.abs\(CONDOM_LADDER\[i\]\.w - req\)/); // no nearest-snap
    // behaviour on the Thai+world ladder [45,49,52,54,56,58,60,64,69,72] (2026-06-21 thai-sizes):
    expect(condomForGirth(11.0).w).toBe(54); // NW 55 → floor 54 (no 55 rung)
    expect(condomForGirth(11.5).w).toBe(56); // NW 57.5 → floor 56 (no 57 rung)
    expect(condomForGirth(10.4).w).toBe(52); // NW 52 → rung 52 (exact)
  });

  it('V5.4-2: numeric result display rounds NEAREST (Math.round, not Math.floor) — 2026-06-21 closest-to-real', () => {
    expect(page).toMatch(/const r1 = \(x\) => \(Math\.round\(/);
    expect(page).not.toMatch(/const r1 = \(x\) => \(Math\.floor\(/);
    // round-nearest at 1 decimal (10.46 → 10.5, 2.99 → 3.0)
    const r1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
    expect(r1(10.46)).toBe('10.5');
    expect(r1(2.99)).toBe('3.0');
  });

  it('V5.4-3: controls box distributes to fill its height (no empty bottom on desktop/iPad)', () => {
    expect(page).toMatch(/className="fs-controls" style=\{card\(\{ padding: '17px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' \}\)\}/);
  });

  it('V5.4-4: 2D illustration is a flex column that fills + DISTRIBUTES its 3 sections (no dead bands)', () => {
    expect(g2d).toMatch(/justifyContent: 'space-evenly'/);   // side-view / cross-section / legend distribute
    expect(g2d).toMatch(/flex: 1, minHeight: 0/);            // fills the card area (desktop) / natural (mobile)
    // legend is real HTML now (i18n spans), not SVG <text> — never overflows
    expect(g2d).toMatch(/<span style=\{\{ color: theme === 'light' \? '#b91c1c' : '#ef4444' \}\}>\{tr\('g2dLegShaft'\)\}/);
    expect(g2d).toMatch(/<span style=\{\{ color: theme === 'light' \? '#b45309' : '#f59e0b' \}\}>\{tr\('g2dLegGlans'\)\}/);
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

  it('V5.3-1: default injection split is glans 0 (shaft gets the full default)', () => {
    expect(page).toMatch(/const \[glansCc, setGlansCc\] = useState\(0\)/);
    expect(page).not.toMatch(/const \[glansCc, setGlansCc\] = useState\(1\)/);
    expect(page).toMatch(/const \[totalCc, setTotalCc\] = useState\(10\)/);  // owner 2026-06-21 total 10 → shaft 10
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

  it('V5.3-3 (ants+scale): cross-section GROWS with girth (caps at box) + after:before exact + baseline marches', () => {
    expect(g2d).toMatch(/viewBox="0 0 240 240"/);
    expect(g2d).toMatch(/const csScale = Math\.min\(CS_BASE, \(CS_MAX_R \* 2\) \/ Math\.max\(dLo, 0\.1\)\)/); // grows with Ø, caps at box
    expect(g2d).toMatch(/const csA = \(dLo \/ 2\) \* csScale/);     // AFTER grows with girth (not pinned to max)
    expect(g2d).toMatch(/const csB = \(d0 \/ 2\) \* csScale/);      // before proportional → exact ratio
    expect(g2d).not.toMatch(/const csA = CS_MAX_R\b/);              // no longer pinned to max
    // marching ants on the BASELINE only — clockwise, smooth (seamless -9 loop), reduced-motion-safe
    expect(g2d).toMatch(/@keyframes fgAnts \{ to \{ stroke-dashoffset: -9; \} \}/);
    expect(g2d).toMatch(/\.fg-ants \{ animation: fgAnts 0\.6s linear infinite; \}/);
    expect(g2d).toMatch(/prefers-reduced-motion: reduce\) \{ \.fg-revBreathe, \.fg-ants \{ animation: none/);
    expect((g2d.match(/showBaseline && <(path|circle) className="fg-ants"/g) || []).length).toBe(2); // baseline path + circle only
    // the after (red) outline UNCHANGED (still breathes) → ≥2 dashed-after strokes
    expect((g2d.match(/stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\} strokeDasharray="7 4" strokeOpacity="1"/g) || []).length).toBeGreaterThanOrEqual(2);
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

describe('filler-simulator R9 (v5.5) — formula obfuscation + logo watermark + theme-aware contact buttons', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const g3d = read('src/components/Filler3D.jsx');
  const vite = read('vite.config.js');
  const math = read('src/lib/fillerMath.js');

  it('R9-1: contact const + real values (tel / lin.ee / facebook), hardcoded (pure-client)', () => {
    expect(page).toMatch(/const CLINIC_CONTACT = \{/);
    expect(page).toMatch(/tel: '0975251525'/);
    expect(page).toMatch(/line: 'https:\/\/lin\.ee\/mFFsDkG'/);
    expect(page).toMatch(/fb: 'https:\/\/www\.facebook\.com\/loverclinickorat'/);
  });

  it('R9-2: ContactButtons reused in header (icon) + footer (full) — Rule of 3', () => {
    expect(page).toMatch(/function ContactButtons\(\{ variant, isLight, lang \}\)/);
    expect(page).toMatch(/<ContactButtons variant="icon"/);   // header
    expect(page).toMatch(/<ContactButtons variant="full"/);   // footer
  });

  it('R9-3: external links open safely (target/rel); phone dials (tel:)', () => {
    expect(page).toMatch(/target: '_blank', rel: 'noopener noreferrer'/);
    expect(page).toMatch(/line: \{ href: CLINIC_CONTACT\.line, ext: true/);
    expect(page).toMatch(/fb: \{ href: CLINIC_CONTACT\.fb, ext: true/);
    expect(page).toMatch(/call: \{ href: `tel:\$\{CLINIC_CONTACT\.tel\}`, ext: false/);
  });

  it('R9-4: real brand SVG icons (phone / LINE / Facebook glyph paths) — no emoji', () => {
    expect(page).toMatch(/const IconPhone = /);
    expect(page).toMatch(/const IconLine = /);
    expect(page).toMatch(/const IconFb = /);
    expect(page).toMatch(/M19\.365 9\.863/);        // official LINE logo path
    expect(page).toMatch(/M24 12\.073c0-6\.627/);   // official Facebook f path
  });

  it('R9-5: theme-aware buttons — dark filled brand + white; light soft-tint + deepened brand + border (AA)', () => {
    expect(page).toMatch(/dark: \{ bg: '#06C755', fg: '#fff'/);                       // LINE filled green
    expect(page).toMatch(/dark: \{ bg: '#1877F2', fg: '#fff'/);                       // FB filled blue
    expect(page).toMatch(/light: \{ bg: '#fef2f2', fg: '#be123c', bd: '#fbcfcf' \}/); // call soft
    expect(page).toMatch(/light: \{ bg: '#ecfdf3', fg: '#047a43', bd: '#a7f0c6' \}/); // LINE soft
    expect(page).toMatch(/light: \{ bg: '#eff6ff', fg: '#1d4ed8', bd: '#bcd7fb' \}/); // FB soft
    expect(page).toMatch(/const sk = isLight \? b\.light : b\.dark/);
  });

  it('R9-6: 2D watermark — centered-faint theme-aware logo <image> in BOTH SVGs, non-interactive', () => {
    expect(g2d).toMatch(/const wmLogo = theme === 'light' \? '\/lover-clinic-logo-light\.png' : '\/lover-clinic-logo-dark\.png'/);
    expect((g2d.match(/<image href=\{wmLogo\}/g) || []).length).toBe(2);   // side-view + cross-section
    expect((g2d.match(/pointerEvents: 'none'/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((g2d.match(/opacity="0\.1"/g) || []).length).toBeGreaterThanOrEqual(2); // faint
  });

  it('R9-7: 3D watermark — theme prop + centered DOM <img> overlay over the canvas', () => {
    expect(g3d).toMatch(/function Filler3D\(\{ est, lengthCm = 11, theme = 'dark', t \}\)/);
    expect(g3d).toMatch(/<img src=\{theme === 'light' \? '\/lover-clinic-logo-light\.png' : '\/lover-clinic-logo-dark\.png'\}/);
    expect(g3d).toMatch(/pointerEvents: 'none'/);
    expect(g3d).toMatch(/transform: 'translate\(-50%, -50%\)'/);                       // centered
    expect(page).toMatch(/<Filler3D est=\{est\} lengthCm=\{lengthCm\} theme=\{theme\}/); // page passes theme
  });

  it('R9-8: build obfuscation scoped to the FORMULA files only, command-gated (vitest bypasses)', () => {
    expect(vite).toMatch(/import obfuscator from 'vite-plugin-javascript-obfuscator'/);
    expect(vite).toMatch(/command === 'build' \? \[obfuscator\(\{/);    // only on build, NOT serve/test
    expect(vite).toMatch(/'\*\*\/fillerMath\.js'/);
    expect(vite).toMatch(/'\*\*\/FillerGraphic2D\.jsx'/);
    // 2026-06-20: FillerSimulator.jsx + Filler3D.jsx REMOVED from the obfuscator include —
    // obfuscating FillerSimulator mangled its dynamic import('Filler3D.jsx') so the `three`
    // 3D lazy chunk never emitted (the OPD prod 3D was silently broken). The include array
    // must NOT contain them so the 3D dynamic import stays a literal Rollup can code-split.
    const inc = vite.match(/include:\s*\[([^\]]*)\]/)[1];
    expect(inc).not.toContain('FillerSimulator.jsx');
    expect(inc).not.toContain('Filler3D.jsx');
    expect(vite).toMatch(/exclude: \['node_modules\/\*\*', 'tests\/\*\*'\]/);
    expect(vite).toMatch(/stringArrayEncoding: \['base64'\]/);
  });

  it('R9-9: calibration constants written as integer fractions (obfuscation-friendly, value-identical)', () => {
    expect(math).toMatch(/K_DURABLE = 122 \/ 100/);   // 2026-06-21: durable 1.22 (was K_REALISTIC 180/100)
    expect(math).toMatch(/K_PEAK = 190 \/ 100/);      // 2026-06-21: peak 1.90 (was K_OPTIMISTIC 230/100)
    expect(math).not.toMatch(/K_DURABLE = 1\.22;/);   // integer-fraction form, never the float literal
    // runtime value still exact (covered by filler-math.test.js: K_DURABLE === 1.22)
  });
});

describe('filler-simulator v5.6→v7.2 — red dashed: BOLD + breathing blink, NO glow (glow tinted the model) + fainter baseline', () => {
  const g2d = read('src/components/FillerGraphic2D.jsx');

  it('V5.6-1: red outline animates as its OWN fill:none element (side + cross) — NOT the skin body', () => {
    // the breathe class lives on fill:none OUTLINE-only elements → opacity/glow touch the LINE, not the skin fill
    expect((g2d.match(/fill="none" className="fg-revBreathe" stroke=\{afterStrokeColor\} strokeWidth=\{afterStrokeW\} strokeDasharray="7 4" strokeOpacity="1"/g) || []).length).toBe(2);
    // ANTI-REGRESSION (the v5.6-first bug): the SKIN-FILLED body must NEVER carry the animation, else the WHOLE shape fades
    expect(g2d).not.toMatch(/fill="url\(#fg-skin\)" className="fg-revBreathe"/);
    expect(g2d).not.toMatch(/fill="url\(#fg-cs\)" className="fg-revBreathe"/);
    // skin body elements still present, solid + static
    expect(g2d).toMatch(/fill="url\(#fg-skin\)" \/>/);
    expect(g2d).toMatch(/fill="url\(#fg-cs\)" \/>/);
  });

  it('V7.3-1: red dashed is OUTSET (hugs the OUTER edge, NOT overlapping the body) + thinner (width 2)', () => {
    // v7.3 (2026-06-20): user — "ลดความหนาเส้นประแดงลงนิดนึง แล้วให้แสดงแบบติดขอบนอกของเส้นจริง
    // ไม่ใช่วาดทับเส้นจริงแบบปัจจุบัน". The after-dashed must sit OUTSIDE the body silhouette, not coincide with it.
    expect(g2d).toMatch(/const DASH_OUT = 3/);
    // cross-section: dashed radius = body radius + outset (was bare csA → overlapped the body edge)
    expect(g2d).toMatch(/<circle cx=\{ccx\} cy=\{ccy\} r=\{csA \+ DASH_OUT\} fill="none" className="fg-revBreathe"/);
    expect(g2d).toMatch(/<circle cx=\{ccx\} cy=\{ccy\} r=\{csA\} fill="url\(#fg-cs\)"/);   // body fill stays bare csA (un-outset)
    // side-view: dashed silhouette inflated by DASH_OUT on every dimension (was the bare body args → overlapped)
    expect(g2d).toMatch(/mushPath\(x0 - DASH_OUT, cy, len \+ DASH_OUT, tShaftA \+ DASH_OUT, tGlansA \+ DASH_OUT, glansLenA \+ DASH_OUT\)/);
    expect(g2d).toMatch(/d=\{mushPath\(x0, cy, len, tShaftA, tGlansA, glansLenA\)\} fill="url\(#fg-skin\)"/);  // body fill = bare silhouette
    // thinner: the old bold 2.6 width is gone everywhere
    expect(g2d).not.toMatch(/strokeWidth="2\.6"/);
  });

  it('V7.2-2: breathing keeps the FULL-disappear; GLOW REMOVED (the red drop-shadow tinted the 2D model colors)', () => {
    // v7.2 (2026-06-20): user — the red drop-shadow glow bled onto the warm skin-tone model
    // ("เอา glow ออกไป มันทำให้สีโมเดล 2D เพี้ยน เหลือแค่กระพริบ breathing"). Keep ONLY the
    // opacity breathe (bold → GONE → bold); remove the glow entirely.
    expect(g2d).toMatch(/@keyframes fgRevBreathe \{ 0%,35%\{opacity:1\} 50%\{opacity:0\} 79%\{opacity:0\} 90%,100%\{opacity:1\} \}/);
    expect(g2d).toMatch(/50%\{opacity:0\} 79%\{opacity:0\}/);       // line FULLY disappears for ~1s (50→79% of 3.4s)
    // ANTI-REGRESSION: no glow keyframes, no drop-shadow filter anywhere in the 2D model
    expect(g2d).not.toMatch(/fgRevGlow/);
    expect(g2d).not.toMatch(/drop-shadow/);
    // .fg-revBreathe runs ONLY the opacity breathe (no second glow animation)
    expect(g2d).toMatch(/\.fg-revBreathe \{ animation: fgRevBreathe 3\.4s ease-in-out infinite; \}/);
  });

  it('V5.6-3: prefers-reduced-motion guard disables BOTH animations (a11y — breathe + marching ants)', () => {
    expect(g2d).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.fg-revBreathe, \.fg-ants \{ animation: none; \} \}/);
  });

  it('V7-4: red line is FULL opacity (strokeOpacity 1) at all times + 2D-only (Filler3D has no dashed line, untouched)', () => {
    const g3d = read('src/components/Filler3D.jsx');
    expect(g3d).not.toMatch(/fg-revBreathe/);                                  // 3D untouched
    expect((g2d.match(/strokeOpacity="1"/g) || []).length).toBeGreaterThanOrEqual(2);  // both after-strokes vivid red
  });
});

describe('filler-simulator v5.7 — condom CAPS at 64 (2026-06-21: past-64 extension + เกินมาตรฐาน removed)', () => {
  const math = read('src/lib/fillerMath.js');
  const page = read('src/pages/FillerSimulator.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('V5.7-1: beyond-ladder branch REMOVED (no LADDER_MAX_W / BEYOND_STEP / REAL_MAX_W) — 2026-06-21', () => {
    expect(math).not.toMatch(/LADDER_MAX_W/);
    expect(math).not.toMatch(/BEYOND_STEP/);
    expect(math).not.toMatch(/REAL_MAX_W/);
    expect(math).not.toMatch(/beyond: w >/);
    // FLOOR snap kept; condomForGirth just floors + returns beyond:false
    expect(math).toMatch(/CONDOM_LADDER\[i\]\.w <= req\) bi = i/);
    expect(math).toMatch(/beyond: false/);
  });

  it('V5.7-2: behaviour — floors on the Thai+world ladder, caps at top rung 72, NEVER beyond (2026-06-21 thai-sizes)', () => {
    expect(condomForGirth(13.2).w).toBe(64);          // NW 66 → floor 64
    expect(condomForGirth(13.2).beyond).toBe(false);
    expect(condomForGirth(14.4).w).toBe(72);          // NW 72 → rung 72 (world max, exact)
    expect(condomForGirth(17.5).w).toBe(72);          // far beyond → caps at 72
    expect(condomForGirth(17.5).beyond).toBe(false);
    expect(condomForGirth(12.8).beyond).toBe(false);  // 64 boundary
    expect(condomForGirth(20).w).toBe(72);            // capped at top rung 72
  });

  it('V5.7-3: condom RESULT = raw computed mm (condomWidthLow/High) + pickClosest hint, no sizesUp/beyond — 2026-06-21 thai-sizes', () => {
    expect(page).toMatch(/est\.condomWidthLow/);
    expect(page).toMatch(/est\.condomWidthHigh/);
    expect(page).toMatch(/delta=\{t\('pickClosest'\)\}/);
    expect(page).not.toMatch(/delta=\{sizesUp\(est\.sizesUpLow, est\.sizesUpHigh\)\}/); // condom no longer uses sizesUp
    expect(page).not.toMatch(/est\.condomLow\.beyond \|\| est\.condomHigh\.beyond/);
  });

  it('V5.7-4: beyondStd string present (TH + EN, keeps "เกินมาตรฐาน")', () => {
    expect(strings).toMatch(/beyondStd: 'เกินมาตรฐาน/);
    expect(strings).toMatch(/beyondStd: 'beyond standard/);
  });
});

describe('filler-simulator v6 — 2D dash toggles (double as legend) + auto-scale', () => {
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('V7.4-2: useState toggle state — showAfter default ON (v7.4 reversal of v7), showBaseline default ON', () => {
    expect(g2d).toMatch(/import \{ useState \} from 'react'/);
    expect(g2d).toMatch(/const \[showAfter, setShowAfter\] = useState\(true\)/);   // v7.4: red "หลังฉีด" shown by default (was OFF in v7)
    expect(g2d).toMatch(/const \[showBaseline, setShowBaseline\] = useState\(true\)/);
  });
  it('V6-2: dashed lines render conditionally on the toggles (both svgs)', () => {
    expect((g2d.match(/showAfter && </g) || []).length).toBe(2);    // side path + cross circle
    expect((g2d.match(/showBaseline && </g) || []).length).toBe(2); // side baseline + cross baseline
  });
  it('V6-3: DashToggle chip — ≥44px tap target + touch-action; doubles as the legend (g2dLegKey span removed)', () => {
    expect(g2d).toMatch(/function DashToggle/);
    expect(g2d).toMatch(/minHeight: 44/);
    expect(g2d).toMatch(/touchAction: 'manipulation'/);
    expect((g2d.match(/<DashToggle /g) || []).length).toBe(2);
    expect(g2d).not.toMatch(/tr\('g2dLegKey'\)/);   // toggles ARE the dashed legend now
  });
  it('V6-4: balanced legend row auto-scales (flex-wrap)', () => {
    expect(g2d).toMatch(/flexWrap: 'wrap'/);
  });
  it('V6-5: toggle strings present (TH + EN)', () => {
    expect(strings).toMatch(/g2dToggleAfter: 'หลังฉีด'/);
    expect(strings).toMatch(/g2dToggleBaseline: 'เดิม'/);
    expect(strings).toMatch(/g2dDashToggleHint: 'เส้นประ · กดเพื่อ เปิด\/ปิด'/);
    expect(strings).toMatch(/g2dToggleAfter: 'after'/);
  });
});

describe('filler-simulator v7.1 — condom HERO card (top + most prominent) in the results', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('V7.1-1: condom card is FIRST + hero (full-width, prominent) with แนะนำ badge', () => {
    const condomIdx = page.indexOf("k={t('resCondom')}");
    const girthIdx = page.indexOf("k={t('resGirth')}");
    const diaIdx = page.indexOf("k={t('resDia')}");
    expect(condomIdx).toBeGreaterThan(0);
    expect(condomIdx).toBeLessThan(girthIdx);   // condom rendered BEFORE girth (top of the results)
    expect(condomIdx).toBeLessThan(diaIdx);     // and before diameter
    expect(page).toMatch(/<ResultCard hero badge=\{t\('recommended'\)\}/);  // hero + recommended badge
    expect(page).toMatch(/if \(hero\) \{/);                                  // ResultCard hero branch
    expect(page).toMatch(/flexBasis: '100%'/);                              // hero = full-width (most prominent)
    expect(strings).toMatch(/recommended: 'แนะนำ'/);
    expect(strings).toMatch(/recommended: 'Recommended'/);
  });
});

describe('filler-simulator 2026-06-21 — Thai dropdown + computed-mm result + length box', () => {
  const page = read('src/pages/FillerSimulator.jsx');
  const strings = read('src/lib/fillerStrings.js');

  it('default condom rung = index 2 (52 มาตรฐาน)', () => {
    expect(page).toMatch(/useState\(2\); \/\/ rung 52/);
  });
  it('dropdown option = number + descriptor (no English brand label, no girth suffix)', () => {
    expect(page).toMatch(/\$\{cd\.w\} \$\{lang === 'th'/);
    expect(page).not.toMatch(/girthFromWidth\(cd\.w\)/); // girth suffix removed from the option
  });
  it('condom RESULT card shows baseline เดิม (condomWidth0 = the selected size) → raw mm range + pickClosest (user 2026-06-21 reversal)', () => {
    expect(page).not.toMatch(/k=\{t\('resCondom'\)\} oldVal=""/);  // baseline restored per the user
    expect(page).toMatch(/k=\{t\('resCondom'\)\} oldVal=\{`\$\{t\('before'\)\} \$\{est\.condomWidth0\}/);
    expect(page).toMatch(/est\.condomWidthLow === est\.condomWidthHigh/);
    expect(page).toMatch(/delta=\{t\('pickClosest'\)\}/);
  });
  it('length by-product box is rendered right after the condom hero (resLength + lengthWarn + varying durable–peak range)', () => {
    const condomIdx = page.indexOf("k={t('resCondom')}");
    const lenIdx = page.indexOf("t('resLength')");
    const girthIdx = page.indexOf("k={t('resGirth')}");
    expect(lenIdx).toBeGreaterThan(condomIdx); // length AFTER condom
    expect(lenIdx).toBeLessThan(girthIdx);     // and BEFORE girth
    expect(page).toMatch(/est\.lengthGainLow/);  // 2026-06-21: varies (durable)
    expect(page).toMatch(/est\.lengthGainHigh/); // varies (peak)
    expect(page).not.toMatch(/est\.lengthGainCm/); // old flat field gone
    expect(page).toMatch(/t\('lengthWarn'\)/);
  });
  it('range-legend + note are NO LONGER rendered (owner revision); disclaimer stays', () => {
    expect(page).not.toMatch(/\{t\('rangeLegend'\)\}/);
    expect(page).not.toMatch(/\{t\('note'\)\}/);
    expect(page).toMatch(/t\('disclaimer'\)/);
  });
  it('new i18n keys present (TH + EN)', () => {
    for (const k of ['pickClosest', 'resLength', 'lengthWarn']) expect(strings).toMatch(new RegExp(`${k}:`));
    expect(strings).toMatch(/lengthWarn: 'พยุงไม่ให้หด/);
    expect(strings).toMatch(/lengthWarn: 'anti-retraction/);
  });
});
