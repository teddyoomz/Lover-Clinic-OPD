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
import { setNoPersist, isNoPersistActive } from './machinePerf.js';

export const WEDGE_RELOAD_KEY = 'lover.wedgeReloadAt';
export const NO_PERSIST_ESCALATED_KEY = 'lover.noPersistEscalatedAt';
/** A wedge within this window of a wedge-reload proves the reload did NOT heal. */
export const RELOAD_HEAL_WINDOW_MS = 90 * 1000;
/** At most one persistence downgrade per hour — the anti-loop cap. */
export const ESCALATION_COOLDOWN_MS = 60 * 60 * 1000;

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
 * Reads the storage ladder, applies the pure decision, and — only on
 * 'escalate' — stamps lover.noPersist (via machinePerf, so the health-card
 * toggle/TTL/wipe all apply) + telemetry. Never throws, never reloads.
 * @returns {'escalate'|'no-recent-reload'|'cooldown'|'already-memory-cache'}
 */
export function escalateWedgeIfReloadFailed(nowMs = Date.now()) {
  try {
    const decision = decideWedgeEscalation({
      nowMs,
      lastReloadAt: lsGet(WEDGE_RELOAD_KEY),
      lastEscalatedAt: lsGet(NO_PERSIST_ESCALATED_KEY),
      noPersistActive: isNoPersistActive(nowMs),
    });
    if (decision !== 'escalate') return decision;
    setNoPersist(true, nowMs);                       // next boot = memory cache (14d TTL)
    lsSet(NO_PERSIST_ESCALATED_KEY, String(nowMs));
    // bucketed message (stable dedupe hash) — kind:'telemetry', never counts
    // toward the error alert; visible in the health-card viewer.
    reportTelemetryToBeacon('[conn-wedge] escalate=no-persist reason=reload-did-not-heal');
    return 'escalate';
  } catch { return 'no-recent-reload'; }
}

export function _resetWedgeEscalationForTests() {
  try { localStorage.removeItem(WEDGE_RELOAD_KEY); } catch { /* blocked */ }
  try { localStorage.removeItem(NO_PERSIST_ESCALATED_KEY); } catch { /* blocked */ }
}
