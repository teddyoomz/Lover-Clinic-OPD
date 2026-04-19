// ─── Appointment Analysis Aggregator (Phase 10.8) — pure, deterministic ──
//
// Replicates ProClinic /admin/appointment-analysis — per-advisor KPI table
// + per-appointment drill (expected) + per-sale drill (unexpected, not
// linked to any appointment).
//
// Data source: be_appointments + be_sales + be_customers (optional join
// for customer display). Firestore-only (Rule E/H).
//
// Triangle-verified 2026-04-20: Table 0 has 10 KPI cols matching sample:
//   พนักงานทำนัด | มาตามนัด(count/total %) | expectedSales | actualSales
//   Performance% | unexpectedSales | totalSales | remainingExpected(qty)
//   maxPossible | Forecast
//
// Sale-to-appointment match rule:
//   A sale is linked to an appointment if:
//     sale.customerId === appt.customerId
//     AND abs(sale.saleDate − appt.date) ≤ 1 day (±1 day tolerance —
//         handles same-day cash + next-day invoice patterns)
//   A sale links to AT MOST ONE appointment (the closest by date + earliest id).
//
// Iron-clad: AR3 cancelled excluded · AR4 roundTHB · AR5 reconcile ·
//            AR14 defensive · AR15 pure (asOfISO is PARAMETER).

import { roundTHB, dateRangeFilter, sortBy } from './reportsUtils.js';

/** Normalised advisor key — prefers advisorId, falls back to name. */
function advisorKey(a) {
  const id = String(a?.advisorId || '').trim();
  if (id) return `id:${id}`;
  const name = String(a?.advisorName || '').trim();
  return name ? `name:${name}` : 'unknown';
}

