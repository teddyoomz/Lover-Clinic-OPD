// tests/e2e/v43-skip-stock-deduction-toggle.spec.js
//
// V43 — "ไม่ตัดสต็อค" toggle on ProductFormModal (tab=products)
//
// Rule Q V66 L2 verification — closes the gap that existing
// scripts/e2e-skip-stock-deduction.mjs left open. That script simulates
// _deductOneItem's decision tree locally; this spec drives the REAL
// backendClient.js functions via real firebase client SDK in an
// authenticated browser context against REAL prod Firestore.
//
// L1 (UI click on the checkbox) is verified by:
//   (a) V43 existing e2e — saves the same Firestore shape that the UI
//       persists via saveProduct(normalizeProduct(form))
//   (b) Source-code inspection: ProductFormModal.jsx:220-228 binds the
//       checkbox to form.skipStockDeduction → onChange writes the boolean;
//       normalizeProduct(form) coerces via !!form.skipStockDeduction
//       (V14 lock — no undefined) → saveProduct setDoc to be_products.
//
// L2 (runtime decision) is what THIS spec exercises end-to-end:
//   1. saveProduct via real client SDK → assert be_products doc has
//      skipStockDeduction:true (matches what the UI would write)
//   2. createBackendTreatment via real client SDK → treatment doc
//   3. deductStockForTreatment via real client SDK → routes through
//      _normalizeStockItems + _deductOneItem (REAL runtime branch 2)
//   4. Admin-SDK verify: skippedItems[].reason === 'product-skip' AND
//      batch.qty.remaining UNCHANGED.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TOKEN_CACHE = path.resolve(import.meta.dirname, '../../.auth/tokens.json');

