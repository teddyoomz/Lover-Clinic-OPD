// V36 / V36-bis / V36-tris — Treatment SKIP path regression bank.
//
// Timeline:
//   - V36 (2026-04-29 morning): added TRACKED_UPSERT_FAILED throw in
//     treatment context to surface "config-impossible" cases loudly.
//   - V36-bis (2026-04-29 afternoon): user report — Allergan 100 U treatment
//     save threw the V36 error even though product DOES exist (id=941 with
//     stockConfig.trackStock=true). Root cause: many submission paths set
//     item.productId to a synthetic value (rowId from purchases, master_data
//     clone id, empty falls to row.id) that doesn't match the canonical
//     be_products doc id even though item.productName matches. User
//     directive: "ห้ามพลาดแบบนี้อีก ไม่ว่าจะเป็นการ submit จากไหน".
//     V36-bis fix:
//       (a) Add `_resolveProductIdByName` fallback — exact-name match in
//           be_products → rewire item.productId before auto-init.
//       (b) REVERTED V36 throw → silent-skip with diagnostic note.
//   - V36-tris (2026-04-29 afternoon): user directive — "ห้ามใช้ master_data
//     ใน backend ไม่ว่าจะใช้ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้
//     be_database เท่านั้น". Removed master_data legacy fallback from
//     `_getProductStockConfig` + `_ensureProductTracked`. be_products is
//     the only source of truth at runtime.
//
// Test classes:
//   V36.E.6-10  — V36-bis: silent-skip with diagnostic note (NOT throw)
//   V36.E.11-15 — Phase 15.7 negative-stock invariant preserved
//   V36.E.16-20 — _ensureProductTracked setDoc-merge path
//   V36.E.21-25 — caller-side error propagation
//   V36.H.1-8   — V36-bis name-fallback resolution
//   V36.I.1-6   — V36-tris master_data fallback removal

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_CLIENT = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8'
);
const TFP = readFileSync(
  resolve(__dirname, '../src/components/TreatmentFormPage.jsx'),
  'utf-8'
);

