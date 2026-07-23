// @vitest-environment jsdom
// ─── firestore-assertion-recovery (2026-07-23) ──────────────────────────────
//
// The infra-health LINE alert (07-23 07:30) surfaced a real client-error burst:
// Firestore INTERNAL ASSERTION FAILED (ID: ca9 → cascades to b815) on real staff
// machines. It is an OPEN upstream SDK bug (firebase-js-sdk#9267 — same ID + 12.x
// family) triggered by our disableNetwork/enableNetwork reconnect churn +
// persistentMultipleTabManager. We cannot fix the SDK, so we ROUTE the assertion
// into the existing AV214 wedge ladder: a recurrence downgrades the next boot to
// memory-cache (which drops persistentMultipleTabManager, one of the two
// documented triggers). Reloads stay user-initiated (AV214 invariant). Plus the
// benign lazy-chunk churn is demoted to telemetry so it stops tripping the alert.
//
// PROVE-RED: before this session `isFirestoreInternalAssertion` did not exist,
// the beacon had no assertion handler, and lazy-chunk reported kind:'error'.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

import { isFirestoreInternalAssertion } from '../src/lib/clientErrorCore.js';
import {
  reportErrorToBeacon, setFirestoreAssertionHandler, _resetBeaconStateForTest, _getAssertionHandlerForTest,
} from '../src/lib/errorBeacon.js';
import {
  onFirestoreAssertion, noteWedgeReload, escalateWedgeIfReloadFailed,
  _resetWedgeEscalationForTests, WEDGE_RELOAD_KEY,
} from '../src/lib/wedgeEscalation.js';
import { isNoPersistActive, getMachinePerfState, _resetMachinePerfForTests } from '../src/lib/machinePerf.js';
import AppErrorBoundary from '../src/components/AppErrorBoundary.jsx';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// The EXACT messages the beacon captured on prod (07-22), incl. the wrapping.
const REAL_B815 = '[onerror] FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) CONTEXT: {"Pc":"Error: FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9) CONTEXT: {\\"ve\\":-1}"}';
const REAL_CA9 = '[unhandledrejection] FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9) CONTEXT: {"ve":-1}';
const REAL_MISSING_TOKEN = '[unhandledrejection] missing stream token';
const REAL_LAZY = '[lazy-chunk] Failed to fetch dynamically imported module: https://x/assets/AdminDashboard-DAW9HvIP.js';

const reachable = async () => ({ ok: false, status: 403 }); // ANY HTTP answer = round-trip proven
const unreachable = async () => { throw new TypeError('Failed to fetch'); };
const NOW = Date.parse('2026-07-23T07:30:00+07:00');

beforeEach(() => {
  vi.stubGlobal('navigator', { sendBeacon: () => true, userAgent: 'jsdom-test' });
  _resetBeaconStateForTest();
  setFirestoreAssertionHandler(null);
  _resetWedgeEscalationForTests();
  _resetMachinePerfForTests();
});
afterEach(() => {
  setFirestoreAssertionHandler(null);
  _resetWedgeEscalationForTests();
  _resetMachinePerfForTests();
  vi.unstubAllGlobals();
});

describe('A — isFirestoreInternalAssertion (pure predicate)', () => {
  it('A1 matches the REAL ca9/b815 prod messages (both prefixes)', () => {
    expect(isFirestoreInternalAssertion(REAL_B815)).toBe(true);
    expect(isFirestoreInternalAssertion(REAL_CA9)).toBe(true);
    expect(isFirestoreInternalAssertion('FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)')).toBe(true);
  });
  it('A2 does NOT match transient "missing stream token" (SDK self-recovers it)', () => {
    expect(isFirestoreInternalAssertion(REAL_MISSING_TOKEN)).toBe(false);
  });
  it('A3 does NOT match lazy-chunk / ordinary errors / empty', () => {
    expect(isFirestoreInternalAssertion(REAL_LAZY)).toBe(false);
    expect(isFirestoreInternalAssertion('TypeError: x is not a function')).toBe(false);
    expect(isFirestoreInternalAssertion('')).toBe(false);
    expect(isFirestoreInternalAssertion(null)).toBe(false);
    expect(isFirestoreInternalAssertion(undefined)).toBe(false);
  });
});

