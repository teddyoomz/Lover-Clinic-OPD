// Money Reconciliation (2026-07-07) — V155/V157 residual closed.
// Pure-core unit matrix + fetcher orchestration + Rule I flow-simulate +
// source-grep wiring locks. The core is the SSOT for BOTH the reports tab
// (client SDK) and api/cron/money-reconciliation-sweep.js (admin SDK).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  netByReference, depositUsageForSale, expectedCourseRows,
  reconcileSale, reconcileSales, summarizeResults,
} from '../src/lib/reconcileSaleCore.js';

const sale = (over = {}) => ({
  id: 'S1', saleId: 'S1', invoiceNo: 'INV-1', customerId: 'C1', customerName: 'สมชาย',
  status: 'active', saleDate: '2026-07-06',
  billing: { depositApplied: 0, walletApplied: 0, grandTotal: 1000 },
  items: { courses: [], promotions: [], products: [], medications: [] },
  ...over,
});

describe('R1 — netByReference', () => {
  it('R1.1 nets deduct − refund per referenceId', () => {
    const m = netByReference([
      { referenceId: 'S1', type: 'deduct', amount: 300 },
      { referenceId: 'S1', type: 'refund', amount: 100 },
      { referenceId: 'S2', type: 'deduct', amount: 50 },
    ]);
    expect(m.get('S1')).toBe(200);
    expect(m.get('S2')).toBe(50);
  });
  it('R1.2 earn/reverse mode + skips empty referenceId + non-numeric amounts', () => {
    const m = netByReference([
      { referenceId: 'S1', type: 'earn', amount: '10' },
      { referenceId: 'S1', type: 'reverse', amount: 4 },
      { referenceId: '', type: 'earn', amount: 99 },
      { referenceId: 'S1', type: 'earn', amount: 'abc' },
      null,
    ], { debitType: 'earn', creditType: 'reverse' });
    expect(m.get('S1')).toBe(6);
    expect(m.size).toBe(1);
  });
});

describe('R2 — depositUsageForSale', () => {
  it('R2.1 sums usage across multiple deposits, filtered to the sale', () => {
    const deposits = [
      { depositId: 'D1', usageHistory: [{ saleId: 'S1', amount: 300 }, { saleId: 'S2', amount: 50 }] },
      { depositId: 'D2', usageHistory: [{ saleId: 'S1', amount: 200 }] },
      { depositId: 'D3' }, // no history
    ];
    const r = depositUsageForSale(deposits, 'S1');
    expect(r.total).toBe(500);
    expect(r.entries).toHaveLength(2);
  });
});

