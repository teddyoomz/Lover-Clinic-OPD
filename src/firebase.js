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
const canPersist = typeof indexedDB !== 'undefined';
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ...(canPersist ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) } : {}),
});
export const storage = getStorage(app);
export const appId = 'loverclinic-opd-4c39b';
