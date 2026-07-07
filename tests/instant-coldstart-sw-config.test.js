// D1 (2026-07-07 instant cold-start, spec Q4=B) — Service Worker config locks
// (AV207). The SW precaches the STATIC shell only, never intercepts /api or
// googleapis, is updatable (no-cache sw.js + visibilitychange update + toast)
// and killable, and never fights the FCM push SW for scope '/'.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const vite = readFileSync('vite.config.js', 'utf8');
const filler = readFileSync('vite.filler.config.js', 'utf8');
const main = readFileSync('src/main.jsx', 'utf8');
const admin = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
const vercel = readFileSync('vercel.json', 'utf8');

describe('AV207 — Service Worker config locks', () => {
  it('D1.1 VitePWA wired in vite.config.js with manifest:false (public/manifest.json stays canonical — iOS identity)', () => {
    expect(vite).toMatch(/VitePWA\(/);
    expect(vite).toMatch(/manifest:\s*false/);
  });

  it('D1.2 navigateFallback denylists /api — the SW NEVER serves API routes', () => {
    expect(vite).toMatch(/navigateFallbackDenylist/);
    expect(vite).toMatch(/\\\/api\\\//);
  });

  it('D1.3 no cross-origin runtimeCaching — googleapis / Firestore stay network-only', () => {
    // scope the grep to the runtimeCaching CONFIG block, not comments (the
    // AV207 rationale comment legitimately names googleapis — grep-the-code
    // lesson from the tablet-chart saga)
    const rcIdx = vite.indexOf('runtimeCaching');
    expect(rcIdx).toBeGreaterThan(-1);
    const rcBlock = vite.slice(rcIdx, vite.indexOf('}]', rcIdx) + 2);
    expect(rcBlock).not.toMatch(/googleapis|firebaseio|cloudfunctions/);
    // and the only runtime route is the same-origin /assets/ CacheFirst
    expect(rcBlock).toMatch(/\/assets\\\//);
    expect(rcBlock).toMatch(/CacheFirst/);
  });

  it('D1.4 registration is manual (injectRegister:false — CSP script-src hashes stay untouched) + bundled module + prod-only', () => {
    expect(vite).toMatch(/injectRegister:\s*false/);
    expect(main).toMatch(/virtual:pwa-register/);
    expect(main).toMatch(/!import\.meta\.env\.DEV/);
  });

  it('D1.5 single-file sw.js (inlineWorkboxRuntime) + vercel serves it no-cache (updates propagate)', () => {
    expect(vite).toMatch(/inlineWorkboxRuntime:\s*true/);
    expect(vercel).toMatch(/"source":\s*"\/sw\.js"/);
    const idx = vercel.indexOf('"/sw.js"');
    expect(vercel.slice(idx, idx + 300)).toMatch(/no-cache/);
  });

  it('D1.6 FCM push SW registered on its OWN scope at BOTH AdminDashboard sites (never fights Workbox for "/")', () => {
    const matches = admin.match(/register\('\/firebase-messaging-sw\.js',\s*\{\s*scope:\s*'\/firebase-cloud-messaging-push-scope'\s*\}\)/g) || [];
    expect(matches.length).toBe(2);
    // anti-regression: no scope-less registration remains
    expect(admin).not.toMatch(/register\('\/firebase-messaging-sw\.js'\)/);
  });

  it('D1.7 filler standalone build has NO service worker', () => {
    expect(filler).not.toMatch(/VitePWA|vite-plugin-pwa/);
  });

  it('D1.8 update toast mounted at the root (user-visible refresh path + idle auto-reload)', () => {
    const toast = readFileSync('src/components/SwUpdateToast.jsx', 'utf8');
    expect(toast).toMatch(/sw-need-refresh/);
    expect(toast).toMatch(/มีเวอร์ชันใหม่/);
    expect(main).toMatch(/SwUpdateToast/);
  });
});