describe('V36.E.6-10 — V36-bis: silent-skip with diagnostic note (NOT throw)', () => {
  test('E.6 — V36-bis: NO TRACKED_UPSERT_FAILED throw in _deductOneItem', () => {
    // V36 throw was reverted in V36-bis per user directive
    // "ห้ามพลาดแบบนี้อีก ไม่ว่าจะเป็นการ submit จากไหน".
    // _deductOneItem must NOT throw a TRACKED_UPSERT_FAILED error.
    expect(BACKEND_CLIENT).not.toMatch(/throw\s+err;[\s\S]{0,300}TRACKED_UPSERT_FAILED/);
    expect(BACKEND_CLIENT).not.toMatch(/err\.code\s*=\s*['"]TRACKED_UPSERT_FAILED['"]/);
  });

  test('E.7 — silent-skip emit at !tracked still exists with Thai note', () => {
    expect(BACKEND_CLIENT).toMatch(/note: reason === ['"]trackStock-false['"]/);
    expect(BACKEND_CLIENT).toMatch(/product not yet configured for stock tracking/);
  });

  test('E.8 — auto-init still fires for sale + treatment context (V35.3-ter preserved)', () => {
    expect(BACKEND_CLIENT).toMatch(/if \(!tracked && \(context === ['"]treatment['"] \|\| context === ['"]sale['"]\)\)/);
  });

  test('E.9 — V35.3-ter contract reaffirmed in code comment', () => {
    expect(BACKEND_CLIENT).toMatch(/V35\.3-ter/);
  });

  test('E.10 — V36-bis revert marker comment present', () => {
    expect(BACKEND_CLIENT).toMatch(/V36-bis \(2026-04-29\)[\s\S]{0,500}REVERTED/);
  });
});

describe('V36.E.11-15 — Phase 15.7 negative-stock invariant preserved', () => {
  test('E.11 — pickNegativeTargetBatch still imported + invoked', () => {
    expect(BACKEND_CLIENT).toMatch(/pickNegativeTargetBatch/);
    expect(BACKEND_CLIENT).toMatch(/pickNegativeTargetBatch\s*\(/);
  });

  test('E.12 — AUTO-NEG batch synthesis still present', () => {
    expect(BACKEND_CLIENT).toMatch(/AUTO-NEG-/);
    expect(BACKEND_CLIENT).toMatch(/autoNegative:\s*true/);
  });

  test('E.13 — negativeOverage marker still set on movement', () => {
    expect(BACKEND_CLIENT).toMatch(/negativeOverage/);
  });

  test('E.14 — shortfall path is gated on context AND reachable from tracked=true', () => {
    // The shortfall path is `if (plan.shortfall > 0 && (context === 'treatment' || ...))`.
    // V35.3-ter auto-init succeeds → tracked=true → FIFO with shortfall → AUTO-NEG.
    expect(BACKEND_CLIENT).toMatch(/if \(plan\.shortfall > 0 && \(context === ['"]treatment['"] \|\| context === ['"]sale['"]\)\)/);
  });

  test('E.15 — Phase 15.7 unchanged by V36-bis revert (negative-stock allowance intact)', () => {
    // Confirm pickNegativeTargetBatch + autoNegative + negativeOverage all
    // still wire together inside _deductOneItem (not orphaned).
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    expect(body).toMatch(/pickNegativeTargetBatch/);
    expect(body).toMatch(/autoNegative:\s*true/);
    expect(body).toMatch(/negativeOverage/);
  });
});

describe('V36.E.16-20 — _ensureProductTracked setDoc-merge path (V36-tris: be_products only)', () => {
  test('E.16 — be_products branch uses setDoc with merge:true', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).toMatch(/setDoc\(beRef,[\s\S]{0,300}merge:\s*true/);
  });

  test('E.17 — V36-tris: master_data branch REMOVED', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    // No more master_data references in this helper
    expect(body).not.toMatch(/master_data/);
    expect(body).not.toMatch(/legacyRef/);
    expect(body).not.toMatch(/legacySnap/);
  });

  test('E.18 — return null when be_products doc missing', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    // Structure: if (!beSnap.exists()) return null; else setDoc + return baseConfig.
    expect(body).toMatch(/if \(!beSnap\.exists\(\)\)\s*return null/);
    expect(body).toMatch(/return baseConfig/);
  });

  test('E.19 — no updateDoc anywhere in helper (V36 setDoc-merge contract)', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).not.toMatch(/await\s+updateDoc\s*\(/);
  });

  test('E.20 — idempotency check (early-return when already tracked)', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).toMatch(/existing.*trackStock\s*===\s*true/);
    expect(body).toMatch(/return existing/);
  });
});

describe('V36.E.21-25 — caller-side error propagation', () => {
  test('E.21 — deductStockForTreatment throws on _deductOneItem error (rethrow)', () => {
    const fnStart = BACKEND_CLIENT.indexOf('export async function deductStockForTreatment');
    const fnEnd = BACKEND_CLIENT.indexOf('\nexport async function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
    expect(body).toMatch(/catch \(err\)\s*\{[\s\S]+?throw err;/);
  });

  test('E.22 — deductStockForTreatment rolls back via reverseStockForTreatment', () => {
    const fnStart = BACKEND_CLIENT.indexOf('export async function deductStockForTreatment');
    const fnEnd = BACKEND_CLIENT.indexOf('\nexport async function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
    expect(body).toMatch(/reverseStockForTreatment\s*\(/);
  });

  test('E.23 — TreatmentFormPage handleSubmit catches stockErr + rethrows with Thai prefix', () => {
    expect(TFP).toMatch(/catch\s*\(stockErr\)\s*\{[\s\S]+?ตัดสต็อกการรักษาไม่สำเร็จ/);
  });

  test('E.24 — Thai error surface uses stockErr.message', () => {
    expect(TFP).toMatch(/ตัดสต็อกการรักษาไม่สำเร็จ:\s*\$\{stockErr\.message\}/);
  });

  test('E.25 — branchId on deductStockForTreatment call comes from useSelectedBranch (V36 Phase 1.5)', () => {
    expect(TFP).toMatch(/useSelectedBranch\s*\(\s*\)/);
    expect(TFP).toMatch(/branchId:\s*SELECTED_BRANCH_ID/);
  });
});

describe('V36.H — V36-bis productName fallback resolution', () => {
  test('H.1 — _resolveProductIdByName helper exists', () => {
    expect(BACKEND_CLIENT).toMatch(/async function _resolveProductIdByName/);
  });

  test('H.2 — helper does case-insensitive trimmed match', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _resolveProductIdByName');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 2000);
    expect(body).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
  });

  test('H.3 — helper queries via listProducts (be_products only — V36-tris)', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _resolveProductIdByName');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 2000);
    expect(body).toMatch(/listProducts\s*\(/);
    // Should NOT touch master_data
    expect(body).not.toMatch(/master_data/);
  });

  test('H.4 — _deductOneItem invokes name fallback when initial id lookup fails', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    expect(body).toMatch(/_resolveProductIdByName/);
  });

  test('H.5 — name fallback gated on !tracked + productName + (treatment|sale) context', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    // The fallback block uses item.productName to resolve
    expect(body).toMatch(/!tracked && item\.productName/);
  });

  test('H.6 — lookupProductId variable carries resolved id for downstream FIFO', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    expect(body).toMatch(/let lookupProductId/);
    // listStockBatches uses lookupProductId for FIFO query
    expect(body).toMatch(/listStockBatches\(\{ productId: lookupProductId/);
    // pickNegativeTargetBatch uses lookupProductId for negative-stock target
    expect(body).toMatch(/productId: lookupProductId/);
  });

  test('H.7 — console.info trace when name fallback resolves', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    expect(body).toMatch(/console\.info\([\s\S]{0,200}name fallback/);
  });

  test('H.8 — V36-bis marker comment near the name-fallback block', () => {
    expect(BACKEND_CLIENT).toMatch(/V36-bis \(2026-04-29\)[\s\S]{0,500}name fallback/);
  });
});

describe('V36.J — V36-bis course-history audit fix (deductCourseItems after createBackendTreatment)', () => {
  test('J.1 — deductCourseItems is called AFTER createBackendTreatment in TFP handleSubmit', () => {
    const createIdx = TFP.indexOf('createBackendTreatment(customerId, backendDetail)');
    const deductIdx = TFP.indexOf('await deductCourseItems(customerId, existingDeductions');
    expect(createIdx).toBeGreaterThan(0);
    expect(deductIdx).toBeGreaterThan(0);
    expect(deductIdx).toBeGreaterThan(createIdx);
  });

  test('J.2 — deductCourseItems passes the resolved newTid (result.treatmentId || treatmentId)', () => {
    expect(TFP).toMatch(/const newTid = result\.treatmentId \|\| treatmentId/);
    expect(TFP).toMatch(/treatmentId: newTid/);
  });

  test('J.3 — atomic rollback on course-deduct failure: deleteBackendTreatment fires for create-mode orphans', () => {
    expect(TFP).toMatch(/catch \(courseErr\)\s*\{[\s\S]+?deleteBackendTreatment/);
    // edit-mode skip: only delete when !isEdit
    expect(TFP).toMatch(/if \(!isEdit && result\?\.treatmentId\)/);
  });

  test('J.4 — Thai error prefix "ตัดคอร์สไม่สำเร็จ" on course-deduct failure', () => {
    expect(TFP).toMatch(/ตัดคอร์สไม่สำเร็จ:\s*\$\{courseErr\.message\}/);
  });

  test('J.5 — deductCourseItems audit emit (backendClient.js) gated on opts.treatmentId', () => {
    expect(BACKEND_CLIENT).toMatch(/Phase 16\.5-quater[\s\S]{0,400}kind=['"]use['"]/);
    expect(BACKEND_CLIENT).toMatch(/if \(opts\.treatmentId\)\s*\{[\s\S]{0,800}kind:\s*['"]use['"]/);
  });

  test('J.6 — V36-bis marker comment near the reorder', () => {
    expect(TFP).toMatch(/V36-bis \(2026-04-29\)[\s\S]{0,800}deductCourseItems[\s\S]{0,200}createBackendTreatment/);
  });
});

describe('V36.I — V36-tris master_data fallback removal', () => {
  test('I.1 — _getProductStockConfig does NOT read master_data', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _getProductStockConfig');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 1500);
    expect(body).not.toMatch(/master_data/);
    expect(body).not.toMatch(/legacyRef/);
    expect(body).not.toMatch(/legacySnap/);
  });

  test('I.2 — _ensureProductTracked does NOT read master_data', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).not.toMatch(/master_data/);
    expect(body).not.toMatch(/legacyRef/);
    expect(body).not.toMatch(/legacySnap/);
  });

  test('I.3 — _resolveProductIdByName uses listProducts (be_products) only', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _resolveProductIdByName');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 2000);
    expect(body).toMatch(/listProducts/);
    expect(body).not.toMatch(/master_data/);
  });

  test('I.4 — V36-tris marker comment in _getProductStockConfig', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _getProductStockConfig');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 1500);
    expect(body).toMatch(/V36-tris/);
  });

  test('I.5 — V36-tris marker comment in _ensureProductTracked', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).toMatch(/V36-tris/);
  });

  test('I.6 — listProducts reads be_products via productsCol helper (no master_data) — Phase 14.10-tris contract', () => {
    // productsCol helper resolves to be_products collection.
    expect(BACKEND_CLIENT).toMatch(/const productsCol\s*=\s*\(\)\s*=>\s*collection\(db,\s*\.\.\.basePath\(\),\s*['"]be_products['"]/);
    // listProducts uses productsCol (NOT a master_data path).
    const fnStart = BACKEND_CLIENT.indexOf('export async function listProducts');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = BACKEND_CLIENT.indexOf('\nexport async function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
    expect(body).toMatch(/productsCol/);
    expect(body).not.toMatch(/master_data/);
  });
});
