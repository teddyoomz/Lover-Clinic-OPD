// ─── Machine Perf Ratchet (2026-07-20, AV212 rule 8) ────────────────────────
//
// THE 10-YEAR-LAPTOP CLASS. Matrix evidence (machine-degradation-matrix):
// Firestore's local cache has NO indexes — every cache read unpacks stored
// docs, so as the app's working set grew (~45MB IDB today vs ~nothing in the
// early days) the WEAKEST machine crossed a cliff where reading its own cache
// costs MORE than re-pulling the small TFP set over clinic WiFi:
//   M6  no-IDB + decent net        = 1.2s entry
//   M12 warm IDB + CPU×20         = 14-35s entry  ← the laptop's band
// (That is also why "สมัยแรกๆ เครื่องนี้เร็วปกติ" — the IDB was tiny then.)
//
// FIX — adaptive persistence, MEASURED not spec-guessed:
//   · the TFP fast-paint times its pure-CACHE read attempts (network-free —
//     tiny doctors/staff/customer reads). That probe is a direct measurement
//     of THIS machine's IDB+CPU health, immune to WiFi confounds.
//   · ≥2 of the last 3 probes > 1500ms while persistence is ON → stamp
//     `lover.noPersist` → the NEXT boot uses memory cache (same boot path as
//     the lover.idbBroken ratchet in firebase.js). Server pulls on clinic
//     WiFi are FASTER than the grinding IDB for this machine class.
//   · the stamp auto-expires after 14 days → persistence gets retried (data
//     may have shrunk / machine upgraded); if still slow it re-flips within
//     3 TFP opens. Bounded oscillation: at most one retry per 2 weeks.
//   · manual override + cache-wipe live in the 🩺 health card (per-machine).
//
// PURITY: no static firebase import (firebase.js imports THIS at boot —
// a static back-import would cycle). The beacon import is pure-safe.
import { reportTelemetryToBeacon } from './errorBeacon.js';

export const NO_PERSIST_KEY = 'lover.noPersist';
export const PROBE_HIST_KEY = 'lover.cacheProbeHist';
export const NO_PERSIST_TTL_MS = 14 * 24 * 3600 * 1000; // retry persistence every 14d
export const PROBE_SLOW_MS = 1500;                      // a cache read this slow = IDB grinding
export const PROBE_HIST_LEN = 3;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked storage */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* blocked storage */ } }

// 2026-07-21 — the stamp carries a REASON + its own TTL. Two very different
// conditions disable persistence and they must never wear each other's label:
//   'idb-slow'   — AV212: this machine's cache read genuinely costs more than
//                  the network (10-year laptop). 14d TTL.
//   'conn-wedge' — the IndexedDB/primary-lease is WEDGED. Nothing to do with
//                  speed: it happens on an iPhone 17 Pro Max because iOS
//                  freezes a background tab while it holds the Firestore
//                  multi-tab lease. Short TTL — the freeze is transient.
// Legacy stamps (a bare timestamp string) decode as 'idb-slow' + the 14d TTL.
export const NO_PERSIST_REASON_SLOW = 'idb-slow';
export const NO_PERSIST_REASON_WEDGE = 'conn-wedge';

function readNoPersist() {
  const v = lsGet(NO_PERSIST_KEY);
  if (!v) return null;
  if (/^\d+$/.test(v)) return { at: Number(v), reason: NO_PERSIST_REASON_SLOW, ttlMs: NO_PERSIST_TTL_MS };
  try {
    const o = JSON.parse(v);
    const at = Number(o?.at) || 0;
    if (!at) return null;
    const ttlMs = Number(o?.ttlMs) > 0 ? Number(o.ttlMs) : NO_PERSIST_TTL_MS;
    return { at, reason: String(o?.reason || NO_PERSIST_REASON_SLOW), ttlMs };
  } catch { return null; }
}

/** Boot check — true while the no-persist stamp is active (per-reason TTL).
 *  Called by firebase.js at module init; expiry clears the stamp so the
 *  next boot retries persistence. */
export function isNoPersistActive(nowMs = Date.now()) {
  const rec = readNoPersist();
  if (!rec) return false;
  if (nowMs - rec.at > rec.ttlMs) { lsDel(NO_PERSIST_KEY); return false; }
  return true;
}

/** Manual override (health-card toggle) + the auto ratchets. on=true stamps
 *  now with a reason/TTL; false clears + clears the probe history so old slow
 *  samples can't instantly re-flip. */
export function setNoPersist(on, nowMs = Date.now(), { reason = NO_PERSIST_REASON_SLOW, ttlMs = NO_PERSIST_TTL_MS } = {}) {
  if (on) lsSet(NO_PERSIST_KEY, JSON.stringify({ at: nowMs, reason, ttlMs }));
  else { lsDel(NO_PERSIST_KEY); lsDel(PROBE_HIST_KEY); }
}

/** UI state for the health card (reason drives the wording — never call a
 *  fast phone "slow"). */
export function getMachinePerfState(nowMs = Date.now()) {
  const active = isNoPersistActive(nowMs);
  const rec = active ? readNoPersist() : null;
  let hist = [];
  try { hist = JSON.parse(lsGet(PROBE_HIST_KEY) || '[]'); } catch { hist = []; }
  return {
    noPersist: active,
    reason: rec ? rec.reason : null,
    expiresAt: rec ? rec.at + rec.ttlMs : null,
    probeHist: Array.isArray(hist) ? hist : [],
  };
}

/** Record one fast-paint cache-probe measurement. Flip rule: persistence ON
 *  and ≥2 of the last 3 probes over PROBE_SLOW_MS → stamp no-persist for the
 *  next boot + telemetry. Returns 'flipped' | 'recorded' | 'skipped'. */
export function recordCacheProbe(ms, { persistOn, nowMs = Date.now() } = {}) {
  try {
    if (!Number.isFinite(ms) || ms < 0) return 'skipped';
    if (!persistOn) return 'skipped';           // memory-cache probe measures net, not IDB
    if (isNoPersistActive(nowMs)) return 'skipped';
    let hist = [];
    try { hist = JSON.parse(lsGet(PROBE_HIST_KEY) || '[]'); } catch { hist = []; }
    if (!Array.isArray(hist)) hist = [];
    hist.push({ t: nowMs, ms: Math.round(ms) });
    hist = hist.slice(-PROBE_HIST_LEN);
    lsSet(PROBE_HIST_KEY, JSON.stringify(hist));
    const slowCount = hist.filter((h) => h && h.ms > PROBE_SLOW_MS).length;
    if (hist.length >= 2 && slowCount >= 2) {
      setNoPersist(true, nowMs, { reason: NO_PERSIST_REASON_SLOW, ttlMs: NO_PERSIST_TTL_MS });
      // bucketed message (stable dedupe hash) — kind:'telemetry', never counts
      // toward the error alert; visible in the health-card viewer.
      reportTelemetryToBeacon('[client-env] auto-nopersist reason=idb-slow probe=1500ms+ hits=2of3');
      return 'flipped';
    }
    return 'recorded';
  } catch { return 'skipped'; }
}

export function _resetMachinePerfForTests() { lsDel(NO_PERSIST_KEY); lsDel(PROBE_HIST_KEY); }
