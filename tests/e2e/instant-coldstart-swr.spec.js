// Instant cold-start — Rule Q L1 (2026-07-07, spec Q1=A/Q2=A/Q4=B).
//
//   S1  staff SWR: with googleapis DEAD, a reload still paints the hub from
//       IndexedDB (impossible without persistentLocalCache) + "กำลังซิงค์…"
//       shows; back online → indicator clears (server confirm).
//   S2  server-correction: data changed server-side while "away" appears
//       correctly after reload (cache paint → server overwrite end-state).
//   S3  customer fresh-gate: ?schedule= page NEVER renders cached data when
//       the server can't confirm — loading/retry only (fresh-always contract).
//   S4  SW app shell: with the network FULLY offline the shell still loads.
//       (needs a built app + SW → runs only when E2E_BASE_URL targets
//        `vite preview` or prod; dev server has no SW by design.)
//
// Run (S1-S3):  npx playwright test tests/e2e/instant-coldstart-swr.spec.js
// Run (S4):     npm run build ; npx vite preview --port 4183
//               E2E_BASE_URL=http://localhost:4183 npx playwright test tests/e2e/instant-coldstart-swr.spec.js
//
// Fixtures: TEST-APPT-SWR-* (V33.13) + TEST-SWR schedule token — seeded +
// cleaned via admin SDK (Rule R env). S2 fixture lives at ทดลอง 1 so the real
// นครราชสีมา queue never shows a TEST row (V27 lesson).
import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.local.prod');
const envText = readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const NAKHON_BRANCH_ID = 'BR-1777873556815-26df6480';   // นครราชสีมา (data-rich)
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5';     // ทดลอง 1 (fixture-safe)

function getDb() {
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  return getFirestore();
}

