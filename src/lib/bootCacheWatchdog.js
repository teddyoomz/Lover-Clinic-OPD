// ─── Boot Cache Watchdog (2026-07-21) — "ครั้งแรกก็ไม่เจอ" ───────────────────
//
// The recovery ladder (AV214 + the 2026-07-21 memory-cache rung) makes a wedge
// heal in ≤2 presses. The user's follow-up: "เอาแบบครั้งแรกก็ไม่เป็นเลยไม่ได้เหรอ".
// Fair — a heal the human has to trigger is still a failure they SAW.
//
// Why the failure is visible at all: nothing checks the local cache layer until
// real data is already late. The chain is
//     boot → listeners/loads hang → 8s soft-timeout → 4s reconnect timebox →
//     red banner → user presses → reload
// so the first ~12 seconds of a wedged boot are spent DISCOVERING the wedge.
//
// This watchdog discovers it in ~3s instead, before any of that surfaces:
// right after boot it issues ONE cache-only read and races it against a timer.
//   settles (found OR not-found, both fine) → the persistence layer is alive;
//                                             zero further cost, never runs again
//   never settles                           → the local layer is wedged (a
//                                             cache read touches NO network, so
//                                             a hang can only be local) → stamp
//                                             memory-cache + reload ONCE, while
//                                             the app is still on its loading
//                                             screen. The user sees a slightly
//                                             longer first load, then a working
//                                             app — no banner, no press.
//
// Safety (an auto-reload is the one thing that must never loop):
//   · only when persistence is actually ON (after the flip it can't re-arm)
//   · one auto-reload per BOOT_RELOAD_COOLDOWN_MS, stamped in localStorage
//   · a settled-but-rejected read counts as HEALTHY (an empty cache rejects
//     immediately — a brand-new device must never be downgraded)
//   · every step is try/catch'd; a broken watchdog can never break the app
//
// Considered and rejected: switching persistentMultipleTabManager →
// persistentSingleTabManager. It would remove the multi-tab LEASE, but both
// managers still share the same IndexedDB, so a sibling frozen mid-transaction
// can still block — an unverified behavioural change with a real cost (the
// second staff tab loses its cache). This watchdog heals the symptom whatever
// the underlying flavour is.
import { reportTelemetryToBeacon } from './errorBeacon.js';
import { setNoPersist, NO_PERSIST_REASON_WEDGE } from './machinePerf.js';

export const BOOT_PROBE_TIMEOUT_MS = 3000;
export const BOOT_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;
export const WEDGE_NO_PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
export const BOOT_RELOAD_KEY = 'lover.bootCacheReloadAt';

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked storage */ } }

// Field/L1 observability: the boot call's verdict, readable from the console
// (or a Chrome-MCP probe) via the SAME module instance the app booted with.
// Without this a mistyped doc path would reject instantly, count as "healthy",
// and leave the watchdog a silent no-op — indistinguishable from success.
let lastVerdict = 'not-run';
export function getLastBootWatchdogVerdict() { return lastVerdict; }

/** Pure — may we auto-reload right now? (anti-loop cap) */
export function canAutoReload(nowMs, lastReloadAt) {
  const last = Number(lastReloadAt) || 0;
  return !last || nowMs - last > BOOT_RELOAD_COOLDOWN_MS;
}

/**
 * @param {object} o
 * @param {() => Promise<any>} o.cacheRead  one cache-only read (settle = healthy)
 * @param {boolean} o.enabled               firestorePersistenceEnabled
 * @param {() => void} o.reload             injected for tests
 * @returns {Promise<'healthy'|'skipped-no-persistence'|'wedged-reloading'|'wedged-cooldown'>}
 */
export async function runBootCacheWatchdog({ cacheRead, enabled, reload, nowMs = Date.now(), timeoutMs = BOOT_PROBE_TIMEOUT_MS } = {}) {
  try {
    if (!enabled) { lastVerdict = 'skipped-no-persistence'; return lastVerdict; }
    let timer = null;
    const probe = Promise.resolve()
      .then(() => cacheRead())
      .then(() => 'settled', () => 'settled');   // found | not-found | rejected → all HEALTHY
    const timeout = new Promise((res) => { timer = setTimeout(() => res('timeout'), timeoutMs); });
    const verdict = await Promise.race([probe, timeout]);
    if (timer) clearTimeout(timer);
    if (verdict === 'settled') { lastVerdict = 'healthy'; return lastVerdict; }

    if (!canAutoReload(nowMs, lsGet(BOOT_RELOAD_KEY))) {
      // Already auto-reloaded recently and it is STILL wedged → stop reloading
      // and let the visible ladder (banner → press → reload) own it, so a
      // pathological device can never spin.
      reportTelemetryToBeacon('[conn-wedge] boot-probe timeout (cooldown — no auto-reload)');
      lastVerdict = 'wedged-cooldown';
      return lastVerdict;
    }
    // The local cache layer is hung: switch this device to memory cache and
    // restart while the app is still painting its loading state.
    setNoPersist(true, nowMs, { reason: NO_PERSIST_REASON_WEDGE, ttlMs: WEDGE_NO_PERSIST_TTL_MS });
    lsSet(BOOT_RELOAD_KEY, String(nowMs));
    reportTelemetryToBeacon('[conn-wedge] boot-probe timeout → auto memory-cache reload (pre-empted the stuck screen)');
    try { reload ? reload() : window.location.reload(); } catch { /* jsdom */ }
    lastVerdict = 'wedged-reloading';
    return lastVerdict;
  } catch {
    lastVerdict = 'healthy'; // a broken watchdog must never degrade a working app
    return lastVerdict;
  }
}

export function _resetBootWatchdogForTests() {
  try { localStorage.removeItem(BOOT_RELOAD_KEY); } catch { /* blocked */ }
  lastVerdict = 'not-run';
}
