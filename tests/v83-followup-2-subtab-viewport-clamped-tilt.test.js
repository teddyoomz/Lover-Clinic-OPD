// ─── V83-followup-2 — Sub-tab tilt viewport-clamped sensing (EOD8 2026-05-18) ──
// User: "sub tab มันบิดไปข้างบนได้ดีกว่าข้างล่าง พอเอาเม้าวางข้างล่างแล้วแทบ
// จะไม่หมุนหาเลย เช็คว่าจุดเช็คตรงกลาง จุดศูนย์กลางในการ sense ซ้าย ขวา บน
// ล่าง มันอยู่กลางจอและกลาง sub tab นั้นๆที่สร้างจริงๆไหม".
//
// Pure-math test of the biasFromCursor algorithm (extracted inline). Verifies
// symmetric ±MAX_BIAS at viewport edges regardless of modal overflow.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Pure mirror of post-V83-followup-2 biasFromCursor algorithm
const MAX_BIAS = 6;

function biasFromCursorPure(clientX, clientY, rect, viewport) {
  if (rect.width === 0 || rect.height === 0) return null;
  const vw = viewport.width;
  const vh = viewport.height;
  const visLeft   = Math.max(rect.left,   0);
  const visRight  = Math.min(rect.right,  vw);
  const visTop    = Math.max(rect.top,    0);
  const visBottom = Math.min(rect.bottom, vh);
  const cx = (visLeft + visRight) / 2;
  const cy = (visTop + visBottom) / 2;
  const halfW = Math.max(1, (visRight - visLeft) / 2);
  const halfH = Math.max(1, (visBottom - visTop) / 2);
  const dx = (clientX - cx) / halfW;
  const dy = (clientY - cy) / halfH;
  return {
    x: Math.max(-1, Math.min(1, dx)) * MAX_BIAS,
    y: -Math.max(-1, Math.min(1, dy)) * MAX_BIAS,
    cx, cy, halfW, halfH,
  };
}

// Pre-fix algorithm for comparison
function biasFromCursorPreFix(clientX, clientY, rect) {
  if (rect.width === 0 || rect.height === 0) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = (clientX - cx) / (rect.width / 2);
  const dy = (clientY - cy) / (rect.height / 2);
  return {
    x: Math.max(-1, Math.min(1, dx)) * MAX_BIAS,
    y: -Math.max(-1, Math.min(1, dy)) * MAX_BIAS,
    cx, cy,
  };
}

