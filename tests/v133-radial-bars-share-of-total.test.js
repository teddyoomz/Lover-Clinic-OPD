// V133 (2026-05-28) — RadialBars (สัดส่วนตามหมวดหมู่) chart: legend %s summed to
// ~279% + arcs rendered a distorted spiral once V132 surfaced 10 real categories.
// Root cause: pct = value/MAX (not value/total) → legend mislabels max-fraction
// as "%"; and fixed maxBarWidth made count×(barWidth+gap) > radius budget →
// bar radii overflowed the SVG. Fix = computeRadialBarLayout: share-of-TOTAL
// (match FancyDonut) + bar thickness derived from the radius budget (always fits).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeRadialBarLayout } from '../src/components/backend/reports/FancyCharts.jsx';

const SRC = readFileSync('src/components/backend/reports/FancyCharts.jsx', 'utf8');
const SIZE = 260, MAXR = SIZE / 2 - 20; // matches helper's outer bound

// the exact magnitudes from the user's screenshot (val/max %s → relative values)
const SCREENSHOT = [100, 70, 41, 24, 18, 9, 7, 4, 3, 3].map((m, i) => ({ label: `c${i}`, value: m * 1457.9 }));

describe('V133 A — share is proportion of TOTAL, never value/max (the >100% bug)', () => {
  it('A1 shares sum to ≤ 1 (≈1 when all shown)', () => {
    const { items } = computeRadialBarLayout(SCREENSHOT, { size: SIZE });
    const sum = items.reduce((s, it) => s + it.share, 0);
    expect(sum).toBeLessThanOrEqual(1.0001);
    expect(sum).toBeGreaterThan(0.99); // top-10 == all 10 here → 100%
  });
  it('A2 legend %s sum to ~100, NOT ~279 (the screenshot bug)', () => {
    const { items } = computeRadialBarLayout(SCREENSHOT, { size: SIZE });
    const pctSum = items.reduce((s, it) => s + Math.round(it.share * 100), 0);
    expect(pctSum).toBeGreaterThan(95);
    expect(pctSum).toBeLessThan(105);
  });
  it('A3 equal values → equal shares (not all 100%)', () => {
    const { items } = computeRadialBarLayout([{ value: 50 }, { value: 50 }], { size: SIZE });
    expect(items[0].share).toBeCloseTo(0.5, 5);
    expect(items[1].share).toBeCloseTo(0.5, 5);
  });
  it('A4 share = value/total exactly (100/50/50 → .5/.25/.25, NOT 1/.5/.5)', () => {
    const { items } = computeRadialBarLayout([{ value: 100 }, { value: 50 }, { value: 50 }], { size: SIZE });
    expect(items.map(i => i.share)).toEqual([0.5, 0.25, 0.25]);
  });
  it('A5 arc sweepDeg = fillFraction(value/max) × maxSweep (visual bar scales to the biggest)', () => {
    const { items, maxVal } = computeRadialBarLayout(SCREENSHOT, { size: SIZE, maxSweep: 270 });
    for (const it of items) {
      expect(it.sweepDeg).toBeLessThanOrEqual(270.0001);
      expect(it.fillFraction).toBeCloseTo(it.value / maxVal, 5);
      expect(it.sweepDeg).toBeCloseTo(it.fillFraction * 270, 5);
    }
  });
  it('A5b biggest (i=0) is a FULL bar — fillFraction 1 + sweepDeg = maxSweep (user req: ดูเต็มๆ)', () => {
    const { items } = computeRadialBarLayout(SCREENSHOT, { size: SIZE, maxSweep: 270 });
    expect(items[0].fillFraction).toBeCloseTo(1, 5);
    expect(items[0].sweepDeg).toBeCloseTo(270, 5);
    // ...but its LEGEND % is still share-of-total (~36%), NOT 100% (keeps the Σ≤100 fix)
    expect(items[0].share).toBeGreaterThan(0.3);
    expect(items[0].share).toBeLessThan(0.45);
  });
  it('A5c half-of-max value fills half the arc (relative-to-max scaling)', () => {
    const { items } = computeRadialBarLayout([{ value: 100 }, { value: 50 }], { size: SIZE, maxSweep: 270 });
    expect(items[1].sweepDeg).toBeCloseTo(135, 5); // 50/100 × 270
  });
});

