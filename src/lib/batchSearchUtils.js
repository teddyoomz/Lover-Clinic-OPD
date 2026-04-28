// Phase 15.6 / V35.1 (2026-04-28) — pure helpers for BatchSelectField.
//
// User directive: "ทำให้ทั้งหน้าสร้างใบโอนย้ายสต็อกและสร้างใบเบิก ของทั้งสาขา
// และคลังกลาง ใช้ระบบ search เลือกรายการสินค้าได้เหมือนกันกับ สร้าง Order
// นำเข้า". Transfer + Withdrawal pick BATCHES (not products), so a parallel
// helper module mirrors productSearchUtils.js but with batch-specific shape.

/**
 * Compose the main display label for a batch.
 *   "{productName} — ...{last8(batchId)}"
 * Falls back to batchId if productName missing.
 */
export function composeBatchDisplayName(b) {
  if (!b || typeof b !== 'object') return '';
  const name = String(b.productName || '').trim();
  const bid = String(b.batchId || b.id || '').trim();
  const tail = bid ? `…${bid.slice(-8)}` : '';
  if (name && tail) return `${name} — ${tail}`;
  if (name) return name;
  return tail || '';
}

/**
 * Compose the subtitle line: qty.remaining/qty.total + unit + (optional)
 * expiry. Empty when nothing useful.
 */
export function composeBatchSubtitle(b) {
  if (!b || typeof b !== 'object') return '';
  const parts = [];
  const remaining = Number(b?.qty?.remaining ?? NaN);
  const total = Number(b?.qty?.total ?? NaN);
  const unit = String(b?.unit || '').trim();
  if (Number.isFinite(remaining) && Number.isFinite(total)) {
    parts.push(`${formatQty(remaining)}/${formatQty(total)}${unit ? ' ' + unit : ''}`);
  } else if (unit) {
    parts.push(unit);
  }
  if (b.expiresAt) parts.push(`exp ${b.expiresAt}`);
  return parts.join(' · ');
}

function formatQty(n) {
  if (Number.isInteger(n)) return String(n);
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

/**
 * Filter batches by query — searches productName + batchId + unit +
 * branchId + locationId. Empty query returns all (Thai-locale sorted).
 *
 * Default sort: by composeBatchDisplayName (Thai locale aware), stable
 * on equal keys. Caller can re-sort post-filter for FEFO etc.
 */
export function filterBatchesByQuery(batches, query) {
  const list = Array.isArray(batches) ? batches : [];
  const q = String(query || '').trim().toLowerCase();

  let filtered;
  if (!q) {
    filtered = list.slice();
  } else {
    filtered = list.filter((b) => {
      const haystack = [
        composeBatchDisplayName(b),
        String(b?.batchId || ''),
        String(b?.productId || ''),
        String(b?.productName || ''),
        String(b?.unit || ''),
        String(b?.branchId || ''),
        String(b?.locationId || ''),
        String(b?.expiresAt || ''),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  try {
    filtered.sort((a, b) =>
      composeBatchDisplayName(a).localeCompare(composeBatchDisplayName(b), 'th')
    );
  } catch {
    filtered.sort((a, b) =>
      composeBatchDisplayName(a).localeCompare(composeBatchDisplayName(b))
    );
  }

  return filtered;
}
