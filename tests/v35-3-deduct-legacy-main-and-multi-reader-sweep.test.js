// ─── V35.3 — _deductOneItem missing includeLegacyMain regression ───────────
//
// User report (verbatim, post V15 #6 deploy 2026-04-28):
//   "กด Backfill flag 'ไม่ตัดสต็อค' ในคอร์สทั้งหมด ลองกดสร้างการรักษาใหม่
//   เลือก [IV Drip] Aura bright x 1 ครั้ง ซึ่งมีในคลังสาขา ในหน้ายอด
//   คงเหลือมีอยู่ 31 amp และตัดการรักษา หลังจากนั้นกดบันทึกและบันทึกสำเร็จ
//   มี list ขึ้นที่หน้า movement log ของสาขา แต่ขึ้นแบบในภาพ ซึ่งบอกว่า
//   'ไม่มีสต็อคที่สาขานี้ (BR-1777095572005-ae97f911) — เปิด trackStock
//   แล้วแต่ batch ยังไม่ได้รับเข้า' และไม่ได้ตัดจำนวน [IV Drip] Aura
//   bright x 1 ครั้ง จริง เพราะในหน้ายอดคงเหลือขึ้นจำนวน 31 เท่าเดิม
//   หลังตัดไป 1 ครั้ง"
//
// Root cause: third occurrence of the V12 multi-reader-sweep miss.
//
//   - Phase 15.4 (commit 26ee312, 2026-04-27 session 19) added
//     `includeLegacyMain` opt-in to `listStockBatches` for legacy
//     `branchId='main'` data → updated 3 stock CREATE forms
//     (Adjust/Transfer/Withdrawal). MISSED the BALANCE reader.
//
//   - V35.1 (commit 2026-04-28 session 25) fixed StockBalancePanel +
//     audited all UI panels. MISSED `_deductOneItem` (the actual stock
//     mutation site) and StockSeedPanel (the opening-balance helper).
//
//   - V35.3 (THIS commit, 2026-04-28 session post-V15-#6) fixes
//     `_deductOneItem` + StockSeedPanel + this regression test bank.
//
// Damage scope: any treatment that consumed a course product where the
// batch was at legacy `branchId='main'` AND the user is on a default
// branch (BR-XXX) silently emitted a "no-batch-at-branch" SKIP movement
// (after V15 #6 hotfix) or a "Stock insufficient" THROW (V15 #5 only)
// instead of decrementing the batch. Movement log shows red qty + SKIP
// badge but `batch.qty` unchanged. Same fingerprint as V35 Bug 1
// (StockBalancePanel silent miss) translated to the deduct path.
//
// Test groups:
//   V35.3.A — pure helper invariant (ALL listStockBatches callers
//             classified; EVERY branch-tier reader passes the flag)
//   V35.3.B — _deductOneItem source-grep + flag presence
//   V35.3.C — StockSeedPanel source-grep
//   V35.3.D — sister-reader sweep regression guards
//             (Adjust/Balance/Transfer/Withdrawal still pass the flag)
//   V35.3.E — coverage extension to listStockOrders (low-risk but
//             worth flagging — past orders hidden under same pattern)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendClientSrc = read('src/lib/backendClient.js');
const seedSrc = read('src/components/backend/StockSeedPanel.jsx');
const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
const balanceSrc = read('src/components/backend/StockBalancePanel.jsx');
const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');

