// TFP-entry real-browser probe (READ-ONLY, Rule R + Rule S) — measures the
// TFP spinner duration on LIVE prod from this machine (same clinic network),
// then repeats under a degraded-WiFi throttle to reproduce the clinic symptom.
// Control = CustomerDetailView (listener/SWR surface, warm cache) under the
// SAME throttle — proves "every page fast except TFP".
//
// NOTE: the ?treatment= deep link only fires WITH ?customer= (BackendDashboard
// reads it inside the customerId branch).
//
// Usage: node scripts/diag-tfp-entry-probe.mjs [BT-treatmentId] [LC-customerId]
import { chromium } from '@playwright/test';

const PROD = 'https://lover-clinic-app.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TREATMENT_ID = process.argv[2] || 'BT-1782130311262';
const CUSTOMER_ID = process.argv[3] || 'LC-26000182';
const TFP_URL = `${PROD}/?backend=1&customer=${CUSTOMER_ID}&treatment=${TREATMENT_ID}`;
// degraded clinic WiFi model: 1.5 Mbps down / 0.75 Mbps up / 200 ms RTT
const THROTTLE = { offline: false, latency: 200, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 0.75 * 1024 * 1024 / 8 };
const NO_THROTTLE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

async function getTokens() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message}`);
  return data;
}

function makeFirestoreTracker(cdp) {
  const ids = new Set();
  const bucket = { count: 0, bytes: 0 };
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.includes('firestore.googleapis.com')) { ids.add(e.requestId); bucket.count++; }
  });
  // webchannel requests stay open — count streamed chunks, not loadingFinished
  cdp.on('Network.dataReceived', (e) => {
    if (ids.has(e.requestId)) bucket.bytes += e.encodedDataLength || e.dataLength || 0;
  });
  return { bucket, reset: () => { bucket.count = 0; bucket.bytes = 0; ids.clear(); } };
}

// Measure a TFP open: REQUIRE the spinner to appear (else OPEN_FAIL), then
// wait for it to detach = form ready. Returns ms from nav start.
async function measureTfpOpen(page, label, timeoutMs) {
  const t0 = Date.now();
  await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });
  const spinner = page.locator('text=กำลังโหลดฟอร์มการรักษา');
  try {
    await spinner.waitFor({ state: 'visible', timeout: 30000 });
  } catch {
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | ');
    console.log(`[${label}] OPEN_FAIL — spinner never appeared. body: ${body}`);
    return { openFail: true, totalMs: Date.now() - t0 };
  }
  const tSpin = Date.now();
  await spinner.waitFor({ state: 'detached', timeout: timeoutMs });
  return { openFail: false, spinnerSeenAtMs: tSpin - t0, formReadyMs: Date.now() - t0 };
}

const tokens = await getTokens();
const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
const authValue = JSON.stringify({
  uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
  providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
  stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
  createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
});

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: authKey, value: authValue });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const tracker = makeFirestoreTracker(cdp);

// ── Phase W: TFP first open on THIS machine's real network (clinic net) ──
{
  tracker.reset();
  const r = await measureTfpOpen(page, 'W', 120000);
  console.log(`[W] TFP first open, real network  : formReady=${r.formReadyMs ?? '-'}ms firestoreReqs=${tracker.bucket.count} firestoreKB=${(tracker.bucket.bytes / 1024).toFixed(0)}`);
}

// ── Phase A: control page under throttle (warm cache) — CustomerDetailView ──
{
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  const t0 = Date.now();
  await page.goto(`${PROD}/?backend=1&customer=${CUSTOMER_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=เบอร์โทร', { timeout: 90000 });
  console.log(`[A] CustomerDetail, THROTTLED     : visible=${Date.now() - t0}ms  (control — listener surface, warm cache)`);
}

// ── Phase B: TFP re-open under the SAME throttle (warm HTTP/SW cache; the
//    ONLY cold thing is the Firestore server getDocs TFP always re-issues) ──
{
  tracker.reset();
  const r = await measureTfpOpen(page, 'B', 300000);
  console.log(`[B] TFP re-open, THROTTLED        : formReady=${r.formReadyMs ?? '-'}ms firestoreReqs=${tracker.bucket.count} firestoreKB=${(tracker.bucket.bytes / 1024).toFixed(0)}`);
}

// ── Phase C: TFP re-open, real network again (delta vs B isolates network) ──
{
  await cdp.send('Network.emulateNetworkConditions', NO_THROTTLE);
  tracker.reset();
  const r = await measureTfpOpen(page, 'C', 120000);
  console.log(`[C] TFP re-open, real network     : formReady=${r.formReadyMs ?? '-'}ms firestoreReqs=${tracker.bucket.count} firestoreKB=${(tracker.bucket.bytes / 1024).toFixed(0)}`);
}

console.log('\nInterpretation: B >> A under the same throttle = TFP paint is network-bound (server getDocs every open) while listener/SWR pages paint from warm cache.');
await browser.close();
