// tests/staff-chat-panel-resize-rtl.test.jsx
// (2026-05-31) RTL behavior for the desktop-resizable StaffChatPanel + hook.
// Native MouseEvents named pointerdown/move/up (jsdom-safe). matchMedia mocked
// per test. getBoundingClientRect mocked so the drag math has a real start.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { StaffChatPanel } from '../src/components/staffchat/StaffChatPanel.jsx';
import { getPanelSize, setPanelSize, PANEL_SIZE_STORAGE_KEY } from '../src/lib/staffChatPanelSize.js';

function mockMatchMedia(isDesktop) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: isDesktop, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}
function fireNative(node, type, { clientX = 0, clientY = 0 } = {}) {
  act(() => { node.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })); });
}
const renderPanel = () => render(
  <StaffChatPanel branchName="ทดสอบ" onMinimize={() => {}} displayName="มะปราง" canMinimize>
    <div data-testid="kid">messages</div>
  </StaffChatPanel>
);

describe('StaffChatPanel resize', () => {
  beforeEach(() => {
    try { globalThis.localStorage.clear(); } catch { /* */ }
    window.innerWidth = 1024; window.innerHeight = 768; // jsdom defaults
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('R1 desktop: renders grip + applies inline size from saved', () => {
    setPanelSize({ width: 520, height: 600 });
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    expect(screen.getByTestId('staff-chat-resize-grip')).toBeTruthy();
    expect(panel.style.width).toBe('520px');
    expect(panel.style.height).toBe('600px');
  });

  it('R2 mobile: no grip, no inline width/height', () => {
    setPanelSize({ width: 520, height: 600 });
    mockMatchMedia(false);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    expect(screen.queryByTestId('staff-chat-resize-grip')).toBeNull();
    expect(panel.style.width).toBe('');
    expect(panel.style.height).toBe('');
  });

  it('R3 desktop no-saved: defaults to 360x480', () => {
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    expect(panel.style.width).toBe('360px');
    expect(panel.style.height).toBe('480px');
  });

  it('R4 drag the grip up-left → grows + persists', () => {
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    panel.getBoundingClientRect = () => ({ width: 360, height: 480, top: 288, left: 648, right: 1008, bottom: 768, x: 648, y: 288, toJSON() {} });
    const grip = screen.getByTestId('staff-chat-resize-grip');
    fireEvent.pointerDown(grip, { clientX: 648, clientY: 288 });   // top-left corner
    fireNative(window, 'pointermove', { clientX: 548, clientY: 188 }); // drag up-left 100,100
    fireNative(window, 'pointerup', { clientX: 548, clientY: 188 });
    // startW 360 - (548-648)=460 ; startH 480 - (188-288)=580 ; within 1024/768 ceil
    expect(panel.style.width).toBe('460px');
    expect(panel.style.height).toBe('580px');
    expect(getPanelSize()).toEqual({ width: 460, height: 580 });
  });

  it('R5 drag beyond viewport ceiling → clamped, never off-screen', () => {
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    panel.getBoundingClientRect = () => ({ width: 360, height: 480, top: 288, left: 648, right: 1008, bottom: 768, x: 648, y: 288, toJSON() {} });
    const grip = screen.getByTestId('staff-chat-resize-grip');
    fireEvent.pointerDown(grip, { clientX: 648, clientY: 288 });
    fireNative(window, 'pointermove', { clientX: -5000, clientY: -5000 }); // way past edges
    fireNative(window, 'pointerup', { clientX: -5000, clientY: -5000 });
    expect(getPanelSize()).toEqual({ width: 1024 - 32, height: 768 - 32 }); // 992x736
  });

  it('R6 window resize smaller than saved → re-clamps to fit', () => {
    setPanelSize({ width: 900, height: 700 });
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    act(() => { window.innerWidth = 600; window.innerHeight = 500; window.dispatchEvent(new Event('resize')); });
    expect(panel.style.width).toBe('568px');  // 600-32
    expect(panel.style.height).toBe('468px'); // 500-32
    expect(getPanelSize()).toEqual({ width: 568, height: 468 });
  });

  it('R7 double-click grip → reset to default 360x480', () => {
    setPanelSize({ width: 800, height: 700 });
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    const grip = screen.getByTestId('staff-chat-resize-grip');
    fireEvent.doubleClick(grip);
    expect(panel.style.width).toBe('360px');
    expect(panel.style.height).toBe('480px');
    expect(getPanelSize()).toEqual({ width: 360, height: 480 });
  });

  it('R8 saved size larger than viewport on mount → clamped on first render', () => {
    setPanelSize({ width: 5000, height: 5000 });
    mockMatchMedia(true);
    renderPanel();
    const panel = screen.getByTestId('staff-chat-panel');
    expect(panel.style.width).toBe('992px');
    expect(panel.style.height).toBe('736px');
  });
});
