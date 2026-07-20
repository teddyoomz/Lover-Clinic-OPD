// ─── lazyRetry (2026-07-20, degradation-matrix M10) ─────────────────────────
//
// BUG CLASS: React.lazy(() => import(...)) rejects when the chunk fetch fails
// (WiFi blip / captive portal / true offline on a view not yet visited this
// session) → the rejection hits AppErrorBoundary → the ENTIRE app is replaced
// by the crash screen. Matrix M10 caught it: hard-offline + click "บันทึกการรักษา"
// → "Failed to fetch dynamically imported module: TreatmentFormPage.jsx" →
// boundary. 79 lazy sites across App/AdminDashboard/BackendDashboard/Filler
// shared the class.
//
// FIX (chokepoint): every host file aliases `lazyRetry as lazy`, so all 79
// callsites route through this wrapper with ZERO callsite edits:
//   1. retry the import up to 2× with backoff (rides out blips; a chunk the
//      SW has cached never gets here — /assets is CacheFirst per AV207)
//   2. still failing → resolve to a FRIENDLY in-place panel (Thai copy +
//      reload button) instead of rejecting — the APP STAYS ALIVE (menu, other
//      tabs, everything already mounted keeps working)
//   3. beacon-report the failure (kind 'error' — a chunk that can't load after
//      retries IS an error worth counting)
// Known limit: React.lazy caches the resolved fallback for the session — the
// panel's ลองใหม่ does a full reload (URL preserved → lands back in place).
import React from 'react';
import { reportErrorToBeacon } from './errorBeacon.js';

export function ChunkLoadFallback() {
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>📶</div>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>โหลดหน้านี้ไม่สำเร็จ</p>
        <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>
          การเชื่อมต่ออินเทอร์เน็ตมีปัญหาระหว่างโหลด — ตรวจสัญญาณแล้วกดลองใหม่
        </p>
        <button
          type="button"
          data-testid="chunk-load-retry"
          onClick={() => { try { window.location.reload(); } catch { /* noop */ } }}
          style={{ padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, background: '#0f766e', color: '#fff' }}
        >ลองใหม่</button>
      </div>
    </div>
  );
}

const RETRIES = 2;
const BASE_DELAY_MS = 1200;

/** Drop-in React.lazy replacement — import with retry + alive-app fallback. */
export function lazyRetry(importFn) {
  return React.lazy(async () => {
    let lastErr;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        return await importFn();
      } catch (e) {
        lastErr = e;
        if (attempt < RETRIES) {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * (attempt + 1)));
        }
      }
    }
    try { reportErrorToBeacon(lastErr, { source: 'lazy-chunk' }); } catch { /* silent */ }
    return { default: ChunkLoadFallback };
  });
}
