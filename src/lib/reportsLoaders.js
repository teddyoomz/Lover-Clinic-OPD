// V52 (2026-05-08, BS-11) — All loaders accept optional `branchId` (single)
// or `allBranches: true` (explicit cross-branch). Backward compat preserved:
// callers that pass neither continue to receive cross-branch data
// (legacy behavior). Report tabs in src/components/backend/reports/*Tab.jsx
// pass `branchId: selectedBranchId` from BranchContext.
//
// ─── Report data loaders — wraps backendClient with date-range queries ─────
// Phase 10 reports load data on tab open + on date-range change. Each loader
// returns a normalized array (sorted descending by primary date) so report
// tabs can map straight to display rows without further sorting.
//
// Rule E: Firestore-only. Never imports brokerClient or /api/proclinic/*.

import { db, appId } from '../firebase.js';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const basePath = () => ['artifacts', appId, 'public', 'data'];
const salesCol = () => collection(db, ...basePath(), 'be_sales');
const treatmentsCol = () => collection(db, ...basePath(), 'be_treatments');
const appointmentsCol = () => collection(db, ...basePath(), 'be_appointments');
const stockBatchesCol = () => collection(db, ...basePath(), 'be_stock_batches');
const stockMovementsCol = () => collection(db, ...basePath(), 'be_stock_movements');
const customersCol = () => collection(db, ...basePath(), 'be_customers');
// Phase 12.8 — P&L report joins expenses and insurance-claims.
const expensesColReports = () => collection(db, ...basePath(), 'be_expenses');
const saleClaimsColReports = () => collection(db, ...basePath(), 'be_sale_insurance_claims');
// 2026-06-09 — deposit-in-reports: reports-payment + reports-sale read deposits
// (money actually received). Branch-scoped (be_deposits = BSA leak-sweep-2).
const depositsColReports = () => collection(db, ...basePath(), 'be_deposits');

/**
 * V52 helper — normalize branch-scope opts.
 *  - `branchId` (string): single-branch filter (e.g. from useSelectedBranch)
 *  - `allBranches` (bool): explicit opt-out — never filter by branch
 *  - both falsy: legacy behavior (no filter; cross-branch data returned)
 *
 * Returns true if the caller wants branch filtering applied.
 */
function shouldFilterByBranch({ branchId, allBranches } = {}) {
  if (allBranches === true) return false;
  return typeof branchId === 'string' && branchId.length > 0;
}

/** Load expenses by `date` field (YYYY-MM-DD inclusive). Fallback path
 *  identical to loadSalesByDateRange — no composite index required yet.
 *  V52: accepts `branchId` for single-branch filter. Multi-branch consumers
 *  (expense-report) keep using their own in-aggregator `branchIds: [...]`
 *  filter — V52 doesn't break that contract (loader filters when `branchId`
 *  alone is passed; aggregator's `branchIds` remains aggregator-side). */
export async function loadExpensesByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  try {
    const conds = [];
    if (from) conds.push(where('date', '>=', from));
    if (to) conds.push(where('date', '<=', to));
    if (wantBranch) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(expensesColReports(), ...conds, orderBy('date', 'desc'))
      : query(expensesColReports(), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    const snap = await getDocs(expensesColReports());
    let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) items = items.filter(e => (e.date || '') >= from);
    if (to) items = items.filter(e => (e.date || '') <= to);
    if (wantBranch) items = items.filter(e => e.branchId === branchId);
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items;
  }
}

/** Load sale insurance claims by `claimDate` (YYYY-MM-DD inclusive).
 *  V52: accepts `branchId` for single-branch filter. */
export async function loadSaleInsuranceClaimsByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  try {
    const conds = [];
    if (from) conds.push(where('claimDate', '>=', from));
    if (to) conds.push(where('claimDate', '<=', to));
    if (wantBranch) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(saleClaimsColReports(), ...conds, orderBy('claimDate', 'desc'))
      : query(saleClaimsColReports(), orderBy('claimDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    const snap = await getDocs(saleClaimsColReports());
    let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) items = items.filter(c => (c.claimDate || '') >= from);
    if (to) items = items.filter(c => (c.claimDate || '') <= to);
    if (wantBranch) items = items.filter(c => c.branchId === branchId);
    items.sort((a, b) => (b.claimDate || '').localeCompare(a.claimDate || ''));
    return items;
  }
}

