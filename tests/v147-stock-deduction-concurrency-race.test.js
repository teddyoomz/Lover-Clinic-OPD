// V147 (2026-06-02) — concurrency-race retry in _deductOneItem.
// SOURCE-GREP regression lock (shape). BEHAVIOR is proven by the real-prod L2
// e2e scripts/e2e-stock-concurrency-race.mjs (6/6 raced→fail BEFORE, 6/0 pass
// AFTER) — per Rule Q V66, mock tests are shape-coverage only; the e2e is the
// behavior proof.
//
// Bug: _deductOneItem reads candidate batches OUTSIDE the per-batch tx
// (listStockBatches getDocs), plans FIFO allocation from that stale snapshot,
// then the in-tx guard `if (beforeRemaining < takeQty) throw` fires when a
// CONCURRENT deduction drained the batch first. That raw throw propagated →
// the whole treatment/sale save FAILED, violating Phase 15.7's "ตัดได้เสมอ
// (ติดลบได้)" purpose (the plan-time negative-stock fallback does NOT cover a
// race-time shortfall because plan.shortfall===0 on the stale snapshot).
// Fix: tag the transient throws STOCK_RACE_RETRY + a bounded re-fetch/re-plan
// loop so the negative-stock push absorbs the race-time shortfall.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

// Isolate the _deductOneItem function body for region-scoped assertions.
function deductOneItemBody() {
  const start = SRC.indexOf('async function _deductOneItem');
  expect(start).toBeGreaterThan(-1);
  // next top-level `async function ` after _deductOneItem
  const after = SRC.indexOf('\nasync function ', start + 30);
  return SRC.slice(start, after > -1 ? after : SRC.length);
}

describe('V147 — _deductOneItem concurrency-race retry (source-grep lock)', () => {
  const body = deductOneItemBody();

  it('V147.1 — bounded retry loop wraps the allocation', () => {
    expect(body).toMatch(/const _DEDUCT_MAX_ATTEMPTS = \d+;/);
    expect(body).toMatch(/for \(let _deductAttempt = 1; ; _deductAttempt\+\+\) \{/);
    expect(body).toContain('// end V147 concurrency-race retry loop');
  });

  it('V147.2 — every transient in-tx throw is tagged STOCK_RACE_RETRY (≥5 sites)', () => {
    const tags = body.match(/code = 'STOCK_RACE_RETRY'/g) || [];
    // 3 positive-tx guards (vanished / became / raced) + 2 negative-push guards
    expect(tags.length).toBeGreaterThanOrEqual(5);
  });

  it('V147.3 — the raced guard is the TAGGED form, not a bare throw (anti-regression)', () => {
    // The race shortfall message must exist AND be created as a tagged Error.
    expect(body).toMatch(/`Batch \$\{a\.batchId\} raced: available \$\{beforeRemaining\}, need \$\{a\.takeQty\}`/);
    expect(body).toMatch(/e\.code = 'STOCK_RACE_RETRY';\s*\n\s*throw e;/);
    // The OLD bare form (throw new Error(`Batch ... raced ...`) without a tag)
    // must NOT appear — the raced throw must go through the tagged `e`.
    expect(body).not.toMatch(/throw new Error\(\s*`Batch \$\{a\.batchId\} raced/);
  });

  it('V147.4 — the catch retries ONLY on STOCK_RACE_RETRY within the attempt budget', () => {
    expect(body).toMatch(/if \(err\?\.code === 'STOCK_RACE_RETRY' && _deductAttempt < _DEDUCT_MAX_ATTEMPTS\) \{/);
    expect(body).toMatch(/continue;/);
    // Non-race errors still propagate (the catch ends with `throw err;`).
    expect(body).toMatch(/throw err;/);
  });

  it('V147.5 — compensation (reverse partial movements) still runs before retry/throw', () => {
    expect(body).toMatch(/for \(const m of committedMovements\)/);
    expect(body).toContain('_reverseOneMovement(m.movementId)');
  });
});

describe('V147 — class boundary: single-doc tx ops are NOT race-tagged (auto-retry-safe)', () => {
  it('V147.6 — createStockAdjustment reads its batch INSIDE the tx (no STOCK_RACE_RETRY needed)', () => {
    const start = SRC.indexOf('export async function createStockAdjustment');
    const seg = SRC.slice(start, start + 4000);
    // tx.get precedes the decision → Firestore contention-auto-retry covers it.
    expect(seg).toMatch(/runTransaction\(db, async \(tx\) => \{[\s\S]*?await tx\.get\(batchRef\)/);
    expect(seg).not.toContain('STOCK_RACE_RETRY');
  });

  it('V147.7 — _exportFromSource (transfer/withdrawal) reads source batch INSIDE the tx', () => {
    // Both copies use `await tx.get(bRef)` then guard with the FRESH value →
    // deterministic anti-negative "short" throw, NOT a stale-plan race.
    const exportTxCount = (SRC.match(/const bSnap = await tx\.get\(bRef\);/g) || []).length;
    expect(exportTxCount).toBeGreaterThanOrEqual(2);
    // The transfer/withdrawal "short" throws must remain UNtagged (correct
    // anti-negative behavior — transfer-out must block, never go negative).
    expect(SRC).toMatch(/short: have \$\{before\}, need \$\{item\.qty\}/);
  });
});
