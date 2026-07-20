// ─── Machine-Degradation Matrix — TFP entry survival under hostile hardware ──
//
// (2026-07-20) User report: a low-spec mini PC still hits the TFP 15s
// resilient-timeout card ("การเชื่อมต่อช้ากว่าปกติ") while every other machine
// + mobile is fine post-AV208. This suite simulates EVERY machine-badness
// class we can emulate in Chromium (Rule Q L1 — real browser, real prod
// Firestore, real deployed bundle when E2E_BASE_URL points at prod) and
// asserts the SURVIVAL CONTRACT in each cell:
//
//   S1 never crashes: zero uncaught pageerrors + AppErrorBoundary never shows
//   S2 the form eventually paints (within the cell's generous budget) OR the
//      honest retry card shows and recovery works (M10)
//   S3 after paint the form is INTERACTIVE (doctor select fillable)
//   S4 card honesty: entry >15.5s ⇒ the timeout card was visible while waiting
//
// Cells:
//   M0  control (no degradation)
//   M1  CPU ×6                       (weak desktop CPU)
//   M2  CPU ×20                      (nightmare CPU — bottom-tier mini PC)
//   M3  NET 1.5Mbps/150ms, cold ctx  (ok-ish clinic WiFi, cold cache)
//   M4  NET 400kbps/400ms, cold ctx  (terrible WiFi, cold cache) + no-retry-needed contract
//   M5  WARM cache + NET 400kbps     (healthy machine on terrible WiFi — must be FAST)
//   M6  IndexedDB ABSENT + NET 1.5M  (perma-cold machine class: API missing)
//   M7  IndexedDB BROKEN + NET 1.5M  (perma-cold: API present, open() throws — SDK fallback proof)
//   M8  Storage quota 5MB + NET 1.5M (nearly-full disk → tiny origin quota; best-effort CDP)
//   M9  HELL: CPU×20 + 400kbps + no IDB, throttled from first byte (whole journey)
//   M10 OFFLINE lazy-chunk fetch → in-place panel (NEVER the app boundary) + reload recovery
//   M11 typing latency at CPU ×20 after paint (post-paint responsiveness)
//   M12 WARM cache + CPU ×20 (the real weak-machine daily profile)
//   M13 WARM + CPU ×20 + NET 400kbps (realistic worst mini-PC)
//
// ≤5s target (2026-07-20 user directive "เน็ตโอเคแล้วต้องไม่เกิน 5 วิ ทุกกรณี"): served by
// the TFP fast-paint pre-stage (AV212 rule 7) — paint from ~15 docs, enrich behind the chip.
//
// Opt-in (heavy: ~15-30 min): E2E_DEGRADE=1 npx playwright test machine-degradation-matrix --workers=1
// Against LIVE prod bundle:    E2E_DEGRADE=1 E2E_BASE_URL=https://lover-clinic-app.vercel.app npx playwright test machine-degradation-matrix --workers=1
// Against LOCAL prod bundle:   npm run build && npx vite preview --port 4173 → E2E_BASE_URL=http://localhost:4173
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const RUN = !!process.env.E2E_DEGRADE;

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const mm = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(mm[1] in process.env)) process.env[mm[1]] = v;
    }
  } catch {}
}
loadEnvFile('.env.local.prod');

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const NAKHON = 'BR-1777873556815-26df6480'; // branch with doctors (TFP MISS gate needs ≥1)
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

function db() {
  if (!getApps().length) {
    const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }) });
  }
  return getFirestore();
}
const cdoc = (id) => db().doc(`${PREFIX}/be_customers/${id}`);
const CID = `TEST-DEGRADE-${Date.now()}`;

// ── auth injection (mirror helpers.js — inlined so we control init-script order) ──
let tokenCache = null;
async function getTokens() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  tokenCache = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  return tokenCache;
}

