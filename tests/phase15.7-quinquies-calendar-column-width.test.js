// Phase 15.7-quinquies (2026-04-28) — calendar column width scales with roomCount
//
// User report (Phase 15.7-bis follow-up): "ตามภาพ column ไม่ระบุห้อง
// หลุดตารางไปแล้ว". The virtual "ไม่ระบุห้อง" column overflowed the
// visible frame because per-column min-width was hardcoded to 140px:
//   6 rooms × 140 + 60 = 900px content
//   typical 1280px viewport - 280px sidebar - 32px padding = 968px available
//   → 900 fits TIGHTLY but headers/cards near right edge can clip on
//     narrower screens or with extra padding.
//
// Fix: scale per-column width based on rooms.length:
//   ≤4 rooms → 160px each (generous)
//   5-6 rooms → 130px each (Thai labels still fit)
//   7+ rooms → 110px each (tight but visible)
// minWidth on the inner div uses the same scale so horizontal scroll
// is the LAST resort, not the default.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const ApptTabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentCalendarView.jsx'), 'utf-8');

describe('Phase 15.7-quinquies — Calendar column width scales with roomCount', () => {
  describe('QU1 — Source contract', () => {
    it('QU1.1 _colWidth IIFE computes pixel width based on rooms.length', () => {
      expect(ApptTabSrc).toMatch(/_colWidth\s*=\s*rooms\.length\s*>=\s*7\s*\?\s*110\s*:\s*rooms\.length\s*>=\s*5\s*\?\s*130\s*:\s*160/);
    });

    it('QU1.2 _colMinClass IIFE computes Tailwind min-w utility based on rooms.length', () => {
      expect(ApptTabSrc).toMatch(/_colMinClass\s*=\s*rooms\.length\s*>=\s*7\s*\?\s*'min-w-\[110px\]'\s*:\s*rooms\.length\s*>=\s*5\s*\?\s*'min-w-\[130px\]'\s*:\s*'min-w-\[160px\]'/);
    });

    it('QU1.3 minWidth uses _colWidth scaled by roomCount', () => {
      expect(ApptTabSrc).toMatch(/minWidth:\s*rooms\.length\s*\*\s*_colWidth\s*\+\s*60/);
    });

    it('QU1.4 header column uses _colMinClass', () => {
      // Header row maps rooms with `${_colMinClass}` in className
      expect(ApptTabSrc).toMatch(/className=\{`flex-1 \$\{_colMinClass\}/);
    });

    it('QU1.5 NO hardcoded min-w-[140px] remaining (anti-regression)', () => {
      // Pre-fix value of 140 must be gone
      expect(ApptTabSrc).not.toMatch(/min-w-\[140px\]/);
    });

    it('QU1.6 truncate added on header so long Thai room names don\'t overflow visually', () => {
      // Header with truncate + title (tooltip on hover)
      expect(ApptTabSrc).toMatch(/border-l border-\[var\(--bd\)\] truncate/);
    });

    it('QU1.7 Phase 15.7-quinquies marker comment', () => {
      expect(ApptTabSrc).toMatch(/Phase 15\.7-quinquies/);
    });
  });

  describe('QU2 — Functional simulate (computed widths match expectations)', () => {
    function computeWidths(roomCount) {
      const colWidth = roomCount >= 7 ? 110 : roomCount >= 5 ? 130 : 160;
      const minWidthPx = roomCount * colWidth + 60;
      const minWClass = roomCount >= 7 ? 'min-w-[110px]' : roomCount >= 5 ? 'min-w-[130px]' : 'min-w-[160px]';
      return { colWidth, minWidthPx, minWClass };
    }

    it('QU2.1 — 4 rooms (default ≤4 tier) → 160px columns, 700px total', () => {
      const r = computeWidths(4);
      expect(r.colWidth).toBe(160);
      expect(r.minWidthPx).toBe(700);
      expect(r.minWClass).toBe('min-w-[160px]');
    });

    it('QU2.2 — 5 rooms → 130px columns, 710px total (transition tier)', () => {
      const r = computeWidths(5);
      expect(r.colWidth).toBe(130);
      expect(r.minWidthPx).toBe(710);
      expect(r.minWClass).toBe('min-w-[130px]');
    });

    it('QU2.3 — 6 rooms (user scenario) → 130px each, 840px total (fits in 968px available)', () => {
      const r = computeWidths(6);
      expect(r.colWidth).toBe(130);
      expect(r.minWidthPx).toBe(840);
      expect(r.minWClass).toBe('min-w-[130px]');
      // Available on 1280px viewport (after ~280px sidebar + 32 padding) ≈ 968px
      expect(r.minWidthPx).toBeLessThan(968);
    });

    it('QU2.4 — 7 rooms → 110px each, 830px total (still fits)', () => {
      const r = computeWidths(7);
      expect(r.colWidth).toBe(110);
      expect(r.minWidthPx).toBe(830);
      expect(r.minWClass).toBe('min-w-[110px]');
    });

    it('QU2.5 — 8 rooms → 110px each, 940px total (close to limit, still fits 968px)', () => {
      const r = computeWidths(8);
      expect(r.colWidth).toBe(110);
      expect(r.minWidthPx).toBe(940);
    });

    it('QU2.6 — 10 rooms → 110px, 1160px total (overflow on 1280px screen, scrolls)', () => {
      const r = computeWidths(10);
      expect(r.minWidthPx).toBe(1160);
      // > 968px → horizontal scroll kicks in (overflow-x-auto handles it)
      expect(r.minWidthPx).toBeGreaterThan(968);
    });

    it('QU2.7 — pre-fix 6 rooms with hardcoded 140 = 900 (right at edge)', () => {
      // The pre-fix scenario: 6×140+60=900. 968 available - 900 = 68px slack.
      // Any extra padding would clip. The fix: 6×130+60=840 → 128px slack.
      const preFix = 6 * 140 + 60;
      expect(preFix).toBe(900);
      const postFix = computeWidths(6).minWidthPx;
      expect(postFix).toBeLessThan(preFix);
      expect(preFix - postFix).toBe(60); // 60px more breathing room
    });
  });
});
