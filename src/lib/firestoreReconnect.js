// ─── firestoreReconnect — shared debounced Firestore network toggle ──────────
// 2026-06-16 (mobile-load reliability). Heals a half-dead WebSocket (looks
// connected, but the snapshot stream is dead) by forcing a clean reconnect.
//
// Module-level debounce → many concurrent callers (App.jsx V17 visibilitychange
// + online, useResilientLoad, useBranchAwareListener, TFP) collapse into ONE
// toggle, so a fleet of stuck listeners can't thrash the network. Non-fatal: a
// failed toggle is swallowed (the SDK keeps its own retry path).
//
// 2026-07-20 (mobile stuck-retry /systematic-debugging) — TIMEBOX + WEDGE
// MARKER. Field incident: iOS froze the background tab holding the
// persistentMultipleTabManager primary lease → every Firestore op on the
// foreground tab HUNG (silent — beacon log empty) → the awaited
// disableNetwork() here never settled → `toggling` latched TRUE forever →
// every later heal path (V17 / auto-retry / manual retry / branch-aware)
// silently no-oped → only an app kill recovered. Fix: Promise.race the toggle
// against TOGGLE_TIMEOUT_MS so the latch ALWAYS clears; a timed-out toggle
// stamps the WEDGE marker (+ [conn-wedge] telemetry) which useResilientLoad's
// retry ladder reads to escalate to hardReloadApp() — the automated
// "ปิดแอปเข้าใหม่" that heals every wedge flavor (lease, async queue, IDB).
// A COMPLETED toggle clears the marker (queue proven alive).
//
// ponytail: single global debounce; per-listener coordination only if profiling
// ever shows real contention.
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase.js';
import { reportTelemetryToBeacon } from './errorBeacon.js';

let lastToggleAt = 0;
let toggling = false;
let wedged = false;
const DEBOUNCE_MS = 1500;
const TOGGLE_TIMEOUT_MS = 4000;
const TIMEBOX_SENTINEL = 'RECONNECT_TIMEBOX';

/** TRUE when the last toggle attempt timed out (the client is wedged — a
 *  bare re-subscribe/reconnect provably cannot heal it; only a reload can). */
export function isConnectionWedged() {
  return wedged;
}

/** The automated "ปิดแอปเข้าใหม่" — beacons first (field observability), then
 *  hard-reloads. Mirror of lazyRetry's chunk-failure recovery. Overridable in
 *  tests via __setHardReloadImplForTest. */
let hardReloadImpl = null;
export function hardReloadApp(reason = '') {
  try { reportTelemetryToBeacon(`[conn-wedge] hard-reload (${reason})`); } catch { /* best-effort */ }
  try {
    if (hardReloadImpl) { hardReloadImpl(reason); return; }
    window.location.reload();
  } catch { /* noop — jsdom */ }
}

export async function reconnectFirestore() {
  if (toggling) return;
  if (Date.now() - lastToggleAt < DEBOUNCE_MS) return;
  toggling = true;
  lastToggleAt = Date.now();
  try {
    // .catch on the toggle chain: if the race is lost to the timebox and the
    // hung promise LATER rejects, it must not surface as an unhandled rejection.
    const toggle = (async () => { await disableNetwork(db); await enableNetwork(db); })();
    toggle.catch(() => {});
    await Promise.race([
      toggle,
      new Promise((_, rej) => setTimeout(() => rej(new Error(TIMEBOX_SENTINEL)), TOGGLE_TIMEOUT_MS)),
    ]);
    wedged = false; // completed toggle = the async queue is alive
  } catch (err) {
    if (String(err?.message || '').includes(TIMEBOX_SENTINEL)) {
      wedged = true;
      try { reportTelemetryToBeacon('[conn-wedge] reconnect toggle timed out (client wedged)'); } catch { /* best-effort */ }
      console.warn('[reconnectFirestore] toggle TIMED OUT — client wedged; retry ladder will escalate to reload');
    } else {
      // Non-fatal — SDK may still recover via its own retries.
      console.warn('[reconnectFirestore] toggle failed:', err?.message || err);
    }
  } finally {
    toggling = false;
  }
}

// Test seam — reset the module-level debounce between unit tests.
export function __resetReconnectDebounceForTest() {
  lastToggleAt = 0;
  toggling = false;
  wedged = false;
  hardReloadImpl = null;
}
export function __setHardReloadImplForTest(fn) {
  hardReloadImpl = fn;
}
