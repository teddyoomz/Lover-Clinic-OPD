import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  estimate, girthFromWidth, girthFromDiameter, diameterFromGirth, girthToRadiusCm, CONDOM_LADDER,
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

  it('SG5: v2 — split-bar + glans card + theme/lang toggle; NO reveal-gate', () => {
    expect(page).toMatch(/glansPct/);            // split control
    expect(page).toMatch(/shaftCc/);             // split derive
    expect(page).toMatch(/resGlans/);            // glans result card
    expect(page).toMatch(/setTheme/);            // light/dark
    expect(page).toMatch(/setLang/);             // TH/EN
    // reveal-gate fully removed
    expect(page).not.toMatch(/แตะเพื่อดูภาพ/);
    expect(page).not.toMatch(/\brevealed\b/);
    expect(page).not.toMatch(/blur\(/);
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
