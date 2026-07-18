// TFP cold-open probe (READ-ONLY, Rule R + Rule S) — approximates the SLOW
// CLINIC MACHINE state: Firestore cache useless (fresh profile = evicted/bloated
// cache) + degraded WiFi (throttle). Compares:
//   [D1] cold TFP open, throttled  — the clinic-machine symptom reproduction
//   [D2] cold TFP open, real net   — cold but good link (why THIS machine is fast)
//   [D3] warm TFP open, throttled  — cache healthy: resume-token delta only
// Each phase uses a FRESH browser context for D1/D2 (cold) and reuses D2's
// context for D3 (warm). HTTP/SW caches are also cold in D1/D2 — mirrors a
// post-deploy or evicted machine.
import { chromium } from '@playwright/test';

const PROD = 'https://lover-clinic-app.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TREATMENT_ID = process.argv[2] || 'BT-1782130311262';
const CUSTOMER_ID = process.argv[3] || 'LC-26000182';
const TFP_URL = `${PROD}/?backend=1&customer=${CUSTOMER_ID}&treatment=${TREATMENT_ID}`;
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
const tokens = await getTokens();
const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
const authValue = JSON.stringify({
  uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
  providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
  stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
  createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
});

const browser = await chromium.launch();

async function newAuthedPage() {
  const ctx = await browser.newContext();
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: authKey, value: authValue });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const ids = new Set();
  const fsb = { count: 0, bytes: 0 };
  cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.includes('firestore.googleapis.com')) { ids.add(e.requestId); fsb.count++; } });
  cdp.on('Network.dataReceived', (e) => { if (ids.has(e.requestId)) fsb.bytes += e.encodedDataLength || e.dataLength || 0; });
  return { ctx, page, cdp, fsb, resetFs: () => { fsb.count = 0; fsb.bytes = 0; ids.clear(); } };
}

async function measure(page, label, timeoutMs) {
  const t0 = Date.now();
  await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });
  const spinner = page.locator('text=กำลังโหลดฟอร์มการรักษา');
  try { await spinner.waitFor({ state: 'visible', timeout: 60000 }); }
  catch { console.log(`[${label}] spinner not seen in 60s (page may have loaded past it or failed)`); }
  try { await spinner.waitFor({ state: 'detached', timeout: timeoutMs }); } catch { return { formReadyMs: -1 }; }
  return { formReadyMs: Date.now() - t0 };
}

// D1 — cold everything + throttled (clinic slow-machine reproduction)
{
  const s = await newAuthedPage();
  await s.cdp.send('Network.emulateNetworkConditions', THROTTLE);
  const r = await measure(s.page, 'D1', 300000);
  console.log(`[D1] COLD TFP open, THROTTLED   : formReady=${r.formReadyMs}ms firestoreReqs=${s.fsb.count} firestoreKB=${(s.fsb.bytes / 1024).toFixed(0)}`);
  await s.ctx.close();
}

// D2 — cold everything + real network (this strong machine's actual state)
let warm;
{
  const s = await newAuthedPage();
  await s.cdp.send('Network.emulateNetworkConditions', NO_THROTTLE);
  const r = await measure(s.page, 'D2', 180000);
  console.log(`[D2] COLD TFP open, real network: formReady=${r.formReadyMs}ms firestoreReqs=${s.fsb.count} firestoreKB=${(s.fsb.bytes / 1024).toFixed(0)}`);
  warm = s; // keep context (now-warm IndexedDB + HTTP cache) for D3
}

// D3 — warm cache + throttled (healthy-cache machine on weak WiFi)
{
  warm.resetFs();
  await warm.cdp.send('Network.emulateNetworkConditions', THROTTLE);
  const r = await measure(warm.page, 'D3', 300000);
  console.log(`[D3] WARM TFP open, THROTTLED   : formReady=${r.formReadyMs}ms firestoreReqs=${warm.fsb.count} firestoreKB=${(warm.fsb.bytes / 1024).toFixed(0)}`);
  await warm.ctx.close();
}

console.log('\nInterpretation: D1 (cold+throttle) reproduces the clinic hang; D3 shows a healthy cache kills it even on the same weak link → the fix must make TFP paint cache-first + keep the cache healthy.');
await browser.close();
