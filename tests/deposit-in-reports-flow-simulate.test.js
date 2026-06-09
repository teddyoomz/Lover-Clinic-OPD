// Deposit-in-reports (2026-06-09) — source-grep contract locks + Rule I
// full-flow simulate (PRE→POST-fix repro that deposit money is now visible).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aggregatePaymentSummary, getMethodDocuments,
} from '../src/lib/paymentSummaryAggregator.js';
import {
  depositsReceivedInRange, sumSystemRemainingDeposits, buildDepositDeepLinkUrl,
} from '../src/lib/depositReportUtils.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const paymentTab = read('../src/components/backend/reports/PaymentSummaryTab.jsx');
const saleTab = read('../src/components/backend/reports/SaleReportTab.jsx');
const aggregator = read('../src/lib/paymentSummaryAggregator.js');
const utils = read('../src/lib/depositReportUtils.js');
const loaders = read('../src/lib/reportsLoaders.js');
const dash = read('../src/pages/BackendDashboard.jsx');
const finance = read('../src/components/backend/FinanceTab.jsx');
const depositPanel = read('../src/components/backend/DepositPanel.jsx');
const av = read('../.claude/skills/audit-anti-vibe-code/SKILL.md');

describe('SG · source-grep contract locks', () => {
  it('SG1 loader: loadDepositsByDateRange filters paymentDate + branchId', () => {
    expect(loaders).toMatch(/export async function loadDepositsByDateRange/);
    expect(loaders).toMatch(/where\('paymentDate', '>=', from\)/);
    expect(loaders).toMatch(/where\('branchId', '==', branchId\)/);
  });
  it('SG2 PaymentSummaryTab loads deposits branch-scoped (BS-11) + folds into aggregate', () => {
    expect(paymentTab).toMatch(/loadDepositsByDateRange\(\{ from, to, branchId: selectedBranchId \}\)/);
    expect(paymentTab).toMatch(/aggregatePaymentSummary\(sales, deposits, \{ from, to \}\)/);
    // selectedBranchId must be in the load effect deps (re-fetch on branch switch)
    expect(paymentTab).toMatch(/\[from, to, selectedBranchId, reloadKey\]/);
    expect(paymentTab).toMatch(/<PaymentDocsModal/);
    expect(paymentTab).toMatch(/<SaleDetailModal/);
    expect(paymentTab).toMatch(/out\.refundsTotal > 0/);
  });
  it('SG3 SaleReportTab: received section + remaining, NOT summed into sale footer', () => {
    expect(saleTab).toMatch(/loadDepositsByDateRange\(\{ from, to, branchId: selectedBranchId \}\)/);
    expect(saleTab).toMatch(/getAllDeposits\(\{ branchId: selectedBranchId \}\)/);
    expect(saleTab).toMatch(/<DepositReceivedSection/);
    // the sale aggregate call must NOT receive any deposit data (separation)
    const aggCall = saleTab.slice(saleTab.indexOf('aggregateSaleReport(allSales, {'), saleTab.indexOf('aggregateSaleReport(allSales, {') + 400);
    expect(aggCall).not.toMatch(/deposit/i);
    // footer totals come from out.totals (sale aggregate) only — never depositReceivedSum
    expect(saleTab).not.toMatch(/totals\.[a-zA-Z]+\s*\+\s*depositReceivedSum/);
  });
  it('SG4 exports present', () => {
    expect(aggregator).toMatch(/export function aggregatePaymentSummary/);
    expect(aggregator).toMatch(/export function getMethodDocuments/);
    expect(aggregator).toMatch(/export function refundsInPeriod/);
    expect(aggregator).toMatch(/export function canonicalMethod/);
    expect(utils).toMatch(/export function depositsReceivedInRange/);
    expect(utils).toMatch(/export function sumSystemRemainingDeposits/);
    expect(utils).toMatch(/export function buildDepositDeepLinkUrl/);
  });
  it('SG5 deep-link wired BackendDashboard → FinanceTab → DepositPanel', () => {
    expect(dash).toMatch(/params\.get\('deposit'\)/);
    expect(dash).toMatch(/setFinanceFocusDepositId/);
    expect(dash).toMatch(/focusDepositId=\{financeFocusDepositId\}/);
    expect(finance).toMatch(/focusDepositId/);
    expect(finance).toMatch(/setActiveSubTab\('deposit'\)/);
    expect(depositPanel).toMatch(/getDeposit\(focusDepositId\)/);
    expect(depositPanel).toMatch(/setViewingDeposit\(d\)/);
  });
  it('SG6 AV191 invariant present', () => {
    expect(av).toMatch(/AV191 — Deposit-received in reports comes from be_deposits/);
  });
});

