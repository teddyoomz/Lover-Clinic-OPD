// Closest-to-real filler recalibration (spec/plan 2026-06-21). Locks every new constant + behavior.
import { describe, it, expect } from 'vitest';
import {
  K_DURABLE, K_PEAK, CONDOM_LADDER, condomForGirth, condomIndexForGirth,
  GLANS_DIAM_PER_CC, GLANS_SATURATION_CC, RANGES, estimate,
} from '../src/lib/fillerMath.js';

describe('girth k-ladder (closest-to-real)', () => {
  it('K_DURABLE = 1.22 (12-mo durable, Low end)', () => { expect(K_DURABLE).toBeCloseTo(1.22, 5); });
  it('K_PEAK = 1.90 (1-mo peak, High end)', () => { expect(K_PEAK).toBeCloseTo(1.90, 5); });
  it('peak > durable (range orientation)', () => { expect(K_PEAK).toBeGreaterThan(K_DURABLE); });
});

describe('condom ladder (real MyONE 9-rung)', () => {
  it('widths are exactly [45,47,49,51,53,55,57,60,64]', () => {
    expect(CONDOM_LADDER.map((c) => c.w)).toEqual([45, 47, 49, 51, 53, 55, 57, 60, 64]);
  });
  it('dropdown labels keep names (Super Snug / Regular / Large / Super Wide)', () => {
    const labels = CONDOM_LADDER.map((c) => c.label).join(' ');
    expect(labels).toMatch(/Super Snug/);
    expect(labels).toMatch(/Regular/);
    expect(labels).toMatch(/Large/);
    expect(labels).toMatch(/Super Wide/);
  });
  it('FLOOR snap: girth 10.4cm (NW 52) -> rung 51 (largest <=52)', () => {
    expect(CONDOM_LADDER[condomIndexForGirth(10.4)].w).toBe(51);
  });
  it('caps at 64 with NO beyond flag (girth 14cm -> w 64, beyond false)', () => {
    const r = condomForGirth(14);
    expect(r.w).toBe(64);
    expect(r.beyond).toBe(false);
  });
  it('the old fictional rungs/extension are gone (no 52/54/56/58/62/66+ widths)', () => {
    const ws = CONDOM_LADDER.map((c) => c.w);
    [52, 54, 56, 58, 62, 66, 68, 70, 72].forEach((w) => expect(ws).not.toContain(w));
  });
});

describe('volume range', () => {
  it('cc range is [5, 30] (was 5–50)', () => {
    expect(RANGES.cc).toEqual([5, 30]);
  });
});

describe('glans calibration', () => {
  it('ΔØ/cc band 0.13–0.24 (was 0.25–0.32)', () => {
    expect(GLANS_DIAM_PER_CC.low).toBeCloseTo(0.13, 5);
    expect(GLANS_DIAM_PER_CC.high).toBeCloseTo(0.24, 5);
  });
  it('saturation cap = 2mL', () => { expect(GLANS_SATURATION_CC).toBe(2); });
});

describe('estimate — erect-state + saturation', () => {
  const base = { lengthCm: 13.4, baseGirthCm: 10.4, shaftCc: 16, glansCc: 0 };
  it('peak gain ~ +1.3cm, durable ~ +0.85cm at SE-Asian erect defaults', () => {
    const e = estimate(base);
    expect(e.deltaCHigh).toBeGreaterThan(1.1); // peak
    expect(e.deltaCHigh).toBeLessThan(1.5);
    expect(e.deltaCLow).toBeGreaterThan(0.7); // durable
    expect(e.deltaCLow).toBeLessThan(1.0);
    expect(e.c1High).toBeGreaterThan(e.c1Low); // peak > durable
  });
  it('condom at defaults: durable rung 55, peak rung 57 (range 55–57)', () => {
    const e = estimate(base);
    expect(e.condomLow.w).toBe(55);
    expect(e.condomHigh.w).toBe(57);
  });
  it('dose-response SATURATES (doubling cc does NOT double the gain)', () => {
    const g16 = estimate({ ...base, shaftCc: 16 }).deltaCHigh;
    const g32 = estimate({ ...base, shaftCc: 32 }).deltaCHigh;
    const g0 = estimate({ ...base, shaftCc: 0 }).deltaCHigh;
    expect(g32 - g16).toBeLessThan(g16 - g0);
  });
  it('glans ΔØ saturates at the 2mL plateau (3mL ≈ 2mL)', () => {
    const g2 = estimate({ ...base, glansCc: 2 }).glans;
    const g3 = estimate({ ...base, glansCc: 3 }).glans;
    expect(g3.dgHigh).toBeCloseTo(g2.dgHigh, 5);
    expect(g3.dgLow).toBeCloseTo(g2.dgLow, 5);
  });
  it('glans 2mL gives ΔØ ≈ +0.26–0.48cm (central ~0.35)', () => {
    const g = estimate({ ...base, glansCc: 2 }).glans;
    expect(g.dgHigh - g.dg0).toBeGreaterThan(0.25);
    expect(g.dgHigh - g.dg0).toBeLessThan(0.5);
  });
  it('glans is decoupled — does NOT change the shaft girth / condom result', () => {
    const no = estimate({ ...base, glansCc: 0 });
    const yes = estimate({ ...base, glansCc: 2 });
    expect(yes.c1Low).toBeCloseTo(no.c1Low, 10);
    expect(yes.condomHigh.w).toBe(no.condomHigh.w);
  });
});

describe('source-grep: the under-promise constants are gone', () => {
  it('K_REALISTIC / K_OPTIMISTIC are no longer exported (renamed to K_DURABLE/K_PEAK)', async () => {
    const mod = await import('../src/lib/fillerMath.js');
    expect(mod.K_REALISTIC).toBeUndefined();
    expect(mod.K_OPTIMISTIC).toBeUndefined();
    expect(mod.REAL_MAX_W).toBeUndefined(); // beyond-72 extension removed
  });
});
