// V36 — Batch-creator multi-writer-sweep regression bank.
//
// Locks the V36 fix (2026-04-29): every writer in src/lib/backendClient.js
// that creates a `be_stock_batches` doc MUST be preceded (within the same
// function) by an `_ensureProductTracked(productId, ...)` call. Pre-V36,
// transfer-receive + withdrawal-receive skipped this and the destination
// tier's product never had stockConfig.trackStock=true set → subsequent
// treatment deduct silent-SKIPped with note "product not yet configured
// for stock tracking" while qty.remaining never moved.
//
// V12 lesson exact repeat: when introducing an opt-in flag (here
// stockConfig.trackStock=true), audit ALL writers. The shared single-writer
// helper `_ensureProductTracked` is the ONLY place that flips the flag —
// every batch-creating call site MUST route through it.
//
// Test classes:
//   V36.A — Source-grep regression: every setDoc(stockBatchDoc(...)) line is
//           preceded (within 60 lines, same function) by _ensureProductTracked
//   V36.B — Call signature: every _ensureProductTracked invocation carries
//           setBy + unit per the shared opt-in contract
//   V36.C — Function bodies actually contain the call (substring match
//           inside the function source range, not just file-wide)
//   V36.D — V36 marker comments present at the new call sites for grep-trace

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_CLIENT = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8'
);
const LINES = BACKEND_CLIENT.split('\n');

function findLineNumbers(needle) {
  const out = [];
  LINES.forEach((line, idx) => {
    if (line.includes(needle)) out.push(idx + 1);
  });
  return out;
}

function sliceContext(lineNum, before, after) {
  const start = Math.max(0, lineNum - 1 - before);
  const end = Math.min(LINES.length, lineNum + after);
  return LINES.slice(start, end).join('\n');
}

