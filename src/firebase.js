import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20",
  authDomain: "loverclinic-opd-4c39b.firebaseapp.com",
  projectId: "loverclinic-opd-4c39b",
  storageBucket: "loverclinic-opd-4c39b.firebasestorage.app",
  messagingSenderId: "653911776503",
  appId: "1:653911776503:web:9e23f723d3ed877962c7f2",
  measurementId: "G-TB3Q9BZ8R5"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// 2026-06-16 (mobile-load reliability) — experimentalAutoDetectLongPolling:
// use WebSocket when it works (fast), fall back to long-polling automatically
// when the SDK detects the stream is broken. Flaky mobile networks / carrier
// proxies half-connect WebSocket (looks connected but the snapshot stream never
// delivers) → was the #1 cause of "stuck loading / empty skeleton" on mobile.
// ponytail: autoDetect not forceLongPolling — escalate to force only if a
// target carrier ever defeats auto-detection.
//
// 2026-07-07 (instant cold-start, spec Q1=A) — persistent IndexedDB cache:
// every onSnapshot now fires a cache snapshot ~instantly on cold start, then
// the server snapshot follows and corrects it (stale-while-revalidate). This
// REVERSES the 2026-06-16 "fresh-always" decision for STAFF surfaces only —
// customer-facing pages (?session= ?schedule=) opt out via src/lib/freshGate.js
// (render server-confirmed data only), and ?patient= reads /api/patient-view
// (server API — fresh by construction). Write semantics UNCHANGED: awaited
// setDoc/updateDoc resolve on server ack; transactions are server-only (Rule T).
// Feature-detect: node/vitest + private-mode have no IndexedDB → omit localCache
// = memory cache = pre-2026-07-07 behavior. Multi-tab manager: staff opens
// frontend + backend tabs simultaneously (single shared cache, no lease fight).
// AV208 (2026-07-18, TFP entry SWR) — cacheSizeBytes 40MB(default) → 200MB.
// The staff-app working set is ~17.6MB raw JSON ≈ ~44MB in IndexedDB — AT the
// 40MB default cap, so heavy-use clinic machines LRU-evicted TFP's query
// targets between opens → every TFP open became a cold ~630KB pull → spinner
// hangs on weak clinic WiFi. 200MB stops the churn; NOT unlimited so GC stays
// as a multi-year backstop. Recurring check: scripts/diag-staffapp-working-set.mjs
// Degradation-matrix M7 (2026-07-20) — a machine whose IndexedDB THROWS on
// open (corrupt Chrome profile / disk-full / AV interference) trips a Firestore
// INTERNAL ASSERTION (ID: b815) that crashes the whole React tree — the SDK's
// graceful memory fallback only covers the ASYNC open-error path, not a
// synchronous throw. Pre-flight probe: (a) catch sync throws NOW, (b) if the
// open fails ASYNC, stamp a localStorage flag so the NEXT load (the error
// boundary's "โหลดหน้าใหม่") boots on memory cache — self-healing in 1 reload.
const IDB_BROKEN_FLAG = 'lover.idbBroken';
function idbHealthy() {
  if (typeof indexedDB === 'undefined') return false;
  // AV212 hunt R1 fix (2026-07-20): the prior version early-RETURNED false when
  // the flag was set, which SKIPPED the probe below — so its onsuccess
  // (the ONLY code that clears the flag) never ran → one transient IDB error
  // downgraded the machine to memory-cache FOREVER (a one-way ratchet, not a
  // self-heal). Fix: ALWAYS run the probe (so a recovered machine clears the
  // flag on success), and use the flag ONLY to decide THIS boot's cache mode.
  // Net: flag set → memory-cache this session (safe) + probe clears it on
  // success → NEXT boot recovers persistence (1-session-delayed self-heal).
  let flagged = false;
  try { flagged = localStorage.getItem(IDB_BROKEN_FLAG) === '1'; }
  catch { /* storage blocked — treat as not-flagged; probe still decides */ }
  try {
    const req = indexedDB.open('lover-idb-preflight');
    req.onsuccess = () => {
      try { req.result.close(); localStorage.removeItem(IDB_BROKEN_FLAG); } catch {}
    };
    req.onerror = () => {
      try { localStorage.setItem(IDB_BROKEN_FLAG, '1'); } catch {}
    };
    // A prior-boot failure → stay memory-cache THIS session; the probe above
    // still runs and (on success) clears the flag for the next boot.
    return !flagged;
  } catch {
    try { localStorage.setItem(IDB_BROKEN_FLAG, '1'); } catch {}
    return false;
  }
}
const canPersist = idbHealthy();
// exposed for the client-env beacon (degradation telemetry) — NOT for app logic
export const firestorePersistenceEnabled = canPersist;
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ...(canPersist ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 200 * 1024 * 1024 }) } : {}),
});
export const storage = getStorage(app);
export const appId = 'loverclinic-opd-4c39b';
