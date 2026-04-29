// ─── Audience Rules — Phase 16.1 (2026-04-30) ───────────────────────────────
// Pure predicate evaluator for Smart Audience tab. Builds AND/OR trees over
// be_customers + be_sales.
//
// Schema:
//   - Group node:      { kind: 'group', op: 'AND' | 'OR', children: [...] }
//   - Predicate leaf:  { kind: 'predicate', type, params: {...} }
//
// 8 predicate types (4 demographic + 4 behavioural):
//   1. age-range             { min, max }                                 — customer.birthdate
//   2. gender                { value: 'M' | 'F' }                          — customer.gender
//   3. branch                { branchIds: string[] }                       — customer.branchId
//   4. source                { values: string[] }                          — customer.source
//   5. bought-x-in-last-n    { kind: 'product'|'course', refId, months }   — sales.items[]
//   6. spend-bracket         { min, max }                                  — sum(sale.billing.netTotal)
//   7. last-visit-days       { op: '>='|'<=', days }                       — most-recent saleDate
//   8. has-unfinished-course { value: true | false }                       — customer.courses[].qty
//
// Iron-clad refs:
//   - Rule E + H + H-quater — feature reads only be_* (no ProClinic-mirror reads)
//   - V14 no-undefined-leaves — predicates return typed booleans
//   - Thai TZ via bangkokNow() for age + last-visit math (V-class TZ-bug guard)

import { parseQtyString } from './courseUtils.js';
import { bangkokNow } from '../utils.js';

// Frozen list of valid predicate types — kept in sync with validation + UI.
export const PREDICATE_TYPES = Object.freeze([
  'age-range',
  'gender',
  'branch',
  'source',
  'bought-x-in-last-n',
  'spend-bracket',
  'last-visit-days',
  'has-unfinished-course',
]);