function advisorDisplay(a) {
  const name = String(a?.advisorName || '').trim();
  return name || (a?.advisorId ? `#${a.advisorId}` : 'ไม่ระบุ');
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity;
  const a = Date.parse(`${d1}T00:00:00.000Z`);
  const b = Date.parse(`${d2}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return Math.abs(Math.floor((a - b) / 86400000));
}

/** Status that counts as "มาตามนัด" (attended + completed). */
function didAttend(appt) {
  const s = String(appt?.status || '').trim();
  return s === 'done' || s === 'completed' || s === 'มาตามนัด' || s === 'ชำระเงิน';
}

function isFutureAppt(appt, asOfISO) {
  if (!appt?.date || !asOfISO) return false;
  return appt.date > asOfISO;
}

function isCancelledAppt(appt) {
  const s = String(appt?.status || '').trim();
  return s === 'cancelled' || s === 'ยกเลิก';
}

/* ─── Sale ↔ Appointment matching ────────────────────────────────────────── */

/**
 * Build a linkage map: saleId → appointment it satisfies (or null).
 *
 * Algorithm: for each sale, find the closest non-cancelled appointment
 * with matching customerId within ±1 day. At most one sale per appointment
 * (first-come wins for contested appointments).
 */
export function matchSalesToAppointments(sales, appointments) {
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeAppts = Array.isArray(appointments) ? appointments : [];

  // Index appts by customerId for fast lookup
  const apptsByCustomer = new Map();
  for (const a of safeAppts) {
    if (!a || isCancelledAppt(a)) continue;
    const cid = String(a.customerId || '');
    if (!cid) continue;
    const arr = apptsByCustomer.get(cid) || [];
    arr.push(a);
    apptsByCustomer.set(cid, arr);
  }

  // Iterate sales by saleDate ascending (so earlier sales get first match)
  const sortedSales = [...safeSales]
    .filter(s => s && s.status !== 'cancelled')
    .sort((a, b) => String(a.saleDate || '').localeCompare(String(b.saleDate || '')));

  const linkage = new Map(); // saleId → apptId
  const claimed = new Set(); // apptId set

  for (const s of sortedSales) {
    const cid = String(s.customerId || '');
    if (!cid) continue;
    const candidates = apptsByCustomer.get(cid) || [];
    let best = null, bestDelta = Infinity;
    for (const a of candidates) {
      const apptId = String(a.appointmentId || a.id || '');
      if (!apptId || claimed.has(apptId)) continue;
      const delta = daysBetween(s.saleDate, a.date);
      if (delta <= 1 && delta < bestDelta) {
        best = a;
        bestDelta = delta;
      }
    }
    if (best) {
      const apptId = String(best.appointmentId || best.id || '');
      const saleId = String(s.saleId || s.id || '');
      linkage.set(saleId, apptId);
      claimed.add(apptId);
    }
  }

  return linkage;
}

/* ─── Per-advisor KPI aggregator ─────────────────────────────────────────── */

/**
 * Aggregate per-advisor KPIs for Table 0.
 *
 * @param {Array} appointments
 * @param {Array} sales
 * @param {Map<string,string>} linkage — saleId → apptId (from matchSalesToAppointments)
 * @param {string} asOfISO
 */
function buildAdvisorKPIs(appointments, sales, linkage, asOfISO) {
  const apptsByAdvisor = new Map();
  const attendedByAdvisor = new Map();
  const expectedByAdvisor = new Map();
  const expectedRemainingByAdvisor = new Map();
  const remainingCountByAdvisor = new Map();
  const displayByKey = new Map();

  // Split appts: past/today count toward attendance + expected;
  // future count toward remainingExpected only. Performance% is measured
  // against past/today expected (the sales they WERE supposed to close).
  for (const a of appointments) {
    if (!a || isCancelledAppt(a)) continue;
    const key = advisorKey(a);
    displayByKey.set(key, advisorDisplay(a));
    const expected = Number(a.expectedSales) || 0;
    if (isFutureAppt(a, asOfISO)) {
      expectedRemainingByAdvisor.set(key, (expectedRemainingByAdvisor.get(key) || 0) + expected);
      remainingCountByAdvisor.set(key, (remainingCountByAdvisor.get(key) || 0) + 1);
    } else {
      apptsByAdvisor.set(key, (apptsByAdvisor.get(key) || 0) + 1);
      expectedByAdvisor.set(key, (expectedByAdvisor.get(key) || 0) + expected);
      if (didAttend(a)) {
        attendedByAdvisor.set(key, (attendedByAdvisor.get(key) || 0) + 1);
      }
    }
  }

  // Map apptId → advisor key for sale-to-advisor routing of linked sales
  const apptIdToAdvisorKey = new Map();
  for (const a of appointments) {
    if (!a || isCancelledAppt(a)) continue;
    const apptId = String(a.appointmentId || a.id || '');
    if (apptId) apptIdToAdvisorKey.set(apptId, advisorKey(a));
  }

  const actualSalesByAdvisor = new Map();       // linked
  const unexpectedSalesByAdvisor = new Map();   // not linked to any appt; attributed to... whom?
  // For "unexpected", ProClinic attributes to sale.sellers[0] or createdBy advisor.
  // Our be_sales has `sellers[]` with {id, name}. We'll group unexpected by first-seller.

  for (const s of sales) {
    if (!s || s.status === 'cancelled') continue;
    const saleId = String(s.saleId || s.id || '');
    const linkedApptId = linkage.get(saleId);
    const net = Number(s?.billing?.netTotal) || 0;
    if (linkedApptId) {
      const adv = apptIdToAdvisorKey.get(linkedApptId) || 'unknown';
      actualSalesByAdvisor.set(adv, (actualSalesByAdvisor.get(adv) || 0) + net);
    } else {
      // Unexpected sale — attribute to first seller name as pseudo-advisor
      const sellers = Array.isArray(s.sellers) ? s.sellers : [];
      const seller0 = sellers[0];
      const sellerName = (seller0?.name || '').trim() || (seller0?.id ? `#${seller0.id}` : 'ไม่ระบุ');
      const advKey = sellerName === 'ไม่ระบุ' ? 'unknown' : `name:${sellerName}`;
      displayByKey.set(advKey, sellerName);
      unexpectedSalesByAdvisor.set(advKey, (unexpectedSalesByAdvisor.get(advKey) || 0) + net);
    }
  }

  // Union of all advisor keys
  const allKeys = new Set([
    ...apptsByAdvisor.keys(),
    ...actualSalesByAdvisor.keys(),
    ...unexpectedSalesByAdvisor.keys(),
  ]);

  const rows = [];
  for (const key of allKeys) {
    const apptCount = apptsByAdvisor.get(key) || 0;
    const attendedCount = attendedByAdvisor.get(key) || 0;
    const expected = roundTHB(expectedByAdvisor.get(key) || 0);
    const actual = roundTHB(actualSalesByAdvisor.get(key) || 0);
    const unexpected = roundTHB(unexpectedSalesByAdvisor.get(key) || 0);
    const total = roundTHB(actual + unexpected);
    const remainingExpected = roundTHB(expectedRemainingByAdvisor.get(key) || 0);
    const remainingCount = remainingCountByAdvisor.get(key) || 0;
    const maxPossible = roundTHB(total + remainingExpected);
    const performancePct = expected > 0 ? roundTHB((actual / expected) * 100) : 0;
    const forecast = roundTHB(total + (remainingExpected * performancePct / 100));

    rows.push({
      advisorKey: key,
      advisorName: displayByKey.get(key) || 'ไม่ระบุ',
      apptCount,
      attendedCount,
      attendedRateLabel: apptCount > 0
        ? `${attendedCount} / ${apptCount} (${roundTHB((attendedCount / apptCount) * 100).toFixed(2)}%)`
        : '0 / 0 (0%)',
      expectedSales: expected,
      actualSales: actual,
      performancePct,
      unexpectedSales: unexpected,
      totalSales: total,
      remainingExpected,
      remainingCount,
      maxPossible,
      forecast,
    });
  }

  return sortBy(rows, r => r.totalSales, 'desc');
}

