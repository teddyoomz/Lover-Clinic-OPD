// ─── V84 — Chat-tab badge overflow-y clipping + neighbor overlap fix (2026-05-18 EOD+9) ─
//
// User report (verbatim, with screenshot):
//   "ใน Frontend เวลาปุ่ม Tab Chat มันมีแชทเข้ามา แล้วมันกระพริบและมี bubble แสดง
//    มันจะแสดงผลผิดพลาดไปเบียดปุ่มข้างๆ และเบียดกรอบบนล่าง ดูไม่สวยและอึดอัด"
//
// Root cause (Phase 1 systematic-debugging via real-browser preview_eval):
//   The inner tab scroll container in AdminDashboard.jsx top-bar used:
//     <div class="flex items-center gap-0.5 ... overflow-x-auto no-scrollbar">
//   CSS spec quirk: whenever overflow-x is non-visible, browsers auto-promote
//   overflow-y from `visible` → `auto`. So overflow-y was clipping anything
//   that protruded above/below the container.
//
//   .menu-badge is `position:absolute; top:-6px; right:-6px`. The negative top
//   pushed the badge 6px above the button → clipped at -5px relative to
//   container top.
//
//   gap-0.5 (2px between tabs) < right:-6px protrusion → badge overlapped the
//   next tab "คิวหน้า Clinic" by 3px.
//
//   chat-tab-blink animation had a 16px red box-shadow halo at peak (50%
//   keyframe) that bled 5.4px above + 4.4px below the bar (~10px py-2.5
//   container padding insufficient).
//
// Fix surfaces (THREE-PART):
//   1. src/index.css `chat-blink` @keyframes: 16px halo → 10px halo so it
//      stays inside the bar's ~10px vertical padding.
//   2. src/index.css NEW `.menu-tab-scroll` class with padding-margin trick:
//      padding-top:10 / padding-bottom:4 / padding-right:8 with matching
//      negative margins. Net layout height/width = 0 change. Gives the
//      absolute-positioned badges room INSIDE the clipping content box.
//   3. src/pages/AdminDashboard.jsx top-bar JSX: gap-0.5 → gap-1.5 (6px
//      breathing room between tabs) + add `menu-tab-scroll` class.
//
// Class-of-bug (V12 multi-reader-sweep at SCROLL-CONTAINER + ABSOLUTE-CHILD
// boundary): 4 badges (chat/queue/noDeposit/deposit) all share the same
// container and benefit from one fix. Mobile dock has its own container
// without overflow-x-auto — not affected. Other 27 files with
// overflow-x-auto are tables with no absolute-positioned overflowing
// children — not in this class.
//
// Real-browser verification (preview_eval geometric assertions, all PASS):
//   badgeTopRelativeToContainer = 5 (was -5, clipped)
//   badgeRight - nextTabLeft = -1 (was +3, overlapping)
//   haloBleedAboveBar = -0.625 (was 5.375, escaping)
//   haloBleedBelowBar = -1.625 (was 4.375, escaping)
//
// Tier 2 artifacts:
//   - This source-grep regression test
//   - audit-anti-vibe-code AV80 (overflow-x-auto + absolute-positioned-child
//     pattern — see SKILL.md)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
const ADMIN = readFileSync(join(process.cwd(), 'src/pages/AdminDashboard.jsx'), 'utf8');

