// ─── error-beacon (2026-07-19) — gate + install + self-safety ──────────────
// The beacon must NEVER make anything worse: dedupe 1/5min/hash, hard session
// cap, idempotent install, silent self-failure (no loop). jsdom env (global).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  shouldSendBeacon, installErrorBeacon, reportErrorToBeacon,
  _resetBeaconStateForTest, DEDUPE_WINDOW_MS, SESSION_MAX_SENDS, BEACON_ENDPOINT,
} from '../src/lib/errorBeacon.js';

// AV41 discipline — capture + restore globals we stub.
const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_SEND_BEACON = global.navigator?.sendBeacon;

beforeEach(() => { _resetBeaconStateForTest(); });
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH;
  if (global.navigator) {
    if (ORIGINAL_SEND_BEACON === undefined) delete global.navigator.sendBeacon;
    else global.navigator.sendBeacon = ORIGINAL_SEND_BEACON;
  }
});

describe('B1 — shouldSendBeacon gate', () => {
  it('B1.1 same hash within 5 min → blocked; after the window → allowed', () => {
    const s = { sentCount: 0, lastSentByHash: new Map() };
    expect(shouldSendBeacon('eX', 1000, s)).toBe(true);
    expect(shouldSendBeacon('eX', 1000 + DEDUPE_WINDOW_MS - 1, s)).toBe(false);
    expect(shouldSendBeacon('eX', 1000 + DEDUPE_WINDOW_MS + 1, s)).toBe(true);
  });
  it('B1.2 distinct hashes pass until the session cap, then everything blocked', () => {
    const s = { sentCount: 0, lastSentByHash: new Map() };
    for (let i = 0; i < SESSION_MAX_SENDS; i += 1) {
      expect(shouldSendBeacon(`e${i}`, 1000 + i, s)).toBe(true);
    }
    expect(shouldSendBeacon('eNEW', 99999, s)).toBe(false); // cap reached
  });
});

describe('B2 — reportErrorToBeacon transport + self-safety', () => {
  it('B2.1 posts a sanitized JSON payload via fetch keepalive when sendBeacon absent', () => {
    if (global.navigator) delete global.navigator.sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    global.fetch = fetchMock;
    reportErrorToBeacon(new Error('boom test'), { source: 'manual' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(BEACON_ENDPOINT);
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    const body = JSON.parse(opts.body);
    expect(body.message).toContain('boom test');
    expect(body.hash).toMatch(/^e[0-9a-z]+$/);
  });
  it('B2.2 prefers navigator.sendBeacon when available (returns true → no fetch)', () => {
    const sb = vi.fn(() => true);
    global.navigator.sendBeacon = sb;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    reportErrorToBeacon(new Error('via beacon'));
    expect(sb).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('B2.3 dedupe applies across reports (same error twice → one send)', () => {
    if (global.navigator) delete global.navigator.sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    global.fetch = fetchMock;
    const err = new Error('same');
    reportErrorToBeacon(err);
    reportErrorToBeacon(err);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('B2.4 SELF-SAFETY: transport throwing is swallowed — never rethrows, never loops', () => {
    if (global.navigator) global.navigator.sendBeacon = () => { throw new Error('sendBeacon exploded'); };
    global.fetch = () => { throw new Error('fetch exploded'); };
    expect(() => reportErrorToBeacon(new Error('x'))).not.toThrow();
  });
  it('B2.5 junk inputs never throw', () => {
    if (global.navigator) delete global.navigator.sendBeacon;
    global.fetch = vi.fn(() => Promise.resolve({}));
    expect(() => reportErrorToBeacon(null)).not.toThrow();
    expect(() => reportErrorToBeacon('string error')).not.toThrow();
    expect(() => reportErrorToBeacon({ weird: true })).not.toThrow();
  });
});

describe('B3 — installErrorBeacon', () => {
  it('B3.1 idempotent — second install adds NO extra listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    installErrorBeacon();
    const after1 = addSpy.mock.calls.filter(c => c[0] === 'error' || c[0] === 'unhandledrejection').length;
    installErrorBeacon();
    const after2 = addSpy.mock.calls.filter(c => c[0] === 'error' || c[0] === 'unhandledrejection').length;
    expect(after1).toBe(2);
    expect(after2).toBe(2);
  });
  it('B3.2 window "error" event routes into the transport', () => {
    if (global.navigator) delete global.navigator.sendBeacon;
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    global.fetch = fetchMock;
    installErrorBeacon();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('window boom'), message: 'window boom' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toContain('window boom');
  });
});

describe('B4 — main.jsx wiring (source-grep locks)', () => {
  const src = readFileSync(path.resolve(__dirname, '..', 'src', 'main.jsx'), 'utf8');
  it('B4.1 installErrorBeacon imported + called; AppErrorBoundary wraps <App/>', () => {
    expect(src).toContain("installErrorBeacon");
    expect(src).toMatch(/installErrorBeacon\(\)/);
    expect(src).toMatch(/<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/);
  });
  it('B4.2 SwUpdateToast stays OUTSIDE the boundary (toast crash ≠ app unmount)', () => {
    const boundaryClose = src.indexOf('</AppErrorBoundary>');
    const toast = src.indexOf('<SwUpdateToast />');
    expect(boundaryClose).toBeGreaterThan(-1);
    expect(toast).toBeGreaterThan(boundaryClose);
  });
});