describe('R3 — reconcileSale channel matrix', () => {
  const base = { courses: [], deposits: [], walletNet: 0, pointsNet: 0, stockMovements: 0 };

  it('R3.1 deposit ok (exact match, satang tolerance)', () => {
    const r = reconcileSale({ ...base, sale: sale({ billing: { depositApplied: 500.004 } }),
      deposits: [{ usageHistory: [{ saleId: 'S1', amount: 500 }] }] });
    expect(r.channels.deposit.verdict).toBe('ok');
    expect(r.hasDiscrepancy).toBe(false);
  });
  it('R3.2 deposit SHORT — the V157-class miss this feature exists to catch', () => {
    const r = reconcileSale({ ...base, sale: sale({ billing: { depositApplied: 2000 } }),
      deposits: [{ usageHistory: [{ saleId: 'S1', amount: 1500 }] }] });
    expect(r.channels.deposit.verdict).toBe('discrepancy');
    expect(r.discrepancies[0]).toContain('ขาด 500.00');
  });
  it('R3.3 ORPHAN usage (sale claims 0 but usage exists) is a discrepancy too', () => {
    const r = reconcileSale({ ...base, sale: sale(),
      deposits: [{ usageHistory: [{ saleId: 'S1', amount: 100 }] }] });
    expect(r.channels.deposit.verdict).toBe('discrepancy');
  });
  it('R3.4 cancelled sale with leftover deposit usage = money not returned', () => {
    const r = reconcileSale({ ...base, sale: sale({ status: 'cancelled', billing: { depositApplied: 300 } }),
      deposits: [{ usageHistory: [{ saleId: 'S1', amount: 300 }] }] });
    expect(r.channels.deposit.verdict).toBe('discrepancy');
    expect(r.cancelled).toBe(true);
  });
  it('R3.5 cancelled sale with reversed usage = ok', () => {
    const r = reconcileSale({ ...base, sale: sale({ status: 'cancelled', billing: { depositApplied: 300 } }) });
    expect(r.channels.deposit.verdict).toBe('ok');
    expect(r.hasDiscrepancy).toBe(false);
  });
  it('R3.6 wallet mismatch both directions', () => {
    const short = reconcileSale({ ...base, sale: sale({ billing: { walletApplied: 200 } }), walletNet: 100 });
    expect(short.channels.wallet.verdict).toBe('discrepancy');
    const over = reconcileSale({ ...base, sale: sale(), walletNet: 150 });
    expect(over.channels.wallet.verdict).toBe('discrepancy');
    const ok = reconcileSale({ ...base, sale: sale({ billing: { walletApplied: 200 } }), walletNet: 200 });
    expect(ok.channels.wallet.verdict).toBe('ok');
  });
  it('R3.7 cancelled + wallet net outstanding = V153-class leak surfaced', () => {
    const r = reconcileSale({ ...base, sale: sale({ status: 'cancelled', billing: { walletApplied: 200 } }), walletNet: 200 });
    expect(r.channels.wallet.verdict).toBe('discrepancy');
    expect(r.discrepancies.join(' ')).toContain('ยังไม่คืน');
  });
  it('R3.8 points: deterministic ONLY for cancelled; active earn = info (never counted)', () => {
    const cancelledLeak = reconcileSale({ ...base, sale: sale({ status: 'cancelled' }), pointsNet: 50 });
    expect(cancelledLeak.channels.points.verdict).toBe('discrepancy');
    const cancelledOk = reconcileSale({ ...base, sale: sale({ status: 'cancelled' }), pointsNet: 0 });
    expect(cancelledOk.channels.points.verdict).toBe('ok');
    const activeEarn = reconcileSale({ ...base, sale: sale(), pointsNet: 45 });
    expect(activeEarn.channels.points.verdict).toBe('info');
    expect(activeEarn.hasDiscrepancy).toBe(false); // info never counts
  });
  it('R3.9 courses: total-failure only (V104 class); partial counts stay ok; cancelled = info', () => {
    const items = { courses: [{ id: 1 }], promotions: [{ id: 2 }] };
    const fail = reconcileSale({ ...base, sale: sale({ items }) });
    expect(fail.channels.courses.verdict).toBe('discrepancy');
    const partial = reconcileSale({ ...base, sale: sale({ items }),
      courses: [{ linkedSaleId: 'S1' }] });
    expect(partial.channels.courses.verdict).toBe('ok'); // promo sub-rows make counts non-deterministic
    const cancelled = reconcileSale({ ...base, sale: sale({ items, status: 'cancelled' }),
      courses: [{ linkedSaleId: 'S1' }] });
    expect(cancelled.channels.courses.verdict).toBe('info');
  });
  it('R3.9b AUDIT-FLOW sales (แก้คงเหลือ/exchange/share) = info, never judged — real-prod adjudicated false positive (INV-20260706-0001)', () => {
    const items = { courses: [{ name: 'ลดคงเหลือ: X -1', itemType: 'reduceRemaining' }] };
    const bySource = reconcileSale({ ...base, sale: sale({ items, source: 'reduceRemaining' }) });
    expect(bySource.channels.courses.verdict).toBe('info');
    expect(bySource.hasDiscrepancy).toBe(false);
    const byItemType = reconcileSale({ ...base, sale: sale({ items }) }); // no sale.source, itemType alone
    expect(byItemType.channels.courses.verdict).toBe('info');
    for (const src of ['addRemaining', 'exchange', 'share']) {
      const r = reconcileSale({ ...base, sale: sale({ items: { courses: [{ name: 'x' }] }, source: src }) });
      expect(r.channels.courses.verdict).toBe('info');
    }
  });
  it('R3.10 stock is ALWAYS info — never a discrepancy', () => {
    const r = reconcileSale({ ...base, sale: sale({ items: { products: [{ id: 1 }] } }), stockMovements: 0 });
    expect(r.channels.stock.verdict).toBe('info');
    expect(r.hasDiscrepancy).toBe(false);
  });
  it('R3.11 adversarial: missing billing / null fields / string amounts survive', () => {
    const r = reconcileSale({ sale: { id: 'X' }, courses: null, deposits: null, walletNet: '5', pointsNet: null, stockMovements: undefined });
    expect(r.saleId).toBe('X');
    expect(r.channels.wallet.verdict).toBe('discrepancy'); // orphan 5฿ net on a sale claiming 0
    expect(typeof r.hasDiscrepancy).toBe('boolean');
  });
});