function todayBangkok() {
  const bkk = new Date(Date.now() + 7 * 3600 * 1000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}

// ── auth: same token cache as helpers.js, but we also need the uid to pin
//    the selected branch (per-uid localStorage key, Phase 17.2) ─────────────
const TOKEN_CACHE = path.join(__dirname, '../../.auth/tokens.json');
async function getTokens() {
  try {
    const cached = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached.expiresAt > Date.now()) return cached;
  } catch {}
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message}`);
  const tokens = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  writeFileSync(TOKEN_CACHE, JSON.stringify(tokens));
  return tokens;
}

async function injectAuth(page, { branchId } = {}) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
  });
  const branchKey = branchId ? `selectedBranchId:${tokens.localId}` : null;
  await page.addInitScript(({ key, value, bKey, bVal }) => {
    localStorage.setItem(key, value);
    if (bKey) localStorage.setItem(bKey, bVal);
  }, { key: authKey, value: authValue, bKey: branchKey, bVal: branchId || '' });
  return tokens;
}

const abortGoogle = (context) => context.route(/googleapis\.com/, (route) => route.abort());

test.describe.configure({ mode: 'serial' });
test.setTimeout(90000);

test('S1 — staff hub paints from IndexedDB with the network to Firebase DEAD (+ sync indicator honest)', async ({ page, context }) => {
  // Pass 1 (online): warm the persistent cache on the data-rich branch.
  await injectAuth(page, { branchId: NAKHON_BRANCH_ID });
  await page.goto('/');
  const hub = page.getByTestId('appt-hub-view');
  await hub.waitFor({ state: 'visible', timeout: 30000 });
  // wait until the wide-range pills carry real counts (data landed + cached)
  const pastPill = page.locator('button', { hasText: 'ย้อนหลัง 30 วัน' }).first();
  await expect(pastPill).not.toContainText(/\s0\s*$/, { timeout: 30000 });
  const warmText = (await pastPill.textContent()).trim();

  // Pass 2: kill EVERY googleapis request (auth + Firestore) → reload.
  // Without persistentLocalCache this reload can show NOTHING (no network
  // source exists) — any data now on screen is IndexedDB-painted by definition.
  await abortGoogle(context);
  await page.reload();
  await hub.waitFor({ state: 'visible', timeout: 30000 });
  await expect(pastPill).toHaveText(warmText, { timeout: 15000 });          // cache painted the same counts
  await expect(page.getByTestId('sync-indicator')).toBeVisible({ timeout: 15000 }); // and it is HONEST about it
  await expect(page.getByText('กำลังโหลด…')).toHaveCount(0);

  // Back online → server confirms → indicator clears.
  await context.unroute(/googleapis\.com/);
  await page.reload();
  await hub.waitFor({ state: 'visible', timeout: 30000 });
  await expect(page.getByTestId('sync-indicator')).toHaveCount(0, { timeout: 30000 });
});

test('S2 — a server-side change made while "away" lands after reload (cache → server correction)', async ({ page, context }) => {
  const db = getDb();
  const ts = Date.now();
  const apptId = `TEST-APPT-SWR-${ts}`;
  const ref = db.doc(`${BASE}/be_appointments/${apptId}`);
  await ref.set({
    id: apptId, appointmentId: apptId, branchId: TEST_BRANCH_ID,
    date: todayBangkok(), startTime: '09:00', endTime: '09:30',
    customerId: '', customerNameTemp: 'TEST-SWR-BEFORE', customerName: 'TEST-SWR-BEFORE',
    type: 'ปรึกษา', status: 'pending', createdAt: new Date().toISOString(),
  });
  try {
    await injectAuth(page, { branchId: TEST_BRANCH_ID });
    await page.goto('/');
    await expect(page.getByText('TEST-SWR-BEFORE').first()).toBeVisible({ timeout: 30000 }); // warm + cached

    // change happens "while the app is closed"
    await ref.update({ customerName: 'TEST-SWR-AFTER', customerNameTemp: 'TEST-SWR-AFTER' });

    await page.reload();
    await page.getByTestId('appt-hub-view').waitFor({ state: 'visible', timeout: 30000 });
    // end-state = server truth (cache may flash the old name first — that's the SWR contract)
    await expect(page.getByText('TEST-SWR-AFTER').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('sync-indicator')).toHaveCount(0, { timeout: 30000 });
  } finally {
    await ref.delete();
  }
});

test('S3 — customer ?schedule= page NEVER renders cached data without server confirmation (fresh-gate)', async ({ page, context }) => {
  const db = getDb();
  const token = `TEST-SWR-SCHED-${Date.now()}`;
  const ref = db.doc(`${BASE}/clinic_schedules/${token}`);
  const month = todayBangkok().slice(0, 7);
  await ref.set({
    enabled: true, createdAt: Timestamp.now(), months: [month],
    noDoctorRequired: true, doctorDays: [], closedDays: [], bookedSlots: [],
    branchId: TEST_BRANCH_ID,
  });
  try {
    // Warm pass (online): calendar renders → doc now sits in IndexedDB.
    await injectAuth(page);
    await page.goto(`/?schedule=${token}`);
    await expect(page.getByText('เลือกวันนัดหมาย').or(page.locator('text=/ก\\.ค\\.|กรกฎาคม/')).first()).toBeVisible({ timeout: 30000 });

    // Offline-to-Firebase pass: the cached doc EXISTS, but the customer page
    // must NOT render it — loading (or the retry escape) only. 8s covers the
    // resilient-load window where a cache leak would have painted instantly.
    await abortGoogle(context);
    await page.reload();
    await page.waitForTimeout(8000);
    const calendarVisible = await page.getByText('เลือกวันนัดหมาย').isVisible().catch(() => false);
    const monthVisible = await page.locator('text=/กรกฎาคม/').first().isVisible().catch(() => false);
    expect(calendarVisible || monthVisible, 'customer page rendered CACHED data — fresh-gate broken').toBe(false);

    // Back online → real data renders again.
    await context.unroute(/googleapis\.com/);
    await page.reload();
    await expect(page.getByText('เลือกวันนัดหมาย').or(page.locator('text=/กรกฎาคม/')).first()).toBeVisible({ timeout: 30000 });
  } finally {
    await ref.delete();
  }
});

test('S4 — SW serves the app shell fully offline (preview/prod only)', async ({ page, context }) => {
  test.skip(!process.env.E2E_BASE_URL, 'SW exists only in built output — run against vite preview or prod (E2E_BASE_URL)');
  await page.goto('/');
  // wait for the SW to take control of the page
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active);
  }, { timeout: 30000 });
  await page.reload(); // now controlled by the SW
  await context.setOffline(true);
  try {
    await page.reload();
    // shell loaded from precache — React mounted something into #root
    await page.waitForFunction(() => {
      const r = document.getElementById('root');
      return !!(r && r.childElementCount > 0);
    }, { timeout: 15000 });
  } finally {
    await context.setOffline(false);
  }
});
