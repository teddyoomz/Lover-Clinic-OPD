// perf-lib.mjs — shared perf-measurement library (P0, plan 2026-07-06-performance-audit-optimization)
// Pure helpers (median/aggregateRuns/SURFACES) are vitest-covered by tests/perf-harness-lib.test.js.
// Browser drivers (auth injection, metric observers, collectors) are consumed by
// scripts/perf-baseline.mjs + scripts/perf-visual-parity.mjs (Playwright library mode).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

// ---------- pure helpers ----------
export const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const aggregateRuns = (runs) => {
  const keys = new Set();
  runs.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const out = {};
  for (const k of keys) out[k] = median(runs.map((r) => r[k] ?? 0));
  return out;
};

// ---------- surface catalog ----------
// tab ids MUST match src/components/backend/nav/navConfig.js leaf ids (anti-drift
// test in tests/perf-harness-lib.test.js reads navConfig and asserts each tab= id).
// {TOKEN} placeholders are filled at runtime from docs/perf/links.json
// (produced by scripts/perf-find-links.mjs — Rule R read-only).
export const SURFACES = [
  { id: 'frontend-queue',              url: '/',                                    auth: true },
  { id: 'frontend-appointment-hub',    url: '/',                                    auth: true, interaction: { clickSel: 'text=นัดหมาย' } },
  { id: 'backend-home',                url: '/?backend=1',                          auth: true },
  { id: 'backend-tab-customers',       url: '/?backend=1&tab=customers',            auth: true },
  { id: 'backend-customer-detail',     url: '/?backend=1&customer={CUSTOMER_ID}',   auth: true },
  { id: 'backend-tab-sales',           url: '/?backend=1&tab=sales',                auth: true },
  { id: 'backend-tab-stock',           url: '/?backend=1&tab=stock',                auth: true },
  { id: 'backend-tab-central-stock',   url: '/?backend=1&tab=central-stock',        auth: true },
  { id: 'backend-tab-appointment-all', url: '/?backend=1&tab=appointment-all',      auth: true },
  { id: 'backend-tab-recall',          url: '/?backend=1&tab=recall',               auth: true },
  { id: 'backend-tab-promotions',      url: '/?backend=1&tab=promotions',           auth: true },
  { id: 'backend-tab-reports',         url: '/?backend=1&tab=reports',              auth: true },
  { id: 'backend-tab-reports-df-payout', url: '/?backend=1&tab=reports-df-payout',  auth: true },
  { id: 'backend-tab-staff',           url: '/?backend=1&tab=staff',                auth: true },
  { id: 'backend-tab-products',        url: '/?backend=1&tab=products',             auth: true },
  { id: 'backend-tab-courses',         url: '/?backend=1&tab=courses',              auth: true },
  { id: 'backend-tab-backup-manager',  url: '/?backend=1&tab=backup-manager',       auth: true },
  { id: 'link-schedule',               url: '/?schedule={SCHEDULE_TOKEN}',          auth: false },
  { id: 'link-patient',                url: '/?patient={PATIENT_TOKEN}',            auth: false },
  { id: 'link-session',                url: '/?session={SESSION_ID}',               auth: false },
  { id: 'link-filler',                 url: '/?play=filler',                        auth: false },
];

export function resolveSurfaceUrl(surface, links = {}) {
  const url = surface.url
    .replace('{SCHEDULE_TOKEN}', links.schedule || '')
    .replace('{PATIENT_TOKEN}', links.patient || '')
    .replace('{SESSION_ID}', links.session || '')
    .replace('{CUSTOMER_ID}', links.customer || '');
  return url.includes('{') || /=($|&)/.test(url) && surface.url.includes('{') ? null : url;
}

// ---------- staff auth (mirrors tests/e2e/helpers.js EXACTLY — single source of shape) ----------
const TOKEN_CACHE = path.join(process.cwd(), '.auth/tokens.json');
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL || 'loverclinic@loverclinic.com';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || 'Lover2024';

