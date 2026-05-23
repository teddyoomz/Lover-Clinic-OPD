// V115 (2026-05-23 EOD+1 LATE+2) — Mobile lightbox UX fix.
//
// User report (verbatim, mobile / iPhone): "ใน mobile กดเปิดรูป Preview
// ในช่องแชท staff chat แล้วปิดพรีวิวไม่ได้ และซูมดูรูปไม่ได้ด้วย ใช้งานยากมาก".
//
// Root causes (Phase 1 + 2 investigation):
//   Symptom A (can't close on mobile):
//     1. StaffChatImageLightbox shipped AV78-NORMAL (backdrop does NOT close)
//        but CLAUDE.md AV78 sanctioned-exception list lists it as one of 2
//        fullscreen image viewers where click-anywhere-closes IS expected
//        UX. Code contradicted spec.
//     2. Close button w-9 h-9 (36px) — below iOS HIG 44pt minimum.
//     3. Top bar top-0 with no env(safe-area-inset-top) — partially under
//        iPhone notch / dynamic island.
//   Symptom B (can't zoom):
//     1. No zoom implementation — image was `<img object-contain>` with no
//        pinch handler, no double-tap zoom, no transform state.
//     2. onTouchStart read only touches[0]?.clientX → pinch's 2-finger
//        gesture misread as single-finger swipe → falsely triggered nav.
//
// Fixes (Rule P class-of-bug expansion):
//   - StaffChatImageLightbox: backdrop close + safe-area + 44pt + multi-
//     touch detect (skip swipe-nav, defer to native pinch) + double-tap-
//     zoom (1x ↔ 2.5x via CSS transform) + reset on idx change.
//   - TreatmentReadOnlyMirror Lightbox + TreatmentReadOnlyPanel Lightbox:
//     safe-area + 44pt button (backdrop close already correct on both).
//
// AV114: fullscreen image lightboxes MUST close on backdrop tap (sanctioned
// AV78 exception) + close button MUST be ≥44pt (iOS HIG) + MUST have
// env(safe-area-inset-top) for iPhone notch.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaffChatImageLightbox } from '../src/components/staffchat/StaffChatImageLightbox.jsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AV41 (V55.3) — capture global.fetch at module-load + restore in afterAll
// to prevent cross-file pollution under vitest worker parallelism.
const ORIGINAL_FETCH = global.fetch;
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

// ───────────────────────────────────────────────────────────────────────────
// V115.SG — Source-grep regression locks across all 3 lightbox sites
// ───────────────────────────────────────────────────────────────────────────

const STAFF_CHAT_LIGHTBOX_PATH = path.resolve(__dirname, '../src/components/staffchat/StaffChatImageLightbox.jsx');
const TREATMENT_MIRROR_PATH = path.resolve(__dirname, '../src/components/backend/TreatmentReadOnlyMirror.jsx');
const TREATMENT_PANEL_PATH = path.resolve(__dirname, '../src/components/backend/TreatmentReadOnlyPanel.jsx');
const STAFF_SRC = fs.readFileSync(STAFF_CHAT_LIGHTBOX_PATH, 'utf8');
const MIRROR_SRC = fs.readFileSync(TREATMENT_MIRROR_PATH, 'utf8');
const PANEL_SRC = fs.readFileSync(TREATMENT_PANEL_PATH, 'utf8');

