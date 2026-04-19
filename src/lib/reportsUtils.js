// ─── Report compute helpers — pure functions used across Phase 10 tabs ──────
// All ops are non-mutating. Inputs treated as read-only.
//
// ⚠️ MONEY MATH: see /audit-reports-accuracy AR4–AR7. All currency arithmetic
// in aggregators MUST end with `roundTHB(n)` to prevent floating-point drift
// (0.1 + 0.2 = 0.30000000000000004 → bookkeeper sees discrepancy at month-end).
// Convention: Math.round(n*100)/100 (half-up to match Excel's default visual).

/** Round any number to 2-decimal THB. Half-up. NaN/non-finite → 0. */
export function roundTHB(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * Reconciliation assertion (AR5): for an aggregator output `{ rows, totals }`,
 * verify that for each numeric key on `totals`, the sum of `rows[i][key]`
 * equals `totals[key]` within 0.01 THB tolerance.
 *
 * Returns array of { key, expected, actual, drift } for every mismatch.
 * Empty array = clean reconciliation.
 *
 * Usage: tests should `expect(assertReconcile(out)).toEqual([])`.
 * Aggregators may also call this in dev mode and console.warn on mismatch.
 */
export function assertReconcile(out, keys = null) {
  const errors = [];
  const rows = out?.rows || [];
  const totals = out?.totals || {};
  const checkKeys = Array.isArray(keys) && keys.length > 0
    ? keys
    : Object.keys(totals).filter(k => typeof totals[k] === 'number');
  for (const key of checkKeys) {
    const expected = roundTHB(totals[key]);
    const actual = roundTHB(rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0));
    const drift = roundTHB(actual - expected);
    if (Math.abs(drift) > 0.005) {
      errors.push({ key, expected, actual, drift });
    }
  }
  return errors;
}

/**
 * Filter array by an ISO date field within [fromISO, toISO] inclusive.
 * Empty / missing dates are excluded. Empty range returns [].
 */
export function dateRangeFilter(items, dateField, fromISO, toISO) {
  if (!Array.isArray(items)) return [];
  if (!dateField) return [];
  const from = fromISO || '';
  const to = toISO || '';
  return items.filter(item => {
    const v = item?.[dateField];
    if (!v || typeof v !== 'string') return false;
    if (from && v < from) return false;
    if (to && v > to) return false;
    return true;
  });
}

/**
 * Group an array by a key function. Returns Map<key, items[]>.
 * Items with undefined/null key go into bucket "" (empty string).
 */
export function groupBy(items, keyFn) {
  const out = new Map();
  if (!Array.isArray(items) || typeof keyFn !== 'function') return out;
  for (const item of items) {
    const k = keyFn(item);
    const key = k === undefined || k === null ? '' : String(k);
    const bucket = out.get(key) || [];
    bucket.push(item);
    out.set(key, bucket);
  }
  return out;
}

/**
 * Sum a numeric extractor across an array. Non-numeric values coerce to 0.
 * NaN guarded — never returns NaN.
 */
export function sumBy(items, fn) {
  if (!Array.isArray(items) || typeof fn !== 'function') return 0;
  let total = 0;
  for (const item of items) {
    const n = Number(fn(item));
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * Stable-sort a copy of `items` by a key extractor.
 * direction: 'asc' (default) or 'desc'.
 * Strings compared via localeCompare; numbers numerically; mixed via String().
 */
export function sortBy(items, keyFn, direction = 'asc') {
  if (!Array.isArray(items) || typeof keyFn !== 'function') return [];
  const sign = direction === 'desc' ? -1 : 1;
  return items.map((item, i) => ({ item, i, k: keyFn(item) }))
    .sort((a, b) => {
      const ka = a.k;
      const kb = b.k;
      if (ka === kb) return a.i - b.i;
      if (typeof ka === 'number' && typeof kb === 'number') return sign * (ka - kb);
      return sign * String(ka ?? '').localeCompare(String(kb ?? ''), 'th');
    })
    .map(x => x.item);
}

/**
 * Split a total proportionally across line items based on each item's weight.
 * Used to allocate billing.depositApplied across cours items in revenue report.
 *
 * If sum(weights) === 0, returns array of zeros.
 * Last element absorbs rounding remainder so sum exactly equals `total`.
 *
 * @param {number[]} weights — non-negative weights per line
 * @param {number} total     — amount to split
 * @returns {number[]} portions, same length as weights
 */
export function proportional(weights, total) {
  if (!Array.isArray(weights) || weights.length === 0) return [];
  const safeTotal = Number(total) || 0;
  const safeWeights = weights.map(w => Math.max(0, Number(w) || 0));
  const sum = safeWeights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || safeTotal === 0) return safeWeights.map(() => 0);
  const portions = safeWeights.map(w => Math.round((w / sum) * safeTotal * 100) / 100);
  // Adjust last cell to absorb rounding drift so portions sum exactly to total.
  const drift = safeTotal - portions.reduce((a, b) => a + b, 0);
  if (portions.length > 0) {
    portions[portions.length - 1] = Math.round((portions[portions.length - 1] + drift) * 100) / 100;
  }
  return portions;
}

/**
 * Quantile boundary calculator for RFM scoring.
 * Returns array of length n+1 with sorted boundary values; element 0 is min,
 * element n is max. Values < boundaries[i] OR === boundaries[i] map to bin i+1
 * (1-indexed quintile when n=5).
 *
 * Empty input → []. All-equal input → all-3 quintile (boundaries collapse).
 */
export function quantileBoundaries(values, n = 5) {
  const nums = (Array.isArray(values) ? values : [])
    .map(v => Number(v))
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (nums.length === 0) return [];
  const out = [nums[0]];
  for (let i = 1; i < n; i++) {
    const idx = Math.floor((i / n) * nums.length);
    out.push(nums[Math.min(idx, nums.length - 1)]);
  }
  out.push(nums[nums.length - 1]);
  return out;
}

/**
 * Map a value into quintile 1..n given boundaries from quantileBoundaries().
 * Higher value → higher quintile (e.g. 5 = top 20% spender).
 * For RFM Recency where LOW is better, caller should invert (n+1-q).
 */
export function quintileOf(value, boundaries, n = 5) {
  if (!Array.isArray(boundaries) || boundaries.length < 2) return Math.ceil(n / 2);
  const v = Number(value);
  // NaN → median fallback. Infinity / -Infinity flow through the loop and
  // naturally land at top / bottom quintile via the `>=` comparison.
  if (Number.isNaN(v)) return Math.ceil(n / 2);
  for (let i = n; i >= 1; i--) {
    if (v >= boundaries[i - 1]) return i;
  }
  return 1;
}