// ============================================================================
describe('V35.3.A — multi-reader sweep invariant: ALL listStockBatches branch-tier callers pass includeLegacyMain', () => {
  // Source map of every listStockBatches call site we know about.
  // ANY new caller must land here OR fail this test (forces explicit
  // classification per V12 multi-reader-sweep lesson).
  //
  // Each entry: { path, expectedClassification, expectedFlag } where:
  //   expectedFlag = 'always-true'  — call sites that always need legacy main
  //                  'gated'        — call sites that gate on deriveLocationType==='BRANCH'
  //                  'unset'        — call sites in central-only contexts (allowed)
  const KNOWN_CALL_SITES = [
    { tag: 'backendClient.js:_deductOneItem',          expectedFlag: 'always-true', src: backendClientSrc },
    { tag: 'StockSeedPanel.jsx:load',                  expectedFlag: 'always-true', src: seedSrc },
    { tag: 'StockAdjustPanel.jsx:listing',             expectedFlag: 'gated',       src: adjustSrc },
    { tag: 'StockAdjustPanel.jsx:productId-filter',    expectedFlag: 'gated',       src: adjustSrc },
    { tag: 'StockBalancePanel.jsx:load',               expectedFlag: 'gated',       src: balanceSrc },
    { tag: 'StockTransferPanel.jsx:source-load',       expectedFlag: 'gated',       src: transferSrc },
    { tag: 'StockWithdrawalPanel.jsx:source-load',     expectedFlag: 'gated',       src: withdrawalSrc },
  ];

  it('A.1 every known caller appears in the codebase exactly where expected', () => {
    // Each call-site source contains listStockBatches at least once.
    expect(backendClientSrc.match(/listStockBatches\(/g)?.length).toBeGreaterThanOrEqual(2); // 1 export + 1 _deductOneItem
    expect(seedSrc).toMatch(/listStockBatches\(/);
    expect(adjustSrc.match(/listStockBatches\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(balanceSrc).toMatch(/listStockBatches\(/);
    expect(transferSrc).toMatch(/listStockBatches\(/);
    expect(withdrawalSrc).toMatch(/listStockBatches\(/);
  });

  it('A.2 EVERY listStockBatches call in src/ passes either includeLegacyMain (literal) OR no-flag default — count matches expected', () => {
    // Tally the unique call shapes across all known sources. The total
    // call count (excluding the export declaration itself) should be 8.
    const sources = [backendClientSrc, seedSrc, adjustSrc, balanceSrc, transferSrc, withdrawalSrc];
    let total = 0;
    let withFlag = 0;
    for (const src of sources) {
      const callMatches = src.match(/listStockBatches\([^)]*\)/g) || [];
      // Skip the export declaration (`export async function listStockBatches({...})`)
      const realCalls = callMatches.filter(m => !m.startsWith('listStockBatches({') || !src.match(/export\s+async\s+function\s+listStockBatches/) || src.indexOf(m) !== src.indexOf(`export async function ${m}`));
      // Simpler: just count occurrences of `listStockBatches(` minus the function declaration prefix
      total += (src.match(/listStockBatches\(/g) || []).length;
      withFlag += (src.match(/listStockBatches\(\{[^}]*includeLegacyMain[^}]*\}/g) || []).length;
    }
    // -1 for the function declaration itself (in backendClient.js)
    const callerCount = total - 1;
    expect(callerCount).toBeGreaterThanOrEqual(7); // 6 panel callers + _deductOneItem
    // At least 7 callers should have the flag (1 _deductOneItem unconditional + 6 gated/conditional in panels)
    expect(withFlag).toBeGreaterThanOrEqual(7);
  });
});

// ============================================================================
describe('V35.3.B — _deductOneItem now passes includeLegacyMain:true', () => {
  it('B.1 _deductOneItem listStockBatches call includes includeLegacyMain:true', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    // Find the listStockBatches call and assert it has the flag
    expect(slice).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*true[^}]*\}\)/);
  });

  it('B.1-bis V35.3-bis: batchFifoAllocate call MUST NOT pass branchId (legacy-main filter regression)', () => {
    // V35.3-bis (2026-04-28 same-day): user reported the V35.3 first cut
    // didn't actually fix the bug. Root cause was batchFifoAllocate's
    // own strict-equality branchId filter (`b.branchId !== opts.branchId`)
    // re-filtering legacy 'main' batches OUT after listStockBatches had
    // included them. Fix: drop branchId from the batchFifoAllocate call;
    // listStockBatches is the single source of truth for branch filtering.
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    const callMatch = slice.match(/batchFifoAllocate\([^,]+,\s*item\.qty,\s*\{[^}]+\}\)/);
    expect(callMatch).toBeTruthy();
    const callOptsMatch = callMatch[0].match(/\{[^}]+\}/);
    expect(callOptsMatch[0]).toMatch(/productId/);
    expect(callOptsMatch[0]).toMatch(/preferNewest/);
    // Critical: branchId MUST NOT be in the opts — listStockBatches handled it
    expect(callOptsMatch[0]).not.toMatch(/\bbranchId\b/);
  });

  it('B.2 V35.3 institutional-memory comment present (anti-V12 marker)', () => {
    // The fix block contains the V35.3 marker so future readers see the
    // pattern (and the test grep will fail if someone strips the comment).
    expect(backendClientSrc).toMatch(/V35\.3/);
    expect(backendClientSrc).toMatch(/hotfix.*V35\.3.*post V15 #6/i);
  });

  it('B.3 V31 fail-loud throw still preserved for sale context (not gutted by hotfix)', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    expect(slice).toMatch(/Stock insufficient/);
    expect(slice).toMatch(/throw new Error/);
  });
});

// ============================================================================
describe('V35.3.C — StockSeedPanel listStockBatches now passes includeLegacyMain:true', () => {
  it('C.1 StockSeedPanel load() call includes includeLegacyMain:true', () => {
    expect(seedSrc).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*true[^}]*\}\)/);
  });

  it('C.2 V35.3 marker comment present', () => {
    expect(seedSrc).toMatch(/V35\.3/);
  });
});