// Statuses that disqualify a sale or course for the "active" predicates.
// Mirrors RemainingCourseTab + saleReportAggregator conventions.
const SALE_EXCLUDED_STATUSES = new Set(['cancelled', 'refunded']);
const COURSE_EXCLUDED_STATUSES = new Set(['ยกเลิก', 'คืนเงิน']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safeNum(v) {
  // Number(null) === 0 and Number('') === 0 — both would corrupt
  // open-ended range comparisons (min: null treated as 0 → "below 0"
  // gate accidentally matches). Treat all empty-ish inputs as NaN so
  // the caller's `Number.isFinite()` guard skips the comparison.
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Compute integer age years given a birthdate string YYYY-MM-DD and a
 * "today" Date (Bangkok wall-clock — pass bangkokNow()). Returns NaN when
 * birthdate is missing/malformed.
 */
export function computeAgeYears(birthdateStr, today) {
  if (typeof birthdateStr !== 'string' || !birthdateStr) return NaN;
  const m = birthdateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const by = +m[1], bm = +m[2], bd = +m[3];
  if (!by || !bm || !bd) return NaN;
  if (!(today instanceof Date)) return NaN;
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  let age = y - by;
  if (mo < bm || (mo === bm && d < bd)) age -= 1;
  return age;
}

/**
 * Days between today (Bangkok) and a YYYY-MM-DD string. Positive = past.
 * Uses Date.UTC for both endpoints so DST drift cannot distort the diff.
 * Returns NaN when input is missing/malformed.
 */
export function daysBetween(today, dateStr) {
  if (!(today instanceof Date)) return NaN;
  if (typeof dateStr !== 'string' || !dateStr) return NaN;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const todayEpoch = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dEpoch = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (!Number.isFinite(dEpoch)) return NaN;
  return Math.floor((todayEpoch - dEpoch) / MS_PER_DAY);
}

/** Most recent saleDate from a list of sales (excluding cancelled/refunded). */
export function mostRecentSaleDate(sales) {
  if (!Array.isArray(sales) || sales.length === 0) return '';
  let best = '';
  for (const s of sales) {
    if (!s || SALE_EXCLUDED_STATUSES.has(s.status)) continue;
    const d = typeof s.saleDate === 'string' ? s.saleDate : '';
    if (d && d > best) best = d;
  }
  return best;
}

/** Sum of sale.billing.netTotal across non-cancelled sales. */
export function sumNetTotal(sales) {
  if (!Array.isArray(sales)) return 0;
  let total = 0;
  for (const s of sales) {
    if (!s || SALE_EXCLUDED_STATUSES.has(s.status)) continue;
    const billing = (s.billing && typeof s.billing === 'object') ? s.billing : null;
    const net = safeNum(billing?.netTotal ?? s.netTotal ?? s.total);
    if (Number.isFinite(net)) total += net;
  }
  return total;
}

/** Step `today` back N months while preserving day-of-month (clamps overflow). */
function shiftMonthsBack(today, months) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  const target = new Date(Date.UTC(y, m - months, d));
  return target;
}

function ymd(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Test whether a customer bought a specific product/course in the last N months. */
function customerBoughtInLastNMonths(customerSales, today, params) {
  const months = safeNum(params?.months);
  if (!Number.isFinite(months) || months <= 0) return false;
  const refId = String(params?.refId || '').trim();
  if (!refId) return false;
  const kind = params?.kind === 'course' ? 'course' : 'product';
  const cutoffStr = ymd(shiftMonthsBack(today, months));
  for (const s of (customerSales || [])) {
    if (!s || SALE_EXCLUDED_STATUSES.has(s.status)) continue;
    if (typeof s.saleDate !== 'string' || s.saleDate < cutoffStr) continue;
    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      if (!it) continue;
      const id = kind === 'course'
        ? String(it.courseId || it.course_id || '').trim()
        : String(it.productId || it.product_id || '').trim();
      if (id === refId) return true;
    }
  }
  return false;
}

/**
 * Check if any course in customer.courses[] is unfinished
 * (status not excluded AND parseQty.remaining > 0).
 *
 * value=true  → "has at least one unfinished" — ANY match
 * value=false → "has NONE unfinished"          — ZERO match
 */
function customerHasUnfinishedCourse(customer, value) {
  const courses = Array.isArray(customer?.courses) ? customer.courses : [];
  let anyOpen = false;
  for (const c of courses) {
    if (!c) continue;
    if (COURSE_EXCLUDED_STATUSES.has(c.status)) continue;
    const qtyStr = typeof c.qty === 'string' ? c.qty : '';
    const { remaining } = parseQtyString(qtyStr);
    if (Number.isFinite(remaining) && remaining > 0) { anyOpen = true; break; }
  }
  return value === true ? anyOpen : !anyOpen;
}

/**
 * Evaluate a single predicate against a customer + their sales list.
 * Always returns boolean — never throws. Invalid params → false.
 *
 * @param {object} customer
 * @param {Array}  customerSales — sales already filtered to this customer
 * @param {object} predicate     — { kind:'predicate', type, params }
 * @param {Date}   today         — bangkokNow() reference
 * @returns {boolean}
 */
export function evaluatePredicate(customer, customerSales, predicate, today) {
  if (!customer || typeof customer !== 'object') return false;
  if (!predicate || predicate.kind !== 'predicate') return false;
  const params = (predicate.params && typeof predicate.params === 'object' && !Array.isArray(predicate.params))
    ? predicate.params
    : {};
  switch (predicate.type) {
    case 'age-range': {
      const age = computeAgeYears(customer.birthdate, today);
      if (!Number.isFinite(age)) return false;
      const min = safeNum(params.min);
      const max = safeNum(params.max);
      if (Number.isFinite(min) && age < min) return false;
      if (Number.isFinite(max) && age > max) return false;
      return true;
    }
    case 'gender': {
      const value = String(params.value || '').trim().toUpperCase();
      if (value !== 'M' && value !== 'F') return false;
      return String(customer.gender || '').toUpperCase() === value;
    }
    case 'branch': {
      const branchIds = Array.isArray(params.branchIds)
        ? params.branchIds.map((v) => String(v ?? '').trim()).filter(Boolean)
        : [];
      if (branchIds.length === 0) return false;
      const cb = String(
        customer.branchId
          ?? customer.branch_id
          ?? customer?.patientData?.branch
          ?? '',
      ).trim();
      return branchIds.includes(cb);
    }
    case 'source': {
      const values = Array.isArray(params.values)
        ? params.values.map((v) => String(v ?? '').trim()).filter(Boolean)
        : [];
      if (values.length === 0) return false;
      const cs = String(customer.source || '').trim();
      return values.includes(cs);
    }
    case 'bought-x-in-last-n':
      return customerBoughtInLastNMonths(customerSales, today, params);
    case 'spend-bracket': {
      const total = sumNetTotal(customerSales);
      const min = safeNum(params.min);
      const max = safeNum(params.max);
      if (Number.isFinite(min) && total < min) return false;
      if (Number.isFinite(max) && total > max) return false;
      return true;
    }
    case 'last-visit-days': {
      const op = params.op === '>=' ? '>=' : params.op === '<=' ? '<=' : '';
      if (!op) return false;
      const days = safeNum(params.days);
      if (!Number.isFinite(days) || days < 0) return false;
      const lastDate = mostRecentSaleDate(customerSales);
      if (!lastDate) {
        // No qualifying sale = "infinity" days since last visit.
        // op '>=' matches (never-visitors are >= every threshold);
        // op '<=' fails (never-visitors are not <= any finite threshold).
        return op === '>=';
      }
      const diff = daysBetween(today, lastDate);
      if (!Number.isFinite(diff)) return false;
      if (op === '>=') return diff >= days;
      return diff <= days;
    }
    case 'has-unfinished-course':
      return customerHasUnfinishedCourse(customer, params.value === true);
    default:
      return false;
  }
}

/**
 * Evaluate an AND/OR group recursively. Empty group returns TRUE (vacuous).
 *
 * @param {object} customer
 * @param {Array}  customerSales
 * @param {object} group  — { kind:'group', op, children: [...] }
 * @param {Date}   today
 * @returns {boolean}
 */
export function evaluateGroup(customer, customerSales, group, today) {
  if (!group || group.kind !== 'group') return false;
  const op = group.op === 'OR' ? 'OR' : 'AND';
  const children = Array.isArray(group.children) ? group.children : [];
  if (children.length === 0) return true;
  if (op === 'AND') {
    for (const child of children) {
      const ok = child?.kind === 'group'
        ? evaluateGroup(customer, customerSales, child, today)
        : evaluatePredicate(customer, customerSales, child, today);
      if (!ok) return false;
    }
    return true;
  }
  for (const child of children) {
    const ok = child?.kind === 'group'
      ? evaluateGroup(customer, customerSales, child, today)
      : evaluatePredicate(customer, customerSales, child, today);
    if (ok) return true;
  }
  return false;
}

/**
 * Build a Map<customerId, sales[]> index from a flat sales array.
 * Status filtering happens per-predicate (some need cancelled-aware logic).
 */
export function indexSalesByCustomer(sales) {
  const out = new Map();
  if (!Array.isArray(sales)) return out;
  for (const s of sales) {
    if (!s) continue;
    const cid = String(s.customerId || s.customer_id || '').trim();
    if (!cid) continue;
    const arr = out.get(cid) || [];
    arr.push(s);
    out.set(cid, arr);
  }
  return out;
}

/**
 * Evaluate a rule (root group) against customers + their sales.
 * Returns matched ids ASC + total count for stable preview.
 *
 * @param {Array} customers
 * @param {Map<string, Array> | object} salesByCustomer
 * @param {object} rule  — root group node
 * @param {Date}   [today] — bangkokNow() default
 * @returns {{ matchedIds: string[], total: number }}
 */
export function evaluateRule(customers, salesByCustomer, rule, today) {
  const t = today instanceof Date ? today : bangkokNow();
  const lookup = salesByCustomer instanceof Map
    ? (id) => salesByCustomer.get(id) || []
    : (salesByCustomer && typeof salesByCustomer === 'object')
      ? (id) => salesByCustomer[id] || []
      : () => [];
  const matchedIds = [];
  if (!Array.isArray(customers)) return { matchedIds: [], total: 0 };
  for (const c of customers) {
    if (!c || !c.id) continue;
    const cid = String(c.id);
    const sales = lookup(cid);
    if (evaluateGroup(c, sales, rule, t)) matchedIds.push(cid);
  }
  matchedIds.sort();
  return { matchedIds, total: matchedIds.length };
}
