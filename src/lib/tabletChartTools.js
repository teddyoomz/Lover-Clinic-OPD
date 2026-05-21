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
