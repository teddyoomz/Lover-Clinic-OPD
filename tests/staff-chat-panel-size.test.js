// tests/staff-chat-panel-size.test.js
// (2026-05-31) Unit tests for the per-device staff-chat panel size module.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPanelSize, setPanelSize, clearPanelSize, clampSize,
  DEFAULT_PANEL_SIZE, MIN_PANEL_SIZE, VIEWPORT_MARGIN, PANEL_SIZE_STORAGE_KEY,
} from '../src/lib/staffChatPanelSize.js';

describe('staffChatPanelSize — clampSize (pure)', () => {
  it('S1.1 floors at MIN when request is smaller', () => {
    expect(clampSize({ width: 100, height: 100 }, { vw: 2000, vh: 2000 }))
      .toEqual({ width: 360, height: 480 });
  });
  it('S1.2 caps at viewport minus margin', () => {
    expect(clampSize({ width: 5000, height: 5000 }, { vw: 800, vh: 600 }))
      .toEqual({ width: 800 - VIEWPORT_MARGIN, height: 600 - VIEWPORT_MARGIN });
  });
  it('S1.3 viewport wins when smaller than MIN (always fits)', () => {
    expect(clampSize({ width: 360, height: 480 }, { vw: 300, vh: 200 }))
      .toEqual({ width: 300 - VIEWPORT_MARGIN, height: 200 - VIEWPORT_MARGIN });
  });
  it('S1.4 passes through a mid value unchanged', () => {
    expect(clampSize({ width: 560, height: 620 }, { vw: 1280, vh: 900 }))
      .toEqual({ width: 560, height: 620 });
  });
  it('S1.5 NaN/garbage request → default-based, still clamped', () => {
    expect(clampSize({ width: NaN, height: 'x' }, { vw: 2000, vh: 2000 }))
      .toEqual({ width: DEFAULT_PANEL_SIZE.width, height: DEFAULT_PANEL_SIZE.height });
  });
  it('S1.6 missing/Infinity viewport → floor at MIN only', () => {
    expect(clampSize({ width: 999, height: 999 }, {}))
      .toEqual({ width: 999, height: 999 });
    expect(clampSize({ width: 100, height: 100 }, {}))
      .toEqual({ width: 360, height: 480 });
  });
  it('S1.7 negative request → MIN', () => {
    expect(clampSize({ width: -50, height: -50 }, { vw: 2000, vh: 2000 }))
      .toEqual({ width: 360, height: 480 });
  });
  it('S1.8 MIN_PANEL_SIZE matches the legacy fixed desktop size', () => {
    expect(MIN_PANEL_SIZE).toEqual({ width: 360, height: 480 });
    expect(DEFAULT_PANEL_SIZE).toEqual({ width: 360, height: 480 });
  });
});

describe('staffChatPanelSize — persistence', () => {
  beforeEach(() => { try { globalThis.localStorage.clear(); } catch { /* */ } });
  it('S2.1 round-trips a valid size', () => {
    setPanelSize({ width: 520, height: 640 });
    expect(getPanelSize()).toEqual({ width: 520, height: 640 });
    expect(globalThis.localStorage.getItem(PANEL_SIZE_STORAGE_KEY)).toContain('520');
  });
  it('S2.2 missing key → null', () => { expect(getPanelSize()).toBeNull(); });
  it('S2.3 invalid JSON → null', () => {
    globalThis.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, '{not json');
    expect(getPanelSize()).toBeNull();
  });
  it('S2.4 non-finite / non-positive stored → null', () => {
    globalThis.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify({ width: 0, height: -1 }));
    expect(getPanelSize()).toBeNull();
  });
  it('S2.5 setPanelSize ignores invalid input (no write)', () => {
    setPanelSize({ width: NaN, height: 480 });
    expect(getPanelSize()).toBeNull();
  });
  it('S2.6 clearPanelSize removes the key', () => {
    setPanelSize({ width: 400, height: 500 });
    clearPanelSize();
    expect(getPanelSize()).toBeNull();
  });
  it('S2.7 rounds fractional dimensions on write', () => {
    setPanelSize({ width: 400.7, height: 500.2 });
    expect(getPanelSize()).toEqual({ width: 401, height: 500 });
  });
});
