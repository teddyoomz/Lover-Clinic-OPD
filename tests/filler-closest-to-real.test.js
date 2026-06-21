// Closest-to-real filler recalibration (spec/plan 2026-06-21). Locks every new constant + behavior.
import { describe, it, expect } from 'vitest';
import {
  K_DURABLE, K_PEAK, CONDOM_LADDER, condomForGirth, condomIndexForGirth,
  RANGES, estimate,
} from '../src/lib/fillerMath.js';

describe('girth k-ladder (closest-to-real)', () => {
  it('K_DURABLE = 1.22 (12-mo durable, Low end)', () => { expect(K_DURABLE).toBeCloseTo(1.22, 5); });
  it('K_PEAK = 1.90 (1-mo peak, High end)', () => { expect(K_PEAK).toBeCloseTo(1.90, 5); });
  it('peak > durable (range orientation)', () => { expect(K_PEAK).toBeGreaterThan(K_DURABLE); });
});

describe('condom ladder (Thai-familiar + world)', () => {
  // 2026-06-21 thai-sizes: INPUT dropdown only; the RESULT shows raw computed mm.
  it('widths are exactly [45,49,52,54,56,58,60,64,69,72] (Thai-retail + global-large)', () => {
    expect(CONDOM_LADDER.map((c) => c.w)).toEqual([45, 49, 52, 54, 56, 58, 60, 64, 69, 72]);
  });
  it('dropdown labels keep Thai descriptors (กระชับ / มาตรฐาน / ใหญ่), no English brand names', () => {
    const labels = CONDOM_LADDER.map((c) => c.label).join(' ');
    expect(labels).toMatch(/กระชับ/);
    expect(labels).toMatch(/มาตรฐาน/);
    expect(labels).toMatch(/ใหญ่/);
    expect(labels).not.toMatch(/Super Snug|Regular|Large/);
  });
  it('FLOOR snap: girth 10.4cm (NW 52) -> rung 52 (มาตรฐาน, exact)', () => {
    expect(CONDOM_LADDER[condomIndexForGirth(10.4)].w).toBe(52);
  });
  it('caps at the top rung 72 with NO beyond flag (girth 20cm -> w 72, beyond false)', () => {
    const r = condomForGirth(20);
    expect(r.w).toBe(72);
    expect(r.beyond).toBe(false);
  });
  it('the Thai-removed odd sizes are gone (no 47/51/53)', () => {
    const ws = CONDOM_LADDER.map((c) => c.w);
    [47, 51, 53].forEach((w) => expect(ws).not.toContain(w));
  });
});

describe('volume range', () => {
  it('cc range is [5, 50] (raised to 50 per owner 2026-06-21)', () => {
    expect(RANGES.cc).toEqual([5, 50]);
  });
});

