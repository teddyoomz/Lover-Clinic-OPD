// ─── Staff Sales Aggregator (Phase 10.X2) — pure, deterministic ──────────
//
// Closes ReportsHome cards "ยอดขายรายแพทย์/พนักงาน" +
// "ยอดขายรายแพทย์/พนักงานตามยอดเงินที่ชำระ" (no Phase 11-16 coverage).
// Aggregates be_sales by seller (staff) and by doctor separately — a sale
// with multiple sellers contributes its netTotal PROPORTIONALLY to each
// seller (even split by default unless seller.share is set).
//
// Output shape: { staffRows, doctorRows, totals, meta }
//
// Iron-clad:
//   - AR3 cancelled excluded from sum (counted separately)
//   - AR4 roundTHB at all boundaries
//   - AR5 reconciliation — staff row sum of netShare === total active netTotal
//   - AR14 defensive access
//   - AR15 pure

import { roundTHB, dateRangeFilter, sortBy } from './reportsUtils.js';

function sellerKey(s) {
  const id = String(s?.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(s?.name || '').trim();
  return name ? `name:${name}` : '';
}
/** Resolve display name: prefer seller.name → staffMap[id].name → '#id' → 'ไม่ระบุ'. */
function sellerDisplay(s, staffMap) {
  const rawName = (s?.name || '').trim();
  if (rawName) return rawName;
  const id = String(s?.id || '').trim();
  if (id && staffMap) {
    const m = staffMap.get(id);
    const resolved = (m?.name || '').trim();
    if (resolved) return resolved;
  }
  return id ? `#${id}` : 'ไม่ระบุ';
}

function doctorKey(sale) {
  const t = sale?.treatment || {};
  const id = String(sale?.doctorId || t?.doctorId || '').trim();
  if (id) return `id:${id}`;
  const name = String(sale?.doctorName || t?.doctorName || '').trim();
  return name ? `name:${name}` : '';
}
function doctorDisplay(sale, doctorMap) {
  const t = sale?.treatment || {};
  const rawName = (sale?.doctorName || t?.doctorName || '').trim();
  if (rawName) return rawName;
  const id = String(sale?.doctorId || t?.doctorId || '').trim();
  if (id && doctorMap) {
    const m = doctorMap.get(id);
    const resolved = (m?.name || '').trim();
    if (resolved) return resolved;
  }
  return id ? `#${id}` : 'ไม่ระบุ';
}

/** Build an id-keyed Map from a master_data array (staff or doctors). */
function buildMasterMap(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const it of items) {
    const id = String(it?.id || it?.proClinicId || '').trim();
    if (id) map.set(id, it);
  }
  return map;
}

/** Compute per-seller amounts (share-weighted split, even by default). */
export function splitSaleAcrossSellers(sale) {
  const sellers = Array.isArray(sale?.sellers) ? sale.sellers : [];
  const net = Number(sale?.billing?.netTotal) || 0;
  const paid = (Array.isArray(sale?.payment?.channels) ? sale.payment.channels : [])
    .reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);

  if (sellers.length === 0) return [];

  // If sellers[].share provided use as weights; missing share defaults to 1
  // (even-split). Explicit 0 or negative is respected as "0 credit" — this
  // lets ops set share=0 for a seller who should not be counted.
  const weights = sellers.map(s => {
    const w = Number(s?.share);
    if (!Number.isFinite(w)) return 1; // missing/NaN → default 1
    return Math.max(0, w);              // explicit value (incl 0)
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    return sellers.map(() => ({ seller: null, netShare: 0, paidShare: 0 }));
  }

  const shares = sellers.map((seller, i) => {
    const pct = weights[i] / weightSum;
    return {
      seller,
      netShare: net * pct,
      paidShare: paid * pct,
    };
  });
  // Last-cell rounding absorbs drift
  const last = shares[shares.length - 1];
  const drift = net - shares.reduce((a, x) => a + x.netShare, 0);
  last.netShare += drift;
  const driftPaid = paid - shares.reduce((a, x) => a + x.paidShare, 0);
  last.paidShare += driftPaid;
  return shares;
}

/**
 * Aggregate per-staff (seller) + per-doctor rows over date-filtered be_sales.
 */
