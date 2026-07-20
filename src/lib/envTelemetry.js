// ─── Env Telemetry (2026-07-20, degradation-matrix) ─────────────────────────
//
// Answers "เครื่องนี้ช้าเพราะเครื่องหรือเพราะระบบ?" with DATA instead of guesses.
// Two reports, both kind:'telemetry' (excluded from the infra-health error
// count — a chronically slow mini PC must not trip the daily error alert):
//
//   1. reportDegradedEnvOnce() — once per session, ONLY when the machine is
//      degraded (Firestore persistence off / IndexedDB broken / tiny storage
//      quota). Healthy machines send NOTHING.
//   2. reportTfpSlowEntry() — when a TFP entry took >10s (bucketed so the
//      beacon dedupe collapses repeats), with the machine facts attached.
//
// Both surface in the "🩺 สุขภาพระบบ" error viewer → the admin can SEE which
// clinic machine is the slow one and WHY (no cache / weak CPU / bad WiFi).
// SAFETY: every path try/catch — telemetry must never make anything worse.
import { reportTelemetryToBeacon } from './errorBeacon.js';
import { firestorePersistenceEnabled } from '../firebase.js';

let envReported = false;

/** Stable machine-facts string (bucketed — stable text → stable dedupe hash). */
export function machineFacts() {
  try {
    const n = typeof navigator !== 'undefined' ? navigator : {};
    // AV212 hunt R1: only STABLE per-device facts here. connection.effectiveType
    // was dropped — it flaps (4g↔3g by measured RTT) on the exact weak-WiFi
    // machines this reports on, giving each entry a new message → a new dedupe
    // hash → the 5-min dedupe never collapsed repeats + burned the shared
    // 20/session beacon budget. cores/mem are fixed per device → stable hash.
    return `cores=${n.hardwareConcurrency ?? '?'} mem=${n.deviceMemory ?? '?'}GB`;
  } catch { return 'facts=unavailable'; }
}

/** ms → stable bucket label so repeated slow entries share one dedupe hash. */
export function slownessBucket(ms) {
  if (ms >= 60000) return '60s+';
  if (ms >= 30000) return '30-60s';
  if (ms >= 15000) return '15-30s';
  return '10-15s';
}

/** Fire once per session, only when degraded. Called from main.jsx post-boot. */
export async function reportDegradedEnvOnce() {
  try {
    if (envReported) return;
    envReported = true;
    const idbAbsent = typeof indexedDB === 'undefined';
    let reason = '';
    if (idbAbsent) reason = 'idb-absent';
    else if (!firestorePersistenceEnabled) reason = 'idb-broken-or-flagged';
    let quotaNote = '';
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const { quota = 0, usage = 0 } = await navigator.storage.estimate();
        const qMB = Math.round(quota / (1024 * 1024) / 50) * 50; // 50MB buckets
        const uMB = Math.round(usage / (1024 * 1024) / 10) * 10;
        if (quota > 0 && quota < 300 * 1024 * 1024) {
          if (!reason) reason = 'quota-low';
          quotaNote = ` quota=${qMB}MB used=${uMB}MB`;
        }
      }
    } catch { /* estimate unavailable — fine */ }
    if (!reason) return; // healthy machine → silence
    reportTelemetryToBeacon(`[client-env] persist=${firestorePersistenceEnabled ? 'on' : 'off'} reason=${reason}${quotaNote} ${machineFacts()}`);
  } catch { /* silent */ }
}

/** TFP entry took >10s → report the bucket + machine facts. */
export function reportTfpSlowEntry({ ms, timedOut = false } = {}) {
  try {
    if (!Number.isFinite(ms) || ms < 10000) return;
    reportTelemetryToBeacon(
      `[tfp-slow] bucket=${slownessBucket(ms)} timedOut=${timedOut ? 'y' : 'n'} persist=${firestorePersistenceEnabled ? 'on' : 'off'} ${machineFacts()}`
    );
  } catch { /* silent */ }
}

export function _resetEnvTelemetryForTests() { envReported = false; }