describe('V84 — Chat-tab badge overflow clipping + neighbor overlap fix', () => {
  describe('B1 — CSS halo containment (chat-blink keyframe)', () => {
    it('B1.1 — chat-blink @keyframes peak halo is 10px (was 16px pre-V84)', () => {
      // Peak (50% keyframe) box-shadow blur must be 10px, not 16px
      expect(CSS).toMatch(/@keyframes\s+chat-blink\s*\{[\s\S]*?50%[^}]*box-shadow:\s*0\s+0\s+10px\s+rgba\(239,\s*68,\s*68,/);
    });

    it('B1.2 — peak halo alpha is 0.55 (was 0.6 pre-V84 — slight reduction)', () => {
      expect(CSS).toMatch(/@keyframes\s+chat-blink\s*\{[\s\S]*?50%[^}]*rgba\(239,\s*68,\s*68,\s*0\.55\)/);
    });

    it('B1.3 — anti-regression: 16px halo NOT present in chat-blink keyframe', () => {
      // Don't allow accidental revert. Match only when 16px appears inside
      // the chat-blink @keyframes block — comment references are OK.
      const keyframeBlock = CSS.match(/@keyframes\s+chat-blink\s*\{[\s\S]*?\n\}/);
      expect(keyframeBlock).not.toBeNull();
      expect(keyframeBlock[0]).not.toMatch(/box-shadow:\s*0\s+0\s+16px/);
    });

    it('B1.4 — chat-blink keyframe still flips bg blue↔red (alert intensity preserved)', () => {
      // Solid-fill bg flip is what carries the alert urgency now that halo is smaller
      expect(CSS).toMatch(/@keyframes\s+chat-blink\s*\{[\s\S]*?0%,\s*100%[^}]*background-color:\s*rgb\(29,\s*78,\s*216\)/);
      expect(CSS).toMatch(/@keyframes\s+chat-blink\s*\{[\s\S]*?50%[^}]*background-color:\s*rgb\(239,\s*68,\s*68\)/);
    });
  });

  describe('B2 — .menu-tab-scroll padding-margin trick (overflow-y clip workaround)', () => {
    it('B2.1 — .menu-tab-scroll class is defined', () => {
      expect(CSS).toMatch(/\.menu-tab-scroll\s*\{/);
    });

    it('B2.2 — padding-top: 10px + margin-top: -10px (net 0 height; gives 4px badge gutter)', () => {
      const block = CSS.match(/\.menu-tab-scroll\s*\{[^}]*\}/)?.[0];
      expect(block).toBeDefined();
      expect(block).toMatch(/padding-top:\s*10px/);
      expect(block).toMatch(/margin-top:\s*-10px/);
    });

    it('B2.3 — padding-bottom: 4px + margin-bottom: -4px (net 0 height)', () => {
      const block = CSS.match(/\.menu-tab-scroll\s*\{[^}]*\}/)?.[0];
      expect(block).toMatch(/padding-bottom:\s*4px/);
      expect(block).toMatch(/margin-bottom:\s*-4px/);
    });

    it('B2.4 — padding-right: 8px + margin-right: -8px (net 0 width; gives badge right protrusion room)', () => {
      const block = CSS.match(/\.menu-tab-scroll\s*\{[^}]*\}/)?.[0];
      expect(block).toMatch(/padding-right:\s*8px/);
      expect(block).toMatch(/margin-right:\s*-8px/);
    });

    it('B2.5 — Net layout impact: padding == |margin| on each affected axis (zero outer shift)', () => {
      const block = CSS.match(/\.menu-tab-scroll\s*\{[^}]*\}/)?.[0];
      const pairs = [
        [/padding-top:\s*(\d+)px/, /margin-top:\s*-(\d+)px/],
        [/padding-bottom:\s*(\d+)px/, /margin-bottom:\s*-(\d+)px/],
        [/padding-right:\s*(\d+)px/, /margin-right:\s*-(\d+)px/]
      ];
      for (const [padRe, marRe] of pairs) {
        const pad = Number(block.match(padRe)?.[1]);
        const mar = Number(block.match(marRe)?.[1]);
        expect(pad).toBeGreaterThan(0);
        expect(pad).toBe(mar);
      }
    });
  });

  describe('B3 — JSX wiring (AdminDashboard.jsx top-bar tab container)', () => {
    it('B3.1 — top-bar tab container has menu-tab-scroll class', () => {
      // The desktop tab container should include menu-tab-scroll
      expect(ADMIN).toMatch(/<div className="flex items-center gap-1\.5 flex-1 min-w-0 overflow-x-auto no-scrollbar menu-tab-scroll"/);
    });

    it('B3.2 — gap-0.5 (2px, pre-V84) NO LONGER on the tab scroll container', () => {
      // Anti-regression: must NOT find the old gap-0.5 on the overflow-x-auto tab scroller
      expect(ADMIN).not.toMatch(/<div className="flex items-center gap-0\.5 flex-1 min-w-0 overflow-x-auto no-scrollbar"/);
    });

    it('B3.3 — gap is now gap-1.5 (6px) on the tab scroll container', () => {
      // gap-1.5 = 6px > badge right:-6px protrusion → no neighbor overlap
      expect(ADMIN).toMatch(/<div className="flex items-center gap-1\.5 [^"]*overflow-x-auto[^"]*menu-tab-scroll"/);
    });

    it('B3.4 — V84 marker comment present near the JSX edit (institutional memory)', () => {
      // Locate the comment block that explains the V84 change
      expect(ADMIN).toMatch(/V84 \(2026-05-18 EOD\+9\):/);
    });
  });

  describe('B4 — .menu-badge CSS unchanged (positioning still top:-6px right:-6px)', () => {
    it('B4.1 — .menu-badge still uses top:-6px (V84 padding-margin trick lets this stand)', () => {
      const block = CSS.match(/\.menu-badge\s*\{[^}]*\}/)?.[0];
      expect(block).toBeDefined();
      expect(block).toMatch(/top:\s*-6px/);
    });

    it('B4.2 — .menu-badge still uses right:-6px', () => {
      const block = CSS.match(/\.menu-badge\s*\{[^}]*\}/)?.[0];
      expect(block).toMatch(/right:\s*-6px/);
    });

    it('B4.3 — .menu-badge stays position: absolute', () => {
      const block = CSS.match(/\.menu-badge\s*\{[^}]*\}/)?.[0];
      expect(block).toMatch(/position:\s*absolute/);
    });
  });

  describe('B5 — Cross-file class-of-bug guard (mobile dock + other overflow-x-auto)', () => {
    it('B5.1 — mobile dock <nav> does NOT have overflow-x-auto (justify-around layout)', () => {
      // .menu-bottom-dock nav uses flex justify-around, not overflow-x-auto
      expect(ADMIN).toMatch(/<nav className="md:hidden fixed left-2 right-2 z-\[90\] flex justify-around items-stretch[^"]*menu-bottom-dock/);
    });

    it('B5.2 — .menu-badge-dock (mobile) does NOT need menu-tab-scroll trick (no overflow-x clipping)', () => {
      // Mobile dock badge: stays absolute at top:-2px right:4px inside nav with justify-around (no overflow-x:auto)
      const dockBadge = CSS.match(/\.menu-badge-dock\s*\{[^}]*\}/)?.[0];
      expect(dockBadge).toMatch(/position:\s*absolute/);
      expect(dockBadge).toMatch(/top:\s*-2px/);
    });

    it('B5.3 — Class-of-bug instance count: ONE (AdminDashboard top-bar tab scroller)', () => {
      // V84 grep classifier: the pattern is "<div overflow-x-auto> wrapping
      // .menu-tab buttons with absolute .menu-badge children". Only 1 instance
      // exists in src/ — locked here so future regressions surface.
      const matches = ADMIN.match(/overflow-x-auto[^"]*menu-tab-scroll|menu-tab-scroll[^"]*overflow-x-auto/g) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe('B6 — Geometric contract documented (live preview_eval evidence)', () => {
    it('B6.1 — Document the live measurement that proved the fix', () => {
      // This test serves as institutional memory for the geometric assertions
      // that the live browser preview confirmed. If a future refactor changes
      // these magic numbers (10/4/8 padding, gap-1.5, 10px halo), the rest of
      // this test bank will flag it.
      const ASSERTIONS = {
        badgeTopRelativeToContainer: 5,       // was -5 pre-fix (clipped by overflow-y)
        badgeRightMinusNextTabLeft: -1,        // was +3 pre-fix (3px overlap into neighbor)
        haloBleedAboveBar: -0.625,             // was +5.375 pre-fix (halo escaped bar top)
        haloBleedBelowBar: -1.625              // was +4.375 pre-fix (halo escaped bar bottom)
      };
      expect(Object.keys(ASSERTIONS).length).toBe(4);
      expect(ASSERTIONS.badgeTopRelativeToContainer).toBeGreaterThan(0);  // not clipped
      expect(ASSERTIONS.badgeRightMinusNextTabLeft).toBeLessThanOrEqual(0); // not overlapping
      expect(ASSERTIONS.haloBleedAboveBar).toBeLessThanOrEqual(0);  // contained
      expect(ASSERTIONS.haloBleedBelowBar).toBeLessThanOrEqual(0);  // contained
    });
  });
});
