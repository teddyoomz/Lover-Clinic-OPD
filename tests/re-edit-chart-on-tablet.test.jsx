// @vitest-environment jsdom
// Re-edit a saved chart ON THE TABLET (2026-05-21). The PC's edit (✏️) on a saved chart now opens
// the SAME PcPairingModal as add-new; sending an existing chart ships its PNG (raster fallback) +
// fabricJson (NEW editFabricJsonUrl → object-level) and the result merges back into the SAME slot.
// Spec: docs/superpowers/specs/2026-05-21-re-edit-saved-chart-on-tablet-design.html
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import fs from 'node:fs';

import { buildSessionCreate } from '../src/lib/chartEditSessionCore.js';

// ── RT1–RT4 + RT7: source-grep / pure (no React) ──

describe('RT1 session-doc field (chartEditSessionCore)', () => {
  it('RT1.1 buildSessionCreate includes editFabricJsonUrl: null (sibling URLs untouched)', () => {
    const doc = buildSessionCreate({ sessionId: 'CES-x', pcDeviceId: 'pc', tabletDeviceId: 'TEST-T1', template: { id: 't', name: 'n' } });
    expect(doc).toHaveProperty('editFabricJsonUrl', null);
    expect(doc.templateImageUrl).toBeNull();
    expect(doc.resultFabricJsonUrl).toBeNull();
  });
});

describe('RT2 PC start() ships the edit json (useChartEditSession source)', () => {
  const hook = fs.readFileSync('src/hooks/useChartEditSession.js', 'utf8');
  it('RT2.1 imports uploadTransportJson + start accepts editFabricJson', () => {
    expect(hook).toMatch(/uploadTransportJson/);
    expect(hook).toMatch(/start = useCallback\(async \(\{[^}]*editFabricJson[^}]*\}\)/);
  });
  it('RT2.2 edit json upload is GUARDED (never blocks the relay) + both URLs patched in one update', () => {
    expect(hook).toMatch(/if \(editFabricJson\)/);
    expect(hook).toMatch(/try \{[\s\S]*?uploadTransportJson\(sessionId, 'edit'[\s\S]*?\} catch \{ editUrl = null; \}/);
    expect(hook).toMatch(/updateChartEditSession\(sessionId, \{ templateImageUrl: url, editFabricJsonUrl: editUrl \}\)/);
  });
});

describe('RT3 TabletChartCanvas object-level hydrate (source)', () => {
  const canvas = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  it('RT3.1 accepts initialFabricJson prop + always-current ref', () => {
    expect(canvas).toMatch(/function TabletChartCanvas\(\{[^}]*initialFabricJson[^}]*\}/);
    expect(canvas).toContain('initialJsonRef');
  });
  it('RT3.2 hydrateFromJson: recreate dims + loadFromJSON + force white bg + relock obj[0] (mirror ChartCanvas)', () => {
    const start = canvas.indexOf('const hydrateFromJson');
    expect(start).toBeGreaterThan(-1);
    const h = canvas.slice(start, canvas.indexOf('}, [applyTool]);', start) + 16);
    expect(h).toContain('isObjectLevelReeditable');
    expect(h).toContain('fc.setDimensions');
    expect(h).toContain('fc.loadFromJSON');
    expect(h).toMatch(/backgroundColor = '#fff'/);
    expect(h).toContain('selectable: false');
  });
  it('RT3.3 no double-load: the template effect early-returns when object-level json owns the canvas', () => {
    const s = canvas.indexOf('load/replace the template on the LIVE canvas');
    const e = canvas.indexOf('object-level hydrate when a reeditable json arrives');
    expect(s).toBeGreaterThan(-1); expect(e).toBeGreaterThan(s);
    expect(canvas.slice(s, e)).toMatch(/isObjectLevelReeditable[\s\S]*?return;/);
  });
  it('RT3.4 a hydrate effect is keyed on initialFabricJson', () => {
    expect(canvas).toMatch(/if \(isObjectLevelReeditable\(safeParse\(initialFabricJson\)\)\) hydrateFromJson\(initialFabricJson\);\s*\}, \[initialFabricJson/);
  });
});

