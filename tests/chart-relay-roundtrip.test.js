// Chart relay round-trip — the user's real-use flows (2026-05-21 EOD+1 LATE+4):
//   save→OPD persist · LOSSLESS object-level re-edit · fresh-image relay · size-guarded persist.
// Locks the contracts the real-prod e2e (scripts/e2e-chart-relay-roundtrip.mjs, 14/0) proved +
// the ChartCanvas object-level re-edit verified in a real browser (objectLevelPathTaken:true,
// objects render). Pure helpers + source-grep + Rule I flow-simulate.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  serializeFabricCanvas, isObjectLevelReeditable, chartEntryForPersist, CHART_PERSIST_CAP_BYTES,
} from '../src/lib/tabletChartTools.js';

// duck-typed fabric canvas (serializeFabricCanvas needs only toJSON + width/height)
const fakeFc = (objects, w = 600, h = 800, background = '#fff') => ({
  width: w, height: h, toJSON: () => ({ version: '7.2.0', objects, background }),
});

describe('U1 serializeFabricCanvas — embeds canvas dims so re-edit can recreate the coordinate space', () => {
  it('U1.1 includes canvasWidth/canvasHeight + the full toJSON shape', () => {
    const json = JSON.parse(serializeFabricCanvas(fakeFc([{ type: 'Path' }], 1033, 1291)));
    expect(json.canvasWidth).toBe(1033);
    expect(json.canvasHeight).toBe(1291);
    expect(Array.isArray(json.objects)).toBe(true);
    expect(json.version).toBe('7.2.0');
  });
  it('U1.2 rounds fractional dims + returns null for a non-canvas', () => {
    expect(JSON.parse(serializeFabricCanvas(fakeFc([], 600.7, 800.2))).canvasWidth).toBe(601);
    expect(serializeFabricCanvas(null)).toBeNull();
    expect(serializeFabricCanvas({})).toBeNull();              // no toJSON
  });
});

describe('U2 isObjectLevelReeditable — picks the object-level vs raster re-edit path', () => {
  it('U2.1 true only when objects[] non-empty AND both canvas dims present', () => {
    expect(isObjectLevelReeditable({ objects: [{ type: 'Image' }], canvasWidth: 600, canvasHeight: 800 })).toBe(true);
  });
  it('U2.2 false for legacy json (no dims) → raster fallback', () => {
    expect(isObjectLevelReeditable({ objects: [{ type: 'Path' }] })).toBe(false);          // pre-dims json
    expect(isObjectLevelReeditable({ objects: [], canvasWidth: 600, canvasHeight: 800 })).toBe(false); // empty
    expect(isObjectLevelReeditable({ canvasWidth: 600, canvasHeight: 800 })).toBe(false);  // no objects
    expect(isObjectLevelReeditable(null)).toBe(false);
    expect(isObjectLevelReeditable({ objects: [{}], canvasWidth: 0, canvasHeight: 800 })).toBe(false); // zero dim
  });
});

describe('U3 chartEntryForPersist — size guard keeps the PNG, drops oversized fabricJson (1MB Firestore doc)', () => {
  it('U3.1 small chart keeps both dataUrl + fabricJson', () => {
    const e = chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: '{"objects":[]}', templateId: 'face' });
    expect(e.dataUrl).toContain('data:image/png');
    expect(e.fabricJson).toBe('{"objects":[]}');
    expect(e.templateId).toBe('face');
  });
  it('U3.2 oversized fabricJson is DROPPED (PNG + templateId always kept → save never breaks)', () => {
    const big = 'x'.repeat(CHART_PERSIST_CAP_BYTES + 10);
    const e = chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: big, templateId: 'face' });
    expect(e.fabricJson).toBeNull();                    // dropped — would blow the doc
    expect(e.dataUrl).toContain('data:image/png');      // visual preserved
    expect(e.templateId).toBe('face');
  });
  it('U3.3 null/absent fabricJson passthrough (raster chart)', () => {
    expect(chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: null, templateId: 't' }).fabricJson).toBeNull();
    expect(chartEntryForPersist({ dataUrl: 'd' }).fabricJson).toBeNull();
  });
  it('U3.4 cap counts dataUrl + fabricJson together (both inline the same 1MB doc)', () => {
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(CHART_PERSIST_CAP_BYTES - 100);
    const e = chartEntryForPersist({ dataUrl, fabricJson: 'y'.repeat(500), templateId: 't' }); // sum > cap
    expect(e.fabricJson).toBeNull();
    expect(e.dataUrl).toBe(dataUrl);                    // PNG never dropped
  });
});

