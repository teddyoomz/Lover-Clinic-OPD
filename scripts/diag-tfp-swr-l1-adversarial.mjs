// AV208 T9 — Rule Q L1 adversarial probe on the NEW build (local vite preview
// :4173) against REAL prod Firestore. Three scenarios:
//   S1  typing during the sync window survives the server correction
//       (hydration/prefill-once contract, live in a real browser)
//   S2  vitals-save clicked IMMEDIATELY after a cache paint → save-gate holds
//       → doc written correctly on prod (TEST- fixture, cleaned up)
//   S3  Q-vis screenshots: chip visible during sync / gone after
// Usage: node scripts/diag-tfp-swr-l1-adversarial.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = process.env.PROBE_BASE || 'http://localhost:4173';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const EDIT_CUSTOMER = 'LC-26000182';
const EDIT_TREATMENT = 'BT-1782130311262';
const THROTTLE = { offline: false, latency: 300, downloadThroughput: 1 * 1024 * 1024 / 8, uploadThroughput: 0.5 * 1024 * 1024 / 8 };

// ── admin SDK (fixtures + verify + cleanup) ─────────────────────────────────
function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const adb = getFirestore();
const DATA = 'artifacts/loverclinic-opd-4c39b/public/data';
const TEST_CUSTOMER = `TEST-AV208-${Date.now()}`;

async function getTokens() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message}`);
  return data;
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const tokens = await getTokens();
const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
const authValue = JSON.stringify({
  uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
  providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
  stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
  createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: authKey, value: authValue });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');

const formReady = async (timeout = 120000) => {
  await page.waitForFunction(() => document.body.innerText.includes('Vital Signs'), null, { timeout });
};
const chipVisible = () => page.evaluate(() => document.body.innerText.includes('กำลังซิงค์'));

try {
  // ══ S1 — typing during the sync window survives the server correction ══
  const editUrl = `${BASE}/?backend=1&customer=${EDIT_CUSTOMER}&treatment=${EDIT_TREATMENT}`;
  await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await formReady();                                  // warm-up (cache populated)
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await formReady();                                  // cache paint (fast) — server leg still crawling
  const chipAtPaint = await chipVisible();
  await page.screenshot({ path: 'test-results/av208-s1-chip-during-sync.png' });
  const MARKER = ` AV208-TYPING-PROBE-${Date.now()}`;
  const ta = page.locator('textarea[placeholder="โรคประจำตัว"]');
  await ta.click();
  await ta.press('End');
  await ta.pressSequentially(MARKER, { delay: 20 }); // real keystrokes WHILE server pass in flight
  // wait until the server confirms (chip gone), keep focus off the field
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.waitForFunction(() => !document.body.innerText.includes('กำลังซิงค์'), null, { timeout: 60000 });
  const after = await ta.inputValue();
  check('S1a chip visible during the sync window (cache paint honest)', chipAtPaint === true);
  check('S1b typed text SURVIVES the server correction (hydration-once)', after.includes(MARKER.trim()), `field len=${after.length}`);
  await page.screenshot({ path: 'test-results/av208-s1-after-sync.png' });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // ══ S2 — save immediately after a cache paint → gate holds → correct doc ══
  await adb.doc(`${DATA}/be_customers/${TEST_CUSTOMER}`).set({
    id: TEST_CUSTOMER, proClinicHN: 'TEST-AV208', branchId: 'BR-1777873556815-26df6480',
    patientData: { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'AV208' }, courses: [],
    createdAt: new Date(), isTestFixture: true,
  });
  const createUrl = `${BASE}/?backend=1&customer=${TEST_CUSTOMER}`;
  // open CustomerDetail → click สร้างการรักษา is the real flow, but the deep
  // link needs ?treatment=. Instead drive the create-mode the way BackendDashboard
  // does: warm-open the CREATE form via the customer page's button.
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=เบอร์โทร', { timeout: 60000 });
  await page.locator('button[title="สร้างใบบันทึกการรักษาใหม่"]').first().click();
  await formReady();                                  // first open (real net) — warms customer into cache
  // back out, reopen THROTTLED → cache paint → click vitals-save IMMEDIATELY
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=เบอร์โทร', { timeout: 60000 });
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  await page.locator('button[title="สร้างใบบันทึกการรักษาใหม่"]').first().click();
  await formReady();
  const chipAtSave = await chipVisible();
  await page.getByTestId('tfp-vitals-save-btn').click();   // save-gate must hold until server confirms
  await page.waitForFunction(() => document.body.innerText.includes('สร้างการรักษาสำเร็จ') || document.body.innerText.includes('บันทึกสำเร็จ'), null, { timeout: 60000 });
  await page.screenshot({ path: 'test-results/av208-s2-saved.png' });
  const tSnap = await adb.collection(`${DATA}/be_treatments`).where('customerId', '==', TEST_CUSTOMER).get();
  check('S2a vitals-save right after cache paint SUCCEEDS (gate held, no corrupt write)', tSnap.size === 1, `docs=${tSnap.size} chipAtSave=${chipAtSave}`);
  const tDoc = tSnap.docs[0];
  check('S2b saved doc has vitals-recorded status + correct customer', (tDoc.data().status === 'vitalsigns-recorded') && tDoc.data().customerId === TEST_CUSTOMER, `status=${tDoc.data().status}`);

  // cleanup: treatment + deterministic staff-chat card + customer
  for (const d of tSnap.docs) {
    await adb.doc(`${DATA}/be_staff_chat_messages/CHAT-SYS-TFP-${d.id}-vitals`).delete().catch(() => {});
    await d.ref.delete();
  }
  await adb.doc(`${DATA}/be_customers/${TEST_CUSTOMER}`).delete();
  const leftovers = await adb.collection(`${DATA}/be_treatments`).where('customerId', '==', TEST_CUSTOMER).get();
  check('S3 cleanup pristine (zero TEST orphans)', leftovers.size === 0);
} finally {
  await browser.close();
}

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${fails ? ` — ${fails} FAIL` : ''}`);
process.exit(fails ? 1 : 0);