async function getTokens() {
  try {
    const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (c.expiresAt > Date.now()) return c;
  } catch {}
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth: ${data.error?.message}`);
  const tokens = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens));
  return tokens;
}

async function injectAuth(page) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
  });
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, value); }, { key: authKey, value: authValue });
}

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON_BRANCH_ID = 'BR-1777873556815-26df6480';
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-V43-L2-${Date.now()}-${RUN_ID}`;
const TEST_PRODUCT_ID = `${NS}-PROD`;
const TEST_BATCH_ID = `${NS}-BATCH`;
const TEST_CUSTOMER_ID = `${NS}-CUST`;
const PRODUCT_NAME = `V43L2 TEST product ${RUN_ID}`;

let firestoreDb;
let dataRef;

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initAdminFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing in .env.local.prod');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

test.describe.serial('V43 — ไม่ตัดสต็อค toggle (Rule Q L2 — real client SDK runtime)', () => {
  test.beforeAll(async () => {
    firestoreDb = initAdminFirestore();
    dataRef = firestoreDb.collection('artifacts').doc(APP_ID).collection('public').doc('data');

    const now = new Date().toISOString();

    // Seed TEST customer + TEST batch (we'll let the real saveProduct
    // create the product via the client SDK).
    await dataRef.collection('be_stock_batches').doc(TEST_BATCH_ID).set({
      batchId: TEST_BATCH_ID,
      productId: TEST_PRODUCT_ID,
      productName: PRODUCT_NAME,
      branchId: NAKHON_BRANCH_ID,
      locationId: NAKHON_BRANCH_ID,
      qty: { total: 10, remaining: 10 },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await dataRef.collection('be_customers').doc(TEST_CUSTOMER_ID).set({
      customerId: TEST_CUSTOMER_ID,
      patientData: {
        firstname: 'V43L2',
        lastname: `TestCustomer ${RUN_ID}`,
        firstName: 'V43L2',
        lastName: `TestCustomer ${RUN_ID}`,
        hn: TEST_CUSTOMER_ID,
      },
      branchId: NAKHON_BRANCH_ID,
      courses: [],
      createdAt: now,
      updatedAt: now,
    });
  });

  test.afterAll(async () => {
    if (!firestoreDb) return;

    try {
      // Delete movements for the TEST product
      const movSnap = await dataRef.collection('be_stock_movements')
        .where('productId', '==', TEST_PRODUCT_ID).get();
      for (const d of movSnap.docs) await dataRef.collection('be_stock_movements').doc(d.id).delete();

      // Delete treatments for the TEST customer
      const treatSnap = await dataRef.collection('be_treatments')
        .where('customerId', '==', TEST_CUSTOMER_ID).get();
      for (const d of treatSnap.docs) await dataRef.collection('be_treatments').doc(d.id).delete();

      // Delete sales for the TEST customer (defensive — none expected)
      const saleSnap = await dataRef.collection('be_sales')
        .where('customerId', '==', TEST_CUSTOMER_ID).get();
      for (const d of saleSnap.docs) await dataRef.collection('be_sales').doc(d.id).delete();

      await dataRef.collection('be_stock_batches').doc(TEST_BATCH_ID).delete();
      await dataRef.collection('be_products').doc(TEST_PRODUCT_ID).delete();
      await dataRef.collection('be_customers').doc(TEST_CUSTOMER_ID).delete();

      console.log(`[cleanup] removed TEST fixtures NS=${NS}`);
    } catch (e) {
      console.warn('[cleanup] failed:', e?.message);
    }
  });

  test('L2.A — saveProduct via real client SDK persists skipStockDeduction:true (matches UI checkbox path)', async ({ page }) => {
    test.setTimeout(60000);
    await injectAuth(page);
    // Land on a known backend URL so the firebase client SDK initializes
    // with auth. We don't need to interact with the UI directly.
    await page.goto('/?backend=1');
    // Wait for auth to settle in firebase client SDK
    await page.waitForFunction(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('firebase:authUser:'));
    }, { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Call the REAL saveProduct (same path the UI uses via
    // ProductFormModal:handleSave → saveProduct in scopedDataLayer.js).
    const saveResult = await page.evaluate(async ({ productId, productName, branchId }) => {
      const mod = await import('/src/lib/scopedDataLayer.js');
      try {
        await mod.saveProduct(productId, {
          productId,
          productName,
          productCode: `V43L2-${productId.slice(-8)}`,
          productType: 'ยา',
          branchId,
          categoryName: '',
          mainUnitName: 'ครั้ง',
          price: 100,
          skipStockDeduction: true, // THE flag under test
          stockConfig: { trackStock: true, minAlert: 0, unit: 'ครั้ง', isControlled: false },
          status: 'ใช้งาน',
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }, { productId: TEST_PRODUCT_ID, productName: PRODUCT_NAME, branchId: NAKHON_BRANCH_ID });

    expect(saveResult.ok, `saveProduct error: ${saveResult.error}`).toBe(true);

    // Admin-SDK verify the doc was written with skipStockDeduction:true
    const snap = await dataRef.collection('be_products').doc(TEST_PRODUCT_ID).get();
    expect(snap.exists).toBe(true);
    const data = snap.data();
    expect(data.skipStockDeduction).toBe(true);
    expect(data.productName).toBe(PRODUCT_NAME);
    expect(data.productId).toBe(TEST_PRODUCT_ID);
    expect(data.branchId).toBe(NAKHON_BRANCH_ID);
    expect(data.status).toBe('ใช้งาน');
    expect(data.stockConfig?.trackStock).toBe(true);
  });

  test('L2.B — Runtime: deductStockForTreatment emits product-skip movement + batch UNCHANGED', async ({ page }) => {
    test.setTimeout(60000);
    await injectAuth(page);
    await page.goto('/?backend=1');
    await page.waitForFunction(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('firebase:authUser:'));
    }, { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Read batch.qty.remaining BEFORE the run
    const batchBefore = (await dataRef.collection('be_stock_batches').doc(TEST_BATCH_ID).get()).data();
    expect(batchBefore.qty.remaining).toBe(10);

    // Invoke createBackendTreatment + deductStockForTreatment via REAL
    // backendClient (firebase client SDK with real prod auth). This is
    // the EXACT code path TFP.handleSubmit exercises in production.
    const result = await page.evaluate(async ({ customerId, branchId, productId, productName }) => {
      const mod = await import('/src/lib/backendClient.js');
      try {
        const t = await mod.createBackendTreatment(customerId, {
          treatmentDate: new Date().toISOString().slice(0, 10),
          branchId,
          treatmentItems: [
            { productId, productName, qty: 1, unit: 'ครั้ง', itemType: 'treatmentItem' },
          ],
        });
        const treatmentId = t?.treatmentId;
        if (!treatmentId) {
          return { ok: false, error: 'no treatmentId returned', raw: JSON.stringify(t) };
        }
        const d = await mod.deductStockForTreatment(
          treatmentId,
          [{ productId, productName, qty: 1, unit: 'ครั้ง', itemType: 'treatmentItem' }],
          { branchId, customerId, user: { uid: 'v43-l2-test', email: 'v43-l2@test' } },
        );
        return {
          ok: true,
          treatmentId,
          allocations: d?.allocations || [],
          skippedItems: d?.skippedItems || [],
        };
      } catch (e) {
        return { ok: false, error: String(e?.message || e), stack: String(e?.stack || '').slice(0, 800) };
      }
    }, {
      customerId: TEST_CUSTOMER_ID,
      branchId: NAKHON_BRANCH_ID,
      productId: TEST_PRODUCT_ID,
      productName: PRODUCT_NAME,
    });

    expect(result.ok, `runtime error: ${result.error}\n${result.stack || ''}`).toBe(true);
    console.log(`[L2.B] treatmentId=${result.treatmentId}`);
    console.log(`[L2.B] allocations=${JSON.stringify(result.allocations)}`);
    console.log(`[L2.B] skippedItems=${JSON.stringify(result.skippedItems)}`);

    // Branch 2 of _deductOneItem fires → ZERO allocations + ONE skippedItem
    // with reason='product-skip'.
    expect(result.allocations.length).toBe(0);
    expect(result.skippedItems.length).toBe(1);
    expect(result.skippedItems[0].reason).toBe('product-skip');
    expect(result.skippedItems[0].productId).toBe(TEST_PRODUCT_ID);

    // Grace period for the movement write to propagate
    await page.waitForTimeout(2000);

    // Admin-SDK verify movement.
    // IMPORTANT — `reason: 'product-skip'` is part of the RETURN VALUE of
    // `_deductOneItem`, NOT a field on the Firestore movement doc. The doc
    // itself carries:
    //   - skipped: true
    //   - batchId: null
    //   - qty: -item.qty  (negative because it represents an attempted deduct
    //     that was skipped — see backendClient.js:6937)
    //   - note: 'ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคที่สินค้า'  (product-skip case)
    //   - note: 'ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส'  (course-skip case)
    const movSnap = await dataRef.collection('be_stock_movements')
      .where('productId', '==', TEST_PRODUCT_ID).get();
    const movements = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[L2.B] movements emitted: ${movements.length}`);
    for (const m of movements) {
      console.log(`  - ${m.id} type=${m.type} qty=${m.qty} batchId=${m.batchId === null ? '(null)' : m.batchId} skipped=${m.skipped} note="${m.note || ''}"`);
    }
    expect(movements.length).toBe(1);
    const m = movements[0];
    // Product-skip signature on the movement doc:
    expect(m.skipped).toBe(true);
    expect(m.batchId).toBeNull();
    expect(m.note).toContain('ไม่ตัดสต็อค');
    // Differentiate product-skip from course-skip via the note tail:
    expect(m.note).toContain('ที่สินค้า'); // V43 branch 2 product-skip note
    expect(m.productId).toBe(TEST_PRODUCT_ID);
    expect(m.qty).toBe(-1); // -item.qty per source code
    expect(m.linkedTreatmentId).toBe(result.treatmentId);
    expect(m.customerId).toBe(TEST_CUSTOMER_ID);
    expect(m.branchId).toBe(NAKHON_BRANCH_ID);

    // Admin-SDK verify batch UNCHANGED
    const batchAfter = (await dataRef.collection('be_stock_batches').doc(TEST_BATCH_ID).get()).data();
    expect(batchAfter.qty.remaining).toBe(10);
    expect(batchAfter.qty.total).toBe(10);
  });
});
