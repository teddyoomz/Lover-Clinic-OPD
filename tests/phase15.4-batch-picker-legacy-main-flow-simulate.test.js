// ─── Phase 15.4 — Batch picker legacy-main fallback (item 2) ────────────────
// User report (s19, verbatim):
//   "ปรับสต็อคไม่ได้ ติด Batch / Lot เลือกไม่ได้"
//
// Diagnosis: pre-V20 multi-branch data was written with branchId='main'.
// After V20 BranchContext returns 'BR-XXX'. Calls to listStockBatches with
// branchId='BR-XXX' filtered legacy batches out → user picker empty.
//
// Fix: opt-in `includeLegacyMain: true` flag in listStockBatches dual-queries
// current branch + 'main' and merges. Stock create forms (Adjust/Transfer/
// Withdrawal) pass it so user can pick legacy batches until admin migrates.
// Default false keeps strict-readers (e.g. central audit) clean.
//
// Coverage:
//   BP.A — listStockBatches signature + dual-query when includeLegacyMain=true
//   BP.B — V31 no-silent-swallow on fallback query failure
//   BP.C — backward compat: default behaviour unchanged (no flag = single query)
//   BP.D — 3 stock create forms pass includeLegacyMain: true
//   BP.E — dedupe + sort preserved across merged result

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');

// ============================================================================
describe('Phase 15.4 BP.A — listStockBatches dual-query when includeLegacyMain set', () => {
  const fnStart = backendSrc.indexOf('export async function listStockBatches');
  expect(fnStart, 'listStockBatches not found').toBeGreaterThan(0);
  const fnSlice = backendSrc.slice(fnStart, fnStart + 2500);

  it('BP.A.1 — function exists', () => {
    expect(fnStart).toBeGreaterThan(0);
  });

  it('BP.A.2 — accepts includeLegacyMain parameter (default false)', () => {
    expect(fnSlice).toMatch(/includeLegacyMain\s*=\s*false/);
  });

  it('BP.A.3 — dual-query when includeLegacyMain && branchId !== "main"', () => {
    expect(fnSlice).toMatch(/if\s*\(\s*includeLegacyMain\s*&&\s*branchId\s*&&\s*String\(branchId\)\s*!==\s*['"]main['"]/);
  });

  it('BP.A.4 — Q1 + Q2 fired in parallel via Promise.all', () => {
    expect(fnSlice).toMatch(/Promise\.all\(\[/);
  });

  it('BP.A.5 — Q2 queries with branchId === "main" (legacy fallback)', () => {
    expect(fnSlice).toMatch(/buildClauses\(['"]main['"]\)/);
  });

  it('BP.A.6 — dedupe by batchId via Set', () => {
    expect(fnSlice).toMatch(/seen\s*=\s*new\s+Set\(\)/);
    expect(fnSlice).toMatch(/seen\.has/);
  });
});

describe('Phase 15.4 BP.B — V31 no-silent-swallow on fallback failure', () => {
  const fnStart = backendSrc.indexOf('export async function listStockBatches');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 2500);

  it('BP.B.1 — fallback query .catch logs warn (V31 lock — not silent)', () => {
    expect(fnSlice).toMatch(/console\.warn\(/);
    expect(fnSlice).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('BP.B.2 — fallback returns empty docs array (Q1 results still surface)', () => {
    expect(fnSlice).toMatch(/return\s*\{\s*docs:\s*\[\]\s*\}/);
  });
});

describe('Phase 15.4 BP.C — backward compat: default behaviour preserved', () => {
  const fnStart = backendSrc.indexOf('export async function listStockBatches');
  const fnSlice = backendSrc.slice(fnStart, fnStart + 2500);

  it('BP.C.1 — when includeLegacyMain=false, single-query path (no Promise.all)', () => {
    // The else branch must be present (no flag = single query, like before).
    expect(fnSlice).toMatch(/\}\s*else\s*\{/);
  });

  it('BP.C.2 — single-query path uses existing query+getDocs+map shape', () => {
    expect(fnSlice).toMatch(/const\s+q\s*=\s*clauses\.length\s*\?\s*query/);
  });

  it('BP.C.3 — sort by receivedAt preserved (FIFO order matters for adjust UX)', () => {
    expect(fnSlice).toMatch(/batches\.sort\(\(a,\s*b\)\s*=>\s*\(a\.receivedAt[^]*localeCompare/);
  });
});

describe('Phase 15.4 BP.D — 3 stock create forms opt in to legacy fallback (gated on branch-tier)', () => {
  // Post-deploy bug 4 fix: includeLegacyMain MUST be gated on
  // deriveLocationType === BRANCH. Central-tier (WH-*) MUST NOT pull legacy
  // 'main' branch-tier batches. Tests assert the conditional pattern, NOT
  // the bare `: true` (which was the V21-locked bug).

  it('BP.D.1 — StockAdjustPanel passes includeLegacyMain: isBranchTier (gated)', () => {
    const src = read('src/components/backend/StockAdjustPanel.jsx');
    expect(src).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*isBranchTier[^}]*\}\s*\)/);
    expect(src).toMatch(/deriveLocationType\(BRANCH_ID\)\s*===\s*LOCATION_TYPE\.BRANCH/);
  });

  it('BP.D.2 — StockTransferPanel passes includeLegacyMain: isBranchSrc (gated on src tier)', () => {
    const src = read('src/components/backend/StockTransferPanel.jsx');
    expect(src).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*isBranchSrc[^}]*\}\s*\)/);
    expect(src).toMatch(/deriveLocationType\(src\)/);
  });

  it('BP.D.3 — StockWithdrawalPanel passes includeLegacyMain: isBranchSrc (gated on src tier)', () => {
    const src = read('src/components/backend/StockWithdrawalPanel.jsx');
    expect(src).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*isBranchSrc[^}]*\}\s*\)/);
    expect(src).toMatch(/deriveLocationType\(src\)/);
  });

  it('BP.D.4 — V21 anti-regression: bare `includeLegacyMain: true` is GONE in all 3 panels', () => {
    // Bug 4: pulling 'main' branch-tier batches into central-tab adjust picker.
    // Lock: only the gated form is acceptable now.
    const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
    const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
    const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');
    for (const src of [adjustSrc, transferSrc, withdrawalSrc]) {
      expect(src).not.toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*true[^}]*\}\s*\)/);
    }
  });

  it('BP.D.5 — Phase 15.4 markers present (institutional memory grep)', () => {
    const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
    expect(adjustSrc).toMatch(/Phase 15\.4 \(s19 item 2\)/);
  });
});

describe('Phase 15.4 BP.E — V21 anti-regression: legacy fallback opt-in (not always-on)', () => {
  // V21 lesson: don't lock in broken behaviour, but also don't lock in the
  // FIX in a way that prevents future cleanup. The fix is opt-in (flag);
  // when admin runs migration, they can drop the flag from the 3 callers.

  it('BP.E.1 — non-create callers don\'t pass the flag (would skip migration cleanup)', () => {
    // Grep all listStockBatches calls. The 3 marked above pass the flag;
    // others (e.g. createStockTransfer's batch validation) should NOT.
    // We just verify the flag exists in the API + isn't accidentally set
    // as default true.
    const fnStart = backendSrc.indexOf('export async function listStockBatches');
    const fnSlice = backendSrc.slice(fnStart, fnStart + 200);
    expect(fnSlice).toMatch(/includeLegacyMain\s*=\s*false/);
    expect(fnSlice).not.toMatch(/includeLegacyMain\s*=\s*true(?!\s*\))/);
  });
});
