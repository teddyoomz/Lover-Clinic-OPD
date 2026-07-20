// Done-tab sort (2026-07-20) — Rule Q L1 real browser + real prod Firestore.
//
// User directive: "หน้าเสร็จแล้วใน tab วันนี้ ... คนที่เพิ่งกดจะอยู่บนสุด".
// Drives the REAL UI: seed 3 TEST- appts today (ทดลอง 1 branch) → click
// "รับบริการเรียบร้อย" in order B → A → C → switch to เสร็จแล้ว sub-pill →
// DOM order must be C, A, B (most recently clicked on top — NOT by
// appointment time) → un-mark C → order A, B. Screenshot for Q-vis.
//
// Scaffolding mirrors tests/e2e/v71-mark-unmark-edit-treatment.spec.js
// (fixtures + auth/branch inject + hub navigation + testids).
import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(path.resolve(__dirname, '../../.env.local.prod'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1 — away from real queues
const TS = Date.now();
const CUSTOMER_ID = `TEST-DONESORT-CUST-${TS}`;
const APPT = {
  A: `TEST-APPT-DONESORT-A-${TS}`,
  B: `TEST-APPT-DONESORT-B-${TS}`,
  C: `TEST-APPT-DONESORT-C-${TS}`,
};
const START_TIME = { A: '09:00', B: '10:30', C: '13:00' };

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
    });
  }
  return getFirestore();
}

function todayBangkok() {
  const now = new Date(Date.now() + 7 * 3600000);
  return now.toISOString().slice(0, 10);
}
const TODAY = todayBangkok();

async function getFirebaseTokens() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  return data;
}

async function injectAuthAndBranch(page, tokens) {
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
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
  await page.addInitScript(
    ({ authKey, authValue, branchKey, branchValue, legacyKey }) => {
      try {
        if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
          indexedDB.databases().then((dbs) => {
            for (const d of dbs) {
              if (d.name && d.name.startsWith('firestore/')) indexedDB.deleteDatabase(d.name);
            }
          }).catch(() => {});
        }
      } catch {}
      localStorage.setItem(authKey, authValue);
      localStorage.setItem(branchKey, branchValue);
      localStorage.setItem(legacyKey, branchValue);
    },
    {
      authKey, authValue,
      branchKey: `selectedBranchId:${tokens.localId}`,
      branchValue: TEST_BRANCH_ID,
      legacyKey: 'selectedBranchId',
    },
  );
}

let tokens;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  tokens = await getFirebaseTokens();
  const db = getDb();
  await db.doc(`${BASE}/be_customers/${CUSTOMER_ID}`).set({
    branchId: TEST_BRANCH_ID, customerHN: 'TEST-DONESORT',
    fullName: 'TEST-DONESORT ลูกค้าทดสอบ', firstname: 'TEST-DONESORT', lastname: 'ลูกค้าทดสอบ',
    phone: '0800000000', createdAt: FieldValue.serverTimestamp(), isTestFixture: true,
  });
  for (const k of ['A', 'B', 'C']) {
    await db.doc(`${BASE}/be_appointments/${APPT[k]}`).set({
      branchId: TEST_BRANCH_ID, customerId: CUSTOMER_ID,
      customerName: `TEST-DONESORT คุณ${k}`, customerHN: 'TEST-DONESORT',
      date: TODAY, startTime: START_TIME[k], endTime: '21:00',
      status: 'confirmed', appointmentTo: 'พบแพทย์', appointmentType: 'treatment-in',
      doctorName: 'หมอ TEST', notifyChannel: [],
      serviceCompletedAt: null, serviceCompletedBy: '',
      createdAt: FieldValue.serverTimestamp(), isTestFixture: true,
    });
  }
});

test.afterAll(async () => {
  const db = getDb();
  for (const p of [
    `${BASE}/be_appointments/${APPT.A}`, `${BASE}/be_appointments/${APPT.B}`,
    `${BASE}/be_appointments/${APPT.C}`, `${BASE}/be_customers/${CUSTOMER_ID}`,
  ]) await db.doc(p).delete().catch(() => {});
});

async function gotoHubToday(page) {
  await injectAuthAndBranch(page, tokens);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await expect(page.getByTestId('appt-hub-view')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('appt-hub-today-sub-pill-bar')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);
}

const row = (page, id) => page.locator(`[data-testid="appt-hub-row"][data-appt-id="${id}"]`).first();
const markBtn = (page, id) => row(page, id).locator('[data-testid="row-action-mark-complete"]');

async function testRowOrder(page) {
  // DOM order of OUR three appts among all rendered rows
  const ids = await page.locator('[data-testid="appt-hub-row"]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-appt-id')),
  );
  return ids.filter((id) => Object.values(APPT).includes(id));
}

test.describe('Done-tab sort — Rule Q L1 real browser', () => {
  test('L1 — mark B→A→C then เสร็จแล้ว shows C,A,B (คนกดล่าสุดบนสุด); un-mark C → A,B', async ({ page }) => {
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await gotoHubToday(page);

    // ── mark in the order B → A → C (spaced ≥1.2s so stamps are unambiguous)
    for (const k of ['B', 'A', 'C']) {
      const btn = markBtn(page, APPT[k]);
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toBeVisible({ timeout: 12000 });
      await btn.click();
      // wait for the row to leave the waiting pill (optimistic + server settle)
      await expect(row(page, APPT[k])).toHaveCount(0, { timeout: 8000 });
      await page.waitForTimeout(1200);
    }

    // ── เสร็จแล้ว sub-pill: most recently clicked on TOP (C, A, B) ─────────
    await page.getByTestId('sub-pill-completed').click();
    await page.waitForTimeout(1200);
    for (const k of ['A', 'B', 'C']) {
      await row(page, APPT[k]).scrollIntoViewIfNeeded().catch(() => {});
      await expect(row(page, APPT[k])).toBeVisible({ timeout: 12000 });
    }
    let order = await testRowOrder(page);
    expect(order, 'เสร็จแล้ว must order by most-recently-completed, NOT by appointment time').toEqual([APPT.C, APPT.A, APPT.B]);
    await page.screenshot({ path: 'test-results/done-sort-completed-order.png', fullPage: false });

    // ── un-mark C (กลับไปคิวรอ) → remaining order A, B ─────────────────────
    const unmark = row(page, APPT.C).locator('[data-testid="row-action-unmark-complete"]');
    await unmark.scrollIntoViewIfNeeded();
    await expect(unmark).toBeVisible({ timeout: 8000 });
    await unmark.click();
    await expect(row(page, APPT.C)).toHaveCount(0, { timeout: 8000 });
    order = await testRowOrder(page);
    expect(order).toEqual([APPT.A, APPT.B]);
    await page.screenshot({ path: 'test-results/done-sort-after-unmark.png', fullPage: false });
  });
});
