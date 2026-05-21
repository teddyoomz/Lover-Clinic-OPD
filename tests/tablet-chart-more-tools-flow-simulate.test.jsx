// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';

// AV41 global.fetch isolation (Phase 17.1 flake-fix) — F1.2 assigns global.fetch; restore it.
const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

vi.mock('../src/firebase.js', () => ({ storage: {}, db: {}, auth: {}, appId: 'test' }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s, p) => ({ __path: p })),
  uploadString: vi.fn(async () => {}),
  getDownloadURL: vi.fn(async (r) => `https://dl.example/${r.__path}`),
  listAll: vi.fn(async () => ({ items: [] })), deleteObject: vi.fn(async () => {}),
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToChartTabletPresenceByBranch: vi.fn(), listenToRequestedSessionForTablet: vi.fn(),
  upsertChartTabletPresence: vi.fn(), listenToChartEditSession: vi.fn(), createChartEditSession: vi.fn(),
  updateChartEditSession: vi.fn(), freeChartTablet: vi.fn(), deleteChartEditSession: vi.fn(),
}));

import EditorToolRail from '../src/components/tablet-chart/EditorToolRail.jsx';
import { shapeObjectType, TOOL_IDS } from '../src/lib/tabletChartTools.js';
import { uploadTransportJson, downloadTransportJson } from '../src/lib/chartEditSession.js';

const base = () => ({
  tool: 'pen', setTool: vi.fn(), color: '#ef4444', setColor: vi.fn(), size: 4, setSize: vi.fn(),
  onUndo: vi.fn(), onRedo: vi.fn(), onClear: vi.fn(), onDelete: vi.fn(),
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('R1 tool rail — full toolset + color picker', () => {
  it('R1.1 renders all 9 tools', () => {
    render(<EditorToolRail {...base()} />);
    ['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'eraser']
      .forEach(id => expect(screen.getByTestId(`tool-${id}`)).toBeTruthy());
  });
  it('R1.2 clicking a tool calls setTool with its id', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-rect'));
    expect(p.setTool).toHaveBeenCalledWith('rect');
  });
  it('R1.3 freeform color picker calls setColor', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.input(screen.getByTestId('color-picker'), { target: { value: '#123456' } });
    expect(p.setColor).toHaveBeenCalledWith('#123456');
  });
  it('R1.4 delete button calls onDelete', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-delete'));
    expect(p.onDelete).toHaveBeenCalled();
  });
  it('R1.5 undo/redo/clear wired', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('tool-undo')); expect(p.onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-redo')); expect(p.onRedo).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('tool-clear')); expect(p.onClear).toHaveBeenCalled();
  });
  it('R1.6 size buttons call setSize', () => {
    const p = base(); render(<EditorToolRail {...p} />);
    fireEvent.click(screen.getByTestId('size-8')); expect(p.setSize).toHaveBeenCalledWith(8);
  });
});

describe('F1 per-tool object fidelity (each drawing tool yields its fabric type; round-trips intact)', () => {
  // fabric v7 toJSON `type` is PascalCase (class name) — verified in a real browser (L1).
  const toolToObj = { pen: { type: 'Path' }, highlighter: { type: 'Path', opacity: 0.4 }, line: { type: 'Line' }, arrow: { type: 'Group' }, rect: { type: 'Rect' }, circle: { type: 'Ellipse' }, text: { type: 'Textbox' } };
  it('F1.1 every non-select/eraser tool maps to a concrete fabric type', () => {
    TOOL_IDS.filter(t => t !== 'select' && t !== 'eraser').forEach(t => expect(shapeObjectType(t)).toBe(toolToObj[t].type));
  });
  it('F1.2 a chart with one of every tool round-trips through transport with all types intact', async () => {
    const json = { version: '7', objects: Object.values(toolToObj).map(o => ({ ...o })) };
    const url = await uploadTransportJson('CES-sim', 'result', json);
    expect(url).toContain('result.json');
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(json) }));
    const back = await downloadTransportJson(url);
    const types = back.objects.map(o => o.type).sort();
    expect(types).toEqual(['Ellipse', 'Group', 'Line', 'Path', 'Path', 'Rect', 'Textbox']);
  });
});

