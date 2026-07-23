// ─── Wedge Escalation Ladder (2026-07-21) — the rung AV214 was missing ──────
//
// FIELD EVIDENCE (client_error_log, iPhone PWA 2026-07-21):
//   13:23:03  [conn-wedge] reconnect toggle timed out (client wedged)
//   13:23:09  [conn-wedge] hard-reload (resilient-retry-escalation)   ← ladder ran
//   13:23:22  [conn-wedge] reconnect toggle timed out (client wedged) ← WEDGED AGAIN
// 13s after the reload = 8s soft-timeout + 4s reconnect timebox + overhead. The
// beacon POSTs themselves SUCCEEDED, so the device's network was fine — only the
// Firestore path hung. User: "กดเข้าแอปแล้วตายแบบนี้รัวๆ กดลองใหม่ก็ยังตาย".
//
// ROOT CAUSE: AV214's ladder tops out at "hard reload with the SAME persistence
// config". But a wedged IndexedDB / a frozen multi-tab PRIMARY LEASE is ORIGIN
// STORAGE — it survives a reload, so the reload deterministically lands back in
// the wedge. Infinite loop, by construction.
//
// The escape hatch already exists (AV212: boot on memory cache) but was
// UNREACHABLE from this failure:
//   · lover.idbBroken  — only set when IDB open() THROWS or fires onerror; an
//                        open that simply HANGS sets neither (idbHealthy() → true)
//   · lover.noPersist  — only set by the TFP fast-paint cache probe, which can
//                        never run on a client wedged on the appointment hub
//
// THIS MODULE adds the missing rung: when a wedge recurs SHORTLY AFTER a
// wedge-triggered reload (proof the reload did not heal), stamp lover.noPersist
// so the NEXT boot runs memory-cache — no IndexedDB, no lease participation, so
// the wedge class is structurally impossible on that boot. The user's next
// "ลองใหม่" press then heals for real (≤2 presses, the AV214 promise kept).
//
// DELIBERATELY NOT auto-reloading (AV214 invariant: hard reload stays
// user-initiated → no reload-loop risk). Escalation is capped at once per hour;
// past that the ladder STOPS and the error banner stands (honest, actionable).
// The stamp carries machinePerf's 14-day TTL + health-card toggle + cache wipe,
// so a machine whose real problem was elsewhere self-heals back to persistence.
import { reportTelemetryToBeacon } from './errorBeacon.js';
import { setNoPersist, isNoPersistActive, NO_PERSIST_REASON_WEDGE } from './machinePerf.js';

export const WEDGE_RELOAD_KEY = 'lover.wedgeReloadAt';
export const NO_PERSIST_ESCALATED_KEY = 'lover.noPersistEscalatedAt';
/** A wedge within this window of a wedge-reload proves the reload did NOT heal. */
export const RELOAD_HEAL_WINDOW_MS = 90 * 1000;
/** At most one persistence downgrade per hour — the anti-loop cap. */
export const ESCALATION_COOLDOWN_MS = 60 * 60 * 1000;
/** Wedge downgrades expire FAST (24h): a frozen tab / stuck lease is transient,
 *  and this is NOT the AV212 slow-machine case (fast phones wedge too), so the
 *  device must get its offline cache + instant cold start back quickly. */
export const WEDGE_NO_PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 3000;
// Public project id (same value ships in src/firebase.js) — kept literal so
// this module stays free of the firebase import graph (pure + unit-testable).
const REACHABILITY_URL =
  'https://firestore.googleapis.com/v1/projects/loverclinic-opd-4c39b/databases/(default)/documents/__reachability__/__probe__';

/**
 * Is the Firestore BACKEND reachable right now, judged OUTSIDE the SDK?
 *
 * This is the measurement that separates the two wedge flavors — and the whole
 * reason a fast phone must never be labelled "slow":
 *   reachable   → the network is fine, so the hang is CLIENT-side state
 *                 (wedged IndexedDB / frozen multi-tab lease) → downgrading
 *                 persistence for the next boot genuinely heals it.
 *   unreachable → the path to firestore.googleapis.com is blocked/half-dead
 *                 (captive portal, carrier proxy, flaky WiFi). Dropping the
 *                 local cache would only make that WORSE — do NOT escalate.
 * A plain fetch cannot be blocked by the SDK's wedged async queue, so the
 * answer is trustworthy even while every Firestore op hangs. ANY HTTP response
 * (403/404 included) proves the round trip; only a network error/timeout does not.
 * @returns {Promise<'reachable'|'unreachable'>}
 */