/* ─── Main aggregator ────────────────────────────────────────────────────── */

/**
 * Full appointment analysis.
 *
 * @param {Array} appointments
 * @param {Array} sales
 * @param {object} opts
 * @param {string} [opts.asOfISO]   — for future-appt detection
 * @param {string} [opts.from]      — date range for appt+sale narrowing
 * @param {string} [opts.to]
 * @param {string} [opts.advisorFilter='all']
 */
export function aggregateAppointmentAnalysis(appointments, sales, opts = {}) {
  const { asOfISO = '', from = '', to = '', advisorFilter = 'all' } = opts;

  const safeAppts = Array.isArray(appointments) ? appointments : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  // Date narrow
  const inRangeAppts = (from || to) ? dateRangeFilter(safeAppts, 'date', from, to) : safeAppts;
  const inRangeSales = (from || to) ? dateRangeFilter(safeSales, 'saleDate', from, to) : safeSales;

  // Link sales → appointments
  const linkage = matchSalesToAppointments(inRangeSales, inRangeAppts);

  // Per-advisor KPI (Table 0)
  let advisorRows = buildAdvisorKPIs(inRangeAppts, inRangeSales, linkage, asOfISO);
  if (advisorFilter && advisorFilter !== 'all') {
    advisorRows = advisorRows.filter(r => r.advisorKey === advisorFilter || r.advisorName === advisorFilter);
  }

  // Per-appointment breakdown (Table 1 — with linked sale amount where present)
  const apptIdToSale = new Map();
  for (const [saleId, apptId] of linkage.entries()) {
    apptIdToSale.set(apptId, inRangeSales.find(s => String(s.saleId || s.id) === saleId));
  }
  const apptRows = [];
  for (const a of inRangeAppts) {
    if (!a || isCancelledAppt(a)) continue;
    const apptId = String(a.appointmentId || a.id || '');
    const linkedSale = apptIdToSale.get(apptId);
    apptRows.push({
      appointmentId: apptId,
      date: a.date || '',
      customerId: String(a.customerId || ''),
      customerName: a.customerName || '-',
      customerHN: a.customerHN || '',
      appointmentTo: a.appointmentTo || '-',
      doctorName: a.doctorName || '-',
      advisorName: advisorDisplay(a),
      expectedSales: roundTHB(Number(a.expectedSales) || 0),
      actualSales: linkedSale ? roundTHB(Number(linkedSale?.billing?.netTotal) || 0) : 0,
      status: a.status || 'pending',
    });
  }

  // Per-sale breakdown (Table 2 — sales NOT linked to any appointment)
  const linkedSaleIds = new Set(linkage.keys());
  const unexpectedSaleRows = [];
  for (const s of inRangeSales) {
    if (!s || s.status === 'cancelled') continue;
    const saleId = String(s.saleId || s.id || '');
    if (linkedSaleIds.has(saleId)) continue;
    const firstSeller = Array.isArray(s.sellers) ? s.sellers[0] : null;
    unexpectedSaleRows.push({
      saleId,
      saleDate: s.saleDate || '',
      customerId: String(s.customerId || ''),
      customerName: s.customerName || '-',
      customerHN: s.customerHN || '',
      appointmentTo: '-',                // unknown for unlinked sales
      doctorName: '-',
      advisorName: (firstSeller?.name || '').trim() || 'ไม่ระบุ',
      actualSales: roundTHB(Number(s?.billing?.netTotal) || 0),
      status: s?.payment?.status || 'paid',
    });
  }

  // Totals — overall clinic
  const totals = advisorRows.reduce((acc, r) => {
    acc.apptCount += r.apptCount;
    acc.attendedCount += r.attendedCount;
    acc.expectedSales += r.expectedSales;
    acc.actualSales += r.actualSales;
    acc.unexpectedSales += r.unexpectedSales;
    acc.totalSales += r.totalSales;
    acc.remainingExpected += r.remainingExpected;
    acc.maxPossible += r.maxPossible;
    acc.forecast += r.forecast;
    return acc;
  }, {
    apptCount: 0, attendedCount: 0,
    expectedSales: 0, actualSales: 0, unexpectedSales: 0, totalSales: 0,
    remainingExpected: 0, maxPossible: 0, forecast: 0,
  });
  // Round
  for (const k of ['expectedSales','actualSales','unexpectedSales','totalSales','remainingExpected','maxPossible','forecast']) {
    totals[k] = roundTHB(totals[k]);
  }
  totals.performancePct = totals.expectedSales > 0
    ? roundTHB((totals.actualSales / totals.expectedSales) * 100)
    : 0;

  return {
    advisors: advisorRows,
    appointments: apptRows,
    unexpectedSales: unexpectedSaleRows,
    totals,
    meta: {
      apptsTotal: inRangeAppts.length,
      salesTotal: inRangeSales.length,
      linkedSaleCount: linkage.size,
      unlinkedSaleCount: unexpectedSaleRows.length,
      range: { from, to },
      asOfISO,
    },
  };
}

