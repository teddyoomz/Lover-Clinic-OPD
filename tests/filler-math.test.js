import { describe, it, expect } from 'vitest';
import {
  PI, K_REALISTIC, K_OPTIMISTIC, CM_PER_INCH, RANGES, CONDOM_LADDER,
  widthFromGirth, girthFromWidth, diameterFromGirth, girthFromDiameter, girthToRadiusCm,
  cmToInch, inchToCm, condomIndexForGirth, condomForGirth, estimate,
} from '../src/lib/fillerMath.js';

describe('fillerMath — exact geometry', () => {
  it('width = girth × 5 (nominal width = half circumference)', () => {
    expect(widthFromGirth(11)).toBe(55);
    expect(widthFromGirth(12)).toBe(60);
    expect(widthFromGirth(10.4)).toBe(52);
  });
  it('girth = width / 5 (inverse)', () => {
    expect(girthFromWidth(55)).toBe(11);
    expect(girthFromWidth(52)).toBe(10.4);
  });
  it('diameter = girth / π', () => {
    expect(diameterFromGirth(11)).toBeCloseTo(3.50, 2);
    expect(diameterFromGirth(12)).toBeCloseTo(3.82, 2);
    expect(diameterFromGirth(10.4)).toBeCloseTo(3.31, 2);
  });
  it('girth = diameter × π (inverse)', () => {
    expect(girthFromDiameter(3.0)).toBeCloseTo(9.4248, 3);
    expect(girthFromDiameter(diameterFromGirth(11))).toBeCloseTo(11, 6);
  });
  it('3D mesh radius = girth / (2π)', () => {
    expect(girthToRadiusCm(10.4)).toBeCloseTo(10.4 / (2 * PI), 6);
  });
});

describe('fillerMath — units', () => {
  it('cm <-> inch round-trip (2.54)', () => {
    expect(cmToInch(2.54)).toBeCloseTo(1, 6);
    expect(inchToCm(1)).toBeCloseTo(2.54, 6);
    expect(inchToCm(cmToInch(11))).toBeCloseTo(11, 6);
    expect(CM_PER_INCH).toBe(2.54);
  });
});

describe('fillerMath — condom snap (nearest width, tie → larger)', () => {
  it('exact width snaps to that rung', () => {
    expect(condomForGirth(10.4).w).toBe(52); // 52mm
    expect(condomForGirth(12.0).w).toBe(60); // 60mm exact
  });
  it('snap-back consistency: every ladder rung → girth → snaps back to itself', () => {
    for (const rung of CONDOM_LADDER) {
      const girth = girthFromWidth(rung.w);
      expect(condomForGirth(girth).w).toBe(rung.w);
    }
  });
  it('verified examples (V10 realistic / optimistic girths)', () => {
    expect(condomForGirth(11.67).w).toBe(58); // Large+
    expect(condomForGirth(12.18).w).toBe(60); // XL
  });
  it('tie resolves to the LARGER width', () => {
    // girth 11.0 → req 55mm, midway 54 & 56 → pick 56
    expect(condomForGirth(11.0).w).toBe(56);
    // girth 10.0 → req 50mm, midway 49 & 52 (Δ1 vs Δ2) → 49 (nearest, not tie)
    expect(condomForGirth(10.0).w).toBe(49);
  });
  it('clamps to ladder ends for out-of-range girth', () => {
    expect(condomForGirth(5).w).toBe(45); // tiny → smallest
    expect(condomForGirth(20).w).toBe(64); // huge → largest
  });
});

