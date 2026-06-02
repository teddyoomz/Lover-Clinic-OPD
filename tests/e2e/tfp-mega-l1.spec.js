// ─── TFP MEGA L1 — real-browser component verification (Rule Q L1) ──────────────
//
// The L2 mega-test (scripts/e2e-tfp-mega-test.mjs) proved the backend FUNCTION
// chain on real prod. This proves the COMPONENT ORCHESTRATION: that the real TFP
// UI, driven in a real browser, actually CALLS that chain correctly on save —
// the V104-class gap (V104 was a handleSubmit param-shadow: the function worked,
// the component didn't call it). Uses a FRESH TEST customer (admin SDK, beforeAll)
// with a course — never a hardcoded/real customer (no real-customer actions).
// Asserts the decrement via admin read-back (source of truth, not UI text).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { goToCustomer } from './helpers.js';

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
const NAKHON = 'BR-1777873556815-26df6480'; // main active branch (has doctors)

function db() {
  if (!getApps().length) {
    const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }) });
  }
  return getFirestore();
}
const cdoc = (id) => db().doc(`${PREFIX}/be_customers/${id}`);

const CID = `TEST-${Date.now()}-l1`;
const createdTreatments = [];

test.beforeAll(async () => {
  await cdoc(CID).set({
    customerName: 'เทสต์ L1', firstname: 'เทสต์', lastname: 'L1', hn_no: `TEST-HN-${Date.now()}`, branchId: NAKHON,
    patientData: { firstName: 'เทสต์', lastName: 'L1', firstNameTh: 'เทสต์', lastNameTh: 'L1', phone: '0800000000' },
    courses: [{ name: 'L1CourseX', product: 'L1ProductA', qty: '5/5 ครั้ง', courseType: '', status: 'กำลังใช้งาน', expiry: '' }],
    createdAt: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  try { await cdoc(CID).delete(); } catch {}
  for (const tid of createdTreatments) { try { await db().doc(`${PREFIX}/be_treatments/${tid}`).delete(); } catch {} }
  // clean any course-change audit + the linked sale, if created
  for (const tid of createdTreatments) {
    for (const col of ['be_course_changes']) {
      const s = await db().collection(`${PREFIX}/${col}`).where('linkedTreatmentId', '==', tid).get();
      for (const d of s.docs) await d.ref.delete().catch(() => {});
    }
  }
});

test('deep-link loads the fresh TEST customer + opens TFP', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((b) => localStorage.setItem('selectedBranchId', b), NAKHON); // branch with doctors
  await goToCustomer(page, CID);                 // proves deep-link works for a fresh customer
  await expect(page.getByText('เทสต์ L1').first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'บันทึกการรักษา' }).first().click(); // Phase 28 renamed สร้างการรักษา → บันทึกการรักษา
  await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });
  // the customer's course must be selectable
  const cb = page.locator('.max-h-\\[300px\\] input[type="checkbox"]');
  expect(await cb.count()).toBeGreaterThan(0);
});

test('V104-class: use existing course in real TFP → save → course decrements 5/5 → 4/5', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => d.accept());           // accept any confirm/alert

  // pre-state: 5/5
  const before = (await cdoc(CID).get()).data().courses[0].qty;
  expect(before.replace(/\s+/g, '')).toBe('5/5ครั้ง');

  await page.addInitScript((b) => localStorage.setItem('selectedBranchId', b), NAKHON); // branch with doctors
  await goToCustomer(page, CID);
  await page.getByRole('button', { name: 'บันทึกการรักษา' }).first().click(); // Phase 28 renamed สร้างการรักษา → บันทึกการรักษา
  await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });

  // pick a doctor (required) — poll for async-loaded options
  const doctorSel = page.locator('[data-field="doctor"] select').first();
  await doctorSel.waitFor({ timeout: 15000 });
  let optionValues = [];
  for (let i = 0; i < 15; i++) {
    optionValues = await doctorSel.locator('option').evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    if (optionValues.length) break;
    await page.waitForTimeout(1000);
  }
  expect(optionValues.length, 'branch must have at least one doctor').toBeGreaterThan(0);
  await doctorSel.selectOption(optionValues[0]);

  // tick the existing course → adds to รายการรักษา
  const cb = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
  await cb.check();
  await page.waitForTimeout(800);
  // set use-qty to 1 (controlled deduction) if the qty input is present
  const qtyInput = page.locator('[data-field="courseSection"]').locator('..').locator('input[type="number"]').first();
  if (await qtyInput.isVisible().catch(() => false)) { await qtyInput.fill('1'); await page.waitForTimeout(300); }

  // submit the treatment (V26.1 removed the top-right button — single save button now)
  await page.getByRole('button', { name: 'ยืนยันการรักษา' }).first().click();

  // wait for save to land: poll the customer doc (source of truth). The V104 bug
  // would leave the course UNCHANGED at 5/5; a working save decrements it. We assert
  // it decremented (amount depends on the use-qty), a treatment was created, and the
  // V36 course-use audit emitted — the full component→function chain fired via real UI.
  let after = before, remaining = 5;
  for (let i = 0; i < 45; i++) {           // up to ~45s
    await page.waitForTimeout(1000);
    const snap = await cdoc(CID).get();
    after = snap.data().courses[0].qty;
    remaining = parseInt(String(after).split('/')[0], 10);
    const ts = await db().collection(`${PREFIX}/be_treatments`).where('customerId', '==', CID).get();
    for (const d of ts.docs) if (!createdTreatments.includes(d.id)) createdTreatments.push(d.id);
    if (remaining < 5) break;
  }
  console.log(`[L1] course after real-UI save: ${after} (was ${before}); treatments created: ${createdTreatments.length}`);
  expect(remaining, `V104-class: course must DECREMENT after real-UI save (was ${before}, now ${after} — V104 bug would stay 5/5)`).toBeLessThan(5);
  expect(createdTreatments.length, 'real-UI save must persist a be_treatments doc').toBeGreaterThan(0);
  const audit = await db().collection(`${PREFIX}/be_course_changes`).where('linkedTreatmentId', '==', createdTreatments[0]).get();
  expect(audit.size, 'V36: course-use audit must emit (component→function chain)').toBeGreaterThan(0);
});