describe('SG source-grep — the round-trip wiring is in place (no drift back to raster-only / unguarded persist)', () => {
  const chart = fs.readFileSync('src/components/ChartCanvas.jsx', 'utf8');
  const tablet = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  const tfp = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
  it('SG1 ChartCanvas re-edit consumes fabricJson object-level (loadFromJSON + isObjectLevelReeditable)', () => {
    expect(chart).toContain('isObjectLevelReeditable');
    expect(chart).toMatch(/reeditJson[\s\S]*?loadFromJSON\(reeditJson\)/);
    expect(chart).toMatch(/canvasWidth[\s\S]*?canvasHeight/);   // recreates the saved coordinate space
  });
  it('SG2 both canvases export via serializeFabricCanvas (dims travel with the json)', () => {
    expect(chart).toMatch(/serializeFabricCanvas\(canvas\)/);
    expect(tablet).toMatch(/serializeFabricCanvas\(fcRef\.current\)/);
    expect(chart).not.toMatch(/fabricJson = JSON\.stringify\(canvas\.toJSON\(\)\)/); // no un-dimensioned export
  });
  it('SG3 the OPD persist is size-guarded (chartEntryForPersist), not a raw inline map', () => {
    expect(tfp).toContain('chartEntryForPersist');
    expect(tfp).toMatch(/charts:\s*charts\.filter\(c => c\.dataUrl\)\.map\(chartEntryForPersist\)/);
  });
});

// Rule I — full-flow simulate: tablet serialize (dims) → transport (json round-trip) → OPD persist
// (size guard) → re-read → re-edit decision (object-level) → re-export. Mirrors the real-prod e2e.
describe('F1 flow-simulate: tablet → transport → persist → re-read → re-edit → re-export', () => {
  const tabletObjects = [
    { type: 'Image', src: 'data:image/png;base64,TEMPLATE', selectable: false },
    { type: 'Path', fill: '#ef4444', path: [['M', 1, 1], ['L', 5, 5], ['Z']] },
    { type: 'Rect', stroke: '#111', width: 30, height: 18 },
    { type: 'Textbox', text: 'ทดสอบ' },
  ];
  it('F1.1 tablet exports json WITH dims → transports → persists → survives re-read object-level', () => {
    // tablet save
    const exported = serializeFabricCanvas(fakeFc(tabletObjects, 1033, 1291));
    // transport (Storage blob → JSON.parse round-trip)
    const transported = JSON.parse(exported);
    expect(transported.objects).toHaveLength(4);
    // PC merge → onSaved → chart entry → OPD persist (size guard, small → kept)
    const persisted = chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: exported, templateId: 'face' });
    expect(persisted.fabricJson).not.toBeNull();
    // re-open later → re-read the persisted fabricJson → object-level re-editable
    const reread = JSON.parse(persisted.fabricJson);
    expect(isObjectLevelReeditable(reread)).toBe(true);
    expect(reread.canvasWidth).toBe(1033);
    expect(reread.objects.find(o => o.type === 'Image')).toBeTruthy();   // template re-hydratable (not flat raster)
    // re-edit: add a stroke, re-export
    reread.objects.push({ type: 'Path', fill: '#000', path: [['M', 9, 9], ['L', 12, 12], ['Z']] });
    const reExported = serializeFabricCanvas(fakeFc(reread.objects, reread.canvasWidth, reread.canvasHeight));
    expect(JSON.parse(reExported).objects).toHaveLength(5);              // edit persisted (+1)
  });
  it('F1.2 legacy chart (PNG only, fabricJson null) → re-read NOT object-level → raster re-edit path', () => {
    const legacy = chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: null, templateId: 'face' });
    const reread = legacy.fabricJson ? JSON.parse(legacy.fabricJson) : null;
    expect(isObjectLevelReeditable(reread)).toBe(false);                 // → ChartCanvas uses the PNG-background path
  });
  it('F1.3 huge embedded-template chart → fabricJson dropped on persist → save survives + raster re-edit', () => {
    const hugeJson = serializeFabricCanvas(fakeFc([{ type: 'Image', src: 'data:image/png;base64,' + 'Z'.repeat(CHART_PERSIST_CAP_BYTES) }], 600, 800));
    const persisted = chartEntryForPersist({ dataUrl: 'data:image/png;base64,AAAA', fabricJson: hugeJson, templateId: 'face' });
    expect(persisted.fabricJson).toBeNull();                              // dropped → doc stays < 1MB → save OK
    expect(persisted.dataUrl).toContain('data:image/png');               // visual still saved
    expect(isObjectLevelReeditable(persisted.fabricJson ? JSON.parse(persisted.fabricJson) : null)).toBe(false); // raster re-edit
  });
});
