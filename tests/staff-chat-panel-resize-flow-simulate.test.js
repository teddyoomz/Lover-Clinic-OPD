// tests/staff-chat-panel-resize-flow-simulate.test.js
// (2026-05-31) Rule I full-flow simulate — the persistence contract that makes
// minimize-reopen + auto-popup restore "free". A resize persists; a fresh mount
// (= remount after `minimized` flips in useStaffChat) reads it back, clamped to
// the live viewport. This mirrors the exact line that runs on every
// StaffChatPanel mount (useStaffChatPanelResize useState initializer).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPanelSize, setPanelSize, clampSize, DEFAULT_PANEL_SIZE,
} from '../src/lib/staffChatPanelSize.js';

// Mirror of useStaffChatPanelResize's mount-time size resolution:
//   useState(() => clampSize(getPanelSize() || DEFAULT_PANEL_SIZE, readViewport()))
function resolveMountSize(viewport) {
  return clampSize(getPanelSize() || DEFAULT_PANEL_SIZE, viewport);
}

describe('F1 — resize → persist → remount restore (minimize/popup contract)', () => {
  beforeEach(() => { try { globalThis.localStorage.clear(); } catch { /* */ } });

  it('F1.1 fresh device (no saved) mounts at default 360x480', () => {
    expect(resolveMountSize({ vw: 1280, vh: 900 })).toEqual({ width: 360, height: 480 });
  });
  it('F1.2 after a resize, a remount restores the dragged size (NOT default)', () => {
    setPanelSize({ width: 620, height: 700 });          // user dragged
    // user clicks − (minimize) → panel unmounts → clicks bubble (reopen) → panel mounts:
    expect(resolveMountSize({ vw: 1280, vh: 900 })).toEqual({ width: 620, height: 700 });
  });
  it('F1.3 auto-popup (someone messages) restores the same dragged size', () => {
    setPanelSize({ width: 540, height: 660 });
    // minimized flips false on incoming message → same mount path:
    expect(resolveMountSize({ vw: 1280, vh: 900 })).toEqual({ width: 540, height: 660 });
  });
  it('F1.4 saved size bigger than current viewport → clamps on restore', () => {
    setPanelSize({ width: 1200, height: 1000 });
    expect(resolveMountSize({ vw: 800, vh: 600 })).toEqual({ width: 768, height: 568 });
  });
  it('F1.5 persistence is device-wide (single key, branch-agnostic)', () => {
    setPanelSize({ width: 500, height: 520 });
    // no branch param anywhere — same value regardless of selected branch
    expect(resolveMountSize({ vw: 1280, vh: 900 })).toEqual({ width: 500, height: 520 });
  });
  it('F1.6 minimize→resize-window-smaller→reopen still fits (clamp on restore)', () => {
    setPanelSize({ width: 900, height: 800 });   // dragged big on a large screen
    // user minimizes, shrinks the browser, reopens on a small viewport:
    expect(resolveMountSize({ vw: 700, vh: 560 })).toEqual({ width: 668, height: 528 });
  });
});
