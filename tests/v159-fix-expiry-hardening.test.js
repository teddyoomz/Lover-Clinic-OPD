// V159-fix — expiry feature hardening (systematic-debugging round, 2026-06-03).
// Two real bugs found by adversarial Phase-1 of the stock expiry feature:
//
//   B1  Dual-path torn write: StockAdjustPanel.handleSave ran the NON-idempotent
//       qty adjust FIRST + the idempotent expiry edit SECOND, as two separate
//       awaits. A transient failure between them + a natural retry (form not
//       reset on error) DOUBLE-APPLIED the qty adjustment → stock conservation
//       violation. Fix: reorder (expiry FIRST, qty LAST) + an in-tx idempotency
//       guard in updateStockBatchExpiry (unchanged expiry → no-op).
//
//   B2  Central expiry→order-line sync was a silent no-op: central order items
//       key on `centralOrderProductId`, but the sync only matched `orderProductId`
//       (branch key). Fix: match EITHER tier key.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BC_SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'backendClient.js'), 'utf-8');
const FORM_SRC = readFileSync(join(process.cwd(), 'src', 'components', 'backend', 'StockAdjustPanel.jsx'), 'utf-8');

// Isolate the updateStockBatchExpiry function body for scoped source-greps.
function fnBody(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  if (start < 0) return '';
  return src.slice(start, start + 4000);
}
const EXPIRY_FN = fnBody(BC_SRC, 'updateStockBatchExpiry');

// ════════ A — B2: central tier key match (pure mirror of the in-tx sync) ════════
function syncOrderLine(order, batchOrderProductId, newExpiresAt) {
  let orderSynced = false;
  const items = (order.items || []).map((it) => {
    if (it && (it.orderProductId === batchOrderProductId || it.centralOrderProductId === batchOrderProductId)) {
      orderSynced = true; return { ...it, expiresAt: newExpiresAt };
    }
    return it;
  });
  return { items, orderSynced };
}

describe('V159-fix B2 — expiry sync matches BOTH tier keys', () => {
  it('A1 branch order (orderProductId) syncs', () => {
    const order = { items: [{ orderProductId: 'ORD-1-0', expiresAt: '2026-01-01' }, { orderProductId: 'ORD-1-1', expiresAt: '2026-02-02' }] };
    const r = syncOrderLine(order, 'ORD-1-0', '2027-12-31');
    expect(r.orderSynced).toBe(true);
    expect(r.items[0].expiresAt).toBe('2027-12-31');
    expect(r.items[1].expiresAt).toBe('2026-02-02'); // sibling untouched
  });
  it('A2 ★ central order (centralOrderProductId) NOW syncs (was a no-op)', () => {
    const order = { items: [{ centralOrderProductId: 'CPO-9-0', expiresAt: '2026-01-01' }, { centralOrderProductId: 'CPO-9-1', expiresAt: '2026-02-02' }] };
    const r = syncOrderLine(order, 'CPO-9-0', '2028-06-30');
    expect(r.orderSynced).toBe(true);
    expect(r.items[0].expiresAt).toBe('2028-06-30');
    expect(r.items[1].expiresAt).toBe('2026-02-02');
  });
  it('A3 the OLD branch-only match would MISS central (regression contrast)', () => {
    const items = [{ centralOrderProductId: 'CPO-9-0' }];
    const oldMatch = items.some(it => it.orderProductId === 'CPO-9-0'); // pre-fix logic
    const newMatch = items.some(it => it.orderProductId === 'CPO-9-0' || it.centralOrderProductId === 'CPO-9-0');
    expect(oldMatch).toBe(false); // proves the old no-op
    expect(newMatch).toBe(true);  // proves the fix
  });
});

