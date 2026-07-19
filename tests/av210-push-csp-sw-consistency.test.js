// AV210 (2026-07-19) — CSP ↔ service-worker importScripts consistency.
//
// Origin: WS4 (d48f79b6, 2026-06-10) added a site-wide CSP whose script-src
// lacked https://www.gstatic.com. Installed FCM SWs never re-evaluate, so push
// kept working — until AV207 (d922c8e4, 2026-07-07) moved the FCM SW to its
// own scope, forcing a FRESH registration + evaluation on every device:
// importScripts(gstatic) blocked by CSP → "ServiceWorker script evaluation
// failed" (Chrome) / "NetworkError: A network error occurred." (WebKit) →
// self-heal + manual enable dead fleet-wide; old subscriptions stranded on the
// handler-less app-shell sw.js swallowed every send silently for 12 days.
//
// Invariant: the CSP served on a service-worker script path MUST allowlist
// every importScripts origin of that script — and the PAGE CSP must NOT be
// widened to do it (gstatic hosts known CSP-bypass gadgets, e.g. old AngularJS).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const vercelJson = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const fcmSw = readFileSync(path.join(ROOT, 'public', 'firebase-messaging-sw.js'), 'utf8');
const adminDash = readFileSync(path.join(ROOT, 'src', 'pages', 'AdminDashboard.jsx'), 'utf8');

const headerRules = vercelJson.headers || [];
const globalRuleIdx = headerRules.findIndex(r => r.source === '/(.*)');
const swRuleIdx = headerRules.findIndex(r => r.source === '/firebase-messaging-sw.js');
const getCsp = (rule) => (rule?.headers || []).find(h => h.key === 'Content-Security-Policy')?.value || '';
const scriptSrcOf = (csp) => (csp.match(/script-src ([^;]+)/) || [])[1] || '';

describe('AV210.C1 — dedicated FCM-SW header rule exists after the global rule', () => {
  it('has a /firebase-messaging-sw.js headers rule', () => {
    expect(swRuleIdx).toBeGreaterThan(-1);
  });
  it('is positioned AFTER /(.*) so its CSP wins on duplicate keys (Vercel later-wins)', () => {
    expect(globalRuleIdx).toBeGreaterThan(-1);
    expect(swRuleIdx).toBeGreaterThan(globalRuleIdx);
  });
  it('serves the SW no-cache (mirror of the sw.js rule — SW scripts must not go stale)', () => {
    const cc = (headerRules[swRuleIdx].headers || []).find(h => h.key === 'Cache-Control')?.value || '';
    expect(cc).toMatch(/no-cache/);
  });
});

describe('AV210.C2/C3 — every importScripts origin is allowlisted in the SW-path script-src', () => {
  const swCsp = getCsp(headerRules[swRuleIdx]);
  const swScriptSrc = scriptSrcOf(swCsp);
  it('SW-path CSP has a script-src with self', () => {
    expect(swScriptSrc).toMatch(/'self'/);
  });
  it('EVERY cross-origin importScripts origin in the SW appears in the SW-path script-src', () => {
    const origins = [...fcmSw.matchAll(/importScripts\(['"](https?:\/\/[^/'"]+)/g)].map(m => m[1]);
    expect(origins.length).toBeGreaterThan(0); // the SW currently imports gstatic
    for (const origin of origins) {
      expect(swScriptSrc, `origin ${origin} must be allowlisted in the /firebase-messaging-sw.js CSP script-src`).toContain(origin);
    }
  });
});

describe('AV210.C4 — page-global CSP stays hardened (WS4 intent preserved)', () => {
  it('global /(.*) script-src does NOT gain gstatic (CSP-bypass gadget host)', () => {
    const pageScriptSrc = scriptSrcOf(getCsp(headerRules[globalRuleIdx]));
    expect(pageScriptSrc).not.toContain('gstatic.com');
  });
});

describe('AV210.C5/C6 — legacy root-scope zombie subscription cleanup wired at both mint sites', () => {
  it('cleanup helper exists, guards the root scope, and unsubscribes', () => {
    expect(adminDash).toMatch(/cleanupLegacyRootPushSubscription = async \(\) =>/);
    expect(adminDash).toMatch(/getRegistration\('\/'\)/);
    expect(adminDash).toMatch(/firebase-cloud-messaging-push-scope'\)\) return;/);
    expect(adminDash).toMatch(/legacySub\.unsubscribe\(\)/);
  });
  it('enablePushNotifications calls cleanup AFTER the token save', () => {
    const enable = adminDash.slice(adminDash.indexOf('const enablePushNotifications'), adminDash.indexOf('const disablePushNotifications'));
    const saveIdx = enable.indexOf('setDoc(tokensRef');
    const cleanupIdx = enable.indexOf('cleanupLegacyRootPushSubscription()');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeGreaterThan(saveIdx);
  });
  it('self-heal calls cleanup unconditionally (dedup no longer early-returns past it)', () => {
    const healIdx = adminDash.indexOf('[push self-heal] failed');
    const heal = adminDash.slice(healIdx - 2200, healIdx);
    expect(heal).toMatch(/if \(!existing\.some/); // fall-through shape, not `if (existing.some(...)) return;`
    expect(heal).toContain('cleanupLegacyRootPushSubscription()');
  });
});

describe('AV210.C7 — FCM SW shape sanity (regression locks)', () => {
  it('SW still registers the notificationclick handler', () => {
    expect(fcmSw).toMatch(/addEventListener\('notificationclick'/);
  });
  it('SW initializes firebase messaging (compat) — display path unchanged from the proven pre-WS4 era', () => {
    expect(fcmSw).toMatch(/firebase\.messaging\(\)/);
  });
});
