import { describe, it, expect } from 'vitest';
import { strokeOutline, PEN_PRESETS } from '../src/lib/penStroke.js';

describe('penStroke', () => {
  it('P1 returns an outline polygon for pressure points', () => {
    const pts = [[0, 0, 0.2], [5, 1, 0.5], [10, 0, 0.8]];
    const out = strokeOutline(pts, PEN_PRESETS.pen(4));
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(2);
    expect(out[0].length).toBe(2);            // [x,y]
  });
  it('P2 empty input → empty outline', () => { expect(strokeOutline([], PEN_PRESETS.pen(4))).toEqual([]); });
  it('P3 presets differ (highlighter thinner thinning than pen)', () => {
    expect(PEN_PRESETS.highlighter(4).thinning).toBeLessThan(PEN_PRESETS.pen(4).thinning);
    expect(PEN_PRESETS.highlighter(4).size).toBeGreaterThan(PEN_PRESETS.pen(4).size);
  });
});