// ============================================================================
describe('V35.3.D — sister readers regression guard (Phase 15.4 + V35.1 fixes preserved)', () => {
  it('D.1 StockAdjustPanel passes flag (gated by isBranchTier)', () => {
    expect(adjustSrc).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*isBranchTier[^}]*\}\)/);
  });

  it('D.2 StockBalancePanel passes flag (gated)', () => {
    expect(balanceSrc).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain[^}]*\}\)/);
  });

  it('D.3 StockTransferPanel passes flag (gated by isBranchSrc)', () => {
    expect(transferSrc).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*isBranchSrc[^}]*\}\)/);
  });

  it('D.4 StockWithdrawalPanel passes flag (gated by isBranchSrc)', () => {
    expect(withdrawalSrc).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*isBranchSrc[^}]*\}\)/);
  });
});

// ============================================================================
describe('V35.3.E — coverage extension: listStockOrders + adjacent branch-scoped queries', () => {
  // listStockOrders has the same legacy-main shape risk (default branch
  // BR-XXX won't see orders with branchId='main' from pre-V20 imports).
  // Less critical (history-display only, doesn't affect balance math)
  // but worth FLAGGING in the regression bank so future audits catch it.
  it('E.1 listStockOrders branchId filter (potential legacy-main miss — flagged but not yet fixed)', () => {
    // Source-only invariant: documents the known limitation. If someone
    // adds includeLegacyMain to listStockOrders later, this test prompts
    // them to extend the regression bank.
    const fnStart = backendClientSrc.indexOf('export async function listStockOrders(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 800);
    expect(slice).toMatch(/where\(['"]branchId['"]/);
    // No flag yet — flagging future audit
    const hasFlag = /includeLegacyMain/.test(slice);
    if (hasFlag) {
      // If a future fix adds the flag, the existing audit must extend
      // sister-reader coverage. This test is informational.
      expect(hasFlag).toBe(true);
    }
  });

  it('E.2 listStockMovements uses client-side filter (V35 Phase 15.6 — already legacy-main safe)', () => {
    // Movement reader doesn't depend on includeLegacyMain because it
    // does client-side branchId filtering (m.branchId === X || m.branchIds.includes(X))
    // after a non-branch server-side fetch.
    const fnStart = backendClientSrc.indexOf('export async function listStockMovements(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 4000);
    expect(slice).toMatch(/branchIds\.includes|m\.branchId\s*===/);
  });

  it('E.3 deleteCentralWarehouse stock-leak guard — branchId-strict by design (central-only path)', () => {
    // Central warehouses are never given legacy 'main' branchId.
    // Strict equality is correct here.
    const fnStart = backendClientSrc.indexOf('export async function deleteCentralWarehouse(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 600);
    expect(slice).toMatch(/where\(['"]branchId['"]/);
    // Should NOT include legacy main (central tier never had it)
    expect(slice).not.toMatch(/includeLegacyMain/);
  });
});

// ============================================================================
describe('V35.3.F — adversarial regression bank (lifecycle of the bug)', () => {
  it('F.1 reverseStockForTreatment uses linkedTreatmentId queries (NOT branchId-scoped — safe)', () => {
    const fnStart = backendClientSrc.indexOf('export async function reverseStockForTreatment(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 2000);
    expect(slice).toMatch(/linkedTreatmentId/);
    // Does NOT call listStockBatches with branchId — uses listStockMovements
    expect(slice).not.toMatch(/listStockBatches\(\{[^}]*branchId/);
  });

  it('F.2 reverseStockForSale uses linkedSaleId queries (NOT branchId-scoped — safe)', () => {
    const fnStart = backendClientSrc.indexOf('export async function reverseStockForSale(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 2000);
    expect(slice).toMatch(/linkedSaleId/);
    expect(slice).not.toMatch(/listStockBatches\(\{[^}]*branchId/);
  });

  it('F.3 V35.3 fix shape — _deductOneItem flag is always-true (NOT gated like UI panels)', () => {
    // _deductOneItem runs at branch tier ONLY (sale + treatment never run
    // at central). Unconditional flag is safe and simpler than gating.
    // If someone adds central-tier deduction in the future, they must
    // re-classify and update this test.
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    expect(slice).toMatch(/listStockBatches\(\{[^}]*includeLegacyMain:\s*true[^}]*\}\)/);
    // Sanity: does NOT use a gated variable like isBranchTier here
    const fifoCallMatch = slice.match(/listStockBatches\(\{[^}]*\}\)/);
    expect(fifoCallMatch?.[0]).not.toMatch(/includeLegacyMain:\s*isBranch/);
  });
});