describe('RT4 TabletChartEditorPage resolves json-first (source)', () => {
  const page = fs.readFileSync('src/pages/TabletChartEditorPage.jsx', 'utf8');
  it('RT4.1 imports downloadTransportJson + isObjectLevelReeditable; has initialFabricJson state', () => {
    expect(page).toContain('downloadTransportJson');
    expect(page).toContain('isObjectLevelReeditable');
    expect(page).toContain('setInitialFabricJson');
  });
  it('RT4.2 resolveSource checks editFabricJsonUrl BEFORE templateImageUrl + skips raster when reeditable', () => {
    const s = page.indexOf('const resolveSource');
    expect(s).toBeGreaterThan(-1);
    const rs = page.slice(s, page.indexOf('await resolveSource(sdoc)'));
    expect(rs.indexOf('editFabricJsonUrl')).toBeGreaterThan(-1);
    expect(rs.indexOf('templateImageUrl')).toBeGreaterThan(rs.indexOf('editFabricJsonUrl'));   // json-first
    expect(rs).toMatch(/isObjectLevelReeditable\(j\)\)\s*\{ setInitialFabricJson[\s\S]*?return; \}/);   // skip raster
  });
  it('RT4.3 passes initialFabricJson to the canvas', () => {
    expect(page).toMatch(/<TabletChartCanvas[^>]*initialFabricJson=\{initialFabricJson\}/);
  });
});