/**
 * Load sales whose `saleDate` falls in [fromISO, toISO] (YYYY-MM-DD inclusive).
 * Default = no date filter (all sales). Empty fromISO/toISO ignored individually.
 * Excludes cancelled sales by default; pass { includeCancelled: true } to keep.
 *
 * Requires composite index: be_sales (saleDate ASC, status ASC).
 * On missing-index error, falls back to client-side filter.
 *
 * V52 (BS-11): accepts `branchId` for single-branch filter. Cross-branch use
 * (e.g. cross-branch insights) MUST pass `allBranches: true`.
 */
export async function loadSalesByDateRange({ from = '', to = '', includeCancelled = false, branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  try {
    const conds = [];
    if (from) conds.push(where('saleDate', '>=', from));
    if (to) conds.push(where('saleDate', '<=', to));
    if (wantBranch) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(salesCol(), ...conds, orderBy('saleDate', 'desc'))
      : query(salesCol(), orderBy('saleDate', 'desc'));
    const snap = await getDocs(q);
    let sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (!includeCancelled) sales = sales.filter(s => s.status !== 'cancelled');
    return sales;
  } catch (e) {
    // Fallback when composite index hasn't built yet
    const snap = await getDocs(salesCol());
    let sales = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) sales = sales.filter(s => (s.saleDate || '') >= from);
    if (to) sales = sales.filter(s => (s.saleDate || '') <= to);
    if (wantBranch) sales = sales.filter(s => s.branchId === branchId);
    if (!includeCancelled) sales = sales.filter(s => s.status !== 'cancelled');
    sales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
    return sales;
  }
}

/**
 * Load deposits whose `paymentDate` (the day the money came in) falls in
 * [from, to] (YYYY-MM-DD inclusive). Mirrors loadSalesByDateRange.
 *
 * reports-payment folds these into the per-channel "มัดจำ" column; reports-sale
 * lists them as "มัดจำที่รับเข้า". Does NOT exclude cancelled here — the
 * aggregator (depositsReceivedInRange) drops cancelled so a single source of
 * truth owns the status rule.
 *
 * V52 (BS-11): branch-scoped via `branchId`. Cross-branch use → `allBranches: true`.
 * Requires composite index be_deposits (paymentDate ASC, branchId ASC); on
 * missing-index error, falls back to client-side filter (same as sales).
 */
export async function loadDepositsByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  try {
    const conds = [];
    if (from) conds.push(where('paymentDate', '>=', from));
    if (to) conds.push(where('paymentDate', '<=', to));
    if (wantBranch) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(depositsColReports(), ...conds, orderBy('paymentDate', 'desc'))
      : query(depositsColReports(), orderBy('paymentDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch {
    const snap = await getDocs(depositsColReports());
    let items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) items = items.filter(x => (x.paymentDate || '') >= from);
    if (to) items = items.filter(x => (x.paymentDate || '') <= to);
    if (wantBranch) items = items.filter(x => x.branchId === branchId);
    items.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
    return items;
  }
}

/**
 * Load treatments whose `detail.treatmentDate` falls in [from, to]
 * (YYYY-MM-DD inclusive). Phase 14.5 DF Payout Report consumes these
 * to prefer explicit `detail.dfEntries[]` over sale-inference.
 *
 * No composite index required: Firestore can't index nested fields
 * reliably, so this always does a full-collection read + client-side
 * filter. Acceptable while treatment volume is modest — revisit when
 * be_treatments grows past ~10k docs.
 *
 * Excludes cancelled treatments by default (matches sale loader).
 *
 * V52: accepts `branchId` for single-branch filter (client-side, since
 * the function already does a full-collection read).
 */
