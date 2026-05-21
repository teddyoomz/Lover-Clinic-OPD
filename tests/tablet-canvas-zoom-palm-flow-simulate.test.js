import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { classifyTouchGesture, nextZoom, isZoomedVpt, FIT_VPT } from '../src/lib/chartGestureMath.js';

// F1 — full input-routing matrix the component delegates to (the pure decision behind the wiring)
describe('F1 input-routing flow (auto-adaptive)', () => {
  it('F1.1 iPad+Pencil session: palm never draws; pen draws; 2 fingers zoom; no zoom mid-stroke', () => {
    expect(classifyTouchGesture({ touchCount: 1, penMode: true, isZoomed: false })).toBe('ignore'); // palm at fit
    expect(classifyTouchGesture({ touchCount: 1, penMode: true, isZoomed: true })).toBe('pan');      // 1 finger when zoomed
    expect(classifyTouchGesture({ touchCount: 2, penMode: true })).toBe('pinch');                    // zoom gesture
    expect(classifyTouchGesture({ touchCount: 3, penMode: true })).toBe('ignore');                   // palm splay
    expect(classifyTouchGesture({ touchCount: 2, penMode: true, penDown: true })).toBe('ignore');    // no zoom mid pen-stroke
  });
  it('F1.2 stylus-less tablet: 1 finger draws until a 2nd finger turns it into a pinch', () => {
    expect(classifyTouchGesture({ touchCount: 1, penMode: false })).toBe('draw');
    expect(classifyTouchGesture({ touchCount: 2, penMode: false })).toBe('pinch');
  });
});

// F2 — pinch zoom math across a gesture (clamp + pinch-out returns to fit)
describe('F2 pinch zoom lifecycle', () => {
  it('F2.1 spread fingers zooms in, clamped at 4x', () => {
    let z = 1;
    z = nextZoom(z, 1.5); expect(z).toBe(1.5);
    z = nextZoom(z, 5);   expect(z).toBe(4);     // clamp
  });
  it('F2.2 pinch in returns to fit; the view snaps to FIT_VPT at/below 1x', () => {
    expect(nextZoom(2.5, 0.1)).toBe(1);
    expect(isZoomedVpt([...FIT_VPT])).toBe(false);
  });
});

