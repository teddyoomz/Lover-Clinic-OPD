import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM, MAX_ZOOM, FIT_VPT,
  clampZoom, distance, centroid, nextZoom, panDelta, isZoomedVpt, classifyTouchGesture,
} from '../src/lib/chartGestureMath.js';

describe('G1 constants', () => {
  it('G1.1 zoom range 1..4 + fit identity VPT', () => {
    expect(MIN_ZOOM).toBe(1); expect(MAX_ZOOM).toBe(4);
    expect(FIT_VPT).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('G2 clampZoom', () => {
  it('G2.1 clamps to [1,4]', () => {
    expect(clampZoom(0.2)).toBe(1); expect(clampZoom(2.5)).toBe(2.5); expect(clampZoom(99)).toBe(4);
  });
  it('G2.2 NaN/undefined → MIN_ZOOM; Infinity → MAX_ZOOM', () => {
    expect(clampZoom(NaN)).toBe(1); expect(clampZoom(undefined)).toBe(1); expect(clampZoom(Infinity)).toBe(4);
  });
});

describe('G3 distance + centroid', () => {
  it('G3.1 distance is euclidean + null-safe', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance(null, null)).toBe(0);
  });
  it('G3.2 centroid averages points + null-safe', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 4, y: 8 }])).toEqual({ x: 2, y: 4 });
    expect(centroid([])).toEqual({ x: 0, y: 0 });
    expect(centroid(null)).toEqual({ x: 0, y: 0 });
  });
});

describe('G4 nextZoom (pinch)', () => {
  it('G4.1 multiplies start zoom by the distance ratio, clamped', () => {
    expect(nextZoom(1, 2)).toBe(2);          // fingers spread 2x → 2x zoom
    expect(nextZoom(2, 0.25)).toBe(1);       // pinch in hard → clamps to fit
    expect(nextZoom(2, 10)).toBe(4);         // clamps to max
  });
  it('G4.2 bad ratio → start zoom unchanged (ratio 1)', () => {
    expect(nextZoom(2, undefined)).toBe(2); expect(nextZoom(2, NaN)).toBe(2); expect(nextZoom(2, -3)).toBe(2);
  });
});

describe('G5 panDelta', () => {
  it('G5.1 delta between two points, null-safe', () => {
    expect(panDelta({ x: 10, y: 10 }, { x: 13, y: 6 })).toEqual({ dx: 3, dy: -4 });
    expect(panDelta(null, null)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('G6 isZoomedVpt', () => {
  it('G6.1 fit VPT is not zoomed', () => { expect(isZoomedVpt([1, 0, 0, 1, 0, 0])).toBe(false); });
  it('G6.2 scaled OR translated is zoomed', () => {
    expect(isZoomedVpt([2, 0, 0, 2, 0, 0])).toBe(true);
    expect(isZoomedVpt([1, 0, 0, 1, 40, 0])).toBe(true);
  });
  it('G6.3 garbage → false', () => { expect(isZoomedVpt(null)).toBe(false); expect(isZoomedVpt([1, 0])).toBe(false); });
});

describe('G7 classifyTouchGesture (the router)', () => {
  it('G7.1 pen down → ignore (pen priority, no mid-stroke gesture)', () => {
    expect(classifyTouchGesture({ touchCount: 2, penDown: true })).toBe('ignore');
    expect(classifyTouchGesture({ touchCount: 1, penDown: true, penMode: false })).toBe('ignore');
  });
  it('G7.2 3+ touches → ignore (palm splay)', () => {
    expect(classifyTouchGesture({ touchCount: 3 })).toBe('ignore');
    expect(classifyTouchGesture({ touchCount: 5 })).toBe('ignore');
  });
  it('G7.3 2 touches → pinch', () => {
    expect(classifyTouchGesture({ touchCount: 2 })).toBe('pinch');
    expect(classifyTouchGesture({ touchCount: 2, penMode: true })).toBe('pinch');
  });
  it('G7.4 1 touch, pen mode → pan when zoomed, ignore when fit (palm rejected)', () => {
    expect(classifyTouchGesture({ touchCount: 1, penMode: true, isZoomed: true })).toBe('pan');
    expect(classifyTouchGesture({ touchCount: 1, penMode: true, isZoomed: false })).toBe('ignore');
  });
  it('G7.5 1 touch, no pen → draw (finger fallback)', () => {
    expect(classifyTouchGesture({ touchCount: 1, penMode: false })).toBe('draw');
  });
  it('G7.6 0 touches → ignore', () => { expect(classifyTouchGesture({ touchCount: 0 })).toBe('ignore'); });
  it('G7.7 empty/no args → ignore (never accidentally draws)', () => { expect(classifyTouchGesture()).toBe('ignore'); });
});
