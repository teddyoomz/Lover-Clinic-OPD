// Pure tool descriptors for the tablet chart editor. No fabric/react import — fully unit-testable.
// Drives TabletChartCanvas tool routing + locks the per-tool fabric object type the relay must
// preserve (used by the flow-simulate fidelity test + AV103).

export const TOOL_IDS = ['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'eraser'];

// Tools that draw a perfect-freehand pressure stroke via OUR pointer capture (not Fabric brush).
export const isDrawTool = (t) => t === 'pen' || t === 'highlighter';

// Tools drawn by dragging a Fabric vector object from start→end point.
export const isShapeTool = (t) => t === 'line' || t === 'arrow' || t === 'rect' || t === 'circle';

// The fabric object type each drawing/shape/text tool produces, EXACTLY as it appears in
// fabric v7 `canvas.toJSON()` — which uses the class name (PascalCase): Path / Line / Group /
// Rect / Ellipse / Textbox. (Verified in a real browser; v5/v6 used lowercase — do NOT assume.)
const TYPE = { pen: 'Path', highlighter: 'Path', line: 'Line', arrow: 'Group', rect: 'Rect', circle: 'Ellipse', text: 'Textbox' };
export function shapeObjectType(tool) { return TYPE[tool] || 'Path'; }

// Serialize a fabric canvas for relay/persist + LOSSLESS object-level re-edit. Includes the canvas
// DIMENSIONS so a re-edit can recreate the SAME coordinate space — fabric objects carry absolute
// coords, so loading them into a differently-sized canvas would misplace/clip them. Backward-
// compatible: loadFromJSON ignores the extra canvasWidth/canvasHeight keys; a legacy json without
// them (or no json at all) falls back to the flattened-PNG raster re-edit. (fc is duck-typed — no
// fabric import here, so this stays unit-testable.)
export function serializeFabricCanvas(fc) {
  if (!fc || typeof fc.toJSON !== 'function') return null;
  return JSON.stringify({ ...fc.toJSON(), canvasWidth: Math.round(fc.width || 0), canvasHeight: Math.round(fc.height || 0) });
}

// True when a parsed chart json carries object-level data AND its canvas dims → re-editable as
// movable/erasable OBJECTS (not just a flat raster). Used by ChartCanvas to pick the re-edit path.
export function isObjectLevelReeditable(parsed) {
  return !!(parsed && Array.isArray(parsed.objects) && parsed.objects.length > 0
    && Number(parsed.canvasWidth) > 0 && Number(parsed.canvasHeight) > 0);
}

// Build the chart entry persisted into the OPD record (be_treatments.detail.charts[]). A Firestore
// doc is capped at ~1 MB; both the flattened PNG dataUrl AND the lossless fabricJson are inlined, so
// a large chart (esp. a big embedded template image) can approach the limit and break the WHOLE
// treatment save. Guard: ALWAYS keep the PNG dataUrl (the essential visual) + templateId, but DROP
// the fabricJson when the entry would get too large → the chart still saves + displays; object-level
// re-edit gracefully falls back to raster for that one chart. CAP leaves headroom for ≤2 charts + the
// rest of the treatment doc. (NOTE: a single chart PNG dataUrl that ALONE exceeds the cap is a
// pre-existing limit of inlining chart images in the Firestore doc — see V-log; Storage-ref is the
// architectural follow-up. This guard prevents the NEW fabricJson from compounding it.)
export const CHART_PERSIST_CAP_BYTES = 700 * 1024;
export function chartEntryForPersist(c) {
  const dataUrl = c?.dataUrl || '';
  let fabricJson = (typeof c?.fabricJson === 'string') ? c.fabricJson : null;
  if (fabricJson && (dataUrl.length + fabricJson.length) > CHART_PERSIST_CAP_BYTES) fabricJson = null;
  return { dataUrl, fabricJson, templateId: c?.templateId };
}
