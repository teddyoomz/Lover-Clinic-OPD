// Tool bugs (2026-05-21 EOD+2, /systematic-debugging) — root-caused + fixed + verified L1 (real
// browser, fc.fire driving the actual handlers):
//   Bug 1 (arrow): commitShape computed dist from o.x1/o.x2 (fabric.Line props), but the arrow is a
//     fabric.Group with NO x1/x2/y1/y2 → dist 0 → every arrow was wrongly "tiny" → fc.remove on
//     mouse:up (showed during drag, vanished on release). Fix: tiny-check uses the DRAG delta
//     (sx,sy → ex,ey), geometry-agnostic (works for the Line AND the arrow Group).
//   Bug 2 (text): addText auto-entered editing (setTimeout enterEditing+selectAll) → fabric sets
//     hasControls=false in editing → NO resize/move handles → user reported "can't set width / no
//     handles to resize/reposition". Fix: mirror the proven PC ChartCanvas — leave the text SELECTED
//     with handles, NOT auto-editing (double-tap to edit; ml/mr handles set the box width).
// L1 evidence (real browser): arrow survives release (objs 1, hasArrow true); text isEditing:false +
// hasControls:true + selectable + all 9 controls positioned. These source-grep locks prevent drift.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/components/tablet-chart/TabletChartCanvas.jsx', 'utf8');

describe('TB1 arrow commit uses the drag delta, not Group-incompatible Line geometry', () => {
  const update = SRC.slice(SRC.indexOf('const updateShape'), SRC.indexOf('const commitShape'));
  const commit = SRC.slice(SRC.indexOf('const commitShape'), SRC.indexOf('const addText'));
  it('TB1.1 updateShape tracks the drag end point (s.ex/s.ey)', () => {
    expect(update).toMatch(/s\.ex = p\.x;\s*s\.ey = p\.y;/);
  });
  it('TB1.2 commitShape tiny-check uses the drag delta (s.ex/s.ey) for line/arrow', () => {
    expect(commit).toMatch(/dragDist = Math\.hypot\(\(s\.ex \?\? s\.sx\) - s\.sx, \(s\.ey \?\? s\.sy\) - s\.sy\)/);
    expect(commit).toMatch(/'arrow'\) && dragDist < 4/);
  });
  it('TB1.3 anti-regression: the Group-incompatible Math.hypot((o.x2 ?? 0)…) dist is GONE', () => {
    expect(commit).not.toMatch(/Math\.hypot\(\(o\.x2 \?\? 0\)/);
  });
});

describe('TB2 text is created SELECTED-with-handles, not trapped in editing', () => {
  const addText = SRC.slice(SRC.indexOf('const addText'), SRC.indexOf('const eraseAt'));
  it('TB2.1 addText leaves the textbox selectable + active (resize/move handles available)', () => {
    expect(addText).toMatch(/tb\.set\(\{ selectable: true, evented: true \}\)/);
    expect(addText).toMatch(/setActiveObject\(tb\)/);
  });
  it('TB2.2 anti-regression: addText does NOT auto-enter editing (which hides the handles)', () => {
    expect(addText).not.toMatch(/enterEditing/);
    expect(addText).not.toMatch(/selectAll/);
  });
});