describe('R4 — reconcileSales orchestration (injected fetchers)', () => {
  it('R4.1 caches evidence PER CUSTOMER (fetchers hit once per cid) + progress fires', async () => {
    const fetchers = {
      getCustomer: vi.fn(async () => ({ courses: [] })),
      getDepositsByCustomer: vi.fn(async () => []),
      getWalletTxByCustomer: vi.fn(async () => []),
      getPointTxByCustomer: vi.fn(async () => []),
      countSaleStockMovements: vi.fn(async () => 0),
    };
    const sales = [sale(), sale({ id: 'S2', saleId: 'S2' }), sale({ id: 'S3', saleId: 'S3', customerId: 'C2' })];
    const progress = vi.fn();
    const res = await reconcileSales(sales, fetchers, { onProgress: progress });
    expect(res).toHaveLength(3);
    expect(fetchers.getCustomer).toHaveBeenCalledTimes(2);           // C1 cached, C2 fresh
    expect(fetchers.countSaleStockMovements).toHaveBeenCalledTimes(3); // per sale
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
  it('R4.2 fetcher failures degrade gracefully (empty evidence, no throw)', async () => {
    const boom = async () => { throw new Error('down'); };
    const res = await reconcileSales([sale()], {
      getCustomer: boom, getDepositsByCustomer: boom, getWalletTxByCustomer: boom,
      getPointTxByCustomer: boom, countSaleStockMovements: boom,
    });
    expect(res).toHaveLength(1);
    expect(res[0].channels.deposit.verdict).toBe('na');
  });
});

describe('R5 — summarizeResults', () => {
  it('R5.1 counts + offending sale digest', () => {
    const results = [
      { saleId: 'A', invoiceNo: 'A', customerId: 'C', cancelled: false, hasDiscrepancy: false, discrepancies: [] },
      { saleId: 'B', invoiceNo: 'B', customerId: 'C', cancelled: true, hasDiscrepancy: true, discrepancies: ['x'] },
    ];
    const s = summarizeResults(results);
    expect(s).toMatchObject({ checked: 2, ok: 1, discrepancyCount: 1, cancelledChecked: 1 });
    expect(s.offendingSales[0].saleId).toBe('B');
  });
});

describe('R6 — Rule I flow-simulate: the V157 scenario end-to-end', () => {
  it('R6.1 sale claims deposit 2000, evidence has 1500 → tab-visible discrepancy with actionable text', async () => {
    // Mirrors the REAL failure mode this feature exists for: applyDepositToSale
    // threw mid-chain (V157 sideEffectWarnings fired at save-time) — the retro
    // scan must independently rediscover it from the data alone.
    const fetchers = {
      getCustomer: async () => ({ courses: [{ linkedSaleId: 'S1', name: 'คอร์ส A' }] }),
      getDepositsByCustomer: async () => [
        { depositId: 'D1', usageHistory: [{ saleId: 'S1', amount: 1500 }] },
      ],
      getWalletTxByCustomer: async () => [
        { referenceId: 'S1', type: 'deduct', amount: 500, walletTypeId: 'W1' },
      ],
      getPointTxByCustomer: async () => [{ referenceId: 'S1', type: 'earn', amount: 12 }],
      countSaleStockMovements: async () => 2,
    };
    const s = sale({
      billing: { depositApplied: 2000, walletApplied: 500, grandTotal: 12000 },
      items: { courses: [{ id: 9 }], promotions: [] },
    });
    const [r] = await reconcileSales([s], fetchers);
    expect(r.hasDiscrepancy).toBe(true);
    expect(r.channels.deposit.verdict).toBe('discrepancy');
    expect(r.channels.wallet.verdict).toBe('ok');
    expect(r.channels.courses.verdict).toBe('ok');
    expect(r.channels.points.verdict).toBe('info');
    const summary = summarizeResults([r]);
    expect(summary.discrepancyCount).toBe(1);
    expect(summary.offendingSales[0].discrepancies[0]).toContain('ขาด 500.00');
  });
});

describe('R7 — source-grep wiring locks (SSOT + BS-11 + cron)', () => {
  const tab = readFileSync('src/components/backend/reports/ReconciliationReportTab.jsx', 'utf8');
  const cron = readFileSync('api/cron/money-reconciliation-sweep.js', 'utf8');
  const core = readFileSync('src/lib/reconcileSaleCore.js', 'utf8');
  const vercel = readFileSync('vercel.json', 'utf8');
  const perms = readFileSync('src/lib/tabPermissions.js', 'utf8');
  const dash = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
  const home = readFileSync('src/components/backend/reports/ReportsHomeTab.jsx', 'utf8');
  const sdl = readFileSync('src/lib/scopedDataLayer.js', 'utf8');

  it('R7.1 BOTH surfaces import the ONE core (SSOT — no drift)', () => {
    expect(tab).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/reconcileSaleCore\.js'/);
    expect(cron).toMatch(/from '\.\.\/\.\.\/src\/lib\/reconcileSaleCore\.js'/);
  });
  it('R7.2 core is PURE (no firebase imports — injectable into admin + client)', () => {
    expect(core).not.toMatch(/from 'firebase/);
    expect(core).not.toMatch(/firebase-admin/);
  });
  it('R7.3 tab follows BS-11 (useSelectedBranch + branchId to loader + deps)', () => {
    expect(tab).toMatch(/useSelectedBranch/);
    expect(tab).toMatch(/branchId: selectedBranchId/);
    expect(tab).toMatch(/\[from, to, selectedBranchId, reloadKey\]/);
    expect(tab).toMatch(/audit-branch-scope: BS-11|V52 \(BS-11\)|V52 \(2026-05-08, BS-11\)/);
  });
  it('R7.4 tab fetchers come from scopedDataLayer ONLY (BS-1)', () => {
    expect(tab).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/scopedDataLayer\.js'/);
    expect(tab).not.toMatch(/from '.*backendClient/);
  });
  it('R7.5 cron: CRON_SECRET gate + deterministic idempotent doc id + read-only scan', () => {
    expect(cron).toMatch(/Bearer \$\{process\.env\.CRON_SECRET\}/);
    expect(cron).toMatch(/recon-daily-\$\{dateISO\.replace/);
    expect(cron).not.toMatch(/\.delete\(\)/);
    // the ONLY write is the summary audit doc
    const writes = cron.match(/\.set\(|\.update\(|\.add\(/g) || [];
    expect(writes).toHaveLength(1);
  });
  it('R7.6 vercel cron scheduled', () => {
    expect(vercel).toContain('"/api/cron/money-reconciliation-sweep"');
  });
  it('R7.7 tab registered: permissions + dashboard case + home card + audit-doc getter', () => {
    expect(perms).toMatch(/'reports-reconciliation': \{ requires: \['sale_view', 'deposit'\] \}/);
    expect(dash).toMatch(/activeTab === 'reports-reconciliation'/);
    expect(home).toMatch(/tabId: 'reports-reconciliation'/);
    expect(sdl).toMatch(/getAdminAuditDoc/);
  });
  it('R7.8 verdict discipline documented in core (info never counted)', () => {
    expect(core).toMatch(/never counted|NEVER counted/i);
  });
});
