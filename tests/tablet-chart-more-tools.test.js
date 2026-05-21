import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ storage: {}, db: {}, auth: {}, appId: 'test' }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s, p) => ({ __path: p })),
  uploadString: vi.fn(async () => {}),
  getDownloadURL: vi.fn(async (r) => `https://dl.example/${r.__path}`),
  listAll: vi.fn(async () => ({ items: [] })),
  deleteObject: vi.fn(async () => {}),
}));
// chartEditSession re-exports the pairing fns from scopedDataLayer — stub it so importing
// chartEditSession doesn't pull backendClient/firebase wiring (mirror tablet-chart-template-transport).
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToChartTabletPresenceByBranch: vi.fn(), listenToRequestedSessionForTablet: vi.fn(),
  upsertChartTabletPresence: vi.fn(), listenToChartEditSession: vi.fn(), createChartEditSession: vi.fn(),
  updateChartEditSession: vi.fn(), freeChartTablet: vi.fn(), deleteChartEditSession: vi.fn(),
}));

import { outlineToSvgPath, strokeOutline, PEN_PRESETS } from '../src/lib/penStroke.js';
import { TOOL_IDS, isDrawTool, isShapeTool, shapeObjectType } from '../src/lib/tabletChartTools.js';
import { uploadTransportJson, downloadTransportJson } from '../src/lib/chartEditSession.js';

describe('U1 outlineToSvgPath', () => {
  it('U1.1 empty outline → empty string', () => {
    expect(outlineToSvgPath([])).toBe('');
    expect(outlineToSvgPath(null)).toBe('');
    expect(outlineToSvgPath(undefined)).toBe('');
  });
  it('U1.2 builds a closed M/L/Z path', () => {
    const d = outlineToSvgPath([[0, 0], [10, 0], [10, 10]]);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d).toContain('L10 0');
    expect(d.endsWith('Z')).toBe(true);
  });
  it('U1.3 real perfect-freehand outline → non-empty closed path', () => {
    const out = strokeOutline([[0, 0, 0.5], [5, 5, 0.6], [10, 2, 0.5]], PEN_PRESETS.pen(4));
    const d = outlineToSvgPath(out);
    expect(d.length).toBeGreaterThan(5);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
  it('U1.4 rounds coordinates to 2dp', () => {
    const d = outlineToSvgPath([[1.23456, 2.98765], [3.1, 4.2]]);
    expect(d).toContain('M1.23 2.99');
    expect(d).not.toMatch(/\d\.\d{3,}/);
  });
});

describe('U2 tool descriptors', () => {
  it('U2.1 TOOL_IDS lists all 9 tools in order', () => {
    expect(TOOL_IDS).toEqual(['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'eraser']);
  });
  it('U2.2 isDrawTool only pen/highlighter', () => {
    expect(isDrawTool('pen')).toBe(true);
    expect(isDrawTool('highlighter')).toBe(true);
    expect(isDrawTool('line')).toBe(false);
    expect(isDrawTool('select')).toBe(false);
    expect(isDrawTool('eraser')).toBe(false);
  });
  it('U2.3 isShapeTool line/arrow/rect/circle', () => {
    expect(['line', 'arrow', 'rect', 'circle'].every(isShapeTool)).toBe(true);
    expect(isShapeTool('pen')).toBe(false);
    expect(isShapeTool('text')).toBe(false);
    expect(isShapeTool('select')).toBe(false);
  });
  it('U2.4 shapeObjectType maps each tool to its fabric type', () => {
    expect(shapeObjectType('rect')).toBe('rect');
    expect(shapeObjectType('circle')).toBe('ellipse');
    expect(shapeObjectType('line')).toBe('line');
    expect(shapeObjectType('arrow')).toBe('group');
    expect(shapeObjectType('text')).toBe('textbox');
    expect(shapeObjectType('pen')).toBe('path');
    expect(shapeObjectType('highlighter')).toBe('path');
  });
});

describe('U3 transport JSON (fabricJson via Storage blob)', () => {
  it('U3.1 uploadTransportJson stores {kind}.json + returns url', async () => {
    const url = await uploadTransportJson('CES-x', 'result', { v: 5, objects: [{ type: 'rect' }] });
    expect(url).toContain('uploads/chart-edit-sessions/CES-x/result.json');
  });
  it('U3.2 downloadTransportJson parses fetched text → object', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ objects: [{ type: 'textbox' }] }) }));
    const obj = await downloadTransportJson('https://storage/x.json');
    expect(obj.objects[0].type).toBe('textbox');
  });
  it('U3.3 downloadTransportJson returns null on !ok (no throw → no PC hang)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    expect(await downloadTransportJson('https://storage/missing.json')).toBeNull();
  });
  it('U3.4 downloadTransportJson returns null when fetch itself throws', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); });
    expect(await downloadTransportJson('https://storage/x.json')).toBeNull();
  });
});