describe('glans calibration (cube-root volume model)', () => {
  it('2cc anchor on Ø3.5: durable +0.45 / peak +0.53 cm Ø (Moon 2015)', () => {
    const g = estimate({ lengthCm: 13.4, baseGirthCm: 10.4, shaftCc: 16, glansCc: 2, baseGlansDiameterCm: 3.5 }).glans;
    expect(g.deltaLow).toBeCloseTo(0.45, 1);
    expect(g.deltaHigh).toBeCloseTo(0.53, 1);
  });
  it('NO plateau — 10cc Ø > 3cc Ø > 2cc Ø (keeps growing per cc)', () => {
    const g = (cc) => estimate({ lengthCm: 13.4, baseGirthCm: 10.4, shaftCc: 16, glansCc: cc, baseGlansDiameterCm: 3.5 }).glans.visualLow;
    expect(g(3)).toBeGreaterThan(g(2));
    expect(g(10)).toBeGreaterThan(g(3));
  });
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
  it('condom RESULT at defaults = raw computed mm 56–59 + length by-product ~1.6–2.4cm (2026-06-21)', () => {
    const e = estimate(base);
    expect(e.condomWidthLow).toBe(56);  // round(c1Low * 5) — NOT floored to a ladder rung
    expect(e.condomWidthHigh).toBe(59); // round(c1High * 5)
    expect(e.lengthGainLow).toBeCloseTo(1.6, 1);  // durable (ระยะคงตัว)
    expect(e.lengthGainHigh).toBeCloseTo(2.4, 1); // peak (ช่วงแรก)
  });
  it('dose-response SATURATES (doubling cc does NOT double the gain)', () => {
    const g16 = estimate({ ...base, shaftCc: 16 }).deltaCHigh;
    const g32 = estimate({ ...base, shaftCc: 32 }).deltaCHigh;
    const g0 = estimate({ ...base, shaftCc: 0 }).deltaCHigh;
    expect(g32 - g16).toBeLessThan(g16 - g0);
  });
  it('glans does NOT plateau — 3mL Ø > 2mL Ø (cube-root volume model)', () => {
    const g2 = estimate({ ...base, glansCc: 2, baseGlansDiameterCm: 3.5 }).glans;
    const g3 = estimate({ ...base, glansCc: 3, baseGlansDiameterCm: 3.5 }).glans;
    expect(g3.visualHigh).toBeGreaterThan(g2.visualHigh);
    expect(g3.visualLow).toBeGreaterThan(g2.visualLow);
  });
  it('glans 2mL gives ΔØ ≈ +0.45–0.53cm (Moon 2015 anchor)', () => {
    const g = estimate({ ...base, glansCc: 2, baseGlansDiameterCm: 3.5 }).glans;
    expect(g.deltaHigh).toBeGreaterThan(0.4);
    expect(g.deltaHigh).toBeLessThan(0.6);
  });
  it('glans is decoupled — does NOT change the shaft girth / condom result', () => {
    const no = estimate({ ...base, glansCc: 0 });
    const yes = estimate({ ...base, glansCc: 2 });
    expect(yes.c1Low).toBeCloseTo(no.c1Low, 10);
    expect(yes.condomWidthHigh).toBe(no.condomWidthHigh);
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

// systematic-debugging 2026-06-21: the flaccid-length box used to show a FLAT 1.6 for every input.
// It must now VARY (dose-dependent + saturating) or it isn't a result. Locks the fix permanently.
describe('flaccid length — dose-dependent + saturating', () => {
  const at = (shaftCc) => estimate({ lengthCm: 13.4, baseGirthCm: 10.4, shaftCc, glansCc: 0 });
  it('VARIES with injected shaft volume (no more flat constant)', () => {
    expect(at(50).lengthGainLow).toBeGreaterThan(at(16).lengthGainLow);
    expect(at(16).lengthGainLow).toBeGreaterThan(at(5).lengthGainLow);
    expect(at(50).lengthGainHigh).toBeGreaterThan(at(16).lengthGainHigh);
  });
  it('SATURATES toward the plateau (durable ≤ 2.0, peak ≤ 3.0) — never blows up', () => {
    expect(at(50).lengthGainLow).toBeLessThanOrEqual(2.0);
    expect(at(50).lengthGainHigh).toBeLessThanOrEqual(3.0);
    expect(at(1e6).lengthGainHigh).toBeLessThanOrEqual(3.0);
  });
  it('peak > durable; ZERO when no SHAFT filler (glans filler does not splint the shaft)', () => {
    expect(at(16).lengthGainHigh).toBeGreaterThan(at(16).lengthGainLow);
    expect(at(0).lengthGainLow).toBe(0);
    expect(at(0).lengthGainHigh).toBe(0);
    expect(estimate({ lengthCm: 13.4, baseGirthCm: 10.4, shaftCc: 0, glansCc: 16 }).lengthGainHigh).toBe(0);
  });
  it('the old flat FLACCID_LENGTH_GAIN_CM + lengthGainCm field are gone', async () => {
    const mod = await import('../src/lib/fillerMath.js');
    expect(mod.FLACCID_LENGTH_GAIN_CM).toBeUndefined();
    expect(at(16).lengthGainCm).toBeUndefined();
  });
  it('CLASSIFIER: NO shaft-driven result field is static — every one varies with shaftCc (length was the last static one)', () => {
    const lo = at(5), hi = at(30);
    for (const f of ['condomWidthLow', 'condomWidthHigh', 'c1Low', 'c1High', 'd1Low', 'd1High', 'lengthGainLow', 'lengthGainHigh']) {
      expect(hi[f]).not.toBe(lo[f]);
    }
  });
});
