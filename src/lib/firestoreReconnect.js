// ─── firestoreReconnect — shared debounced Firestore network toggle ──────────
// 2026-06-16 (mobile-load reliability). Heals a half-dead WebSocket (looks
// connected, but the snapshot stream is dead) by forcing a clean reconnect.
//
// Module-level debounce → many concurrent callers (App.jsx V17 visibilitychange
// + online, useResilientLoad, useBranchAwareListener) collapse into ONE toggle,
// so a fleet of stuck listeners can't thrash the network. Non-fatal: a failed
// toggle is swallowed (the SDK keeps its own retry path).
//
// ponytail: single global debounce; per-listener coordination only if profiling
// ever shows real contention.
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase.js';

let lastToggleAt = 0;
let toggling = false;
const DEBOUNCE_MS = 1500;

export async function reconnectFirestore() {
  if (toggling) return;
  if (Date.now() - lastToggleAt < DEBOUNCE_MS) return;
  toggling = true;
  lastToggleAt = Date.now();
  try {
    await disableNetwork(db);
    await enableNetwork(db);
  } catch (err) {
    // Non-fatal — SDK may still recover via its own retries.
    console.warn('[reconnectFirestore] toggle failed:', err?.message || err);
  } finally {
    toggling = false;
  }
}

// Test seam — reset the module-level debounce between unit tests.
export function __resetReconnectDebounceForTest() {
  lastToggleAt = 0;
  toggling = false;
}
