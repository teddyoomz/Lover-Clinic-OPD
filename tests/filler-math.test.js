import { describe, it, expect } from 'vitest';
import {
  PI, K_DURABLE, K_PEAK, CM_PER_INCH, RANGES, CONDOM_LADDER,
  GLANS_CC, GLANS_BASE_RATIO, GLANS_FILL_VOLUME_CC, GLANS_SPLIT_MAX_CC, glansDiameterGain,
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

describe('fillerMath — condom snap (FLOOR — largest size that fits; retention rule)', () => {
  // 2026-06-21 thai-sizes: Thai-familiar+world ladder [45,49,52,54,56,58,60,64,69,72].
  it('exact width snaps to that rung', () => {
    expect(condomForGirth(10.4).w).toBe(52); // NW 52 → rung 52 (exact)
    expect(condomForGirth(12.0).w).toBe(60); // NW 60 → rung 60 (exact)
  });
  it('snap-back consistency: every ladder rung → girth → snaps back to itself', () => {
    for (const rung of CONDOM_LADDER) {
      const girth = girthFromWidth(rung.w);
      expect(condomForGirth(girth).w).toBe(rung.w);
    }
  });
  it('verified examples (Thai+world ladder floor)', () => {
    expect(condomForGirth(11.67).w).toBe(58); // NW 58.35 → floor 58
    expect(condomForGirth(12.18).w).toBe(60); // NW 60.9 → floor 60
  });
  it('floor: between sizes → rounds DOWN to the rung that fits (retention)', () => {
    expect(condomForGirth(11.0).w).toBe(54); // NW 55 → floor 54 (no 55 rung)
    expect(condomForGirth(10.0).w).toBe(49); // NW 50 → floor 49
    expect(condomForGirth(11.5).w).toBe(56); // NW 57.5 → floor 56 (no 57 rung)
  });
  it('clamps small girth to the smallest rung; large girth caps at the top rung 72 (no beyond)', () => {
    expect(condomForGirth(5).w).toBe(45);          // tiny → smallest
    expect(condomForGirth(5).beyond).toBe(false);
    expect(condomForGirth(20).w).toBe(72);         // huge → caps at 72 (world max; 2026-06-21 thai-sizes)
    expect(condomForGirth(20).beyond).toBe(false);
  });
});

describe('fillerMath — condom floor on the Thai+world ladder (no beyond flag)', () => {
  // 2026-06-21 thai-sizes: floor snap to the largest fitting rung; top rung 72 (world max); never "beyond".
  it('floors to the largest fitting rung; NO beyond flag', () => {
    expect(condomForGirth(12.8).w).toBe(64);       // NW 64 exactly → 64
    expect(condomForGirth(12.8).beyond).toBe(false);
    expect(condomForGirth(13.0).w).toBe(64);       // NW 65 → floors to 64
    expect(condomForGirth(13.0).beyond).toBe(false);
    expect(condomForGirth(14.0).w).toBe(69);       // NW 70 → floors to 69
    expect(condomForGirth(14.0).index).toBe(8);    // rung 69 = index 8
    expect(condomForGirth(20).w).toBe(72);         // way over → caps at the top rung 72
    expect(condomForGirth(20).beyond).toBe(false);
  });
  it('estimate NEVER flags beyond (the เกินมาตรฐาน flag was removed)', () => {
    const e = estimate({ lengthCm: 12.7, baseGirthCm: girthFromWidth(60), shaftCc: 30, glansCc: 0 });
    expect(e.condomHigh.beyond).toBe(false);
    expect(e.condom0.beyond).toBe(false);
  });
});

describe('fillerMath — estimate (girth model, geometry × k)', () => {
  it('ANCHOR: C0=10.4, L=11, V=16 → ΔC durable +1.0 / peak +1.6 (k 1.22–1.90, RCT-anchored)', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 16 });
    expect(e.deltaCLow).toBeCloseTo(1.0, 1);
    expect(e.deltaCHigh).toBeCloseTo(1.6, 1);
    expect(e.c1Low).toBeCloseTo(11.4, 1);
    expect(e.c1High).toBeCloseTo(12.0, 1);
  });
  it('mockup case: C0=10.4, L=11, V=10 → 11.1–11.4 / Ø 3.5–3.6 / condom 52→54–56 / +1..+2 (k 1.22–1.90)', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 10 });
    expect(e.c1Low).toBeCloseTo(11.1, 1);
    expect(e.c1High).toBeCloseTo(11.4, 1);
    expect(e.d1Low).toBeCloseTo(3.5, 1);
    expect(e.d1High).toBeCloseTo(3.6, 1);
    expect(e.condom0.w).toBe(52);     // 2026-06-21 thai-sizes ladder
    expect(e.condomLow.w).toBe(54);
    expect(e.condomHigh.w).toBe(56);
    expect(e.sizesUpLow).toBe(1);
    expect(e.sizesUpHigh).toBe(2);
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
    expect(d8).toBeCloseTo(1.4, 1);   // 2026-06-21 k 1.22 durable (was 2.1 @ k 1.8)
    expect(d15).toBeCloseTo(0.8, 1);  // 2026-06-21 k 1.22 durable
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
    expect(K_DURABLE).toBe(1.22); // 2026-06-21 closest-to-real (was K_REALISTIC 1.8)
    expect(K_PEAK).toBe(1.9);     // 2026-06-21 closest-to-real (was K_OPTIMISTIC 2.3)
    expect(RANGES.cc).toEqual([5, 50]); // 2026-06-21: raised back to 50 per owner
    expect(RANGES.lengthCm).toEqual([6.35, 25.4]); // 2.5–10 in
    expect(CONDOM_LADDER.map((r) => r.w)).toEqual([45, 49, 52, 54, 56, 58, 60, 64, 69, 72]); // 2026-06-21 thai-sizes
  });
});

