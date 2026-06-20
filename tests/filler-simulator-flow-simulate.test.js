import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  estimate, girthFromWidth, girthFromDiameter, diameterFromGirth, girthToRadiusCm, CONDOM_LADDER,
} from '../src/lib/fillerMath.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('filler-simulator flow (Rule I — full chain, both views one source)', () => {
  it('F1: condom Regular 52 → C0 10.4 → estimate(V10,L11) → verified result', () => {
    const baseGirthCm = girthFromWidth(CONDOM_LADDER[2].w); // Regular 52
    expect(baseGirthCm).toBe(10.4);
    const e = estimate({ lengthCm: 11, baseGirthCm, fillerCc: 10 });
    expect(e.c1Low).toBeCloseTo(11.7, 1);
    expect(e.c1High).toBeCloseTo(12.2, 1);
    expect(e.d1Low).toBeCloseTo(3.7, 1);
    expect(e.d1High).toBeCloseTo(3.9, 1);
    expect(e.condom0.label).toBe('Regular 52');
    expect(e.condomLow.label).toBe('Large+ 58');
    expect(e.condomHigh.label).toBe('XL 60');
    expect(e.sizesUpLow).toBe(3);
    expect(e.sizesUpHigh).toBe(4);
  });

  it('F2: both baseline modes (condom vs Ø) produce identical estimate for the same C0', () => {
    const viaCondom = estimate({ lengthCm: 11, baseGirthCm: girthFromWidth(52), fillerCc: 10 });
    const dia = diameterFromGirth(10.4);
    const viaDiameter = estimate({ lengthCm: 11, baseGirthCm: girthFromDiameter(dia), fillerCc: 10 });
    expect(viaDiameter.c1Low).toBeCloseTo(viaCondom.c1Low, 6);
    expect(viaDiameter.condomLow.label).toBe(viaCondom.condomLow.label);
  });

  it('F3: 2D scale + 3D radius both derive from the SAME est.c1 (single source)', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 16 });
    // 3D mesh radius = girthToRadiusCm(c1Low); 2D thickness scales with d1Low = c1Low/π
    expect(girthToRadiusCm(e.c1Low)).toBeCloseTo(e.c1Low / (2 * Math.PI), 6);
    expect(e.d1Low).toBeCloseTo(e.c1Low / Math.PI, 6);
  });
});

describe('filler-simulator source-grep (purity + wiring + Rev requirements)', () => {
  const math = read('src/lib/fillerMath.js');
  const page = read('src/pages/FillerSimulator.jsx');
  const g2d = read('src/components/FillerGraphic2D.jsx');
  const g3d = read('src/components/Filler3D.jsx');
  const app = read('src/App.jsx');

  it('SG1: no Firestore / backendClient / firebase IMPORTS in any new file (pure client, no PII)', () => {
    // check import SOURCES (not comments — files mention "no Firebase" in prose)
    const badImport = /from\s+['"][^'"]*(firebase|firestore|backendClient|scopedDataLayer)[^'"]*['"]/i;
    for (const [name, src] of [['math', math], ['page', page], ['g2d', g2d], ['g3d', g3d]]) {
      expect(src, name).not.toMatch(badImport);
    }
  });

  it('SG2: page wires fillerMath + FillerGraphic2D + lazy Filler3D (SSOT)', () => {
    expect(page).toMatch(/from '\.\.\/lib\/fillerMath\.js'/);
    expect(page).toMatch(/FillerGraphic2D/);
    expect(page).toMatch(/lazy\(\(\) => import\('\.\.\/components\/Filler3D\.jsx'\)\)/); // 3D lazy-loaded only on demand
  });

  it('SG3: both graphic components consume the estimate from fillerMath', () => {
    expect(g2d).toMatch(/fillerMath\.js/);
    expect(g3d).toMatch(/girthToRadiusCm/);
    expect(g3d).toMatch(/est\?\.c1Low|est\.c1Low/);
  });

  it('SG4: App routes ?play=filler before auth gate', () => {
    expect(app).toMatch(/playFromUrl = params\.get\('play'\)/);
    expect(app).toMatch(/playFromUrl === 'filler'/);
    expect(app).toMatch(/lazy\(\(\) => import\('\.\/pages\/FillerSimulator\.jsx'\)\)/);
  });

  it('SG5: Rev requirements present — เดิม→ใหม่ cards, ประมาณ wording, no "กะเกณ", reveal-gate, 6–24', () => {
    expect(page).toMatch(/เดิม/);                 // baseline shown in cards
    expect(page).toMatch(/ประมาณ/);               // wording
    expect(page).not.toMatch(/กะเกณ/);            // old wording gone
    expect(page).toMatch(/แตะเพื่อดูภาพ/);        // reveal-gate
    expect(page).toMatch(/6–24/);                 // duration note
    expect(page).toMatch(/ไม่เพิ่ม.*ความยาว|เพิ่ม.*รอบวง.*ไม่เพิ่ม/); // girth-not-length
  });
});
