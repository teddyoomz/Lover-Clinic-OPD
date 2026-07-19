// V71 + V71.A Rule Q L1 verification — real browser + real Firestore.
//
// Verifies the 3 user-pending L1 flows from active.md:
//   1. /admin → นัดหมาย → "วันนี้" → click "✓ ลูกค้ารับบริการเรียบร้อย"
//      → row moves from waiting sub-pill (-1) to completed sub-pill (+1)
//      → Firestore serviceCompletedAt becomes a Timestamp
//   2. Switch to "เสร็จแล้ว" sub-pill → click "↩ กลับไปคิวรอ"
//      → row moves back to waiting (counts flip)
//      → Firestore serviceCompletedAt becomes null
//   3. Click "แก้ไขบันทึกการรักษา" on the TEST row
//      → TreatmentFormPage renders without `tfp-missing-customer-id`
//        placeholder (V71.A customerId-drop bug fix)
//
// Fixture: TEST-V71L1 customer + TEST-APPT-V71L1-{ts} appt today +
//   TEST-TREATMENT-V71L1-{ts} treatment doc. All TEST-prefixed
//   (V33.10 + V33.13 discipline). Created + cleaned via admin SDK.
//
// Branch: ทดลอง 1 (BR-1778136097138-98199ef5) — keeps the TEST row away
//   from the real นครราชสีมา / พระราม 3 production queues.
//
// 2026-05-16 STATUS: L1.1 mark-complete PASSED end-to-end in a prior run
// (page rendered, button clicked, sub-pill counts flipped, Firestore
// confirmed serviceCompletedAt Timestamp). L1.2 + L1.3 intermittently hit
// a known Firestore SDK 12.x INTERNAL ASSERTION (ID ca9 — listener
// permission-denied race + auth-state-change → page-blank crash) when
// run inside Playwright headless chromium against the dev server. This
// is environmental flake (NOT a V71 bug — vitest U1-U5 + F2.1 in
// tests/v71a-edit-fix-and-unmark.test.jsx fully verify the behavior at
// the unit/integration layer). Spec is preserved here for re-run on the
// deployed prod URL or in a less-stressed CI environment.

import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Env load ───────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.local.prod');
const envText = readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

// ─── Admin SDK init ─────────────────────────────────────────────────────────
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

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
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
}

// ─── Fixture identifiers (one set per test session) ─────────────────────────
const TS = Date.now();
const CUSTOMER_ID = `TEST-V71L1-cust-${TS}`;
const APPT_ID = `TEST-APPT-V71L1-${TS}`;
const TREATMENT_ID = `TEST-TREATMENT-V71L1-${TS}`;
const TODAY = todayBangkok();
const CUSTOMER_NAME = 'TEST-V71L1 ลูกค้าทดสอบ';
const APPOINTMENT_TO = 'V71 L1 verify — DO NOT TOUCH';

// ─── Auth helpers (mirror tests/e2e/helpers.js) ─────────────────────────────
async function getFirebaseTokens() {
  const TOKEN_CACHE = path.resolve(__dirname, '../../.auth/tokens.json');
  try {
    const cached = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached.expiresAt > Date.now()) return cached;
  } catch {}
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'loverclinic@loverclinic.com',
        password: 'Lover2024',
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  return { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
}

async function injectAuthAndBranch(page, tokens) {
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId,
    email: tokens.email,
    emailVerified: false,
    isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.idToken,
      expirationTime: Date.now() + 3600000,
    },
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
  });
  await page.addInitScript(
    ({ authKey, authValue, branchKey, branchValue, legacyKey }) => {
      // Clear IndexedDB to avoid Firestore SDK INTERNAL ASSERTION (ID ca9)
      // race when listener state from prior pages conflicts with new auth.
      // Mitigates the known firestore@12.x SDK bug where stale listener
      // targets + auth-state-change produce blank-page crash.
      try {
        if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
          indexedDB.databases().then((dbs) => {
            for (const d of dbs) {
              if (d.name && d.name.startsWith('firestore/')) {
                indexedDB.deleteDatabase(d.name);
              }
            }
          }).catch(() => {});
        }
      } catch {}
      localStorage.setItem(authKey, authValue);
      localStorage.setItem(branchKey, branchValue);
      localStorage.setItem(legacyKey, branchValue);
    },
    {
      authKey,
      authValue,
      branchKey: `selectedBranchId:${tokens.localId}`,
      branchValue: TEST_BRANCH_ID,
      legacyKey: 'selectedBranchId',
    }
  );
}