const dep = (o = {}) => ({ depositId: 'DEP-1', amount: 1000, remainingAmount: 1000, status: 'active',
  paymentChannel: 'เงินสด', paymentDate: '2026-06-09', branchId: 'BR-A', customerHN: 'HN1', customerName: 'ลูกค้า', ...o });
const sale = (o = {}) => ({ saleId: 'INV-1', id: 'INV-1', saleDate: '2026-06-09', status: 'active', branchId: 'BR-A',
  billing: { netTotal: 2500, depositApplied: 1000 }, payment: { channels: [{ method: 'เงินสด', amount: 2500 }] }, ...o });
const RANGE = { from: '2026-06-01', to: '2026-06-30' };

describe('F · Rule I full-flow simulate', () => {
  it('F1 master deposit + sale → received filter → aggregate → drill-down (no double-count)', () => {
    const deposits = [dep()];
    const sales = [sale()];
    const received = depositsReceivedInRange(deposits, RANGE);
    expect(received).toHaveLength(1);
    const out = aggregatePaymentSummary(sales, deposits, RANGE);
    const cash = out.rows.find(r => r.method === 'เงินสด');
    expect(cash.salesAmount).toBe(2500);
    expect(cash.depositAmount).toBe(1000);
    expect(cash.total).toBe(3500);
    expect(out.rows.find(r => r.method === 'มัดจำ')).toBeUndefined(); // no double-count
    const docs = getMethodDocuments(sales, deposits, 'เงินสด', RANGE);
    expect(docs.map(d => d.type).sort()).toEqual(['deposit', 'sale']);
  });
  it('F2 PRE→POST repro: deposit money was ฿0 (sales-only), now visible', () => {
    const sales = [sale()];
    const deposits = [dep({ amount: 1000 })];
    const PRE = aggregatePaymentSummary(sales, [], RANGE);   // old behavior: no deposits
    expect(PRE.totals.depositAmount).toBe(0);
    const POST = aggregatePaymentSummary(sales, deposits, RANGE);
    expect(POST.totals.depositAmount).toBe(1000);
    expect(POST.totals.total).toBe(PRE.totals.total + 1000);
  });
  it('F3 reports-sale separation: received list (excl cancelled) + system remaining', () => {
    const all = [
      dep({ depositId: 'D1', status: 'active', remainingAmount: 1000, paymentDate: '2026-06-05' }),
      dep({ depositId: 'D2', status: 'partial', remainingAmount: 300, paymentDate: '2026-06-06' }),
      dep({ depositId: 'D3', status: 'cancelled', remainingAmount: 0, paymentDate: '2026-06-07' }),
      dep({ depositId: 'D4', status: 'used', remainingAmount: 0, paymentDate: '2026-06-08' }),
    ];
    const received = depositsReceivedInRange(all, RANGE).map(d => d.depositId);
    expect(received).toEqual(['D1', 'D2', 'D4']); // cancelled out
    expect(sumSystemRemainingDeposits(all)).toBe(1300); // active+partial only
  });
  it('F4 deep-link URL round-trips deposit id', () => {
    const url = buildDepositDeepLinkUrl('DEP-XYZ');
    const sp = new URLSearchParams(url.split('?')[1]);
    expect(sp.get('tab')).toBe('finance');
    expect(sp.get('subtab')).toBe('deposit');
    expect(sp.get('deposit')).toBe('DEP-XYZ');
  });
});