// F3 — source-grep regression: lock the wiring contract in TabletChartCanvas + the page
describe('F3 source-grep contract', () => {
  const canvas = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  const page = fs.readFileSync('src/pages/TabletChartEditorPage.jsx', 'utf8');
  it('F3.1 imports the gesture math helpers', () => {
    expect(canvas).toMatch(/from '\.\.\/\.\.\/lib\/chartGestureMath\.js'/);
  });
  it('F3.2 pen-mode touch never draws (router gate in mouse:down)', () => {
    expect(canvas).toMatch(/if \(penSeenRef\.current\) return;/);
    expect(canvas).toMatch(/pointersRef\.current\.size >= 2\) return;/);
  });
  it('F3.3 attaches + cleans up the raw pointer gesture listeners', () => {
    expect(canvas).toMatch(/addEventListener\('pointerdown'/);
    expect(canvas).toMatch(/addEventListener\('pointermove'/);
    expect(canvas).toMatch(/gestureCleanupRef\.current/);
  });
  it('F3.4 pinch uses zoomToPoint + snaps to FIT_VPT at min zoom', () => {
    expect(canvas).toMatch(/fc\.zoomToPoint\(/);
    expect(canvas).toMatch(/setViewportTransform\(\[\.\.\.FIT_VPT\]\)/);
  });
  it('F3.5 export resets the viewport before toDataURL then restores it', () => {
    const ex = canvas.slice(canvas.indexOf('exportDataUrl:'), canvas.indexOf('exportFabricJson:'));
    expect(ex).toMatch(/viewportTransform\.slice\(\)/);             // save
    expect(ex).toMatch(/setViewportTransform\(\[\.\.\.FIT_VPT\]\)/); // reset to fit
    expect(ex).toMatch(/toDataURL/);
    expect(ex).toMatch(/setViewportTransform\(saved\)/);           // restore
  });
  it('F3.6 still uses getScenePoint for drawing (zoom-safe coords) — unchanged', () => {
    expect(canvas).toMatch(/getScenePoint/);
  });
  it('F3.7 the page renders the fit button wired to resetZoom + passes onZoomChange', () => {
    expect(page).toMatch(/data-testid="zoom-fit"/);
    expect(page).toMatch(/canvasRef\.current\?\.resetZoom\(\)/);
    expect(page).toMatch(/onZoomChange={setZoomed}/);
  });
});

// F4 — iPad black-screen fix lock (AV107): the gesture listeners are CAPTURE-phase on the OWNED
// wrapper (surf = wrapRef.current), NEVER raw listeners on fc.upperCanvasEl (the reverted e36a73e9
// root cause: raw pointer listeners on Fabric's own element conflict with its trusted-touch pipeline
// on iPad/WebKit → black screen). stopPropagation isolates Fabric from the multitouch.
describe('F4 no-upperCanvasEl-listeners lock (iPad fix — AV107)', () => {
  const canvas = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');
  it('F4.1 gesture listeners attach to the owned wrapper (surf), capture-phase', () => {
    expect(canvas).toMatch(/const surf = wrapRef\.current;/);
    expect(canvas).toMatch(/surf\.addEventListener\('pointerdown', \w+, \{ capture: true \}\)/);
    expect(canvas).toMatch(/surf\.addEventListener\('pointermove', \w+, \{ capture: true \}\)/);
    expect(canvas).toMatch(/surf\.addEventListener\('pointerup', \w+, \{ capture: true \}\)/);
    expect(canvas).toMatch(/surf\.addEventListener\('pointercancel', \w+, \{ capture: true \}\)/);
  });
  it('F4.2 NEVER attaches raw pointer listeners to fc.upperCanvasEl (the iPad black-screen root cause)', () => {
    expect(canvas).not.toMatch(/upperCanvasEl\.addEventListener/);
    expect(canvas).not.toMatch(/const elc = fc\.upperCanvasEl/);
  });
  it('F4.3 isolates Fabric from the pinch via stopPropagation + sets touchAction:none on the surface', () => {
    expect(canvas).toMatch(/surf\.style\.touchAction = 'none'/);
    expect(canvas).toMatch(/ev\.stopPropagation\(\)/);
  });
  it('F4.4 cleanup removes the capture-phase wrapper listeners', () => {
    expect(canvas).toMatch(/surf\.removeEventListener\('pointerdown', \w+, \{ capture: true \}\)/);
    expect(canvas).toMatch(/gestureCleanupRef\.current = \(\) =>/);
  });
});

// F5 — THE real iPad black-screen lock (AV107): the ⤢ fit button MUST render AFTER
// <TabletChartCanvas> (last child). Fabric wraps the React-owned <canvas> in a .canvas-container,
// so the <canvas> is no longer a direct child of the flex div. With the button BEFORE the canvas,
// React calls surf.insertBefore(button, canvas) when `zoomed` flips true → NotFoundError ("node ...
// not a child of this node") → React unmounts the tree → BLANK SCREEN (the exact iPad symptom; the
// zoom flips `zoomed` true). Button-after-canvas → React APPENDS it → no insertBefore-on-a-moved
// node. Reproduced + fix-verified in a real browser via a synthetic 2-touch pinch (Chrome MCP).
describe('F5 fit-button-after-canvas (React/Fabric insertBefore crash lock — AV107)', () => {
  const page = fs.readFileSync('src/pages/TabletChartEditorPage.jsx', 'utf8');
  it('F5.1 the ⤢ fit button renders AFTER <TabletChartCanvas> (append, never insertBefore the Fabric-wrapped canvas)', () => {
    const canvasIdx = page.indexOf('<TabletChartCanvas');
    const fitIdx = page.indexOf('data-testid="zoom-fit"');
    expect(canvasIdx).toBeGreaterThan(-1);
    expect(fitIdx).toBeGreaterThan(-1);
    expect(fitIdx).toBeGreaterThan(canvasIdx);   // button is the LAST child → React appends it
  });
});
