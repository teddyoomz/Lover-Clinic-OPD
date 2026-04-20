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
const appointmentsCol = () => collection(db, ...basePath(), 'be_appointments');
const stockBatchesCol = () => collection(db, ...basePath(), 'be_stock_batches');
const stockMovementsCol = () => collection(db, ...basePath(), 'be_stock_movements');
const customersCol = () => collection(db, ...basePath(), 'be_customers');
// Phase 12.8 — P&L report joins expenses and insurance-claims.
const expensesColReports = () => collection(db, ...basePath(), 'be_expenses');
const saleClaimsColReports = () => collection(db, ...basePath(), 'be_sale_insurance_claims');

/** Load expenses by `date` field (YYYY-MM-DD inclusive). Fallback path
 *  identical to loadSalesByDateRange — no composite index required yet. */
export async function loadExpensesByDateRange({ from = '', to = '' } = {}) {
  try {
    const conds = [];
    if (from) conds.push(where('date', '>=', from));
    if (to) conds.push(where('date', '<=', to));
    const q = conds.length > 0
      ? query(expensesColReports(), ...conds, orderBy('date', 'desc'))
      : query(expensesColReports(), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(expensesColReports());
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) items = items.filter(e => (e.date || '') >= from);
    if (to) items = items.filter(e => (e.date || '') <= to);
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items;
  }
}

/** Load sale insurance claims by `claimDate` (YYYY-MM-DD inclusive). */
export async function loadSaleInsuranceClaimsByDateRange({ from = '', to = '' } = {}) {
  try {
    const conds = [];
    if (from) conds.push(where('claimDate', '>=', from));
    if (to) conds.push(where('claimDate', '<=', to));
    const q = conds.length > 0
      ? query(saleClaimsColReports(), ...conds, orderBy('claimDate', 'desc'))
      : query(saleClaimsColReports(), orderBy('claimDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(saleClaimsColReports());
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) items = items.filter(c => (c.claimDate || '') >= from);
    if (to) items = items.filter(c => (c.claimDate || '') <= to);
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
 */
export async function loadSalesByDateRange({ from = '', to = '', includeCancelled = false } = {}) {
  try {
    const conds = [];
    if (from) conds.push(where('saleDate', '>=', from));
    if (to) conds.push(where('saleDate', '<=', to));
    const q = conds.length > 0
      ? query(salesCol(), ...conds, orderBy('saleDate', 'desc'))
      : query(salesCol(), orderBy('saleDate', 'desc'));
    const snap = await getDocs(q);
    let sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!includeCancelled) sales = sales.filter(s => s.status !== 'cancelled');
    return sales;
  } catch (e) {
    // Fallback when composite index hasn't built yet
    const snap = await getDocs(salesCol());
    let sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) sales = sales.filter(s => (s.saleDate || '') >= from);
    if (to) sales = sales.filter(s => (s.saleDate || '') <= to);
    if (!includeCancelled) sales = sales.filter(s => s.status !== 'cancelled');
    sales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
    return sales;
  }
}

/**
 * Load appointments by `date` field (YYYY-MM-DD). Same fallback pattern.
 * Sorted descending by date, then ascending by startTime.
 */
export async function loadAppointmentsByDateRange({ from = '', to = '' } = {}) {
  try {
    const conds = [];
    if (from) conds.push(where('date', '>=', from));
    if (to) conds.push(where('date', '<=', to));
    const q = conds.length > 0
      ? query(appointmentsCol(), ...conds, orderBy('date', 'desc'))
      : query(appointmentsCol(), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const snap = await getDocs(appointmentsCol());
    let appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) appts = appts.filter(a => (a.date || '') >= from);
    if (to) appts = appts.filter(a => (a.date || '') <= to);
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
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => getRemaining(b) > 0);
  } catch (e) {
    const snap = await getDocs(stockBatchesCol());
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
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
 * @param {{branchId?: string}} [opts]
 */
export async function loadAllStockBatchesForReport({ branchId = '' } = {}) {
  const getRemaining = (b) => {
    const r = Number(b?.qty?.remaining);
    if (Number.isFinite(r)) return r;
    const s = Number(b?.qty);
    return Number.isFinite(s) ? s : 0;
  };
  const snap = await getDocs(stockBatchesCol());
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => {
      if (getRemaining(b) <= 0) return false;
      if (b.status === 'cancelled' || b.status === 'depleted') return false;
      if (branchId && b.branchId !== branchId) return false;
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
 */
export async function loadAllCustomersForReport() {
  const snap = await getDocs(customersCol());
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.clonedAt || '').localeCompare(a.clonedAt || ''));
  return list;
}

/**
 * Load stock movements within a date range. Sorted desc by createdAt.
 * Used by future Phase 10 movement report (deferred from v1).
 */
export async function loadStockMovementsByDateRange({ from = '', to = '' } = {}) {
  const snap = await getDocs(stockMovementsCol());
  let mvs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (from) mvs = mvs.filter(m => (m.createdAt || '') >= from);
  if (to) mvs = mvs.filter(m => (m.createdAt || '') <= `${to}T23:59:59Z`);
  mvs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return mvs;
}
