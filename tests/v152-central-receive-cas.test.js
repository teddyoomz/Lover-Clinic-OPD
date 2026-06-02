// V152 (2026-06-02) — central-PO receive must be CONCURRENCY-SAFE (CAS claim).
// SOURCE-GREP lock; BEHAVIOR proven by the real-prod L2 e2e
// scripts/e2e-stock-order-cancel-central-receive.mjs (C2: receive-twice
// concurrently → 2 batches / 16 units for an 8-unit PO BEFORE; 1 batch / 8 AFTER).
//
// Bug (documented AUDIT-V34 "deferred" gap): receiveCentralStockOrder read
// order.receivedLineIds via getCentralStockOrder (getDoc, OUTSIDE a tx), created
// batches, then updated receivedLineIds only at the END → two concurrent
// receives both saw receivedLineIds=[], both created batches → DOUBLE stock.
// Fix: a runTransaction CAS atomically CLAIMS the to-receive lineIds into
// receivedLineIds BEFORE any batch is created (loser claims nothing →
// early-return, no batch); finalize is also a CAS (re-read + MERGE, not
// overwrite). Same in-tx-CAS pattern transfer/withdrawal already used (R8/R13/R14).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

function fnBody() {
  const start = SRC.indexOf('export async function receiveCentralStockOrder');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\nexport async function ', start + 30);
  return SRC.slice(start, end > start ? end : start + 8000);
}

describe('V152 — central-receive CAS claim (source-grep lock)', () => {
  const body = fnBody();

  it('V152.1 — a CAS CLAIM (runTransaction + tx.get(centralStockOrderDoc)) precedes batch creation', () => {
    const casIdx = body.indexOf('const claimedSet = await runTransaction(db, async (tx) =>');
    expect(casIdx).toBeGreaterThan(-1);
    const buildIdx = body.indexOf('_buildBatchFromOrderItem');
    expect(buildIdx).toBeGreaterThan(casIdx); // claim happens BEFORE batch build
    const cas = body.slice(casIdx, casIdx + 1400);
    expect(cas).toMatch(/await tx\.get\(oRef\)/);
    expect(cas).toMatch(/tx\.update\(oRef, \{ receivedLineIds:/); // claim writes receivedLineIds in-tx
  });

  it('V152.2 — the loser (claimedSet empty) early-returns WITHOUT creating batches', () => {
    expect(body).toMatch(/if \(claimedSet\.size === 0\)/);
    // the batch loop only processes lines THIS call claimed
    expect(body).toMatch(/if \(!claimedSet\.has\(lineId\)\)/);
  });

  it('V152.3 — finalize is a CAS that MERGES receivedLineIds (re-read + union), not an overwrite', () => {
    // The final write must be inside a runTransaction reading the fresh order.
    expect(body).toMatch(/const newStatus = await runTransaction\(db, async \(tx\) =>/);
    expect(body).toMatch(/new Set\(\[\.\.\.\(o\.receivedLineIds \|\| \[\]\), \.\.\.newlyReceivedLineIds\]\)/);
    // anti-regression: NO non-tx updateDoc that overwrites receivedLineIds.
    expect(body).not.toMatch(/await updateDoc\(centralStockOrderDoc\(orderId\), \{\s*items: updatedItems,\s*receivedLineIds:/);
  });

  it('V152.4 — anti-regression: the AUDIT-V34 "deferred" concurrent-receive gap comment is GONE', () => {
    expect(body).not.toContain('KNOWN CONCURRENT-RECEIVE GAP (deferred to V35)');
    expect(body).not.toMatch(/const existingReceived = new Set\(order\.receivedLineIds/);
  });

  it('V152.5 — still idempotent on already-received (status guard + per-line receivedBatchId)', () => {
    expect(body).toMatch(/if \(o\.status === 'received'\) return new Set\(\)/);
    expect(body).toMatch(/if \(ln\.receivedBatchId\) continue/);
  });
});
