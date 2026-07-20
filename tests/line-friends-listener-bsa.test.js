// ─── LINE Friend Picker (2026-07-20) — listener BSA locks (Task 5) ───────────
// L1 Layer-1 safe-by-default (BS-13) · L2 equality-only query (NO orderBy —
// no composite-index dependency; sort is client-side in mergeFriendRoster) ·
// L3 Layer-2 auto-inject wrapper · L4 V38 spread-order.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const BACKEND = readFileSync('src/lib/backendClient.js', 'utf8');
const SCOPED = readFileSync('src/lib/scopedDataLayer.js', 'utf8');

function listenerBlock() {
  const start = BACKEND.indexOf('export function listenToLineFriendsByBranch');
  expect(start, 'listenToLineFriendsByBranch export exists').toBeGreaterThan(-1);
  return BACKEND.slice(start, start + 1600);
}

describe('L1 — Layer 1 safe-by-default (BS-13)', () => {
  it('L1.1 empty branchId + !allBranches → onChange([]) + noop unsub (never whole-collection)', () => {
    const block = listenerBlock();
    expect(block).toMatch(/if \(!effectiveBranchId && !allBranches\)/);
    expect(block).toMatch(/onChange\(\[\]\)/);
    expect(block).toMatch(/return \(\) => \{\};/);
  });
  it('L1.2 explicit branchId → where equality filter', () => {
    const block = listenerBlock();
    expect(block).toMatch(/where\('branchId', '==', String\(effectiveBranchId\)\)/);
  });
});

describe('L2 — equality-only query (composite-index-free)', () => {
  it('L2.1 NO orderBy in the query (sort happens client-side in mergeFriendRoster)', () => {
    expect(listenerBlock()).not.toMatch(/orderBy\(/);
  });
});

describe('L3 — Layer 2 wrapper (scopedDataLayer auto-inject)', () => {
  it('L3.1 wrapper exists + auto-injects resolveSelectedBranchId when {} passed', () => {
    const start = SCOPED.indexOf('export const listenToLineFriendsByBranch');
    expect(start, 'scopedDataLayer wrapper exists').toBeGreaterThan(-1);
    const block = SCOPED.slice(start, start + 700);
    expect(block).toMatch(/resolveSelectedBranchId\(\)/);
    expect(block).toMatch(/raw\.listenToLineFriendsByBranch\(resolved, onChange, onError\)/);
  });
  it('L3.2 explicit branchId OR allBranches bypasses auto-inject (mirror BS-16 chat wrapper)', () => {
    const start = SCOPED.indexOf('export const listenToLineFriendsByBranch');
    const block = SCOPED.slice(start, start + 700);
    expect(block).toMatch(/hasExplicitBranchId \|\| isAllBranches/);
  });
});

describe('L4 — V38 spread-order', () => {
  it('L4.1 doc.id wins over any stray data.id field', () => {
    expect(listenerBlock()).toMatch(/\{ \.\.\.d\.data\(\), id: d\.id \}/);
  });
});