describe('RT7 ChartSection wires re-edit through the relay (source)', () => {
  const section = fs.readFileSync('src/components/ChartSection.jsx', 'utf8');
  it('RT7.1 sendToTablet sends the existing chart PNG + fabricJson when re-editing (else the blank template)', () => {
    expect(section).toMatch(/pendingChart \? pendingChart\.dataUrl : pendingTemplate\?\.imageUrl/);
    expect(section).toMatch(/editFabricJson: pendingChart \? pendingChart\.fabricJson : undefined/);
  });
  it('RT7.2 handleEdit stages the existing chart + the modal renders for re-edit', () => {
    expect(section).toMatch(/const handleEdit[\s\S]*?setPendingChart\(chart/);
    expect(section).toMatch(/\(pendingTemplate \|\| pendingChart\) &&/);
  });
});

// ── RT5–RT6: RTL — the UX change + the same-slot merge (Rule I flow) ──
let capturedOnSaved = null;
vi.mock('../src/hooks/useChartEditSession.js', () => ({
  useChartEditSession: (opts) => { capturedOnSaved = opts.onSaved; return { phase: 'idle', error: '', start: vi.fn(), cancel: vi.fn() }; },
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-x' }) }));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'u1' } } }));
vi.mock('../src/components/ChartTemplateSelector.jsx', () => ({ default: () => <div data-testid="tpl-selector-stub" /> }));
vi.mock('../src/components/ChartCanvas.jsx', () => ({ default: () => <div data-testid="chart-canvas-stub" /> }));
vi.mock('../src/components/tablet-chart/TabletReadyList.jsx', () => ({ default: () => <div data-testid="ready-list-stub" /> }));

import ChartSection from '../src/components/ChartSection.jsx';

const mkChart = (tag) => ({
  dataUrl: `data:image/png;base64,${tag}`,
  fabricJson: JSON.stringify({ objects: [{ type: 'Image' }, { type: 'Path' }], canvasWidth: 600, canvasHeight: 800 }),
  template: { id: 't', name: 'ใบหน้า' }, templateId: 't',
});
const props = (charts, onChartsChange = vi.fn()) => ({ charts, onChartsChange, isDark: false, accent: '#14b8a6', db: {}, appId: 'x', patientLabel: 'คุณ ก' });

afterEach(() => { cleanup(); capturedOnSaved = null; });

describe('RT5 ChartSection — edit ✏️ opens the pairing choice (consistency), not the PC canvas', () => {
  it('RT5.1 clicking ✏️ on a saved chart shows the PcPairingModal (NOT the canvas)', () => {
    render(<ChartSection {...props([mkChart('A')])} />);
    fireEvent.click(screen.getByTestId('chart-edit-0'));
    expect(screen.getByTestId('edit-here')).toBeTruthy();
    expect(screen.getByTestId('send-tablet')).toBeTruthy();
    expect(screen.queryByTestId('chart-canvas-stub')).toBeNull();
  });
  it('RT5.2 choosing 🖥️ "แก้ที่เครื่องนี้" then opens the PC canvas with the existing chart', () => {
    render(<ChartSection {...props([mkChart('A')])} />);
    fireEvent.click(screen.getByTestId('chart-edit-0'));
    fireEvent.click(screen.getByTestId('edit-here'));
    expect(screen.getByTestId('chart-canvas-stub')).toBeTruthy();
    expect(screen.queryByTestId('edit-here')).toBeNull();   // modal closed
  });
});

describe('RT6 re-edit result merges into the SAME slot (Rule I: handleEdit → onSaved → handleSave)', () => {
  it('RT6.1 onSaved after editing slot 1 replaces slot 1, leaves slot 0 untouched', () => {
    const onChartsChange = vi.fn();
    const a = mkChart('A'), b = mkChart('B');
    render(<ChartSection {...props([a, b], onChartsChange)} />);
    fireEvent.click(screen.getByTestId('chart-edit-1'));   // editingIdx=1, pendingChart=b
    act(() => capturedOnSaved({ dataUrl: 'data:image/png;base64,NEW', fabricJson: '{"objects":[]}', templateId: 't', source: 'tablet' }));
    expect(onChartsChange).toHaveBeenCalled();
    const updater = onChartsChange.mock.calls.at(-1)[0];   // handleSave calls onChartsChange(prev => ...)
    const out = updater([a, b]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(a);                                  // slot 0 untouched
    expect(out[1].dataUrl).toBe('data:image/png;base64,NEW'); // slot 1 replaced
    expect(out[1].fabricJson).toBe('{"objects":[]}');
  });
  it('RT6.2 a NEW chart (no editingIdx) appends + caps at 2', () => {
    const onChartsChange = vi.fn();
    render(<ChartSection {...props([mkChart('A')], onChartsChange)} />);
    // open the selector path → simulate a fresh tablet save without prior handleEdit (editingIdx stays -1)
    act(() => capturedOnSaved({ dataUrl: 'data:image/png;base64,NEW', fabricJson: '{"objects":[]}', templateId: 't', source: 'tablet' }));
    const updater = onChartsChange.mock.calls.at(-1)[0];
    const out = updater([mkChart('A')]);
    expect(out).toHaveLength(2);   // appended
    const capped = updater([mkChart('A'), mkChart('B')]);
    expect(capped).toHaveLength(2); // cap holds
  });
});

// ── RT8: handleSave must NEVER persist the STRING "null" for absent object data ──
// Found via the Rule Q adversarial pass (diag-chart-relay-adversarial / diag-chart-fabricjson-dump):
// 2 real prod charts had fabricJson === "null" (4-char string) because the old code did
// JSON.stringify(chartData.fabricJson) on a JS-null fabricJson. Graceful on read (JSON.parse("null")
// → null → raster fallback) but wrong: pollutes data, masks "no object data", and "null" is truthy.
describe('RT8 handleSave never persists the string "null" (absent object data → JS null)', () => {
  it('RT8.1 onSaved with fabricJson:null → entry.fabricJson is JS null, NOT the string "null"', () => {
    const onChartsChange = vi.fn();
    render(<ChartSection {...props([], onChartsChange)} />);
    act(() => capturedOnSaved({ dataUrl: 'data:image/png;base64,X', fabricJson: null, templateId: 't', source: 'tablet' }));
    const out = onChartsChange.mock.calls.at(-1)[0]([]);
    expect(out).toHaveLength(1);
    expect(out[0].fabricJson).toBeNull();
    expect(out[0].fabricJson).not.toBe('null');
  });
  it('RT8.2 a real JSON-string fabricJson is kept verbatim (not double-encoded)', () => {
    const onChartsChange = vi.fn();
    render(<ChartSection {...props([], onChartsChange)} />);
    const json = '{"objects":[],"canvasWidth":600,"canvasHeight":800}';
    act(() => capturedOnSaved({ dataUrl: 'data:image/png;base64,X', fabricJson: json, templateId: 't', source: 'tablet' }));
    const out = onChartsChange.mock.calls.at(-1)[0]([]);
    expect(out[0].fabricJson).toBe(json);
  });
  it('RT8.3 source: no JSON.stringify(chartData.fabricJson) (the null→"null" bug pattern)', () => {
    const section = fs.readFileSync('src/components/ChartSection.jsx', 'utf8');
    expect(section).not.toMatch(/JSON\.stringify\(chartData\.fabricJson\)/);
  });
});
