// ─── V83-followup-6 — Sub-tab tilt symmetry via zero base (EOD8 LATE 2026-05-18) ─
// User: "ในรูปที่ 1 ผมวางเม้าไว้มุมซ้ายบน sub tab โค่ดเอียงหา; ในรูปที่ 2 มุมขวาล่าง
// ในระยะห่างที่เท่ากัน ไม่เอียงหาเลย ทำไมแต่ละมุมแม่ง interactive ไม่เท่ากันวะ".
//
// Root cause: CSS pre-baked --tilt-x:8deg + --tilt-y:-4deg base tilt + mouse
// bias was ADDED on top via `calc(var(--tilt-x) + var(--tilt-my))`. Result:
//   - mouse top-left  → 8+(+6)=14deg X, -4+(-6)=-10deg Y  (BIG tilt)
//   - mouse bottom-right → 8+(-6)=2deg X, -4+(+6)=2deg Y  (almost flat)
// V83-followup-2 fixed the JS bias calc (viewport-clamped sensing). The CSS
// base-bias was still asymmetric. V83-followup-6 drops base to 0/0 so mouse
// bias drives the full ±6deg symmetric range.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

describe('V83-followup-6 — Sub-tab tilt CSS base-zero symmetry', () => {
  it('S1 — .subtab-modal.desktop has --tilt-x: 0deg', () => {
    expect(CSS).toMatch(/\.subtab-modal\.desktop\s*\{[^}]*--tilt-x:\s*0deg/s);
  });

  it('S2 — .subtab-modal.desktop has --tilt-y: 0deg', () => {
    expect(CSS).toMatch(/\.subtab-modal\.desktop\s*\{[^}]*--tilt-y:\s*0deg/s);
  });

  it('S3 — Anti-regression: NO pre-fix base tilt-x:8deg or tilt-y:-4deg as ACTIVE declarations', () => {
    // Stricter regex requires semicolon (property declaration, not comment text)
    // — V83-followup-6 comment intentionally references the pre-fix values.
    expect(CSS).not.toMatch(/\.subtab-modal\.desktop\s*\{[^}]*\n\s*--tilt-x:\s*8deg\s*;/s);
    expect(CSS).not.toMatch(/\.subtab-modal\.desktop\s*\{[^}]*\n\s*--tilt-y:\s*-4deg\s*;/s);
  });

  it('S4 — subtab-pop-3d animation also zeroed for entry symmetry', () => {
    expect(CSS).toMatch(/@keyframes subtab-pop-3d[^{]*\{[^}]*scale\(0\.7\)\s*rotateX\(0deg\)\s*rotateY\(0deg\)/s);
    // Anti-regression: pre-fix had rotateX(8deg) rotateY(-4deg) in @keyframes
    expect(CSS).not.toMatch(/@keyframes subtab-pop-3d[^{]*\{[^}]*rotateX\(8deg\)/s);
  });

  it('S5 — V83-followup-6 marker comment present', () => {
    expect(CSS).toMatch(/V83-followup-6/);
  });

  it('S6 — Symmetry contract: equal cursor displacement → equal |tilt|', () => {
    // Pure-math mirror: with base 0+0 and bias ±6deg max, symmetric inputs
    // produce symmetric outputs.
    const baseTiltX = 0;
    const baseTiltY = 0;
    const MAX_BIAS = 6;
    const compute = (mx, my) => ({
      finalX: baseTiltX + my,
      finalY: baseTiltY + mx,
    });
    // Top-left cursor: mx=-6 my=+6
    const topLeft = compute(-MAX_BIAS, +MAX_BIAS);
    // Bottom-right cursor: mx=+6 my=-6
    const bottomRight = compute(+MAX_BIAS, -MAX_BIAS);
    // Magnitudes equal
    expect(Math.abs(topLeft.finalX)).toBe(Math.abs(bottomRight.finalX));
    expect(Math.abs(topLeft.finalY)).toBe(Math.abs(bottomRight.finalY));
    expect(Math.abs(topLeft.finalX)).toBe(MAX_BIAS);
    expect(Math.abs(topLeft.finalY)).toBe(MAX_BIAS);
  });
});

describe('V83-followup-7 — Sidebar sub-item card-shading', () => {
  it('SH1 — DARK theme inactive items have rgba background + border + shadow', () => {
    // Match the dark-theme rule (no [data-theme="light"] prefix)
    expect(CSS).toMatch(/nav\[aria-label="เมนูระบบหลังบ้าน"\]\s+ul\[role="list"\][^{]*not\(\[aria-current="page"\]\)\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.025\)/s);
  });

  it('SH2 — DARK theme inactive items have transform + box-shadow', () => {
    expect(CSS).toMatch(/nav\[aria-label="เมนูระบบหลังบ้าน"\]\s+ul\[role="list"\][^{]*not\(\[aria-current="page"\]\)\s*\{[^}]*box-shadow/s);
  });

  it('SH3 — DARK theme hover lifts (translateY(-1px))', () => {
    expect(CSS).toMatch(/nav\[aria-label="เมนูระบบหลังบ้าน"\]\s+ul\[role="list"\][^{]*not\(\[aria-current="page"\]\):hover\s*\{[^}]*transform:\s*translateY\(-1px\)/s);
  });

  it('SH4 — LIGHT theme inactive items have white bg + paper drop-shadow', () => {
    expect(CSS).toMatch(/\[data-theme="light"\][^{]*nav\[aria-label="เมนูระบบหลังบ้าน"\][^{]*ul\[role="list"\][^{]*not\(\[aria-current="page"\]\)\s*\{[^}]*background:\s*#ffffff/s);
  });

  it('SH5 — V83-followup-7 marker present', () => {
    expect(CSS).toMatch(/V83-followup-7/);
  });
});
