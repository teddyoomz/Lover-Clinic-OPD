// V150 (2026-06-02) — the negative-stock debt carrier must NEVER be an expired
// or cancelled lot. pickNegativeTargetBatch filtered candidates by productId +
// branchId ONLY (comment: "any status") → with an expired-only product, a deduct
// pushed the EXPIRED lot negative (10→7), writing a movement that DOCUMENTS
// "expired units dispensed" — a MOPH-audit violation. Fix: exclude CANCELLED +
// EXPIRED + hasExpired() from the candidate set → falls through to a synthetic
// AUTO-NEG (Fallback C), leaving the expired lot's count intact for write-off.
// Behavior proven by the real-prod L2 e2e scripts/e2e-stock-fefo-expiry.mjs (E2).
// This file tests the PURE helper directly (real logic, not a mock) + source-grep.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pickNegativeTargetBatch, BATCH_STATUS } from '../src/lib/stockUtils.js';

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-12-31T00:00:00.000Z';
const b = (batchId, status, expiresAt, createdAt) => ({
  batchId, productId: 'P', branchId: 'BR', status, expiresAt, createdAt,
  qty: { total: 10, remaining: 10 },
});

describe('V150 — pickNegativeTargetBatch excludes expired/cancelled carriers', () => {
  it('V150.1 — expired-ONLY lot → returns null (caller makes a synthetic AUTO-NEG; expired lot untouched)', () => {
    const r = pickNegativeTargetBatch({
      allocations: [], productId: 'P', branchId: 'BR',
      branchBatches: [b('EXP', BATCH_STATUS.ACTIVE, PAST, '2024-01-01')],
    });
    expect(r).toBeNull();
  });

  it('V150.2 — cancelled-ONLY lot → returns null (cancelled never revived as debt carrier)', () => {
    const r = pickNegativeTargetBatch({
      allocations: [], productId: 'P', branchId: 'BR',
      branchBatches: [b('CAN', BATCH_STATUS.CANCELLED, FUTURE, '2024-01-01')],
    });
    expect(r).toBeNull();
  });

  it('V150.3 — explicit status=expired lot → excluded', () => {
    const r = pickNegativeTargetBatch({
      allocations: [], productId: 'P', branchId: 'BR',
      branchBatches: [b('EXPST', BATCH_STATUS.EXPIRED, FUTURE, '2024-01-01')],
    });
    expect(r).toBeNull();
  });

  it('V150.4 — active non-expired lot present → it carries the debt (common case unchanged)', () => {
    const r = pickNegativeTargetBatch({
      allocations: [], productId: 'P', branchId: 'BR',
      branchBatches: [
        b('EXP', BATCH_STATUS.ACTIVE, PAST, '2024-01-01'),       // expired — excluded
        b('OK', BATCH_STATUS.ACTIVE, FUTURE, '2025-06-01'),      // valid — chosen
      ],
    });
    expect(r).toBe('OK');
  });

  it('V150.5 — active non-expired, no-expiry (null) lot is eligible; newest-first among valids', () => {
    const r = pickNegativeTargetBatch({
      allocations: [], productId: 'P', branchId: 'BR',
      branchBatches: [
        b('OLD', BATCH_STATUS.ACTIVE, null, '2024-01-01'),
        b('NEW', BATCH_STATUS.ACTIVE, null, '2025-12-01'),
      ],
    });
    expect(r).toBe('NEW'); // newest-first sort preserved
  });

  it('V150.6 — depleted (remaining 0) active non-expired lot is still an eligible carrier', () => {
    const dep = b('DEP', BATCH_STATUS.DEPLETED, FUTURE, '2025-01-01');
    dep.qty = { total: 5, remaining: 0 };
    const r = pickNegativeTargetBatch({ allocations: [], productId: 'P', branchId: 'BR', branchBatches: [dep] });
    expect(r).toBe('DEP');
  });

  it('V150.7 — allocations path unchanged: returns the LAST allocated batchId (always expired-safe)', () => {
    const r = pickNegativeTargetBatch({
      allocations: [{ batchId: 'A1' }, { batchId: 'A2' }],
      productId: 'P', branchId: 'BR', branchBatches: [b('EXP', BATCH_STATUS.ACTIVE, PAST, '2024-01-01')],
    });
    expect(r).toBe('A2');
  });

  it('V150.8 — source: the candidate filter excludes CANCELLED + EXPIRED + hasExpired', () => {
    const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/stockUtils.js'), 'utf8');
    const start = SRC.indexOf('export function pickNegativeTargetBatch');
    const end = SRC.indexOf('\nexport ', start + 30);
    const body = SRC.slice(start, end > start ? end : start + 2600);
    expect(body).toContain('BATCH_STATUS.CANCELLED');
    expect(body).toContain('BATCH_STATUS.EXPIRED');
    expect(body).toContain('hasExpired(b, now)');
  });
});
