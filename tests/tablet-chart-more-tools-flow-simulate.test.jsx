// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';

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
