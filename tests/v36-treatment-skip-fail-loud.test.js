// V36 — Treatment fail-loud config-impossible regression bank.
//
// Locks the V36 contract (2026-04-29):
//   - Treatment context: when _ensureProductTracked returns null AND the
//     product genuinely doesn't exist in EITHER be_products OR
//     master_data/products/items, throw TRACKED_UPSERT_FAILED with
//     friendly Thai error. Was: silent SKIP movement that misled admin.
//   - Sale context: preserves silent-skip per V35.3-ter explicit user
//     contract ("ขายของจาก tab=sales แล้ว...สุดท้ายก็ไม่มีการตัดสต็อคจริง"
//     was the V35.3-ter complaint; we ALREADY chose silent-skip there to
//     match Phase 12.x sale flow). Throwing in sale context = regression.
//   - Phase 15.7 negative-stock invariant PRESERVED: tracked product +
//     shortfall still routes through pickNegativeTargetBatch + AUTO-NEG
//     synthesis. NO TRACKED_UPSERT_FAILED fires for shortfall — only
//     fires for genuine config-impossible.
//
// Test classes:
//   V36.E.1-5   — TRACKED_UPSERT_FAILED error shape (code, productId,
//                 productName, Thai message)
//   V36.E.6-10  — fail-loud branch source-grep (treatment context throws,
//                 sale context falls through to silent-skip)
//   V36.E.11-15 — Phase 15.7 negative-stock invariant grep (AUTO-NEG synth
//                 + pickNegativeTargetBatch + negativeOverage marker still
//                 present and gated by tracked=true, NOT by config-possible)
//   V36.E.16-20 — _ensureProductTracked setDoc-merge path (be_products +
//                 master_data branches both use merge upsert; null only
//                 returned when genuinely no doc anywhere)
//   V36.E.21-25 — Caller-side error propagation (TreatmentFormPage catches
//                 stockErr.message → friendly Thai surface in alert)

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