export function aggregateStaffSales(sales, filters = {}) {
  const {
    from = '', to = '', searchText = '',
    staffMasterList = [], doctorMasterList = [],
  } = filters;

  const safeSales = Array.isArray(sales) ? sales : [];
  const inRange = (from || to) ? dateRangeFilter(safeSales, 'saleDate', from, to) : safeSales;
  const staffLookup = buildMasterMap(staffMasterList);
  const doctorLookup = buildMasterMap(doctorMasterList);

  const staffMap = new Map();
  const doctorMap = new Map();
  const displayStaff = new Map();
  const displayDoctor = new Map();

  let totalActive = 0, totalPaid = 0, totalCancelled = 0, totalNetAllocated = 0;

  for (const s of inRange) {
    if (!s) continue;
    if (s.status === 'cancelled') { totalCancelled += 1; continue; } // AR3

    totalActive += 1;
    const net = Number(s?.billing?.netTotal) || 0;
    const paid = (Array.isArray(s?.payment?.channels) ? s.payment.channels : [])
      .reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    totalPaid += paid;

    // Per-seller split
    const shares = splitSaleAcrossSellers(s);
    for (const sh of shares) {
      const key = sellerKey(sh.seller);
      if (!key) continue;
      displayStaff.set(key, sellerDisplay(sh.seller, staffLookup));
      const cur = staffMap.get(key) || { saleCount: 0, netShare: 0, paidShare: 0 };
      cur.saleCount += 1; // counts each seller-in-sale once
      cur.netShare += sh.netShare;
      cur.paidShare += sh.paidShare;
      staffMap.set(key, cur);
      totalNetAllocated += sh.netShare;
    }

    // Per-doctor (full sale amount attributed to the ONE doctor)
    const dk = doctorKey(s);
    if (dk) {
      displayDoctor.set(dk, doctorDisplay(s, doctorLookup));
      const cur = doctorMap.get(dk) || { saleCount: 0, netTotal: 0, paidAmount: 0 };
      cur.saleCount += 1;
      cur.netTotal += net;
      cur.paidAmount += paid;
      doctorMap.set(dk, cur);
    }
  }

  let staffRows = [...staffMap.entries()].map(([key, v]) => ({
    staffKey: key,
    staffName: displayStaff.get(key) || 'ไม่ระบุ',
    saleCount: v.saleCount,
    netShare: roundTHB(v.netShare),
    paidShare: roundTHB(v.paidShare),
  }));
  let doctorRows = [...doctorMap.entries()].map(([key, v]) => ({
    doctorKey: key,
    doctorName: displayDoctor.get(key) || 'ไม่ระบุ',
    saleCount: v.saleCount,
    netTotal: roundTHB(v.netTotal),
    paidAmount: roundTHB(v.paidAmount),
  }));

  // Search filter
  const q = (searchText || '').trim().toLowerCase();
  if (q) {
    staffRows = staffRows.filter(r => r.staffName.toLowerCase().includes(q));
    doctorRows = doctorRows.filter(r => r.doctorName.toLowerCase().includes(q));
  }

  staffRows = sortBy(staffRows, r => r.netShare, 'desc');
  doctorRows = sortBy(doctorRows, r => r.netTotal, 'desc');

  return {
    staffRows,
    doctorRows,
    totals: {
      staffCount: staffRows.length,
      doctorCount: doctorRows.length,
      saleCount: totalActive,
      cancelledCount: totalCancelled,
      netTotal: roundTHB(staffRows.reduce((s, r) => s + r.netShare, 0) || totalNetAllocated),
      paidTotal: roundTHB(totalPaid),
    },
    meta: {
      totalSales: inRange.length,
      activeSales: totalActive,
      range: { from, to },
    },
  };
}

/* ─── Column specs ───────────────────────────────────────────────────────── */

export function buildStaffColumns({ fmtMoney = (v) => v } = {}) {
  return [
    { key: 'staffName', label: 'พนักงานขาย' },
    { key: 'saleCount', label: 'จำนวนใบขาย' },
    { key: 'netShare',  label: 'ยอดขาย (แบ่งตามสัดส่วน)', format: (v) => fmtMoney(v) },
    { key: 'paidShare', label: 'ยอดที่ชำระ (แบ่งตามสัดส่วน)', format: (v) => fmtMoney(v) },
  ];
}

export function buildDoctorColumns({ fmtMoney = (v) => v } = {}) {
  return [
    { key: 'doctorName', label: 'แพทย์' },
    { key: 'saleCount',  label: 'จำนวนใบขาย' },
    { key: 'netTotal',   label: 'ยอดขายรวม',   format: (v) => fmtMoney(v) },
    { key: 'paidAmount', label: 'ยอดที่ชำระ',  format: (v) => fmtMoney(v) },
  ];
}
