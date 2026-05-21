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