/* ─── Column specs for CSV ──────────────────────────────────────────────── */

export function buildAdvisorKPIColumns({ fmtMoney = (v) => v } = {}) {
  return [
    { key: 'advisorName',       label: 'พนักงานทำนัด' },
    { key: 'attendedRateLabel', label: 'มาตามนัด' },
    { key: 'expectedSales',     label: 'ยอดขายที่คาดหวัง', format: (v) => fmtMoney(v) },
    { key: 'actualSales',       label: 'ยอดขาย',           format: (v) => fmtMoney(v) },
    { key: 'performancePct',    label: 'Performance',       format: (v) => `${Number(v || 0).toFixed(2)}%` },
    { key: 'unexpectedSales',   label: 'ยอดขายที่ไม่คาดหวัง', format: (v) => fmtMoney(v) },
    { key: 'totalSales',        label: 'ยอดขายรวม',         format: (v) => fmtMoney(v) },
    { key: 'remainingExpected', label: 'ยอดคาดหวังจากนัดที่เหลือ', format: (v, r) => `${fmtMoney(v)} (${r?.remainingCount || 0} นัด)` },
    { key: 'maxPossible',       label: 'ยอดขายที่เป็นไปได้สูงสุด', format: (v) => fmtMoney(v) },
    { key: 'forecast',          label: 'Forecast',           format: (v) => fmtMoney(v) },
  ];
}