export async function probeFirestoreReachable(fetchFn, timeoutMs = PROBE_TIMEOUT_MS) {
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!f) return 'unreachable';
  let timer = null;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const p = f(REACHABILITY_URL, { method: 'GET', cache: 'no-store', ...(ctrl ? { signal: ctrl.signal } : {}) });
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => { try { ctrl?.abort(); } catch { /* noop */ } rej(new Error('probe-timeout')); }, timeoutMs);
    });
    await Promise.race([p, timeout]);
    return 'reachable';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked storage */ } }

/** Stamp the moment of a wedge-triggered reload (called just before reloading). */
export function noteWedgeReload(nowMs = Date.now()) {
  lsSet(WEDGE_RELOAD_KEY, String(nowMs));
}

/**
 * Pure decision — no storage, no side effects (injectable for tests).
 * @returns {'escalate'|'no-recent-reload'|'cooldown'|'already-memory-cache'}
 */
export function decideWedgeEscalation({ nowMs, lastReloadAt, lastEscalatedAt, noPersistActive } = {}) {
  if (noPersistActive) return 'already-memory-cache';   // already booting memory-cache; nothing left to downgrade
  const reloadAt = Number(lastReloadAt) || 0;
  if (!reloadAt || nowMs - reloadAt > RELOAD_HEAL_WINDOW_MS) return 'no-recent-reload';
  const escAt = Number(lastEscalatedAt) || 0;
  if (escAt && nowMs - escAt < ESCALATION_COOLDOWN_MS) return 'cooldown';
  return 'escalate';
}

/**
 * Called by firestoreReconnect when a toggle times out (client wedged).
 * Ladder → reachability probe → (only then) stamp. Never throws, never reloads.
 * @returns {Promise<'escalate'|'no-recent-reload'|'cooldown'|'already-memory-cache'|'backend-unreachable'>}
 */
export async function escalateWedgeIfReloadFailed(nowMs = Date.now(), fetchFn) {
  try {
    const decision = decideWedgeEscalation({
      nowMs,
      lastReloadAt: lsGet(WEDGE_RELOAD_KEY),
      lastEscalatedAt: lsGet(NO_PERSIST_ESCALATED_KEY),
      noPersistActive: isNoPersistActive(nowMs),
    });
    if (decision !== 'escalate') return decision;
    // Only downgrade persistence once we've PROVEN the backend is reachable —
    // i.e. the hang is client-side state, not the network. Dropping the local
    // cache on a blocked/half-dead network would make things strictly worse
    // (and mislabel a perfectly fast device).
    const reach = await probeFirestoreReachable(fetchFn);
    if (reach !== 'reachable') {
      reportTelemetryToBeacon('[conn-wedge] no-escalate reason=firestore-unreachable (network path, not client state)');
      return 'backend-unreachable';
    }
    setNoPersist(true, nowMs, { reason: NO_PERSIST_REASON_WEDGE, ttlMs: WEDGE_NO_PERSIST_TTL_MS });
    lsSet(NO_PERSIST_ESCALATED_KEY, String(nowMs));
    // bucketed message (stable dedupe hash) — kind:'telemetry', never counts
    // toward the error alert; visible in the health-card viewer.
    reportTelemetryToBeacon('[conn-wedge] escalate=no-persist reason=reload-did-not-heal backend=reachable');
    return 'escalate';
  } catch { return 'no-recent-reload'; }
}

/**
 * Firestore INTERNAL ASSERTION (ca9/b815) handler — registered by main.jsx onto
 * the error beacon (setFirestoreAssertionHandler). The assertion means the SDK's
 * internal state is corrupt (open bug firebase-js-sdk#9267) and only a reload
 * recovers; a recurrence within RELOAD_HEAL_WINDOW_MS of a wedge-reload proves
 * the reload did NOT heal → escalateWedgeIfReloadFailed downgrades the NEXT boot
 * to memory-cache (dropping persistentMultipleTabManager, one of the two
 * documented triggers). Reuses the ENTIRE AV214 ladder — reachability probe,
 * once-per-hour cap, 24h TTL, no auto-reload. First occurrence = no-op (no
 * recent wedge-reload yet); the user-initiated reload (retry ladder hardReloadApp
 * / AppErrorBoundary) stamps WEDGE_RELOAD, so the recurrence escalates. Firebase-
 * free (no firebase import) — safe for the pre-boot beacon's graph. Never throws.
 */
export function onFirestoreAssertion(nowMs = Date.now(), fetchFn) {
  try { reportTelemetryToBeacon('[fs-assert] firestore internal assertion (ca9/b815) — routed to wedge ladder'); } catch { /* best-effort */ }
  try { return escalateWedgeIfReloadFailed(nowMs, fetchFn); } catch { return Promise.resolve('no-recent-reload'); }
}

export function _resetWedgeEscalationForTests() {
  try { localStorage.removeItem(WEDGE_RELOAD_KEY); } catch { /* blocked */ }
  try { localStorage.removeItem(NO_PERSIST_ESCALATED_KEY); } catch { /* blocked */ }
}
