import { getStroke } from 'perfect-freehand';

export const PEN_PRESETS = {
  pen: (size) => ({ size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: false }),
  highlighter: (size) => ({ size: size * 2.2, thinning: 0.1, smoothing: 0.6, streamline: 0.6, simulatePressure: false }),
};

// points: array of [x, y, pressure]
export function strokeOutline(points, options) {
  if (!points || points.length === 0) return [];
  return getStroke(points, options);
}

// Build a Path2D from an outline polygon (for canvas fill). Browser-only (Path2D).
export function outlineToPath2D(outline) {
  const p = new Path2D();
  if (!outline.length) return p;
  p.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) p.lineTo(outline[i][0], outline[i][1]);
  p.closePath();
  return p;
}