describe('fillerMath — estimate (girth model, geometry × k)', () => {
  it('ANCHOR: condom 52 (C0=10.4), L=11, V=16 → ΔC +2.0 / +2.8', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 16 });
    expect(e.deltaCLow).toBeCloseTo(2.0, 1);
    expect(e.deltaCHigh).toBeCloseTo(2.8, 1);
    expect(e.c1Low).toBeCloseTo(12.4, 1);
    expect(e.c1High).toBeCloseTo(13.2, 1);
  });
  it('mockup case: C0=10.4, L=11, V=10 → 11.7–12.2 / Ø 3.7–3.9 / condom 58→60 / +3..+4', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 10 });
    expect(e.c1Low).toBeCloseTo(11.7, 1);
    expect(e.c1High).toBeCloseTo(12.2, 1);
    expect(e.d1Low).toBeCloseTo(3.7, 1);
    expect(e.d1High).toBeCloseTo(3.9, 1);
    expect(e.condom0.w).toBe(52);
    expect(e.condomLow.w).toBe(58);
    expect(e.condomHigh.w).toBe(60);
    expect(e.sizesUpLow).toBe(3);
    expect(e.sizesUpHigh).toBe(4);
  });
  it('monotonic: more cc → larger girth', () => {
    let prev = -Infinity;
    for (let v = 0; v <= 50; v++) {
      const c = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: v }).c1Low;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
  it('length-sensitivity: same cc, shorter shaft → bigger ΔC', () => {
    const d8 = estimate({ lengthCm: 8, baseGirthCm: 10.4, fillerCc: 16 }).deltaCLow;
    const d11 = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 16 }).deltaCLow;
    const d15 = estimate({ lengthCm: 15, baseGirthCm: 10.4, fillerCc: 16 }).deltaCLow;
    expect(d8).toBeGreaterThan(d11);
    expect(d11).toBeGreaterThan(d15);
    expect(d8).toBeCloseTo(2.7, 1);
    expect(d15).toBeCloseTo(1.5, 1);
  });
  it('band ordering: low ≤ high always (matrix)', () => {
    for (let v = 1; v <= 50; v += 5)
      for (const L of [8, 11, 15, 18])
        for (const C0 of [7, 9, 10.4, 13]) {
          const e = estimate({ lengthCm: L, baseGirthCm: C0, fillerCc: v });
          expect(e.c1Low).toBeLessThanOrEqual(e.c1High);
          expect(e.deltaCLow).toBeLessThanOrEqual(e.deltaCHigh);
        }
  });
  it('V=0 → no change', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 0 });
    expect(e.deltaCLow).toBe(0);
    expect(e.c1Low).toBe(10.4);
  });
  it('adversarial: NaN / negative / huge → finite, no throw', () => {
    for (const args of [
      { lengthCm: NaN, baseGirthCm: NaN, fillerCc: NaN },
      { lengthCm: -5, baseGirthCm: -5, fillerCc: -5 },
      { lengthCm: 0, baseGirthCm: 0, fillerCc: 0 },
      { lengthCm: 1e6, baseGirthCm: 1e6, fillerCc: 1e6 },
    ]) {
      const e = estimate(args);
      expect(Number.isFinite(e.c1Low)).toBe(true);
      expect(Number.isFinite(e.c1High)).toBe(true);
      expect(Number.isFinite(e.d1Low)).toBe(true);
    }
  });
  it('baseGirth from diameter equals baseGirth from condom (same C0 → same estimate)', () => {
    const viaCondom = estimate({ lengthCm: 11, baseGirthCm: girthFromWidth(52), fillerCc: 10 });
    const viaDiameter = estimate({ lengthCm: 11, baseGirthCm: girthFromDiameter(diameterFromGirth(10.4)), fillerCc: 10 });
    expect(viaDiameter.c1Low).toBeCloseTo(viaCondom.c1Low, 6);
  });
});

describe('fillerMath — constants/ranges sanity', () => {
  it('k + ranges + ladder', () => {
    expect(K_REALISTIC).toBe(2.37);
    expect(K_OPTIMISTIC).toBe(3.32);
    expect(RANGES.cc).toEqual([1, 50]);
    expect(CONDOM_LADDER.map((r) => r.w)).toEqual([45, 49, 52, 54, 56, 58, 60, 64]);
  });
});
