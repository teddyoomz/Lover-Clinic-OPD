import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Pure mirror of updateStockBatchExpiry's decision logic (kept in lock-step).
function normExpiry(v) { return (v === '' || v == null) ? null : String(v); }
function resolveOrderRefKind(batch) { return batch.locationType === 'central' ? 'central' : 'branch'; }
function buildExpirySync(order, orderProductId, newExpiresAt) {
  const items = Array.isArray(order.items) ? order.items : [];
  let touched = false;
  const newItems = items.map((it) => {
    if (it && it.orderProductId === orderProductId) { touched = true; return { ...it, expiresAt: newExpiresAt }; }
    return it;
  });
  return { touched, newItems };
}

describe('V159 — updateStockBatchExpiry logic', () => {
  it('C1 normalize empty/null → null (clearable); string preserved', () => {
    expect(normExpiry('')).toBe(null);
    expect(normExpiry(null)).toBe(null);
    expect(normExpiry(undefined)).toBe(null);
    expect(normExpiry('2026-07-31')).toBe('2026-07-31');
  });
  it('C2 central batch → central order collection; else branch', () => {
    expect(resolveOrderRefKind({ locationType: 'central' })).toBe('central');
    expect(resolveOrderRefKind({ locationType: 'branch' })).toBe('branch');
    expect(resolveOrderRefKind({})).toBe('branch');
  });
  it('C3 order-line sync touches only the matching orderProductId', () => {
    const order = { items: [
      { orderProductId: 'OPI-a', expiresAt: '2026-01-01' },
      { orderProductId: 'OPI-b', expiresAt: '2026-06-30' },
    ] };
    const { touched, newItems } = buildExpirySync(order, 'OPI-b', '2026-07-31');
    expect(touched).toBe(true);
    expect(newItems[0].expiresAt).toBe('2026-01-01'); // untouched
    expect(newItems[1].expiresAt).toBe('2026-07-31');
  });
  it('C4 no matching line → touched=false (graceful)', () => {
    const { touched } = buildExpirySync({ items: [{ orderProductId: 'OPI-x' }] }, 'OPI-z', '2026-07-31');
    expect(touched).toBe(false);
  });
  it('C5 source-grep: updateStockBatchExpiry has the right contract', () => {
    const src = readFileSync('src/lib/backendClient.js', 'utf8');
    expect(src).toMatch(/export async function updateStockBatchExpiry/);
    const start = src.indexOf('export async function updateStockBatchExpiry');
    const after = src.indexOf('\nexport ', start + 10);
    const fnBody = src.slice(start, after > 0 ? after : start + 3000);
    expect(fnBody).toMatch(/runTransaction\(/);
    expect(fnBody).toMatch(/type:\s*'expiry'/);            // audit doc type
    expect(fnBody).toMatch(/expiresAtLegacyValue/);        // forensic trail
    expect(fnBody).toMatch(/_resolveProductNameLive/);     // Rule O
    expect(fnBody).toMatch(/movementId:\s*null/);          // no movement linked
    // expiry path must NOT write status (EXPIRED is derived, never persisted)
    expect(fnBody).not.toMatch(/\bstatus:\s/);
    // expiry path must NOT write a movement doc (conservation untouched)
    expect(fnBody).not.toMatch(/stockMovementDoc/);
  });
  it('C6 scopedDataLayer exports updateStockBatchExpiry (writer passthrough)', () => {
    const src = readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(src).toMatch(/export const updateStockBatchExpiry\s*=\s*\(\.\.\.args\)\s*=>\s*raw\.updateStockBatchExpiry/);
  });
});
