import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
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
// NO offline persistence (Q1 = fresh-always: customers must never see a stale
// course balance / appointment time).
// ponytail: autoDetect not forceLongPolling — escalate to force only if a
// target carrier ever defeats auto-detection.
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const storage = getStorage(app);
export const appId = 'loverclinic-opd-4c39b';