describe('V115.SG — StaffChatImageLightbox source-grep', () => {
  it('SG1: backdrop click closes the lightbox (outer div has onClick={onClose})', () => {
    // Outer div needs the onClick={onClose} for backdrop-close.
    // AV78 sanctioned exception per CLAUDE.md AV78 list (closed set of 2).
    expect(STAFF_SRC).toMatch(/data-testid=['"]staff-chat-image-lightbox['"][\s\S]{0,400}onClick=\{onClose\}/);
  });

  it('SG1b: AV78 sanctioned-exception annotation present (corrected from AV78 NORMAL)', () => {
    expect(STAFF_SRC).toMatch(/AV78[\s\S]{0,80}(lightbox-explicit-exception|sanctioned)/);
    // Anti-regression: the OLD "AV78 NORMAL modal — backdrop does NOT close"
    // comment must NOT remain (would re-introduce the user-reported bug).
    expect(STAFF_SRC).not.toMatch(/AV78 NORMAL modal.*backdrop does NOT close/);
  });

  it('SG2: safe-area-inset-top padding on top bar', () => {
    expect(STAFF_SRC).toMatch(/paddingTop:\s*['"][^'"]*env\(safe-area-inset-top\)/);
  });

  it('SG3: close button bumped to 44pt iOS HIG (w-11 h-11, was w-9 h-9)', () => {
    // The CLOSE button (data-testid staff-chat-lightbox-close) must be 44pt.
    expect(STAFF_SRC).toMatch(/data-testid=['"]staff-chat-lightbox-close['"][\s\S]{0,200}w-11 h-11/);
    // Anti-regression: no w-9 h-9 on the close button anywhere
    expect(STAFF_SRC).not.toMatch(/staff-chat-lightbox-close['"][\s\S]{0,200}w-9 h-9/);
  });

  it('SG4: multi-touch detection in onTouchStart (defers pinch to native)', () => {
    expect(STAFF_SRC).toMatch(/e\.touches[\s\S]{0,40}\.length\s*>\s*1/);
  });

  it('SG5: double-tap-zoom mechanism (zoom state + setZoom toggle)', () => {
    expect(STAFF_SRC).toMatch(/const\s*\[zoom,\s*setZoom\]\s*=\s*useState/);
    // Toggle pattern: 1x ↔ 2.5x
    expect(STAFF_SRC).toMatch(/setZoom\(z\s*=>\s*\(?\s*z\s*===\s*1\s*\?\s*2\.5\s*:\s*1\s*\)?\s*\)/);
  });

  it('SG6: zoom resets on idx change (useEffect with [idx] deps)', () => {
    expect(STAFF_SRC).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setZoom\(1\)/);
  });

  it('SG7: image carries CSS transform scale(zoom) inline style', () => {
    expect(STAFF_SRC).toMatch(/transform:\s*`scale\(\$\{zoom\}\)`/);
  });
});

describe('V115.SG — Treatment lightboxes (class-of-bug expansion)', () => {
  it('SG-T1: TreatmentReadOnlyMirror close button bumped to 44pt (was w-8 h-8)', () => {
    expect(MIRROR_SRC).toMatch(/aria-label=['"]ปิด['"][\s\S]{0,40}/);
    // The close button class should now use w-11 h-11
    expect(MIRROR_SRC).toMatch(/w-11 h-11[\s\S]{0,200}aria-label=['"]ปิด['"]/);
    // Anti-regression: must NOT have w-8 h-8 on the close button
    expect(MIRROR_SRC).not.toMatch(/w-8 h-8 rounded-full bg-black\/60/);
  });

  it('SG-T2: TreatmentReadOnlyMirror safe-area-inset on close button position', () => {
    expect(MIRROR_SRC).toMatch(/env\(safe-area-inset-top\)/);
  });

  it('SG-T3: TreatmentReadOnlyPanel close button bumped to 44pt (was p-2)', () => {
    // Order in source: data-testid="timeline-lightbox-close" first, then
    // className="... w-11 h-11 ..." later (JSX attributes order).
    expect(PANEL_SRC).toMatch(/timeline-lightbox-close[\s\S]{0,400}w-11 h-11/);
  });

  it('SG-T4: TreatmentReadOnlyPanel safe-area-inset on close button position', () => {
    expect(PANEL_SRC).toMatch(/env\(safe-area-inset-top\)/);
  });

  it('SG-T5: Treatment lightboxes preserve their backdrop-close behavior', () => {
    // Mirror: onClick={onClose} on outer div
    expect(MIRROR_SRC).toMatch(/className=['"]fixed inset-0 z-\[110\][\s\S]{0,200}onClick=\{onClose\}/);
    // Panel: outer onClick={(e) => { ... onClose?.() ... }}. JSX attribute
    // syntax has `{` after `=` (onClick={(e)... not onClick=(e)...).
    expect(PANEL_SRC).toMatch(/timeline-lightbox['"][\s\S]{0,200}onClick=\{\s*\(e\)\s*=>\s*\{[\s\S]{0,80}onClose\?\.\(\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// V115.R — RTL behavioral tests on StaffChatImageLightbox
// ───────────────────────────────────────────────────────────────────────────

const FAKE_IMAGES = [
  { fullUrl: 'https://example.com/img1.jpg', thumbUrl: 'https://example.com/img1-t.jpg' },
  { fullUrl: 'https://example.com/img2.jpg', thumbUrl: 'https://example.com/img2-t.jpg' },
  { fullUrl: 'https://example.com/img3.jpg', thumbUrl: 'https://example.com/img3-t.jpg' },
];

describe('V115.R — StaffChatImageLightbox behavioral', () => {
  beforeEach(() => {
    // Mock fetch so the blob-cache preload doesn't error
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake'], { type: 'image/jpeg' })),
    });
    // jsdom doesn't have URL.createObjectURL
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
    }
    if (!global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL = vi.fn();
    }
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('R1: backdrop tap calls onClose (NEW V115 behavior)', () => {
    const onClose = vi.fn();
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={onClose} />);
    const backdrop = screen.getByTestId('staff-chat-image-lightbox');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('R2: clicking the close button calls onClose', () => {
    const onClose = vi.fn();
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('staff-chat-lightbox-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('R3: clicking the IMAGE does NOT close (stopPropagation preserved)', () => {
    const onClose = vi.fn();
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('staff-chat-lightbox-image'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('R4: clicking the top-bar (counter/download) does NOT close', () => {
    const onClose = vi.fn();
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('staff-chat-lightbox-counter'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('R5: double-click on image toggles zoom (CSS transform changes)', () => {
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={() => {}} />);
    const img = screen.getByTestId('staff-chat-lightbox-image');
    expect(img.style.transform).toMatch(/scale\(1\)/);
    fireEvent.doubleClick(img);
    expect(img.style.transform).toMatch(/scale\(2\.5\)/);
    fireEvent.doubleClick(img);
    expect(img.style.transform).toMatch(/scale\(1\)/);
  });

  it('R6: zoom resets to 1x when navigating to next image', () => {
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={() => {}} />);
    const img = screen.getByTestId('staff-chat-lightbox-image');
    fireEvent.doubleClick(img);
    expect(img.style.transform).toMatch(/scale\(2\.5\)/);
    fireEvent.click(screen.getByTestId('staff-chat-lightbox-next'));
    expect(img.style.transform).toMatch(/scale\(1\)/);
  });

  it('R7: multi-touch (touches.length > 1) bails onTouchStart — swipe-nav skipped', () => {
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={() => {}} />);
    const root = screen.getByTestId('staff-chat-image-lightbox');
    // Simulate pinch start: 2 touches
    fireEvent.touchStart(root, { touches: [{ clientX: 100 }, { clientX: 200 }] });
    // Then release with horizontal movement — should NOT trigger swipe-nav
    // because onTouchStart bailed (touchX was cleared to null).
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 300 }], touches: [] });
    // idx should still be 0
    const counter = screen.getByTestId('staff-chat-lightbox-counter');
    expect(counter.textContent).toMatch(/1\s*\/\s*3/);
  });

  it('R8: single-finger horizontal swipe (>40px) navigates next', () => {
    render(<StaffChatImageLightbox images={FAKE_IMAGES} onClose={() => {}} />);
    const root = screen.getByTestId('staff-chat-image-lightbox');
    fireEvent.touchStart(root, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 100 }], touches: [] }); // dx = -200, swipe left
    const counter = screen.getByTestId('staff-chat-lightbox-counter');
    expect(counter.textContent).toMatch(/2\s*\/\s*3/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// V115.AV — AV114 invariant + class-of-bug discipline
// ───────────────────────────────────────────────────────────────────────────

const AV_SKILL_PATH = path.resolve(__dirname, '../.agents/skills/audit-anti-vibe-code/SKILL.md');
const AV_SKILL_SRC = fs.readFileSync(AV_SKILL_PATH, 'utf8');

describe('V115.AV — AV114 invariant present in audit-anti-vibe-code', () => {
  it('AV1: AV114 entry exists in audit-anti-vibe-code SKILL.md', () => {
    expect(AV_SKILL_SRC).toMatch(/### AV114\s*[—-]/);
  });

  it('AV2: AV114 enumerates the 3 sanctioned consumer lightboxes', () => {
    // Window widened to 6000 to span the full AV114 entry (sanctioned
    // consumer list sits near the end of a ~5KB entry).
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}StaffChatImageLightbox/);
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}TreatmentReadOnlyMirror/);
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}TreatmentReadOnlyPanel/);
  });

  it('AV3: AV114 mandates the 3 mobile gates (backdrop / safe-area / 44pt)', () => {
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}backdrop/i);
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}safe-area/);
    expect(AV_SKILL_SRC).toMatch(/AV114[\s\S]{0,6000}44/);
  });
});
