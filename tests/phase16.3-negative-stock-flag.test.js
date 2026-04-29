// Phase 16.3 — Q4-C runtime semantic source-grep guards.
//
// allowNegativeStock=false → block NEW negatives, repay existing.
//
// Implementation lives in `src/lib/backendClient.js _deductOneItem` and reads
// `clinic_settings/system_config.featureFlags.allowNegativeStock` via
// `getSystemConfig()`. When flag is false AND `plan.shortfall > 0`, throws
// `STOCK_INSUFFICIENT_NEGATIVE_DISABLED` Thai error.
//
// Repay path is upstream (`_repayNegativeBalances` in `_buildBatchFromOrderItem`,
// `_receiveAtDestination` for transfer + withdrawal) — UNCONDITIONAL: existing
// negative batches always receive incoming positives regardless of the flag.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_CLIENT = readFileSync(resolve(__dirname, '../src/lib/backendClient.js'), 'utf-8');

describe('Phase 16.3 NSF.A — _deductOneItem reads system_config feature flag', () => {
  test('A.1 — _deductOneItem imports getSystemConfig dynamically', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    expect(body).toMatch(/import\(['"]\.\/systemConfigClient\.js['"]\)/);
    expect(body).toMatch(/getSystemConfig/);
  });

  test('A.2 — flag check happens INSIDE shortfall block (only when plan.shortfall > 0)', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _deductOneItem(');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    // The shortfall block: `if (plan.shortfall > 0 && (context === 'treatment' || context === 'sale'))`
    // Inside that block, the flag is read. Order matters — we don't want to throw on
    // every deduct, only when shortfall + flag-off.
    const shortfallIdx = body.indexOf("plan.shortfall > 0 && (context === 'treatment'");
    expect(shortfallIdx).toBeGreaterThan(0);
    const flagCheckIdx = body.indexOf('allowNegativeStock === false', shortfallIdx);
    expect(flagCheckIdx).toBeGreaterThan(shortfallIdx);
  });
});

describe('Phase 16.3 NSF.B — Q4-C error contract', () => {
  test('B.1 — throws Thai error with code STOCK_INSUFFICIENT_NEGATIVE_DISABLED', () => {
    expect(BACKEND_CLIENT).toMatch(/err\.code\s*=\s*['"]STOCK_INSUFFICIENT_NEGATIVE_DISABLED['"]/);
  });

  test('B.2 — error message references Thai prompt + ProductFormModal pointer', () => {
    expect(BACKEND_CLIENT).toMatch(/admin ปิดการใช้สต็อคติดลบในระบบ/);
    expect(BACKEND_CLIENT).toMatch(/อนุญาตการตัดสต็อคติดลบ/);
  });

  test('B.3 — error carries productId + productName + shortfall fields', () => {
    expect(BACKEND_CLIENT).toMatch(/err\.productId\s*=\s*item\.productId/);
    expect(BACKEND_CLIENT).toMatch(/err\.productName\s*=\s*item\.productName/);
    expect(BACKEND_CLIENT).toMatch(/err\.shortfall\s*=\s*plan\.shortfall/);
  });

  test('B.4 — graceful degradation: catch other errors but re-throw STOCK_INSUFFICIENT_NEGATIVE_DISABLED', () => {
    expect(BACKEND_CLIENT).toMatch(/STOCK_INSUFFICIENT_NEGATIVE_DISABLED.*throw e/s);
  });
});

describe('Phase 16.3 NSF.C — Q4-C: repay path UNCONDITIONAL (existing negatives still receive)', () => {
  test('C.1 — _repayNegativeBalances is NOT gated by allowNegativeStock flag', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _repayNegativeBalances');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000);
    // The helper must NOT read system_config — Q4-C contract.
    expect(body).not.toMatch(/getSystemConfig/);
    expect(body).not.toMatch(/allowNegativeStock/);
  });

  test('C.2 — _buildBatchFromOrderItem (vendor receive) calls _repayNegativeBalances unconditionally', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _buildBatchFromOrderItem');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 6000);
    expect(body).toMatch(/_repayNegativeBalances/);
    // Must NOT condition on the flag
    const repayIdx = body.indexOf('_repayNegativeBalances');
    const before = body.substring(Math.max(0, repayIdx - 500), repayIdx);
    expect(before).not.toMatch(/allowNegativeStock/);
  });
});

describe('Phase 16.3 NSF.D — V36 + V35 regression banks intact', () => {
  test('D.1 — Phase 15.7 negative-stock auto-repay invariant preserved (pickNegativeTargetBatch + AUTO-NEG synthesis)', () => {
    // From V36 test bank — the toggle does NOT remove the negative-stock
    // path entirely; it only gates entry to it.
    expect(BACKEND_CLIENT).toMatch(/pickNegativeTargetBatch/);
    expect(BACKEND_CLIENT).toMatch(/AUTO-NEG-/);
    expect(BACKEND_CLIENT).toMatch(/autoNegative:\s*true/);
  });

  test('D.2 — V36-bis productName fallback still wired', () => {
    expect(BACKEND_CLIENT).toMatch(/_resolveProductIdByName/);
    expect(BACKEND_CLIENT).toMatch(/lookupProductId/);
  });

  test('D.3 — V36-tris master_data removal still in effect', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _getProductStockConfig');
    const fnEnd = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 1500);
    expect(body).not.toMatch(/master_data/);
  });
});