describe('F2 wiring source-grep (AV103 — fabricJson transport, no fabricJson:null in the merge)', () => {
  const page = fs.readFileSync('src/pages/TabletChartEditorPage.jsx', 'utf8');
  const hook = fs.readFileSync('src/hooks/useChartEditSession.js', 'utf8');
  const canvas = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  it('F2.1 page imports TabletChartCanvas, not PenCanvas', () => {
    expect(page).toContain('TabletChartCanvas');
    expect(page).not.toMatch(/import\s+PenCanvas/);
  });
  it('F2.2 onSave uploads fabricJson + sets resultFabricJsonUrl', () => {
    expect(page).toContain('uploadTransportJson');
    expect(page).toContain('resultFabricJsonUrl');
    expect(page).toContain('exportFabricJson');
  });
  it('F2.3 hook downloads resultFabricJsonUrl + passes real fabricJson (NEVER fabricJson:null)', () => {
    expect(hook).toContain('downloadTransportJson');
    expect(hook).toContain('resultFabricJsonUrl');
    expect(hook).not.toMatch(/fabricJson:\s*null/);
  });
  it('F2.4 toolrail wired with onDelete + canvas exposes deleteSelected/exportFabricJson', () => {
    expect(page).toContain('onDelete');
    expect(canvas).toContain('deleteSelected');
    expect(canvas).toContain('exportFabricJson');
  });
  it('F2.5 pen rides Fabric mouse events via getScenePoint (no raw upperCanvasEl listeners)', () => {
    expect(canvas).toContain('getScenePoint');
    expect(canvas).toMatch(/mouse:down|mouse:move|mouse:up/);
  });
});

// RC — root-cause regression for the user-reported "ภาพไม่ขึ้น + วาดไม่ติด + กดบันทึกไม่ได้".
// Cause: the fabric init effect was keyed on templateImageUrl, so the LATE template (instant-pop
// race, ''→dataUrl) re-ran it → cleanup fc.dispose() removed the React-owned <canvas> → re-init
// could not recover (elRef.current null) → fcRef=null → blank template + no draw + broken save.
// Verified live in a real browser: after the late template, the canvas was GONE (wrappers=0,
// fcRef=null). Fix: init the canvas ONCE ([] deps) + load/replace the template on the LIVE canvas
// in a separate effect (mirror PC ChartCanvas + old PenCanvas). Class: React↔DOM-library
// ownership — a library that takes over a React-owned element must be initialized ONCE; reactive
// prop updates mutate the live instance, never dispose+re-init.
describe('RC root-cause: canvas init-once; template on live canvas; no dispose on prop change', () => {
  const canvasSrc = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  it('RC1 the fabric init effect uses [] deps (init ONCE) — NOT keyed on templateImageUrl', () => {
    expect(canvasSrc).toMatch(/\}, \[\]\);\s*\/\/ eslint-disable-line[\s\S]*?init ONCE/);
    const initStart = canvasSrc.indexOf('init fabric ONCE');
    const initEnd = canvasSrc.indexOf('load/replace the template on the LIVE canvas');
    expect(initStart).toBeGreaterThan(-1); expect(initEnd).toBeGreaterThan(initStart);
    const initBlock = canvasSrc.slice(initStart, initEnd);
    expect(initBlock).toContain('new fabric.Canvas');
    expect(initBlock).toContain('fc.dispose()');
    expect(initBlock).not.toMatch(/\}, \[templateImageUrl/);   // init MUST NOT re-run on template change
  });
  it('RC2 a separate effect loads the template on the live canvas keyed on templateImageUrl', () => {
    expect(canvasSrc).toMatch(/useEffect\(\(\) => \{ if \(readyRef\.current\) loadTemplate\(templateImageUrl\); \}, \[templateImageUrl/);
  });
  it('RC3 loadTemplate mutates the existing fcRef canvas — never disposes / news a Canvas', () => {
    const ltStart = canvasSrc.indexOf('const loadTemplate = useCallback');
    const ltEnd = canvasSrc.indexOf('// ── pen:');
    expect(ltStart).toBeGreaterThan(-1); expect(ltEnd).toBeGreaterThan(ltStart);
    const lt = canvasSrc.slice(ltStart, ltEnd);
    expect(lt).toContain('fcRef.current');
    expect(lt).not.toContain('new fabric.Canvas');
    expect(lt).not.toContain('.dispose(');
  });
});

