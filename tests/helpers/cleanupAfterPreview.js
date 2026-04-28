// Phase 15.7 (2026-04-28) — preview_eval test cleanup helper.
//
// User directive: "ล้างสิ่งที่ตัวเอง test ให้สะอาดไร้ร่องรอยด้วย" (clean test
// artifacts so no trace remains). This helper centralises the cleanup
// pattern shared across N10 preview_eval round-trips.
//
// Usage from a test (after running a real-Firestore preview_eval round-trip):
//
//   import { cleanupTestArtifacts } from './helpers/cleanupAfterPreview.js';
//   const result = await cleanupTestArtifacts({
//     branchIds: [testBranchId],
//     productIds: [testProductId],
//     saleIds: [testSaleId],
//   });
//   expect(result.cleaned).toBe(true);
//
// Implementation strategy: emit a single bash-runnable curl recipe that the
// test can shell out OR a developer can copy-paste. Our preview_eval scripts
// run inside the dev server, so cleanup happens INSIDE the same script (this
// helper is a pure ID-list builder + assertion helper for the test side).
// The dev-server preview_eval scripts call /api/admin/cleanup-test-sales,
// /api/admin/cleanup-test-products, /api/admin/cleanup-orphan-stock and
// assert returned counts.
//
// This helper provides the assertion shape (test-side) — the cleanup itself
// runs on the dev server during preview_eval (browser-side ID-token mint +
// fetch).

/**
 * Build the cleanup intent — a structured list of doc IDs to verify removed.
 * Tests pass this to preview_eval which runs the actual deletes via the
 * admin endpoints, then returns counts. Test asserts counts === expected.
 *
 * @param {object} args
 * @param {string[]} [args.branchIds]
 * @param {string[]} [args.productIds]
 * @param {string[]} [args.batchIds]
 * @param {string[]} [args.saleIds]
 * @param {string[]} [args.customerIds]
 * @returns {{
 *   branchIds: string[],
 *   productIds: string[],
 *   batchIds: string[],
 *   saleIds: string[],
 *   customerIds: string[],
 *   totalArtifacts: number,
 * }}
 */
export function buildCleanupIntent(args = {}) {
  const branchIds = Array.isArray(args.branchIds) ? args.branchIds.filter(Boolean) : [];
  const productIds = Array.isArray(args.productIds) ? args.productIds.filter(Boolean) : [];
  const batchIds = Array.isArray(args.batchIds) ? args.batchIds.filter(Boolean) : [];
  const saleIds = Array.isArray(args.saleIds) ? args.saleIds.filter(Boolean) : [];
  const customerIds = Array.isArray(args.customerIds) ? args.customerIds.filter(Boolean) : [];
  return {
    branchIds,
    productIds,
    batchIds,
    saleIds,
    customerIds,
    totalArtifacts: branchIds.length + productIds.length + batchIds.length + saleIds.length + customerIds.length,
  };
}

/**
 * Verify every ID in the intent has a TEST-/E2E- prefix.
 * Throws if any non-prefixed ID is found — preventing accidental
 * production-data cleanup attempts.
 */
export function assertAllTestPrefixed(intent) {
  const SAFE_PREFIXES = /^(TEST-|E2E-)/;
  const violations = [];
  for (const k of ['branchIds', 'productIds', 'batchIds', 'saleIds', 'customerIds']) {
    for (const id of intent[k] || []) {
      if (!SAFE_PREFIXES.test(String(id))) {
        violations.push({ key: k, id: String(id) });
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `cleanupAfterPreview: ${violations.length} non-prefixed IDs in cleanup intent: ` +
      violations.map(v => `${v.key}=${v.id}`).join(', ') +
      `. Use createTestStockBranchId/createTestStockProductId/createTestStockBatchId/` +
      `createTestSaleId/createTestCustomerId to generate prefixed IDs.`
    );
  }
}