describe('V36.E.1-5 — TRACKED_UPSERT_FAILED error shape', () => {
  test('E.1 — error code is TRACKED_UPSERT_FAILED', () => {
    expect(BACKEND_CLIENT).toMatch(/err\.code\s*=\s*['"]TRACKED_UPSERT_FAILED['"]/);
  });

  test('E.2 — error carries productId field', () => {
    expect(BACKEND_CLIENT).toMatch(/err\.productId\s*=\s*item\.productId/);
  });

  test('E.3 — error carries productName field', () => {
    expect(BACKEND_CLIENT).toMatch(/err\.productName\s*=\s*item\.productName/);
  });

  test('E.4 — Thai error message references "ไม่สามารถตั้งค่า" + product name', () => {
    expect(BACKEND_CLIENT).toMatch(/ไม่สามารถตั้งค่าการตัดสต็อคของสินค้า/);
    // Message uses item.productName fallback to item.productId
    expect(BACKEND_CLIENT).toMatch(/item\.productName\s*\|\|\s*item\.productId/);
  });

  test('E.5 — Thai error message points admin to ProductFormModal', () => {
    expect(BACKEND_CLIENT).toMatch(/ข้อมูลพื้นฐาน\s*→\s*สินค้า/);
  });
});

describe('V36.E.6-10 — fail-loud branch source-grep', () => {
  test('E.6 — throw is gated to context==="treatment" only', () => {
    // The else-if branch must check context === 'treatment' BEFORE throw.
    // Comment block + Thai error message before the throw add up to ~1300
    // chars so window is generous.
    expect(BACKEND_CLIENT).toMatch(/else if \(context === ['"]treatment['"]\)\s*\{[\s\S]{0,2500}TRACKED_UPSERT_FAILED/);
  });

  test('E.7 — sale context falls through to legacy silent-skip', () => {
    // Comment must explicitly say sale context preserves silent-skip
    expect(BACKEND_CLIENT).toMatch(/sale context.*silent-skip/i);
    // The SKIP emit at line ~5755-5782 must still exist
    expect(BACKEND_CLIENT).toMatch(/note: reason === ['"]trackStock-false['"]/);
    expect(BACKEND_CLIENT).toMatch(/product not yet configured for stock tracking/);
  });

  test('E.8 — auto-init still fires for sale context (V35.3-ter preserved)', () => {
    expect(BACKEND_CLIENT).toMatch(/if \(!tracked && \(context === ['"]treatment['"] \|\| context === ['"]sale['"]\)\)/);
  });

  test('E.9 — V35.3-ter contract reaffirmed in code comment', () => {
    expect(BACKEND_CLIENT).toMatch(/V35\.3-ter/);
  });

  test('E.10 — V36 marker comment near the throw', () => {
    expect(BACKEND_CLIENT).toMatch(/V36 \(2026-04-29\)[\s\S]{0,200}fail-loud/);
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

  test('E.14 — shortfall path is gated on context AND tracked=true (NOT TRACKED_UPSERT_FAILED gate)', () => {
    // V36 throw fires BEFORE the tracked-with-shortfall path. The shortfall
    // path is `if (plan.shortfall > 0 && (context === 'treatment' || ...))`.
    // It must remain reachable from the tracked=true branch (V35.3-ter
    // auto-init succeeded → tracked=true → FIFO with shortfall → AUTO-NEG).
    expect(BACKEND_CLIENT).toMatch(/if \(plan\.shortfall > 0 && \(context === ['"]treatment['"] \|\| context === ['"]sale['"]\)\)/);
  });

  test('E.15 — V36 throw NOT fired for shortfall (only config-impossible)', () => {
    // Source-grep: the throw is inside the !tracked block, NOT inside the
    // shortfall block. shortfall block lives lower in _deductOneItem and
    // never throws TRACKED_UPSERT_FAILED.
    const throwIdx = BACKEND_CLIENT.indexOf("err.code = 'TRACKED_UPSERT_FAILED'");
    expect(throwIdx).toBeGreaterThan(0);
    const after = BACKEND_CLIENT.substring(throwIdx, throwIdx + 1500);
    // The shortfall path uses `pickNegativeTargetBatch` — must NOT appear
    // INSIDE the throw block (between throw and end of else-if).
    const blockEnd = after.indexOf('}');
    expect(blockEnd).toBeGreaterThan(0);
    const block = after.substring(0, blockEnd);
    expect(block).not.toMatch(/pickNegativeTargetBatch/);
  });
});

describe('V36.E.16-20 — _ensureProductTracked setDoc-merge path', () => {
  test('E.16 — be_products branch uses setDoc with merge:true', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    // be_products branch
    expect(body).toMatch(/be_products[\s\S]{0,500}setDoc\(beRef,[\s\S]{0,300}merge:\s*true/);
  });

  test('E.17 — master_data branch uses setDoc with merge:true', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    expect(body).toMatch(/master_data[\s\S]{0,500}setDoc\(legacyRef,[\s\S]{0,300}merge:\s*true/);
  });

  test('E.18 — return null only when both be_products + master_data missing', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 5000);
    // The structure is: if be exists → setDoc + return baseConfig; else if legacy exists → setDoc + return baseConfig; else return null.
    expect(body).toMatch(/if \(beSnap\.exists\(\)\)\s*\{[\s\S]+?return baseConfig;/);
    expect(body).toMatch(/if \(legacySnap\.exists\(\)\)\s*\{[\s\S]+?return baseConfig;/);
    expect(body).toMatch(/return null;[\s\S]{0,200}\}\s*catch/);
  });

  test('E.19 — no updateDoc on either branch (V36 contract)', () => {
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

  test('E.24 — Thai error surface uses stockErr.message (carries V36 friendly text)', () => {
    expect(TFP).toMatch(/ตัดสต็อกการรักษาไม่สำเร็จ:\s*\$\{stockErr\.message\}/);
  });

  test('E.25 — branchId on deductStockForTreatment call comes from useSelectedBranch (V36 Phase 1.5)', () => {
    expect(TFP).toMatch(/useSelectedBranch\s*\(\s*\)/);
    expect(TFP).toMatch(/branchId:\s*SELECTED_BRANCH_ID/);
  });
});
