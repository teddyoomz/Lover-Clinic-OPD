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
//   2. still failing → resolve to a friendly recovery panel instead of
//      rejecting — the APP STAYS ALIVE (menu, other tabs keep working)
//   3. beacon-report the failure as TELEMETRY (2026-07-23) — a chunk-load
//      failure is self-healing churn (in-loop retries + a reload fetching a
//      fresh index.html recover it) that SPIKES on deploy days when a user on
//      an old tab requests deleted chunk hashes. Reported as kind:'telemetry'
//      so it stays visible in the health-card viewer but never trips the daily
//      error alert (which is reserved for real runtime crashes). Pre-2026-07-23
//      it was kind:'error' → 4 benign post-deploy chunk churn events tripped the
//      5/24h threshold on 2026-07-22 (a cry-wolf 🟡).
//
// AV212 hunt R1 fixes (2026-07-20):
//   - The panel is a FIXED full-screen overlay (was an in-flow 40vh div): many
//     lazy hosts render into a fixed-overlay Suspense slot (TFP, walk-in appt
//     modal, StaffChatWidget) — an in-flow panel landed at the bottom of a long
//     page, below the fold, so the recovery button was off-viewport (dead view).
//     A fixed overlay is always visible. It is DISMISSABLE (a passive widget's
//     chunk failure shouldn't lock the screen) — dismiss hides it; reload fixes.
//   - Type-aware copy: a network fetch failure blames the connection; a module-
//     EVALUATION error (bad deploy / top-level throw) shows a neutral message
//     (reload/WiFi cannot fix an eval error → don't send staff chasing WiFi).
// Known limit: React.lazy caches the resolved fallback for the session; reload
// re-fetches a fresh index.html (new chunk hashes) and recovers. On iOS WebKit
// the module map poison-caches a failed specifier so the in-loop retries are a
// no-op there — reload is the real iOS recovery (hence the short backoff).
import React from 'react';
import { reportTelemetryToBeacon } from './errorBeacon.js';

function isNetworkChunkError(err) {
  const m = String((err && err.message) || err || '');
  // Chromium/WebKit dynamic-import network failures + Vite's own message.
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i.test(m);
}

export function ChunkLoadFallback({ networkCause = true }) {
  const [hidden, setHidden] = React.useState(false);
  if (hidden) return null;
  return (
    <div
      role="alertdialog"
      aria-label="โหลดหน้าไม่สำเร็จ"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'rgba(10,10,10,0.55)', backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 440, background: '#141414', color: '#f5f5f5', borderRadius: 16, padding: '28px 24px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>{networkCause ? '📶' : '⚠️'}</div>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>โหลดหน้านี้ไม่สำเร็จ</p>
        <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 18 }}>
          {networkCause
            ? 'การเชื่อมต่ออินเทอร์เน็ตมีปัญหาระหว่างโหลด — ตรวจสัญญาณแล้วกดลองใหม่'
            : 'เกิดข้อผิดพลาดในการแสดงผล ระบบบันทึกปัญหาไว้แล้ว — กดโหลดใหม่อีกครั้ง'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            data-testid="chunk-load-retry"
            onClick={() => { try { window.location.reload(); } catch { /* noop */ } }}
            style={{ padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, background: '#0f766e', color: '#fff' }}
          >โหลดใหม่</button>
          <button
            type="button"
            data-testid="chunk-load-dismiss"
            onClick={() => setHidden(true)}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #333', cursor: 'pointer', fontWeight: 600, background: 'transparent', color: '#cbd5e1' }}
          >ปิด</button>
        </div>
      </div>
    </div>
  );
}

const RETRIES = 2;
const BASE_DELAY_MS = 700; // short — iOS poison-caches the specifier so retries only help Chromium; reload is the universal recovery

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
    try {
      reportTelemetryToBeacon(`[lazy-chunk] ${String((lastErr && lastErr.message) || lastErr || 'chunk load failed')}`);
    } catch { /* silent */ }
    const networkCause = isNetworkChunkError(lastErr);
    return { default: () => React.createElement(ChunkLoadFallback, { networkCause }) };
  });
}