// RC-save — the SAVE bug the full-relay e2e caught (template+draw worked but save failed): the
// generic storage.rules allowed only image/* + pdf, so the client-SDK result.json upload
// (application/json) was DENIED → uploadTransportJson threw → onSave's Promise.all rejected →
// save silently failed. The admin-SDK L2 e2e missed it (admin bypasses storage rules). Two fixes:
// (RC4) storage.rules allows application/json for the chart path; (RC5) onSave makes the json
// upload non-fatal so the PNG (which carries every visible edit) always saves.
describe('RC-save root-cause: storage.rules allows result.json + onSave json-upload non-fatal', () => {
  const rules = fs.readFileSync('storage.rules', 'utf8');
  const page = fs.readFileSync('src/pages/TabletChartEditorPage.jsx', 'utf8');
  it('RC4 storage.rules allows application/json for the chart-edit-sessions upload path', () => {
    expect(rules).toMatch(/match \/uploads\/chart-edit-sessions\/\{sessionId\}\/\{file=\*\*\}/);
    const block = rules.slice(rules.indexOf('uploads/chart-edit-sessions'), rules.indexOf('Generic uploads'));
    expect(block).toContain('application/json');
    expect(block).toContain('isClinicStaff()');
  });
  it('RC5 onSave guards the json upload (non-fatal) + surfaces save errors (never silent)', () => {
    const onSave = page.slice(page.indexOf('const onSave ='), page.indexOf('const onCancel ='));
    expect(onSave).toMatch(/try \{ jsonUrl = await uploadTransportJson[\s\S]*?\} catch \{ jsonUrl = null; \}/);
    expect(onSave).toContain('setSaveErr');
    expect(onSave).toContain('SESSION_STATUS.SAVED');
  });
});

// RC-render — the LIVE-DISPLAY bug the user's on-device test caught (save was correct + carried
// every edit, but the tablet screen rendered NOTHING live — template + strokes invisible). Root
// cause: the canvas painted via the rAF-deferred request-render path; rAF is unreliable on the
// tablet (throttled / stuck nextRenderHandle / not firing in some editor states) so the paint
// never landed, while the object model stayed correct (toDataURL save bypasses on-screen render).
// Proven in a real browser at dpr=2: the rAF path → 0 painted px; sync renderAll → template +
// strokes paint. Fix (mirror the PROVEN PC ChartCanvas): render synchronously, never via rAF.
describe('RC-render root-cause: synchronous renderAll only — never the rAF-deferred path', () => {
  const canvasSrc = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  const chartSrc = fs.readFileSync('src/components/ChartCanvas.jsx', 'utf8');
  it('RC6 TabletChartCanvas paints via SYNC fc.renderAll() — ZERO fc.requestRenderAll() calls', () => {
    expect(canvasSrc).not.toMatch(/fc\.requestRenderAll\s*\(/);     // no rAF-deferred call sites
    expect(canvasSrc).not.toMatch(/\brequestRenderAll\b/);          // not even in prose (drift guard)
    expect((canvasSrc.match(/fc\.renderAll\s*\(/g) || []).length).toBeGreaterThanOrEqual(15);
  });
  it('RC7 the proven-working PC ChartCanvas is the reference: sync renderAll, never rAF', () => {
    expect(chartSrc).not.toMatch(/requestRenderAll/);
    expect((chartSrc.match(/\.renderAll\s*\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });
  it('RC8 the render-fix rationale is documented at the top of the component', () => {
    expect(canvasSrc).toMatch(/CRITICAL \(render fix\)[\s\S]*?SYNCHRONOUS renderAll/);
  });
});