export async function loadTreatmentsByDateRange({ from = '', to = '', includeCancelled = false, branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  const snap = await getDocs(treatmentsCol());
  let items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  if (from) items = items.filter((t) => (t?.detail?.treatmentDate || '') >= from);
  if (to) items = items.filter((t) => (t?.detail?.treatmentDate || '') <= to);
  if (wantBranch) items = items.filter((t) => t.branchId === branchId);
  if (!includeCancelled) items = items.filter((t) => t?.detail?.status !== 'cancelled');
  items.sort((a, b) => (b?.detail?.treatmentDate || '').localeCompare(a?.detail?.treatmentDate || ''));
  return items;
}

/**
 * Load appointments by `date` field (YYYY-MM-DD). Same fallback pattern.
 * Sorted descending by date, then ascending by startTime.
 *
 * V52: accepts `branchId` for single-branch filter.
 */
export async function loadAppointmentsByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  try {
    const conds = [];
    if (from) conds.push(where('date', '>=', from));
    if (to) conds.push(where('date', '<=', to));
    if (wantBranch) conds.push(where('branchId', '==', branchId));
    const q = conds.length > 0
      ? query(appointmentsCol(), ...conds, orderBy('date', 'desc'))
      : query(appointmentsCol(), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    const snap = await getDocs(appointmentsCol());
    let appts = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    if (from) appts = appts.filter(a => (a.date || '') >= from);
    if (to) appts = appts.filter(a => (a.date || '') <= to);
    if (wantBranch) appts = appts.filter(a => a.branchId === branchId);
    appts.sort((a, b) => {
      const c = (b.date || '').localeCompare(a.date || '');
      if (c !== 0) return c;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    return appts;
  }
}

/**
 * Load all available stock batches (status === 'available' & qty > 0).
 * Used by Stock Report 10.5; aggregates per productId happen client-side.
 *
 * NOTE: batch.qty shape is `{ remaining, total }` (buildQtyNumeric). A bare
 * `Number(b.qty) > 0` returns NaN > 0 = false for every real batch, so this
 * loader must look at `qty.remaining`. Legacy path where qty was a scalar
 * is still handled via Number(b.qty) fallback.
 */
export async function loadStockBatches({ branchId = '' } = {}) {
  const getRemaining = (b) => {
    const r = Number(b?.qty?.remaining);
    if (Number.isFinite(r)) return r;
    const s = Number(b?.qty);
    return Number.isFinite(s) ? s : 0;
  };
  try {
    const conds = [where('status', '==', 'available')];
    if (branchId) conds.push(where('branchId', '==', branchId));
    const q = query(stockBatchesCol(), ...conds);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(b => getRemaining(b) > 0);
  } catch (e) {
    const snap = await getDocs(stockBatchesCol());
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(b => b.status === 'available' && getRemaining(b) > 0)
      .filter(b => !branchId || b.branchId === branchId);
  }
}

/**
 * Load ALL stock batches for the Stock Report (status in active/expired, any qty).
 * Unlike loadStockBatches, this does NOT filter out expired batches — the report
 * needs to show "หมดอายุ" qty broken out per product. Cancelled/depleted batches
 * (qty.remaining === 0) ARE filtered since they carry no stock value.
 *
 * @param {{branchId?: string, allBranches?: boolean}} [opts]
 * V52: `allBranches: true` opts out of branch filter (reserved for future
 * cross-branch dashboards); default behavior unchanged for backward compat.
 */
export async function loadAllStockBatchesForReport({ branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  const getRemaining = (b) => {
    const r = Number(b?.qty?.remaining);
    if (Number.isFinite(r)) return r;
    const s = Number(b?.qty);
    return Number.isFinite(s) ? s : 0;
  };
  const snap = await getDocs(stockBatchesCol());
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .filter(b => {
      if (getRemaining(b) <= 0) return false;
      if (b.status === 'cancelled' || b.status === 'depleted') return false;
      if (wantBranch && b.branchId !== branchId) return false;
      return true;
    });
}

/**
 * Load all customers for the Customer Report (10.3). Sorted by clonedAt desc.
 * No date filter at the customer level — Customer Report shows ALL customers
 * by default; the date range narrows the embedded purchase-summary subquery
 * inside the aggregator (see aggregateCustomerReport).
 *
 * Returns plain be_customers docs; finance.* summary fields are read directly
 * by the aggregator (recalcCustomerDepositBalance + recalcCustomerWalletBalances
 * + earnPoints keep them fresh on every mutation).
 *
 * V52 (BS-11): accepts `branchId` for single-branch filter (creation branch
 * per V50 Phase 3). Pass `allBranches: true` for cross-branch reports.
 */
export async function loadAllCustomersForReport({ branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  const snap = await getDocs(customersCol());
  let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (wantBranch) list = list.filter(c => c.branchId === branchId);
  list.sort((a, b) => (b.clonedAt || '').localeCompare(a.clonedAt || ''));
  return list;
}

/**
 * Load stock movements within a date range. Sorted desc by createdAt.
 * Used by future Phase 10 movement report (deferred from v1).
 *
 * V52: accepts `branchId` for single-branch filter.
 */
export async function loadStockMovementsByDateRange({ from = '', to = '', branchId = '', allBranches = false } = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  const snap = await getDocs(stockMovementsCol());
  let mvs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (from) mvs = mvs.filter(m => (m.createdAt || '') >= from);
  if (to) mvs = mvs.filter(m => (m.createdAt || '') <= `${to}T23:59:59Z`);
  if (wantBranch) mvs = mvs.filter(m => m.branchId === branchId);
  mvs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return mvs;
}