describe('V133 B — geometry fits inside the SVG (the distorted-spiral bug)', () => {
  it('B1 ten bars: every radius + barWidth/2 stays within the outer bound', () => {
    const { items, barWidth } = computeRadialBarLayout(SCREENSHOT, { size: SIZE });
    expect(items).toHaveLength(10);
    for (const it of items) {
      expect(it.radius + barWidth / 2).toBeLessThanOrEqual(MAXR + 0.5);
      expect(it.radius - barWidth / 2).toBeGreaterThan(0);
    }
  });
  it('B2 barWidth shrinks to fit many bars but stays visible (≥ 3)', () => {
    const { barWidth } = computeRadialBarLayout(SCREENSHOT, { size: SIZE });
    expect(barWidth).toBeGreaterThanOrEqual(3);
    expect(barWidth).toBeLessThanOrEqual(14);
  });
  it('B3 few bars keep a comfortable thickness (capped at maxBarWidth)', () => {
    const { barWidth } = computeRadialBarLayout([{ value: 10 }], { size: SIZE, maxBarWidth: 14 });
    expect(barWidth).toBe(14);
  });
  it('B4 biggest (i=0) is outermost', () => {
    const { items } = computeRadialBarLayout([{ value: 100 }, { value: 10 }], { size: SIZE });
    expect(items[0].radius).toBeGreaterThan(items[1].radius);
  });
  it('B5 caps at 10 bars even if more categories passed', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ value: 25 - i }));
    const { items } = computeRadialBarLayout(many, { size: SIZE });
    expect(items).toHaveLength(10);
  });
});

describe('V133 C — adversarial / defensive', () => {
  it('C1 empty / non-array → no throw, empty items', () => {
    expect(computeRadialBarLayout([]).items).toEqual([]);
    expect(computeRadialBarLayout(null).items).toEqual([]);
    expect(computeRadialBarLayout(undefined).items).toEqual([]);
  });
  it('C2 all-zero values → shares 0, no NaN', () => {
    const { items } = computeRadialBarLayout([{ value: 0 }, { value: 0 }], { size: SIZE });
    for (const it of items) expect(it.share).toBe(0);
  });
  it('C3 negative values clamp to 0', () => {
    const { items } = computeRadialBarLayout([{ value: -50 }, { value: 50 }], { size: SIZE });
    expect(items[0].value).toBe(0);
    expect(items[1].share).toBe(1);
  });
  it('C4 single bar → share 1', () => {
    const { items } = computeRadialBarLayout([{ value: 99 }], { size: SIZE });
    expect(items[0].share).toBe(1);
  });
});

describe('V133 G — top-10 bars get DISTINCT colors (no look-alike hues)', () => {
  it('G1 ten bars → ten unique colors from the default palette', () => {
    const { items } = computeRadialBarLayout(SCREENSHOT, { size: SIZE,
      palette: ['#22d3ee','#f97316','#a855f7','#84cc16','#ec4899','#3b82f6','#facc15','#ef4444','#14b8a6','#d946ef','#10b981','#f59e0b'] });
    const colors = items.map(it => it.color);
    expect(new Set(colors).size).toBe(10); // all distinct
  });
});

describe('V133 D — source-grep regression', () => {
  it('D1 RadialBars uses computeRadialBarLayout', () => {
    expect(SRC).toMatch(/computeRadialBarLayout\(/);
    expect(SRC).toMatch(/export function computeRadialBarLayout/);
  });
  it('D2 legend + hover render share (of total), not val/max pct', () => {
    expect(SRC).toMatch(/it\.share/);
    // the old bug: pct = val / maxValue then legend `it.pct`
    expect(SRC).not.toMatch(/const pct = val \/ maxValue/);
  });
  it('D3 hover center says ของยอดรวม (share of total), not ของสูงสุด', () => {
    expect(SRC).toMatch(/ของยอดรวม/);
    expect(SRC).not.toMatch(/% ของสูงสุด/);
  });
});
