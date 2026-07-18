// TFP COLD-open timeline probe (READ-ONLY) — polls the page every 500ms to
// find exactly WHERE the cold open stalls (deep-link getCustomer → lazy chunk
// → TFP mount spinner → options loaded → form). Captures console + pageerrors.
import { chromium } from '@playwright/test';

const PROD = 'https://lover-clinic-app.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TREATMENT_ID = process.argv[2] || 'BT-1782130311262';
const CUSTOMER_ID = process.argv[3] || 'LC-26000182';
const TFP_URL = `${PROD}/?backend=1&customer=${CUSTOMER_ID}&treatment=${TREATMENT_ID}`;

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

// Optional throttle: THROTTLE_KBPS=400 THROTTLE_LAT=500 node ... ; WARM=1 does a
// warm-up open first (healthy-cache machine), then measures the SECOND open.
const KBPS = Number(process.env.THROTTLE_KBPS || 0);
const LAT = Number(process.env.THROTTLE_LAT || 0);
const WARM = process.env.WARM === '1';

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: authKey, value: authValue });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [console.${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => console.log(`  [pageerror] ${String(e).slice(0, 300)}`));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const fsIds = new Set(); const fsb = { count: 0, bytes: 0 };
cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.includes('firestore.googleapis.com')) { fsIds.add(e.requestId); fsb.count++; } });
cdp.on('Network.dataReceived', (e) => { if (fsIds.has(e.requestId)) fsb.bytes += e.encodedDataLength || e.dataLength || 0; });

if (WARM) {
  console.log('(warm-up open on real network...)');
  await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Vital Signs') || document.body.innerText.includes('ข้อมูลการใช้คอร์ส'), null, { timeout: 120000 });
  fsb.count = 0; fsb.bytes = 0; fsIds.clear();
}
if (KBPS > 0) {
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: KBPS * 1024 / 8, uploadThroughput: (KBPS / 2) * 1024 / 8 });
  console.log(`(throttled: ${KBPS} kbps down / ${KBPS / 2} kbps up / ${LAT} ms RTT)`);
}

const t0 = Date.now();
await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });

let last = '';
for (let i = 0; i < 180; i++) {
  const state = await page.evaluate(() => {
    const has = (t) => document.body.innerText.includes(t);
    return {
      spinner: has('กำลังโหลดฟอร์มการรักษา'),
      anyLoading: (document.body.innerText.match(/กำลังโหลด/g) || []).length,
      custDetail: has('ลิงก์ดูข้อมูล'),
      tfpForm: has('Vital Signs') || has('ข้อมูลการใช้คอร์ส') || has('บันทึกสำหรับแพทย์'),
      bodyLen: document.body.innerText.length,
    };
  }).catch(() => null);
  if (!state) { console.log(`${Date.now() - t0}ms  (eval failed — navigating?)`); await page.waitForTimeout(500); continue; }
  const sig = JSON.stringify(state);
  if (sig !== last) {
    console.log(`${String(Date.now() - t0).padStart(6)}ms  spinner=${state.spinner} loadingTexts=${state.anyLoading} custDetail=${state.custDetail} tfpForm=${state.tfpForm} bodyLen=${state.bodyLen}`);
    last = sig;
  }
  if (state.tfpForm) { console.log(`FORM READY at ${Date.now() - t0}ms  firestoreReqs=${fsb.count} firestoreKB=${(fsb.bytes / 1024).toFixed(0)}`); break; }
  await page.waitForTimeout(500);
}
await browser.close();
