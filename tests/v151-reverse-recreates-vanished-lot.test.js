// V151 (2026-06-02) — a stock reverse (sale/treatment cancel) must RESTORE the
// stock even when the original lot has VANISHED. SOURCE-GREP lock; BEHAVIOR
// proven by the real-prod L2 e2e scripts/e2e-stock-reverse-after-lotclear.mjs
// (cancel after V144 deleted the drained 0-lot → threw "vanished before reverse"
// + stock stayed at 5 BEFORE; → no throw + restored to 10 AFTER).
//
// Bug: _reverseOneMovement did `tx.get(batchRef); if (!bSnap.exists()) throw
// "Batch X vanished before reverse"`. V144's real-time 0-lot clear DELETES a
// redundant 0-lot post-commit — so a sale that drains lot A to 0 (lot B live)
// → V144 deletes A → cancelling the sale → reverseStockForSale's loop (no
// try/catch) hit the throw → the WHOLE cancel FAILED + the customer's stock was
// never returned (conservation broken, Σdelta=-5). A cancel MUST always restore.
// Fix: on a vanished lot, RE-CREATE it from the movement metadata carrying the
// returned qty (conservation holds + reverse movement.batchId still matches).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

function reverseFnBody() {
  const start = SRC.indexOf('async function _reverseOneMovement');
  expect(start).toBeGreaterThan(-1);
  const next = SRC.indexOf('\nasync function ', start + 30);
  const next2 = SRC.indexOf('\nexport ', start + 30);
  const end = Math.min(...[next, next2].filter(n => n > start));
  return SRC.slice(start, Number.isFinite(end) ? end : start + 6000);
}

describe('V151 — reverse re-creates a vanished lot (never throws + loses stock)', () => {
  const body = reverseFnBody();

  it('V151.1 — anti-regression: the bare "vanished before reverse" throw is GONE', () => {
    expect(body).not.toMatch(/throw new Error\(`Batch \$\{m\.batchId\} vanished before reverse`\)/);
  });

  it('V151.2 — on a vanished lot it RE-CREATES the batch via tx.set (not throw)', () => {
    // The !exists branch must tx.set the batch with the returned qty + marker.
    expect(body).toMatch(/if \(!bSnap\.exists\(\)\) \{/);
    expect(body).toContain('_recreatedByReverse: true');
    expect(body).toMatch(/tx\.set\(batchRef, \{/);
    expect(body).toMatch(/qty: \{ total: qtyReturn, remaining: qtyReturn \}/);
  });

  it('V151.3 — re-created lot is built from the MOVEMENT metadata (productId/branchId/name)', () => {
    expect(body).toMatch(/productId: m\.productId/);
    expect(body).toMatch(/branchId: m\.branchId/);
    expect(body).toMatch(/productName: m\.productName/);
    // cost derived from the movement's costBasis (best-effort)
    expect(body).toMatch(/m\.costBasis/);
    // resolveBatchStatusForRemaining must be destructured for the re-created status
    expect(body).toMatch(/resolveBatchStatusForRemaining/);
  });

  it('V151.4 — the existing-lot path is preserved (reverseQtyNumeric + tx.update)', () => {
    expect(body).toMatch(/const newQty = reverseQtyNumeric\(b\.qty, qtyReturn\)/);
    expect(body).toMatch(/tx\.update\(batchRef, \{ qty: newQty/);
  });

  it('V151.5 — the reverse movement + reversedByMovementId flag still written (audit chain)', () => {
    expect(body).toMatch(/tx\.set\(stockMovementDoc\(reverseMovementId\)/);
    expect(body).toMatch(/tx\.update\(movRef, \{ reversedByMovementId: reverseMovementId \}\)/);
    expect(body).toMatch(/reverseOf: m\.movementId/);
  });

  it('V151.6 — S5 concurrent-reverse guard (in-tx reversedByMovementId re-check) intact', () => {
    expect(body).toMatch(/const mSnap2 = await tx\.get\(movRef\)/);
    expect(body).toMatch(/if \(mSnap2\.data\(\)\?\.reversedByMovementId\)/);
  });
});
