// TFP probe: HTTP/SW cache WARM + Firestore IndexedDB COLD + throttled.
// = the exact "clinic heavy-use machine" model (app chunks cached all day,
// but the Firestore cache no longer serves TFP's query targets — evicted).
// READ-ONLY (Rule R + Rule S).
import { chromium } from '@playwright/test';

const PROD = 'https://lover-clinic-app.vercel.app';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TREATMENT_ID = process.argv[2] || 'BT-1782130311262';
const CUSTOMER_ID = process.argv[3] || 'LC-26000182';
const TFP_URL = `${PROD}/?backend=1&customer=${CUSTOMER_ID}&treatment=${TREATMENT_ID}`;
const KBPS = Number(process.env.THROTTLE_KBPS || 1500);
const LAT = Number(process.env.THROTTLE_LAT || 200);

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
const ctx = await browser.newContext();
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: authKey, value: authValue });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const fsIds = new Set(); const fsb = { count: 0, bytes: 0 };
cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.includes('firestore.googleapis.com')) { fsIds.add(e.requestId); fsb.count++; } });
cdp.on('Network.dataReceived', (e) => { if (fsIds.has(e.requestId)) fsb.bytes += e.encodedDataLength || e.dataLength || 0; });

// 1) WARM everything (real network): open TFP fully once.
await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.innerText.includes('Vital Signs') || document.body.innerText.includes('ข้อมูลการใช้คอร้ส') || document.body.innerText.includes('ข้อมูลการใช้คอร์ส'), null, { timeout: 120000 });
console.log('(warmed: HTTP/SW + Firestore IDB populated)');

// 2) Kill ONLY the Firestore IndexedDB (leave HTTP/SW cache intact).
//    Do it from a non-app page on the same origin so the SDK isn't holding
//    the DB open (deleteDatabase would block otherwise).
await page.goto(`${PROD}/robots.txt`);
const deleted = await page.evaluate(async () => {
  const dbs = (await indexedDB.databases()) || [];
  const targets = dbs.filter(d => (d.name || '').startsWith('firestore')).map(d => d.name);
  await Promise.all(targets.map(name => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  })));
  return targets;
});
console.log(`(deleted Firestore IDB: ${JSON.stringify(deleted)})`);

// 3) Throttle + reopen TFP: HTTP warm, Firestore cold.
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: KBPS * 1024 / 8, uploadThroughput: (KBPS / 2) * 1024 / 8 });
fsb.count = 0; fsb.bytes = 0; fsIds.clear();
const t0 = Date.now();
await page.goto(TFP_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.innerText.includes('Vital Signs') || document.body.innerText.includes('ข้อมูลการใช้คอร์ส'), null, { timeout: 300000 });
console.log(`[IDB-COLD + HTTP-WARM + ${KBPS}kbps/${LAT}ms] formReady=${Date.now() - t0}ms firestoreReqs=${fsb.count} firestoreKB=${(fsb.bytes / 1024).toFixed(0)}`);
await browser.close();