describe('V83-followup-2 — Sub-tab viewport-clamped tilt sensing', () => {
  describe('T1 — Fits-in-viewport (small modal, baseline)', () => {
    const rect = { left: 200, right: 800, top: 100, bottom: 700, width: 600, height: 600 };
    const vp = { width: 1000, height: 800 };

    it('T1.1 — cursor at modal-center → 0 bias', () => {
      const b = biasFromCursorPure(500, 400, rect, vp);
      expect(b.x).toBeCloseTo(0, 1);
      expect(b.y).toBeCloseTo(0, 1);
    });

    it('T1.2 — cursor at modal-top-edge → ~+MAX bias (tilt back)', () => {
      const b = biasFromCursorPure(500, 100, rect, vp);
      expect(b.y).toBeCloseTo(MAX_BIAS, 1);
    });

    it('T1.3 — cursor at modal-bottom-edge → ~-MAX bias (tilt forward)', () => {
      const b = biasFromCursorPure(500, 700, rect, vp);
      expect(b.y).toBeCloseTo(-MAX_BIAS, 1);
    });

    it('T1.4 — fits-in-viewport behaves identically to pre-fix algorithm', () => {
      // When fully in viewport, clamping is a no-op
      const post = biasFromCursorPure(400, 300, rect, vp);
      const pre = biasFromCursorPreFix(400, 300, rect);
      expect(post.x).toBeCloseTo(pre.x, 2);
      expect(post.y).toBeCloseTo(pre.y, 2);
    });
  });

  describe('T2 — Overflows-bottom (USER BUG REPRO)', () => {
    // 22-item data section ~1100px tall on 800px viewport
    const rect = { left: 200, right: 800, top: 80, bottom: 1400, width: 600, height: 1320 };
    const vp = { width: 1000, height: 800 };

    it('T2.1 — PRE-FIX: cursor at viewport bottom gives only ~0.11 dy (BUG)', () => {
      const pre = biasFromCursorPreFix(500, 800, rect);
      // Pre-fix cy = (80 + 1400) / 2 = 740, halfH = 660 → dy=(800-740)/660=0.09 → y=-0.55
      expect(pre.y).toBeGreaterThan(-1.0); // far from MAX
      expect(Math.abs(pre.y)).toBeLessThan(1.0); // barely any tilt
    });

    it('T2.2 — POST-FIX: cursor at viewport bottom reaches ±MAX_BIAS', () => {
      const post = biasFromCursorPure(500, 800, rect, vp);
      // Post-fix: visTop=80, visBottom=800, cy=440, halfH=360 → dy=(800-440)/360=1.0 → y=-6.0
      expect(post.y).toBeCloseTo(-MAX_BIAS, 1);
    });

    it('T2.3 — POST-FIX: cursor at viewport top reaches +MAX_BIAS', () => {
      const post = biasFromCursorPure(500, 0, rect, vp);
      expect(post.y).toBeCloseTo(MAX_BIAS, 1);
    });

    it('T2.4 — POST-FIX: symmetric — top tilt magnitude == bottom tilt magnitude', () => {
      const top = biasFromCursorPure(500, 0, rect, vp);
      const bottom = biasFromCursorPure(500, 800, rect, vp);
      expect(Math.abs(top.y)).toBeCloseTo(Math.abs(bottom.y), 1);
    });

    it('T2.5 — POST-FIX: sensing center cy lives WITHIN viewport (not at y=740)', () => {
      const b = biasFromCursorPure(500, 400, rect, vp);
      expect(b.cy).toBeGreaterThan(0);
      expect(b.cy).toBeLessThan(800);
      expect(b.cy).toBeCloseTo(440, 1); // midpoint of visible 80→800
    });
  });

  describe('T3 — Overflows-right (horizontal symmetry)', () => {
    const rect = { left: 100, right: 1500, top: 100, bottom: 600, width: 1400, height: 500 };
    const vp = { width: 1000, height: 800 };

    it('T3.1 — cursor at viewport right edge reaches +MAX_BIAS x', () => {
      const post = biasFromCursorPure(1000, 350, rect, vp);
      expect(post.x).toBeCloseTo(MAX_BIAS, 1);
    });

    it('T3.2 — symmetric — left vs right tilt magnitude', () => {
      const left = biasFromCursorPure(0, 350, rect, vp);
      const right = biasFromCursorPure(1000, 350, rect, vp);
      expect(Math.abs(left.x)).toBeCloseTo(Math.abs(right.x), 1);
    });
  });

  describe('T4 — Cursor outside viewport (still clamps to ±MAX)', () => {
    const rect = { left: 200, right: 800, top: 100, bottom: 700, width: 600, height: 600 };
    const vp = { width: 1000, height: 800 };

    it('T4.1 — cursor far above viewport (clientY=-500) clamps to +MAX', () => {
      const b = biasFromCursorPure(500, -500, rect, vp);
      expect(b.y).toBeCloseTo(MAX_BIAS, 1);
    });

    it('T4.2 — cursor far right of viewport (clientX=5000) clamps to +MAX', () => {
      const b = biasFromCursorPure(5000, 400, rect, vp);
      expect(b.x).toBeCloseTo(MAX_BIAS, 1);
    });
  });

  describe('T5 — Source-grep regression lock', () => {
    it('T5.1 — BackendSubTabBloom uses viewport-clamped algorithm', () => {
      const content = readFileSync(
        join(process.cwd(), 'src/components/backend/shell/BackendSubTabBloom.jsx'),
        'utf8'
      );
      // Anti-regression — old non-clamped pattern MUST NOT reappear
      expect(content).not.toMatch(/cx = rect\.left \+ rect\.width \/ 2;\s*\n\s*const cy = rect\.top \+ rect\.height \/ 2;/);
      // Post-fix markers
      expect(content).toMatch(/visTop\s*=\s*Math\.max\(rect\.top/);
      expect(content).toMatch(/visBottom\s*=\s*Math\.min\(rect\.bottom/);
      expect(content).toMatch(/V83-followup-2/);
    });
  });
});