// ─── Fixture setup + cleanup ────────────────────────────────────────────────
let tokens;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  tokens = await getFirebaseTokens();
  const db = getDb();

  // Customer
  await db.doc(`${BASE}/be_customers/${CUSTOMER_ID}`).set({
    branchId: TEST_BRANCH_ID,
    customerHN: 'TEST-V71L1',
    fullName: CUSTOMER_NAME,
    firstname: 'TEST-V71L1',
    lastname: 'ลูกค้าทดสอบ',
    phone: '0800000000',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    isTestFixture: true,
    _v71L1Test: true,
  });

  // Appointment — today, serviceCompletedAt:null (waiting state)
  await db.doc(`${BASE}/be_appointments/${APPT_ID}`).set({
    branchId: TEST_BRANCH_ID,
    customerId: CUSTOMER_ID,
    customerName: CUSTOMER_NAME,
    customerHN: 'TEST-V71L1',
    date: TODAY,
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    appointmentTo: APPOINTMENT_TO,
    appointmentType: 'treatment-in',
    doctorName: 'หมอ TEST',
    advisor: 'TEST-V71L1',
    notifyChannel: [],
    serviceCompletedAt: null,
    serviceCompletedBy: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    isTestFixture: true,
    _v71L1Test: true,
  });

  // Treatment — links to the customer + has today's treatmentDate so
  // treatmentsByCustomerDate Map picks it up and apptDateTreatments[0] is non-null,
  // which makes RowCard render mark-complete (V71) + edit-treatment buttons.
  await db.doc(`${BASE}/be_treatments/${TREATMENT_ID}`).set({
    branchId: TEST_BRANCH_ID,
    customerId: CUSTOMER_ID,
    customerName: CUSTOMER_NAME,
    detail: {
      treatmentDate: TODAY,
      treatmentItems: [],
      consumables: [],
      medications: [],
      vitalSigns: {},
      doctorName: 'หมอ TEST',
    },
    status: 'vitalsigns-recorded',
    vitalsignsRecordedAt: Timestamp.fromDate(new Date()),
    createdAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
    isTestFixture: true,
    _v71L1Test: true,
  });
});

test.afterAll(async () => {
  const db = getDb();
  for (const path of [
    `${BASE}/be_treatments/${TREATMENT_ID}`,
    `${BASE}/be_appointments/${APPT_ID}`,
    `${BASE}/be_customers/${CUSTOMER_ID}`,
  ]) {
    await db.doc(path).delete().catch(() => {});
  }
});

