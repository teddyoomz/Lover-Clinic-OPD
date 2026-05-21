// Pure gesture math + touch-input classification for the tablet chart canvas. No fabric/react
// import → fully unit-testable (mirrors tabletChartTools.js). The component wires DOM pointer
// events to these helpers; this module owns the MATH + the routing decision (not the DOM).

export const MIN_ZOOM = 1;            // fit
export const MAX_ZOOM = 4;
export const FIT_VPT = [1, 0, 0, 1, 0, 0];   // Fabric viewportTransform at fit (no zoom/pan)

export function clampZoom(z) {
  const n = Number(z);
  if (Number.isNaN(n)) return MIN_ZOOM;   // NaN/undefined → fit; Infinity flows through → MAX
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
}

export function distance(a, b) {
  return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
}

export function centroid(points) {
  const pts = Array.isArray(points) ? points.filter(Boolean) : [];
  if (!pts.length) return { x: 0, y: 0 };
  const s = pts.reduce((acc, p) => ({ x: acc.x + (p.x || 0), y: acc.y + (p.y || 0) }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

export function nextZoom(startZoom, distRatio) {
  const ratio = Number(distRatio);
  const z = (Number(startZoom) || MIN_ZOOM) * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
  return clampZoom(z);
}

export function panDelta(prev, cur) {
  return { dx: (cur?.x ?? 0) - (prev?.x ?? 0), dy: (cur?.y ?? 0) - (prev?.y ?? 0) };
}

// A Fabric viewportTransform is [scaleX, skewY, skewX, scaleY, translateX, translateY].
// Zoomed = scaled away from 1 OR translated (panned) away from origin.
export function isZoomedVpt(vpt) {
  if (!Array.isArray(vpt) || vpt.length < 6) return false;
  return Math.abs(vpt[0] - 1) > 1e-3 || Math.abs(vpt[4]) > 0.5 || Math.abs(vpt[5]) > 0.5;
}

// THE router for a TOUCH input. The pen path is separate (pen always draws). Returns one of
// 'pinch' | 'pan' | 'draw' | 'ignore'. Defaults are safe: unknown/empty input never draws.
export function classifyTouchGesture({ touchCount = 0, penMode = false, penDown = false, isZoomed = false } = {}) {
  if (penDown) return 'ignore';            // pen has priority — no gesture/draw from touch mid-stroke
  if (touchCount >= 3) return 'ignore';    // palm splay
  if (touchCount === 2) return 'pinch';
  if (touchCount === 1) {
    if (penMode) return isZoomed ? 'pan' : 'ignore';   // pen mode: a finger/palm never draws
    return 'draw';                                      // no-pen fallback: a single finger draws
  }
  return 'ignore';
}