async function getTokens() {
  try {
    const cached = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached.expiresAt > Date.now()) return cached;
  } catch { /* no cache */ }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Staff auth failed: ${data.error?.message || 'Unknown'}`);
  const tokens = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  writeFileSync(TOKEN_CACHE, JSON.stringify(tokens));
  return tokens;
}

/** Inject Firebase staff auth into a Playwright BrowserContext (before any page). */
export async function injectStaffAuth(context) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  // Shape copied verbatim from tests/e2e/helpers.js injectAuth()
  const authValue = JSON.stringify({
    uid: tokens.localId,
    email: tokens.email,
    emailVerified: false,
    isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
  });
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: authKey, value: authValue });
}

/** Set app theme before first paint (visual-parity captures both themes). */
export async function injectTheme(context, theme) {
  await context.addInitScript((t) => {
    localStorage.setItem('app-theme', t);
  }, theme);
}

// ---------- in-page metric observers (serialized into addInitScript — self-contained) ----------
export function perfObserversInit() {
  window.__perf = { longTasks: [], lcp: 0, fcp: 0, cls: 0 };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.longTasks.push(e.duration))).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => { const es = l.getEntries(); if (es.length) window.__perf.lcp = es[es.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; })).observe({ type: 'paint', buffered: true }); } catch { /* unsupported */ }
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch { /* unsupported */ }
}

/**
 * Wait until the DOM has been mutation-quiet for `quietMs` (settled paint proxy).
 * Firestore WebChannel keeps `networkidle` flaky → mutation-quiet is the
 * deterministic settle signal for this app. Returns elapsed ms (capped).
 */
export async function waitForDomQuiet(page, quietMs = 600, capMs = 15000) {
  return page.evaluate(([q, cap]) => new Promise((resolve) => {
    const t0 = performance.now();
    let last = performance.now();
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const iv = setInterval(() => {
      const now = performance.now();
      if (now - last >= q || now - t0 >= cap) {
        clearInterval(iv); mo.disconnect(); resolve(Math.round(now - t0));
      }
    }, 100);
  }), [quietMs, capMs]);
}

/**
 * Content-settle for SCREENSHOTS: dom-quiet is NOT enough — a loading spinner
 * animates via CSS (no DOM mutations) so dom-quiet can fire mid-load (caught
 * 2026-07-06: baseline parity shots captured spinners). Wait until no
 * .animate-spin is visible, then re-quiet, then a small grace.
 */
export async function waitForContentSettle(page) {
  await waitForDomQuiet(page);
  await page.waitForFunction(
    () => document.querySelectorAll('.animate-spin').length === 0,
    undefined,
    { timeout: 25000 },
  ).catch(() => {});
  await waitForDomQuiet(page);
  // JS-staggered entrance animations (bloom-menu orb mount) render AFTER
  // dom-quiet + spinner-gone — long grace so captures never catch a pre-orb frame.
  await page.waitForTimeout(1500);
}

/** Collect metrics after page settle. Includes a 5s idle-mutation window (re-render-storm proxy). */
export async function collectMetrics(page) {
  const idleMutations = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const mo = new MutationObserver((ms) => { count += ms.length; });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { mo.disconnect(); resolve(count); }, 5000);
  }));
  const base = await page.evaluate(() => {
    const p = window.__perf || { longTasks: [], lcp: 0, fcp: 0, cls: 0 };
    const js = performance.getEntriesByType('resource').filter((r) => /\.js(\?|$)/.test(r.name));
    return {
      FCP_ms: Math.round(p.fcp),
      LCP_ms: Math.round(p.lcp),
      CLS: +p.cls.toFixed(4),
      longTasks_count: p.longTasks.length,
      longTasks_totalMs: Math.round(p.longTasks.reduce((a, b) => a + b, 0)),
      jsTransferred_KB: Math.round(js.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
      jsResources: js.length,
      domNodes: document.querySelectorAll('*').length,
      heapUsed_MB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
    };
  });
  return { ...base, idleMutations_5s: idleMutations };
}

/** Load link tokens produced by scripts/perf-find-links.mjs (optional). */
export function loadLinks() {
  try { return JSON.parse(readFileSync('docs/perf/links.json', 'utf8')); } catch { return {}; }
}