// ════════ B — B1: idempotency guard + reorder make a retry apply qty ONCE ════════
// Pure mirror of updateStockBatchExpiry's idempotency guard.
function simExpiryEdit(batch, newExpiresAt) {
  const old = batch.expiresAt ?? null;
  if (newExpiresAt === old) return { batch, adjustmentWritten: false }; // B1 in-tx guard
  return { batch: { ...batch, expiresAt: newExpiresAt }, adjustmentWritten: true };
}
// Pure mirror of StockAdjustPanel.handleSave dual-path. The realistic torn-write
// is the SECOND await failing transiently → the handler's catch leaves the form
// intact → a natural retry re-runs BOTH steps. If the FIRST step is the
// non-idempotent qty adjust (old order), re-running it DOUBLES the qty.
// `order` = which step runs first. `failSecondAttempts` = times the 2nd step throws.
function simHandleSave(initialBatch, { qtyDelta, newExpiresAt, order, failSecondAttempts }) {
  let batch = { ...initialBatch, qty: { ...initialBatch.qty } };
  let adjustmentDocs = 0;
  const fail = { n: failSecondAttempts };
  const doExpiry = () => { const r = simExpiryEdit(batch, newExpiresAt); batch = r.batch; if (r.adjustmentWritten) adjustmentDocs++; };
  const doQty = () => { batch = { ...batch, qty: { remaining: batch.qty.remaining + qtyDelta, total: batch.qty.total + qtyDelta } }; };
  const steps = order === 'expiry-first' ? [doExpiry, doQty] : [doQty, doExpiry];
  const run = () => {
    steps[0]();                                                   // first step applies
    if (fail.n > 0) { fail.n--; throw new Error('transient failure on 2nd await'); } // 2nd throws BEFORE applying
    steps[1]();                                                   // second step applies
  };
  try { run(); } catch { run(); /* user retries — form state preserved */ }
  return { batch, adjustmentDocs };
}

describe('V159-fix B1 — reorder + idempotency guard = qty applied exactly once on retry', () => {
  const base = { expiresAt: '2026-09-30', qty: { remaining: 10, total: 10 } };

  it('B1 ★ FIXED (expiry-first, qty-last): 2nd-await fail + retry → qty applied ONCE', () => {
    const { batch } = simHandleSave(base, { qtyDelta: 5, newExpiresAt: '2027-01-01', order: 'expiry-first', failSecondAttempts: 1 });
    expect(batch.qty.remaining).toBe(15); // +5 once, NOT +10 — conservation held
    expect(batch.expiresAt).toBe('2027-01-01');
  });
  it('B2 ★ OLD (qty-first): 2nd-await fail + retry → qty DOUBLED (pre-fix bug)', () => {
    const { batch } = simHandleSave(base, { qtyDelta: 5, newExpiresAt: '2027-01-01', order: 'qty-first', failSecondAttempts: 1 });
    expect(batch.qty.remaining).toBe(20); // proves the pre-fix conservation violation (+5 twice)
  });
  it('B3 idempotency guard: retry re-runs expiry (already applied) → NO 2nd adjustment doc', () => {
    const { adjustmentDocs } = simHandleSave(base, { qtyDelta: 5, newExpiresAt: '2027-01-01', order: 'expiry-first', failSecondAttempts: 1 });
    expect(adjustmentDocs).toBe(1); // only the first real change; retry's expiry is a guarded no-op
  });
  it('B4 happy path (no failure): qty + expiry both applied once', () => {
    const { batch, adjustmentDocs } = simHandleSave(base, { qtyDelta: 5, newExpiresAt: '2027-01-01', order: 'expiry-first', failSecondAttempts: 0 });
    expect(batch.qty.remaining).toBe(15);
    expect(batch.expiresAt).toBe('2027-01-01');
    expect(adjustmentDocs).toBe(1);
  });
  it('B5 unchanged expiry → guard no-op (no adjustment doc)', () => {
    expect(simExpiryEdit({ expiresAt: '2026-09-30' }, '2026-09-30').adjustmentWritten).toBe(false);
    expect(simExpiryEdit({ expiresAt: null }, null).adjustmentWritten).toBe(false);
  });
});

// ════════ C — source-grep regression locks ════════
describe('V159-fix — source-grep regression', () => {
  it('C1 updateStockBatchExpiry has the in-tx idempotency guard', () => {
    expect(EXPIRY_FN).toMatch(/if\s*\(\s*newExpiresAt === oldExpiresAt\s*\)/);
    expect(EXPIRY_FN).toMatch(/noChange:\s*true/);
  });
  it('C2 expiry sync matches BOTH orderProductId AND centralOrderProductId', () => {
    expect(EXPIRY_FN).toMatch(/it\.orderProductId === orderProductId\s*\|\|\s*it\.centralOrderProductId === orderProductId/);
  });
  it('C3 StockAdjustPanel runs expiry edit BEFORE qty adjust (reorder)', () => {
    const iExpiry = FORM_SRC.indexOf('await updateStockBatchExpiry(');
    const iQty = FORM_SRC.indexOf('await createStockAdjustment(');
    expect(iExpiry).toBeGreaterThan(0);
    expect(iQty).toBeGreaterThan(0);
    expect(iExpiry).toBeLessThan(iQty); // expiry first
  });
});