describe('fillerMath v2 — glans (head) augmentation', () => {
  it('glans constants (cube-root model)', () => {
    expect(GLANS_CC).toEqual({ min: 0, max: 15, step: 0.5, default: 0 });
    expect(GLANS_SPLIT_MAX_CC).toBe(15);
    expect(GLANS_FILL_VOLUME_CC.peak).toBeCloseTo(3.81, 2);
    expect(GLANS_FILL_VOLUME_CC.durable).toBeCloseTo(4.59, 2);
    expect(GLANS_FILL_VOLUME_CC.peak).toBeLessThan(GLANS_FILL_VOLUME_CC.durable); // smaller veff → peak grows more
  });
  it('ANCHOR: glans Ø 3.5 + 2cc → durable +0.45 / peak +0.53 cm Ø (Moon 2015 +14.1/+16.6mm circ)', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 9.74, shaftCc: 0, glansCc: 2, baseGlansDiameterCm: 3.5 });
    expect(e.glans.deltaLow).toBeCloseTo(0.45, 1);   // durable +12.8%
    expect(e.glans.deltaHigh).toBeCloseTo(0.53, 1);  // peak +15.1%
    expect(e.glans.pctLow).toBeCloseTo(12.8, 0);
    expect(e.glans.pctHigh).toBeCloseTo(15.1, 0);
  });
  it('0cc → no change; durable ≤ peak', () => {
    const e0 = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 5, glansCc: 0 });
    expect(e0.glans.visualLow).toBe(e0.glans.dg0);
    expect(e0.glans.visualHigh).toBe(e0.glans.dg0);
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 5, glansCc: 3 });
    expect(e.glans.visualLow).toBeLessThanOrEqual(e.glans.visualHigh);
  });
  it('glans baseline defaults to shaft Ø when not provided', () => {
    const e = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 5, glansCc: 2 });
    expect(e.glans.dg0).toBeCloseTo(diameterFromGirth(10.4), 6); // ≈3.31
  });
  it('CRITICAL: glans cc does NOT change shaft girth / condom', () => {
    const a = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 12, glansCc: 0 });
    const b = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 12, glansCc: 4 });
    expect(b.c1Low).toBeCloseTo(a.c1Low, 6);
    expect(b.c1High).toBeCloseTo(a.c1High, 6);
    expect(b.condomLow.w).toBe(a.condomLow.w);
    expect(b.sizesUpLow).toBe(a.sizesUpLow);
  });
  it('back-compat: fillerCc alias still drives shaft band', () => {
    const v1 = estimate({ lengthCm: 11, baseGirthCm: 10.4, fillerCc: 16 });
    const v2 = estimate({ lengthCm: 11, baseGirthCm: 10.4, shaftCc: 16 });
    expect(v1.c1Low).toBeCloseTo(v2.c1Low, 6);
    expect(v1.glans.dg0).toBeCloseTo(diameterFromGirth(10.4), 6);
  });
  it('split math: total 12 · glans% 15 → shaft 10.2 / glans 1.8', () => {
    const total = 12, gp = 0.15;
    const shaftCc = total * (1 - gp), glansCc = total * gp;
    expect(shaftCc).toBeCloseTo(10.2, 6);
    expect(glansCc).toBeCloseTo(1.8, 6);
    const e = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc, glansCc });
    expect(e.glans.deltaLow).toBeGreaterThan(0);            // head grows with the 1.8cc
    expect(e.glans.visualLow).toBeGreaterThan(e.glans.dg0);
  });
  it('glans baseline ratio (v5): dg0 = ratio × shaft Ø; scales with diameter; condom unchanged', () => {
    expect(GLANS_BASE_RATIO).toEqual({ min: 0.75, max: 1.25, step: 0.05, default: 1.0 });
    const dia = diameterFromGirth(10.4); // shaft Ø
    // ratio 1.0 → dg0 = shaft Ø (today's behavior)
    const a = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 5, glansCc: 2, baseGlansDiameterCm: 1.0 * dia });
    expect(a.glans.dg0).toBeCloseTo(dia, 6);
    // ratio 1.25 → dg0 25% larger; shaft girth + condom UNCHANGED (head excluded from condom)
    const b = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 5, glansCc: 2, baseGlansDiameterCm: 1.25 * dia });
    expect(b.glans.dg0).toBeCloseTo(1.25 * dia, 6);
    expect(b.glans.visualLow).toBeGreaterThan(a.glans.visualLow); // bigger baseline → bigger head bulb
    expect(b.c1Low).toBeCloseTo(a.c1Low, 6);
    expect(b.condomLow.w).toBe(a.condomLow.w);
    // scales with diameter: bigger baseGirth → bigger dg0 at the same ratio
    const bigDia = diameterFromGirth(12.0);
    const big = estimate({ lengthCm: 12.7, baseGirthCm: 12.0, shaftCc: 5, glansCc: 2, baseGlansDiameterCm: 1.0 * bigDia });
    expect(big.glans.dg0).toBeGreaterThan(a.glans.dg0);
  });
  it('STRICTLY INCREASING 0→15 (no plateau) + diminishing per-cc + ≥+1cm at 10cc + independent of shaft', () => {
    // research-anchored cube-root volume model (spec 2026-06-21): head grows with EVERY cc, never
    // plateaus (the OLD "saturates at 2mL" was a misread), each cc adds a little less Ø. Capped 15cc.
    const g = (cc) => estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 5, glansCc: cc, baseGlansDiameterCm: 3.5 }).glans;
    expect(g(2).visualLow).toBeGreaterThan(g(0).visualLow);              // grows from baseline
    expect(g(8).visualLow).toBeGreaterThan(g(2).visualLow);             // KEEPS growing above 2cc — the fix
    expect(g(15).visualLow).toBeGreaterThan(g(10).visualLow);          // all the way to the 15cc cap
    expect(g(10).visualLow - g(10).dg0).toBeGreaterThan(1.0);          // clinic 10cc looks big (≥ +1cm Ø)
    // diminishing per-cc (cube-root): the 8→15 increment < the 2→8 increment
    expect(g(15).visualLow - g(8).visualLow).toBeLessThan(g(8).visualLow - g(2).visualLow);
    // visual is independent of shaft cc
    const a = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 5, glansCc: 8 });
    const b = estimate({ lengthCm: 12.7, baseGirthCm: 10.4, shaftCc: 30, glansCc: 8 });
    expect(b.glans.visualLow).toBeCloseTo(a.glans.visualLow, 6);
  });
  it('removed: GLANS_DIAM_PER_CC / GLANS_SATURATION_CC / glansVisualGain no longer exported', async () => {
    const mod = await import('../src/lib/fillerMath.js');
    expect(mod.GLANS_DIAM_PER_CC).toBeUndefined();
    expect(mod.GLANS_SATURATION_CC).toBeUndefined();
    expect(mod.glansVisualGain).toBeUndefined();
    expect(mod.GLANS_VISUAL_MAX_DELTA).toBeUndefined();
  });
});