describe('B — beacon routes the assertion to the registered handler (every path)', () => {
  it('B1 an assertion error fires the handler; a normal / lazy-chunk error does NOT', () => {
    const handler = vi.fn();
    setFirestoreAssertionHandler(handler);
    reportErrorToBeacon({ message: REAL_CA9 }, { source: 'unhandledrejection' });
    reportErrorToBeacon({ message: REAL_B815 }, { source: 'onerror' });
    expect(handler).toHaveBeenCalledTimes(2);
    handler.mockClear();
    reportErrorToBeacon({ message: 'TypeError: boom' }, { source: 'onerror' });
    reportErrorToBeacon({ message: REAL_LAZY }, { source: 'lazy-chunk' });
    reportErrorToBeacon({ message: REAL_MISSING_TOKEN }, { source: 'unhandledrejection' });
    expect(handler).not.toHaveBeenCalled();
  });
  it('B2 fires even when the send is deduped — every occurrence must reach the escalate-check', () => {
    const handler = vi.fn();
    setFirestoreAssertionHandler(handler);
    reportErrorToBeacon({ message: REAL_CA9 }, { source: 'onerror' });
    reportErrorToBeacon({ message: REAL_CA9 }, { source: 'onerror' }); // same hash → send deduped, handler still runs
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it('B3 no handler registered → no throw (beacon is pre-boot; handler may be unset)', () => {
    setFirestoreAssertionHandler(null);
    expect(() => reportErrorToBeacon({ message: REAL_CA9 }, { source: 'onerror' })).not.toThrow();
  });
  it('B4 a throwing handler never breaks reporting', () => {
    setFirestoreAssertionHandler(() => { throw new Error('handler blew up'); });
    expect(() => reportErrorToBeacon({ message: REAL_CA9 }, { source: 'onerror' })).not.toThrow();
  });
  it('B5 setFirestoreAssertionHandler only accepts functions', () => {
    setFirestoreAssertionHandler(123);
    expect(_getAssertionHandlerForTest()).toBe(null);
  });
});

describe('C — wedgeEscalation.onFirestoreAssertion (firebase-free ladder entry)', () => {
  it('C1 first assertion, no recent reload → no-op (reload rung only)', async () => {
    expect(await onFirestoreAssertion(NOW, reachable)).toBe('no-recent-reload');
    expect(isNoPersistActive(NOW)).toBe(false);
  });
  it('C2 recurrence after a wedge-reload + backend reachable → memory-cache escalation', async () => {
    noteWedgeReload(NOW - 10_000);
    expect(await onFirestoreAssertion(NOW, reachable)).toBe('escalate');
    expect(isNoPersistActive(NOW)).toBe(true);
    // labelled a CONNECTION wedge, never "slow machine" — a fast phone hits this too
    expect(getMachinePerfState(NOW).reason).toBe('conn-wedge');
    // and it expires FAST (24h) — the assertion is transient, not a weak machine
    expect(isNoPersistActive(NOW + 25 * 3600 * 1000)).toBe(false);
  });
  it('C3 backend unreachable → NO downgrade (dropping the cache on bad net is worse)', async () => {
    noteWedgeReload(NOW - 10_000);
    expect(await onFirestoreAssertion(NOW, unreachable)).toBe('backend-unreachable');
    expect(isNoPersistActive(NOW)).toBe(false);
  });
  it('C4 never throws even with blocked storage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(onFirestoreAssertion(NOW, reachable)).resolves.toBeTruthy();
    spy.mockRestore();
  });
});

describe('D — AppErrorBoundary stamps the wedge-reload only on an assertion crash', () => {
  function Boom({ msg }) { throw new Error(msg); }
  let errSpy;
  beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errSpy.mockRestore(); });

  it('D1 assertion crash → reload button stamps WEDGE_RELOAD (recurrence will escalate)', () => {
    const { getByText } = render(
      <AppErrorBoundary><Boom msg={'FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)'} /></AppErrorBoundary>,
    );
    expect(localStorage.getItem(WEDGE_RELOAD_KEY)).toBe(null); // not stamped by the crash itself
    fireEvent.click(getByText('โหลดหน้าใหม่'));                  // user-initiated reload
    expect(localStorage.getItem(WEDGE_RELOAD_KEY)).not.toBe(null);
  });
  it('D2 an ORDINARY crash reload does NOT stamp (no spurious escalation)', () => {
    const { getByText } = render(
      <AppErrorBoundary><Boom msg={'TypeError: cannot read x of undefined'} /></AppErrorBoundary>,
    );
    fireEvent.click(getByText('โหลดหน้าใหม่'));
    expect(localStorage.getItem(WEDGE_RELOAD_KEY)).toBe(null);
  });
});