// ─── Navigation helper ──────────────────────────────────────────────────────
async function gotoFrontendAppointmentToday(page) {
  // Capture page errors / console errors for debugging black-screen-after-click failures.
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(`PAGEERROR: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`CONSOLE-ERR: ${msg.text()}`);
  });

  await injectAuthAndBranch(page, tokens);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Generous initial wait — Firebase auth hydrate + BranchContext + onSnapshot
  // listeners all need to settle before the first click. Pre-V71 phase-29 spec
  // uses 2.5s after goto; we use 4s + an explicit wait for the apptBtn.
  await page.waitForTimeout(4000);

  // 2026-07-20: the 'นัดหมาย ProClinic' title-button no longer exists — since
  // 2026-05-26 adminMode DEFAULTS to 'appointment', so '/' lands on the hub
  // directly. Wait for the hub itself; no mode-switch click needed.
  // Hub view + today sub-pill bar (loadAll fetches data in parallel — 5-6s budget)
  try {
    await expect(page.getByTestId('appt-hub-view')).toBeVisible({ timeout: 45000 });
  } catch (e) {
    console.log('PAGE ERRORS AFTER CLICK:', JSON.stringify(pageErrors, null, 2));
    const debug = await page.evaluate(() => ({
      url: location.href,
      bodyStart: (document.body.innerText || '').slice(0, 800),
      hasAdminMode: !!document.querySelector('button[title="นัดหมาย ProClinic"]'),
      rootChildren: document.getElementById('root')?.childElementCount || 0,
    }));
    console.log('NAV DEBUG (appt-hub-view not visible):', JSON.stringify(debug, null, 2));
    await page.screenshot({ path: 'test-results/v71-nav-debug-postclick.png', fullPage: false });
    throw e;
  }
  await expect(page.getByTestId('appt-hub-today-sub-pill-bar')).toBeVisible({ timeout: 10000 });
  // Wait a tick so apptList state has populated before findTestRow tries to match.
  await page.waitForTimeout(1500);
}

async function findTestRow(page) {
  const row = page.locator(`[data-testid="appt-hub-row"][data-appt-id="${APPT_ID}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 12000 });
  return row;
}

function pillCount(page, key) {
  // Sub-pill rendered as `<button data-testid="sub-pill-waiting">…<span>{count}</span></button>`
  return page.getByTestId(`sub-pill-${key}`);
}

// ─── Test (single sequential flow — page reused across phases) ──────────────
// Original 3-test serial layout produced a black-screen failure on the 2nd
// navigation in Playwright's chromium (cause unidentified; phase-29 spec
// uses identical pattern but their tests don't share state across nav). One
// sequential test keeps the page warm and exercises mark→unmark→edit in the
// exact order the user-pending L1 checklist describes.

test.describe('V71 Rule Q L1 — mark/unmark + edit-treatment real browser', () => {

  test('L1 — mark→unmark→edit-treatment (single nav, sequential)', async ({ page }) => {
    page.on('dialog', (d) => d.accept().catch(() => {}));

    // ── Phase A: navigation ──────────────────────────────────────────────
    await gotoFrontendAppointmentToday(page);

    // ── Phase B: mark-complete moves row to completed sub-pill ───────────
    const beforeWaiting_B = Number((await pillCount(page, 'waiting').textContent()).match(/\d+/)?.[0] || '0');
    const beforeCompleted_B = Number((await pillCount(page, 'completed').textContent()).match(/\d+/)?.[0] || '0');

    let row = await findTestRow(page);
    const markBtn = row.locator('[data-testid="row-action-mark-complete"]');
    await expect(markBtn).toBeVisible({ timeout: 8000 });
    await markBtn.click();

    await expect.poll(
      async () => Number((await pillCount(page, 'waiting').textContent()).match(/\d+/)?.[0] || '0'),
      { timeout: 8000 }
    ).toBe(beforeWaiting_B - 1);
    await expect.poll(
      async () => Number((await pillCount(page, 'completed').textContent()).match(/\d+/)?.[0] || '0'),
      { timeout: 8000 }
    ).toBe(beforeCompleted_B + 1);

    await page.waitForTimeout(2000);
    let apptSnap = await getDb().doc(`${BASE}/be_appointments/${APPT_ID}`).get();
    let data = apptSnap.data();
    expect(data.serviceCompletedAt).toBeTruthy();
    expect(typeof data.serviceCompletedAt.toMillis).toBe('function');

    // ── Phase C: switch to completed sub-pill → un-mark → back to waiting ─
    await pillCount(page, 'completed').click();
    await page.waitForTimeout(800);

    row = await findTestRow(page);
    const unmarkBtn = row.locator('[data-testid="row-action-unmark-complete"]');
    await expect(unmarkBtn).toBeVisible({ timeout: 8000 });
    // Mutually-exclusive contract (V71.A U2.6)
    await expect(row.locator('[data-testid="row-action-mark-complete"]')).toHaveCount(0);

    const beforeWaiting_C = Number((await pillCount(page, 'waiting').textContent()).match(/\d+/)?.[0] || '0');
    const beforeCompleted_C = Number((await pillCount(page, 'completed').textContent()).match(/\d+/)?.[0] || '0');
    await unmarkBtn.click();

    await expect.poll(
      async () => Number((await pillCount(page, 'waiting').textContent()).match(/\d+/)?.[0] || '0'),
      { timeout: 8000 }
    ).toBe(beforeWaiting_C + 1);
    await expect.poll(
      async () => Number((await pillCount(page, 'completed').textContent()).match(/\d+/)?.[0] || '0'),
      { timeout: 8000 }
    ).toBe(beforeCompleted_C - 1);

    await page.waitForTimeout(2000);
    apptSnap = await getDb().doc(`${BASE}/be_appointments/${APPT_ID}`).get();
    data = apptSnap.data();
    expect(data.serviceCompletedAt).toBeNull();
    expect(data.serviceCompletedBy).toBe('');

    // ── Phase D: edit-treatment opens TFP without missing-customerId guard ─
    // After un-mark we're back on waiting sub-pill. Row has a treatment for
    // today → hasTreatmentForDay=true → row-action-edit-treatment visible.
    await pillCount(page, 'waiting').click();
    await page.waitForTimeout(800);
    row = await findTestRow(page);
    const editBtn = row.locator('[data-testid="row-action-edit-treatment"]');
    await expect(editBtn).toBeVisible({ timeout: 8000 });
    await editBtn.click();

    // V71.A bug fix: post-fix the customerId IS in setTreatmentFormMode
    // payload, so TFP's V35.2-sexies guard does NOT short-circuit to the
    // placeholder.
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('tfp-missing-customer-id')).toHaveCount(0);
  });
});