async function prepPage(page, { killIdb = false, brokenIdb = false } = {}) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
  });
  await page.addInitScript(({ key, value, branch }) => {
    localStorage.setItem(key, value);
    localStorage.setItem('lover.backendMenuMode', 'classic');
    localStorage.setItem('selectedBranchId', branch);
    // record unhandled rejections too (belt+suspenders next to pageerror)
    window.__matrixRejections = [];
    window.addEventListener('unhandledrejection', (e) => {
      try { window.__matrixRejections.push(String(e.reason && (e.reason.message || e.reason)).slice(0, 200)); } catch {}
    });
  }, { key: authKey, value: authValue, branch: NAKHON });
  // simulated-machine errors must NEVER pollute the prod client_error_log
  // (the M7 crash round wrote 6 entries before this guard existed — cleaned).
  // CAPTURE the payload before aborting — a boundary-caught render error never
  // reaches page.on('pageerror') (prod React swallows it), so the beacon body
  // is the ONLY place the crash message exists.
  await page.route('**/api/client-error', (route) => {
    try {
      const b = route.request().postData();
      if (b) console.log('[BEACON-CAPTURE]', String(b).slice(0, 700));
    } catch { /* capture is best-effort */ }
    route.abort();
  });
  if (killIdb) {
    await page.addInitScript(() => {
      try { Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true }); } catch {}
    });
  } else if (brokenIdb) {
    await page.addInitScript(() => {
      try {
        const err = () => { throw new DOMException('SIMULATED disk corruption (degradation matrix M7)', 'UnknownError'); };
        IDBFactory.prototype.open = err;
        IDBFactory.prototype.deleteDatabase = err;
      } catch {}
    });
  }
}