describe('E — full recovery flow (Rule I) — assertion → reload → recurrence → memory-cache', () => {
  it('E1 mirrors the field sequence: 1st no-op, reload stamps, 2nd escalates', async () => {
    // 1st assertion — no reload has happened yet → reload rung only.
    expect(await onFirestoreAssertion(NOW, reachable)).toBe('no-recent-reload');
    expect(isNoPersistActive(NOW)).toBe(false);
    // user reloads via the boundary/retry button → WEDGE_RELOAD stamped.
    noteWedgeReload(NOW + 5_000);
    // assertion recurs on the fresh boot within the heal window → escalate.
    expect(await onFirestoreAssertion(NOW + 8_000, reachable)).toBe('escalate');
    expect(isNoPersistActive(NOW + 8_000)).toBe(true); // firebase.js will boot memory-cache → trigger removed
  });
  it('E2 once on memory-cache, a further assertion no longer churns the ladder', async () => {
    noteWedgeReload(NOW - 5_000);
    await onFirestoreAssertion(NOW, reachable);
    expect(isNoPersistActive(NOW)).toBe(true);
    noteWedgeReload(NOW + 1_000);
    expect(await onFirestoreAssertion(NOW + 2_000, reachable)).toBe('already-memory-cache');
  });
});

describe('F — wiring + de-noise source-grep locks', () => {
  it('F1 main.jsx registers the handler onto the beacon after install', () => {
    const m = read('src/main.jsx');
    expect(m).toMatch(/setFirestoreAssertionHandler\(onFirestoreAssertion\)/);
    // the CALL to install runs before the CALL that registers the handler
    expect(m.indexOf('installErrorBeacon()')).toBeLessThan(m.indexOf('setFirestoreAssertionHandler(onFirestoreAssertion)'));
    // must stay firebase-free on the pre-boot path (no firestoreReconnect/firebase import here)
    expect(m).not.toMatch(/from '\.\/lib\/firestoreReconnect\.js'/);
    expect(m).toMatch(/from '\.\/lib\/wedgeEscalation\.js'/);
  });
  it('F2 errorBeacon routes the assertion inside reportErrorToBeacon', () => {
    const b = read('src/lib/errorBeacon.js');
    expect(b).toMatch(/isFirestoreInternalAssertion/);
    const fn = b.slice(b.indexOf('export function reportErrorToBeacon'), b.indexOf('export function installErrorBeacon'));
    expect(fn).toMatch(/if \(assertionHandler && isFirestoreInternalAssertion\(message\)\)/);
  });
  it('F3 wedgeEscalation.onFirestoreAssertion is firebase-free (safe for the beacon graph)', () => {
    const w = read('src/lib/wedgeEscalation.js');
    expect(w).toMatch(/export function onFirestoreAssertion/);
    expect(w).toMatch(/escalateWedgeIfReloadFailed\(nowMs, fetchFn\)/);
    expect(w).not.toMatch(/from ['"].*firebase/);
  });
  it('F4 AppErrorBoundary.handleReload stamps on the assertion branch', () => {
    const a = read('src/components/AppErrorBoundary.jsx');
    expect(a).toMatch(/isAssertion: isFirestoreInternalAssertion\(error\?\.message\)/);
    expect(a).toMatch(/if \(this\.state\.isAssertion\) \{ try \{ noteWedgeReload\(\)/);
  });
  it('F5 lazyRetry demotes chunk-load failures to TELEMETRY (no longer trips the alert)', () => {
    const l = read('src/lib/lazyRetry.jsx');
    expect(l).toMatch(/import \{ reportTelemetryToBeacon \} from '\.\/errorBeacon\.js'/);
    expect(l).toMatch(/reportTelemetryToBeacon\(`\[lazy-chunk\]/);
    // the OLD kind:'error' report must be gone (that is what cried wolf)
    expect(l).not.toMatch(/reportErrorToBeacon\(lastErr/);
  });
});