describe('V36.A — every setDoc(stockBatchDoc(...)) site is preceded by _ensureProductTracked', () => {
  test('A.1 — at least 4 batch-creating sites exist (vendor receive + AUTO-NEG + transfer + withdrawal)', () => {
    const sites = findLineNumbers('setDoc(stockBatchDoc(');
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });

  test('A.2 — vendor-order receive (_buildBatchFromOrderItem) calls _ensureProductTracked', () => {
    const sites = findLineNumbers('setDoc(stockBatchDoc(');
    const inBuilder = sites.filter(n => {
      const ctx = sliceContext(n, 60, 5);
      return ctx.includes('_buildBatchFromOrderItem');
    });
    expect(inBuilder.length).toBeGreaterThanOrEqual(1);
    for (const lineNum of inBuilder) {
      const ctx = sliceContext(lineNum, 60, 5);
      expect(ctx).toMatch(/_ensureProductTracked\s*\(/);
    }
  });

  test('A.3 — transfer _receiveAtDestination calls _ensureProductTracked', () => {
    const sites = findLineNumbers('setDoc(stockBatchDoc(');
    const inTransfer = sites.filter(n => {
      const ctx = sliceContext(n, 60, 5);
      return ctx.includes('createStockTransfer:receive') ||
             ctx.includes('updateStockTransferStatus._receiveAtDestination');
    });
    expect(inTransfer.length).toBeGreaterThanOrEqual(1);
    for (const lineNum of inTransfer) {
      const ctx = sliceContext(lineNum, 60, 5);
      expect(ctx).toMatch(/_ensureProductTracked\s*\(/);
    }
  });

  test('A.4 — withdrawal _receiveAtDestination calls _ensureProductTracked', () => {
    const sites = findLineNumbers('setDoc(stockBatchDoc(');
    const inWithdrawal = sites.filter(n => {
      const ctx = sliceContext(n, 60, 5);
      return ctx.includes('createStockWithdrawal:receive') ||
             ctx.includes('updateStockWithdrawalStatus._receiveAtDestination');
    });
    expect(inWithdrawal.length).toBeGreaterThanOrEqual(1);
    for (const lineNum of inWithdrawal) {
      const ctx = sliceContext(lineNum, 60, 5);
      expect(ctx).toMatch(/_ensureProductTracked\s*\(/);
    }
  });

  test('A.5 — AUTO-NEG synthesis lives inside the tracked=true path (gated by V35.3-ter auto-init upstream)', () => {
    // AUTO-NEG site doesn't need _ensureProductTracked DIRECTLY because the
    // outer condition (line ~5840) gates on `(context==='treatment'||sale')`
    // which already triggered _ensureProductTracked at line ~5745. Locked
    // here so refactor doesn't accidentally allow AUTO-NEG synthesis from
    // an untracked path.
    const idx = BACKEND_CLIENT.indexOf('autoNegative: true');
    expect(idx).toBeGreaterThan(0);
    // Find the enclosing function — _deductOneItem — then assert the
    // function body contains _ensureProductTracked SOMEWHERE before the
    // AUTO-NEG synthesis. Function body is large (1400+ lines) so window
    // size is generous.
    const fnStart = BACKEND_CLIENT.lastIndexOf('async function _deductOneItem', idx);
    expect(fnStart).toBeGreaterThan(0);
    const before = BACKEND_CLIENT.substring(fnStart, idx);
    expect(before).toMatch(/_ensureProductTracked\s*\(/);
    // And confirm the gate condition appears before AUTO-NEG synthesis
    expect(before).toMatch(/context === ['"]treatment['"] \|\| context === ['"]sale['"]/);
  });
});

describe('V36.B — call signatures match shared opt-in contract', () => {
  // Use line-based extraction (regex with balanced parens trips on template
  // literals like `_deductOneItem(${context})` that contain `)` inside).
  function extractCallBodies() {
    const sites = findLineNumbers('_ensureProductTracked(').filter(n => {
      const line = LINES[n - 1] || '';
      return !line.includes('async function _ensureProductTracked');
    });
    return sites.map(n => {
      // Read 5 lines starting at the call line — covers the {} opts block.
      return sliceContext(n, 0, 5);
    });
  }

  test('B.1 — every _ensureProductTracked call passes setBy', () => {
    const bodies = extractCallBodies();
    expect(bodies.length).toBeGreaterThanOrEqual(4); // builder + transfer + withdrawal + treatment auto-init
    for (const body of bodies) {
      expect(body).toMatch(/setBy:/);
    }
  });

  test('B.2 — every _ensureProductTracked call passes unit', () => {
    const bodies = extractCallBodies();
    for (const body of bodies) {
      expect(body).toMatch(/unit:\s*item\.unit/);
    }
  });

  test('B.3 — _ensureProductTracked is awaited (not fire-and-forget)', () => {
    const sites = findLineNumbers('_ensureProductTracked(');
    const callSites = sites.filter(n => {
      const line = LINES[n - 1] || '';
      return !line.includes('async function _ensureProductTracked');
    });
    for (const lineNum of callSites) {
      const ctx = sliceContext(lineNum, 1, 0);
      expect(ctx).toMatch(/await\s+_ensureProductTracked\s*\(/);
    }
  });
});

describe('V36.C — function-scoped presence of _ensureProductTracked', () => {
  test('C.1 — _buildBatchFromOrderItem function body contains _ensureProductTracked', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _buildBatchFromOrderItem');
    expect(fnStart).toBeGreaterThan(0);
    const next = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, next > 0 ? next : fnStart + 8000);
    expect(body).toMatch(/_ensureProductTracked/);
    expect(body).toMatch(/setBy:\s*['"]_buildBatchFromOrderItem/);
  });

  test('C.2 — updateStockTransferStatus _receiveAtDestination calls _ensureProductTracked', () => {
    const transferStart = BACKEND_CLIENT.indexOf('export async function updateStockTransferStatus');
    expect(transferStart).toBeGreaterThan(0);
    const next = BACKEND_CLIENT.indexOf('\nexport async function ', transferStart + 30);
    const body = BACKEND_CLIENT.substring(transferStart, next > 0 ? next : transferStart + 12000);
    expect(body).toMatch(/_receiveAtDestination/);
    expect(body).toMatch(/setBy:\s*['"]updateStockTransferStatus\._receiveAtDestination/);
  });

  test('C.3 — updateStockWithdrawalStatus _receiveAtDestination calls _ensureProductTracked', () => {
    const wdStart = BACKEND_CLIENT.indexOf('export async function updateStockWithdrawalStatus');
    expect(wdStart).toBeGreaterThan(0);
    const next = BACKEND_CLIENT.indexOf('\nexport async function ', wdStart + 30);
    const body = BACKEND_CLIENT.substring(wdStart, next > 0 ? next : wdStart + 12000);
    expect(body).toMatch(/_receiveAtDestination/);
    expect(body).toMatch(/setBy:\s*['"]updateStockWithdrawalStatus\._receiveAtDestination/);
  });
});

describe('V36.D — V36 marker comments present', () => {
  test('D.1 — V36 marker exists at transfer-receive site', () => {
    // Comment block ~600 chars, then setBy key with the route name.
    expect(BACKEND_CLIENT).toMatch(/V36 \(2026-04-29\)[\s\S]{0,200}multi-writer-sweep[\s\S]{0,1500}updateStockTransferStatus\._receiveAtDestination/);
  });

  test('D.2 — V36 marker exists at withdrawal-receive site', () => {
    expect(BACKEND_CLIENT).toMatch(/V36 \(2026-04-29\)[\s\S]{0,1500}updateStockWithdrawalStatus\._receiveAtDestination/);
  });

  test('D.3 — _ensureProductTracked uses setDoc({merge:true}) per V36', () => {
    const fnStart = BACKEND_CLIENT.indexOf('async function _ensureProductTracked');
    expect(fnStart).toBeGreaterThan(0);
    const next = BACKEND_CLIENT.indexOf('\nasync function ', fnStart + 30);
    const body = BACKEND_CLIENT.substring(fnStart, next > 0 ? next : fnStart + 4000);
    // V36 switches updateDoc → setDoc(beRef, {...}, { merge: true })
    expect(body).toMatch(/setDoc\([^,]+,\s*\{[\s\S]+?\},\s*\{\s*merge:\s*true\s*\}\)/);
    // No more updateDoc on the be_products / master_data branches
    const updateDocCount = (body.match(/await\s+updateDoc\s*\(/g) || []).length;
    expect(updateDocCount).toBe(0);
  });

  test('D.4 — V36 marker on _ensureProductTracked refactor', () => {
    expect(BACKEND_CLIENT).toMatch(/V36 \(2026-04-29\)[\s\S]{0,400}setDoc\(\{merge:true\}\)/);
  });
});