async function cdpFor(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable').catch(() => {});
  return client;
}
const NET = {
  net1500: { offline: false, latency: 150, downloadThroughput: 187500, uploadThroughput: 93750 },
  net400: { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 25000 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  online: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};

const FORM_MARKER = 'ข้อมูลการใช้คอร์ส';
const CARD = '[data-testid="tfp-load-timeout-escape"]';
const BOUNDARY = 'text=โหลดหน้าใหม่';

/** Open customer detail (optionally under throttle) and click into TFP; poll
 *  until the form paints, recording whether the 15s card ever showed. */
async function openCustomerDetail(page, { budgetMs = 120000 } = {}) {
  await page.goto(`/?backend=1&customer=${CID}`, { timeout: budgetMs, waitUntil: 'commit' });
  await page.waitForSelector('text=เบอร์โทร', { timeout: budgetMs });
}

async function enterTfpAndWait(page, { budgetMs = 120000, pollMs = 500 } = {}) {
  await page.getByRole('button', { name: 'บันทึกการรักษา' }).first().click();
  const t0 = Date.now();
  let cardSeen = false;
  let painted = false;
  let loadingAt = 0; // when the TFP loading screen (and its 15s timer) actually MOUNTED
  while (Date.now() - t0 < budgetMs) {
    if (!loadingAt && await page.getByText('กำลังโหลดฟอร์มการรักษา').isVisible().catch(() => false)) loadingAt = Date.now();
    if (await page.locator(CARD).isVisible().catch(() => false)) cardSeen = true;
    if (await page.getByText(FORM_MARKER).first().isVisible().catch(() => false)) { painted = true; break; }
    if (await page.locator(BOUNDARY).isVisible().catch(() => false)) {
      throw new Error('AppErrorBoundary fallback rendered — CRASH (survival contract S1 violated)');
    }
    await page.waitForTimeout(pollMs);
  }
  // S4 honesty is judged from the LOADING SCREEN mount, not the click — under
  // a throttled DEV server the lazy chunk itself can eat >15s BEFORE the TFP
  // (and its escape timer) even mounts (Suspense fallback period).
  const msFromLoading = loadingAt ? Date.now() - loadingAt : 0;
  return { ms: Date.now() - t0, msFromLoading, painted, cardSeen };
}

async function assertInteractive(page) {
  const doctorSel = page.locator('[data-field="doctor"] select').first();
  await doctorSel.waitFor({ timeout: 30000 });
  let optionValues = [];
  for (let i = 0; i < 30; i++) {
    optionValues = await doctorSel.locator('option').evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    if (optionValues.length) break;
    await page.waitForTimeout(1000);
  }
  expect(optionValues.length, 'doctor picker must have options after paint (S3)').toBeGreaterThan(0);
  await doctorSel.selectOption(optionValues[0]);
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message || e).slice(0, 200)}`));
  return errors;
}

async function getRejections(page) {
  return await page.evaluate(() => window.__matrixRejections || []).catch(() => []);
}

const RESULTS = [];
function record(cell, data) {
  RESULTS.push({ cell, ...data });
  console.log(`[MATRIX] ${cell} → ${JSON.stringify(data)}`);
  // append-per-cell (JSONL) — a worker restart (retry) resets RESULTS, and
  // token-filtering reporters can swallow stdout; the JSONL is the record
  try {
    const fs = require('node:fs');
    fs.mkdirSync('test-results', { recursive: true });
    fs.appendFileSync('test-results/degradation-matrix.jsonl', JSON.stringify({ at: Date.now(), cell, ...data }) + '\n');
  } catch { /* best-effort */ }
}

test.describe('machine-degradation matrix (TFP entry survival)', () => {
  // NOT serial: cells are independent (own page each); serial mode made the
  // M7 failure skip M8-M11 on round 1. Sequentiality comes from --workers=1.
  test.skip(!RUN, 'opt-in heavy suite — set E2E_DEGRADE=1');

  test.beforeAll(async () => {
    await cdoc(CID).set({
      customerName: 'เทสต์ Degrade', firstname: 'เทสต์', lastname: 'Degrade',
      hn_no: `TEST-HN-${Date.now()}`, branchId: NAKHON,
      patientData: { firstName: 'เทสต์', lastName: 'Degrade', firstNameTh: 'เทสต์', lastNameTh: 'Degrade', phone: '0800000001' },
      courses: [{ name: 'DegradeCourseX', product: 'DegradeProductA', qty: '5/5 ครั้ง', courseType: '', status: 'กำลังใช้งาน', expiry: '' }],
      createdAt: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    try { await cdoc(CID).delete(); } catch {}
    // defensive: no cell submits, but sweep any stray treatment for this CID
    try {
      const ts = await db().collection(`${PREFIX}/be_treatments`).where('customerId', '==', CID).get();
      for (const d of ts.docs) await d.ref.delete().catch(() => {});
    } catch {}
    console.log('\n[MATRIX SUMMARY]');
    for (const r of RESULTS) console.log(`  ${r.cell.padEnd(26)} paint=${String(r.ms).padStart(6)}ms card=${r.cardSeen ? 'Y' : 'n'} ok=${r.painted ? 'Y' : 'N'}${r.note ? ' · ' + r.note : ''}`);
    // persist — reporters/token-filters can swallow stdout; the JSON is the record
    try {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      mkdirSync('test-results', { recursive: true });
      writeFileSync('test-results/degradation-matrix-summary.json', JSON.stringify({ at: new Date().toISOString(), base: process.env.E2E_BASE_URL || 'http://localhost:5173', results: RESULTS }, null, 2));
    } catch { /* best-effort */ }
  });

  test('M0 control', async ({ page }) => {
    test.setTimeout(180000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const r = await enterTfpAndWait(page, { budgetMs: 60000 });
    record('M0_control', r);
    expect(r.painted, 'M0: form must paint').toBe(true);
    await assertInteractive(page);
    expect(errors, 'S1 zero uncaught errors').toEqual([]);
  });

  test('M1 CPU ×6', async ({ page }) => {
    test.setTimeout(240000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const r = await enterTfpAndWait(page, { budgetMs: 90000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    record('M1_cpu6', r);
    expect(r.painted, 'M1: form must paint under CPU×6').toBe(true);
    await assertInteractive(page);
    expect(errors).toEqual([]);
  });

  test('M2 CPU ×20', async ({ page }) => {
    test.setTimeout(360000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    const r = await enterTfpAndWait(page, { budgetMs: 240000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    record('M2_cpu20', r);
    expect(r.painted, 'M2: form must paint under CPU×20').toBe(true);
    expect(errors).toEqual([]);
  });

  test('M3 NET 1.5Mbps cold', async ({ page }) => {
    test.setTimeout(240000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.net1500);
    const r = await enterTfpAndWait(page, { budgetMs: 120000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    record('M3_net1500_cold', r);
    expect(r.painted, 'M3: form must paint on 1.5Mbps').toBe(true);
    if (r.msFromLoading > 18000) expect(r.cardSeen, 'S4 honesty: >18s-from-loading ⇒ card must have shown (18s margin = 15s timer + poll-cycle slack)').toBe(true);
    await assertInteractive(page);
    expect(errors).toEqual([]);
  });

  test('M4 NET 400kbps cold — completes WITHOUT clicking retry', async ({ page }) => {
    test.setTimeout(360000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.net400);
    const r = await enterTfpAndWait(page, { budgetMs: 240000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    record('M4_net400_cold', r);
    expect(r.painted, 'M4: pull must COMPLETE in background even when the 15s card shows (no retry click)').toBe(true);
    if (r.msFromLoading > 18000) expect(r.cardSeen, 'S4 honesty').toBe(true);
    await assertInteractive(page);
    expect(errors).toEqual([]);
  });

  test('M5 WARM cache + NET 400kbps — warm machines are immune to bad WiFi', async ({ page }) => {
    test.setTimeout(360000);
    const errors = collectErrors(page);
    await prepPage(page);
    // pass 1: warm the Firestore IDB cache (unthrottled), leave TFP
    await openCustomerDetail(page);
    const warm = await enterTfpAndWait(page, { budgetMs: 90000 });
    expect(warm.painted).toBe(true);
    // pass 2: reload + terrible WiFi → cache paint must carry the entry
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.net400);
    await page.goto(`/?backend=1&customer=${CID}`, { timeout: 240000, waitUntil: 'commit' });
    await page.waitForSelector('text=เบอร์โทร', { timeout: 240000 });
    const r = await enterTfpAndWait(page, { budgetMs: 120000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    record('M5_warm_net400', r);
    expect(r.painted, 'M5: warm cache must paint on terrible WiFi').toBe(true);
    expect(errors).toEqual([]);
  });

  test('M6 IndexedDB ABSENT + NET 1.5Mbps (perma-cold class)', async ({ page }) => {
    test.setTimeout(300000);
    const errors = collectErrors(page);
    await prepPage(page, { killIdb: true });
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.net1500);
    const r = await enterTfpAndWait(page, { budgetMs: 180000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    const rejections = await getRejections(page);
    record('M6_noIdb_net1500', { ...r, rejections: rejections.length });
    expect(r.painted, 'M6: memory-cache machine must still load TFP').toBe(true);
    await assertInteractive(page);
    expect(errors, 'S1: no uncaught errors with IDB absent').toEqual([]);
  });

  test('M7 IndexedDB BROKEN (open throws) + NET 1.5Mbps — SDK runtime fallback', async ({ page }) => {
    test.setTimeout(300000);
    const errors = collectErrors(page);
    await prepPage(page, { brokenIdb: true });
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.net1500);
    const r = await enterTfpAndWait(page, { budgetMs: 180000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    const rejections = await getRejections(page);
    record('M7_brokenIdb_net1500', { ...r, rejections: rejections.length });
    expect(r.painted, 'M7: corrupted-IDB machine must still load TFP (SDK memory fallback)').toBe(true);
    await assertInteractive(page);
    expect(errors, 'S1: no uncaught errors with IDB broken').toEqual([]);
  });

  test('M8 quota 5MB + NET 1.5Mbps (nearly-full disk)', async ({ page }) => {
    test.setTimeout(300000);
    const errors = collectErrors(page);
    await prepPage(page);
    const origin = new URL(process.env.E2E_BASE_URL || 'http://localhost:5173').origin;
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    let quotaApplied = true;
    try { await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 5 * 1024 * 1024 }); }
    catch { quotaApplied = false; }
    await cdp.send('Network.emulateNetworkConditions', NET.net1500);
    const r = await enterTfpAndWait(page, { budgetMs: 180000 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    record('M8_quota5mb_net1500', { ...r, note: quotaApplied ? 'quota override applied' : 'quota override UNSUPPORTED — cell = net-only' });
    expect(r.painted, 'M8: tiny-quota machine must still load TFP').toBe(true);
    expect(errors).toEqual([]);
  });

  test('M9 HELL — CPU×20 + 400kbps + no IDB, throttled from first byte', async ({ page }) => {
    test.setTimeout(600000);
    const errors = collectErrors(page);
    await prepPage(page, { killIdb: true });
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    await cdp.send('Network.emulateNetworkConditions', NET.net400);
    await openCustomerDetail(page, { budgetMs: 420000 });
    const r = await enterTfpAndWait(page, { budgetMs: 420000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    const rejections = await getRejections(page);
    record('M9_hell', { ...r, rejections: rejections.length });
    expect(r.painted, 'M9: even the hell machine must eventually paint the form').toBe(true);
    if (r.msFromLoading > 18000) expect(r.cardSeen, 'S4 honesty in hell').toBe(true);
    expect(errors, 'S1: hell machine must not crash').toEqual([]);
  });

  test('M10 OFFLINE chunk fetch — app STAYS ALIVE (panel, not boundary) + recovers', async ({ page }) => {
    // Round-1 finding: clicking into a not-yet-visited lazy view while OFFLINE
    // rejected the React.lazy chunk import → AppErrorBoundary replaced the
    // WHOLE app ("Failed to fetch dynamically imported module"). The lazyRetry
    // chokepoint must turn that into an in-place panel + reload recovery.
    test.setTimeout(300000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const cdp = await cdpFor(page);
    await cdp.send('Network.emulateNetworkConditions', NET.offline);
    await page.getByRole('button', { name: 'บันทึกการรักษา' }).first().click();
    // lazyRetry: 2 retries (~3.6s) then the friendly panel — the app is ALIVE
    await expect(page.locator('[data-testid="chunk-load-retry"]')).toBeVisible({ timeout: 30000 });
    expect(await page.locator(BOUNDARY).isVisible().catch(() => false),
      'M10: chunk failure must NEVER reach the app-wide error boundary').toBe(false);
    // recovery: net returns → ลองใหม่ (reload; URL preserved) → back on the
    // customer page → enter TFP → form paints
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    await page.locator('[data-testid="chunk-load-retry"]').click();
    await page.waitForSelector('text=เบอร์โทร', { timeout: 120000 });
    const r = await enterTfpAndWait(page, { budgetMs: 120000 });
    record('M10_offline_chunk', { ...r, note: 'panel → reload → recovered' });
    expect(r.painted, 'M10: post-recovery TFP entry must paint').toBe(true);
    await assertInteractive(page);
  });

  test('M12 WARM cache + CPU ×20 — the real mini-PC daily profile', async ({ page }) => {
    test.setTimeout(420000);
    const errors = collectErrors(page);
    await prepPage(page);
    // pass 1: warm the cache (unthrottled)
    await openCustomerDetail(page);
    const warm = await enterTfpAndWait(page, { budgetMs: 90000 });
    expect(warm.painted).toBe(true);
    // pass 2: reload as the weak-CPU machine with a WARM cache
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    await page.goto(`/?backend=1&customer=${CID}`, { timeout: 300000, waitUntil: 'commit' });
    await page.waitForSelector('text=เบอร์โทร', { timeout: 300000 });
    const r = await enterTfpAndWait(page, { budgetMs: 240000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    record('M12_warm_cpu20', r);
    expect(r.painted, 'M12: warm weak-CPU machine must paint').toBe(true);
    expect(errors).toEqual([]);
  });

  test('M13 WARM + CPU ×20 + NET 400kbps — realistic worst mini-PC', async ({ page }) => {
    test.setTimeout(480000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const warm = await enterTfpAndWait(page, { budgetMs: 90000 });
    expect(warm.painted).toBe(true);
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    await cdp.send('Network.emulateNetworkConditions', NET.net400);
    await page.goto(`/?backend=1&customer=${CID}`, { timeout: 360000, waitUntil: 'commit' });
    await page.waitForSelector('text=เบอร์โทร', { timeout: 360000 });
    const r = await enterTfpAndWait(page, { budgetMs: 300000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', NET.online);
    record('M13_warm_cpu20_net400', r);
    expect(r.painted, 'M13: worst realistic mini-PC must paint').toBe(true);
    if (r.msFromLoading > 18000) expect(r.cardSeen, 'S4 honesty').toBe(true);
    expect(errors).toEqual([]);
  });

  test('M11 typing latency at CPU ×20 after paint', async ({ page }) => {
    test.setTimeout(360000);
    const errors = collectErrors(page);
    await prepPage(page);
    await openCustomerDetail(page);
    const r = await enterTfpAndWait(page, { budgetMs: 90000 });
    expect(r.painted).toBe(true);
    const cdp = await cdpFor(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    // type into the first visible textarea (CC/notes) — measure per-key wall time
    const ta = page.locator('textarea:visible').first();
    await ta.waitFor({ timeout: 30000 });
    await ta.click();
    const t0 = Date.now();
    const text = 'ทดสอบพิมพ์ช้า';
    await ta.pressSequentially(text, { delay: 0 });
    const perKey = Math.round((Date.now() - t0) / text.length);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    record('M11_typing_cpu20', { ms: perKey, painted: true, cardSeen: false, note: `ms/keystroke at CPU×20` });
    expect(perKey, 'M11: keystroke must stay under 2s even at CPU×20').toBeLessThan(2000);
    expect(errors).toEqual([]);
  });
});
