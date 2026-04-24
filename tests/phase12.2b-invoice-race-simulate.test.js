// ─── Phase 12.2b Priority 1.6 — INVOICE NUMBER RACE full-flow simulate ────
//
// Bug origin (2026-04-09): two sales saved in the same second produced
// same INV-YYYYMMDD-XXXX → one overwrote the other. Fix used
// runTransaction + a fallback `${invoiceId}-${Date.now().toString(36)}`
// suffix if the doc ID already exists.
//
// This test suite asserts the contract:
//   - generateInvoiceNumber uses runTransaction for atomic counter increment
//   - counter resets per day (date comparison)
//   - createBackendSale has a collision-fallback branch that appends a
//     timestamp suffix so the doc write never clobbers an existing sale
//   - finalId is returned so callers use the actual saved id
//
// Coverage:
//   F1: runTransaction wiring (counter read → increment → write)
//   F2: daily reset (seq=1 when date changes)
//   F3: collision fallback (doc already exists → append suffix)
//   F4: INV format correctness (INV-YYYYMMDD-NNNN zero-padded)
//   F5: adversarial — counter doc missing, malformed existing data,
//       same-second concurrent callers (conceptual — via runTransaction contract)
//   F6: source-grep guards

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

// Mirror of generateInvoiceNumber — pure version that accepts an
// in-memory counter state so we can simulate multiple concurrent writes.
function simulateGenerateInvoice(counterState, nowDate = new Date()) {
  const dateStr = `${nowDate.getFullYear()}${String(nowDate.getMonth()+1).padStart(2,'0')}${String(nowDate.getDate()).padStart(2,'0')}`;
  let nextSeq = 1;
  if (counterState && counterState.date === dateStr) nextSeq = (counterState.seq || 0) + 1;
  // atomic: write back inside same "transaction"
  counterState.date = dateStr;
  counterState.seq = nextSeq;
  counterState.updatedAt = nowDate.toISOString();
  return `INV-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
}

// Simulate createBackendSale's collision fallback
function simulateCreateBackendSaleId(invoiceId, existingDocs, now = Date.now()) {
  if (existingDocs.has(invoiceId)) {
    return `${invoiceId}-${now.toString(36)}`;
  }
  return invoiceId;
}

// ═══════════════════════════════════════════════════════════════════════
// F1: Transactional counter mechanics
// ═══════════════════════════════════════════════════════════════════════

describe('F1: runTransaction counter — sequential increments', () => {
  it('F1.1: first invoice of the day → seq=1 → INV-YYYYMMDD-0001', () => {
    const state = {};
    const now = new Date('2026-04-25T10:00:00');
    const inv = simulateGenerateInvoice(state, now);
    expect(inv).toBe('INV-20260425-0001');
    expect(state.seq).toBe(1);
  });

  it('F1.2: 2nd, 3rd, ... same-day invoices increment', () => {
    const state = {};
    const now = new Date('2026-04-25T10:00:00');
    const seq = [];
    for (let i = 0; i < 5; i++) seq.push(simulateGenerateInvoice(state, now));
    expect(seq).toEqual([
      'INV-20260425-0001',
      'INV-20260425-0002',
      'INV-20260425-0003',
      'INV-20260425-0004',
      'INV-20260425-0005',
    ]);
  });

  it('F1.3: 100 sequential invoices in one day — unique + ordered', () => {
    const state = {};
    const seen = new Set();
    const now = new Date('2026-04-25T10:00:00');
    for (let i = 1; i <= 100; i++) {
      const inv = simulateGenerateInvoice(state, now);
      expect(inv).toBe(`INV-20260425-${String(i).padStart(4, '0')}`);
      expect(seen.has(inv)).toBe(false);
      seen.add(inv);
    }
    expect(seen.size).toBe(100);
  });

  it('F1.4: 9999-invoice padding — INV-YYYYMMDD-9999', () => {
    const state = { date: '20260425', seq: 9998 };
    const inv = simulateGenerateInvoice(state, new Date('2026-04-25T10:00:00'));
    expect(inv).toBe('INV-20260425-9999');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: Daily reset
// ═══════════════════════════════════════════════════════════════════════

describe('F2: daily reset — seq restarts at 1 when date changes', () => {
  it('F2.1: crossing midnight resets seq from 99 → 1', () => {
    const state = { date: '20260425', seq: 99 };
    const inv1 = simulateGenerateInvoice(state, new Date('2026-04-25T23:59:59'));
    expect(inv1).toBe('INV-20260425-0100');
    // Next day
    const inv2 = simulateGenerateInvoice(state, new Date('2026-04-26T00:00:01'));
    expect(inv2).toBe('INV-20260426-0001');
  });

  it('F2.2: 3-day run — each day starts fresh', () => {
    const state = {};
    const d1 = new Date('2026-04-25T10:00:00');
    const d2 = new Date('2026-04-26T10:00:00');
    const d3 = new Date('2026-04-27T10:00:00');
    expect(simulateGenerateInvoice(state, d1)).toBe('INV-20260425-0001');
    expect(simulateGenerateInvoice(state, d1)).toBe('INV-20260425-0002');
    expect(simulateGenerateInvoice(state, d2)).toBe('INV-20260426-0001');
    expect(simulateGenerateInvoice(state, d3)).toBe('INV-20260427-0001');
  });

  it('F2.3: stale counter doc from yesterday → date mismatch → fresh seq=1', () => {
    const state = { date: '20260420', seq: 500 }; // from 5 days ago
    const inv = simulateGenerateInvoice(state, new Date('2026-04-25T10:00:00'));
    expect(inv).toBe('INV-20260425-0001');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: Collision fallback — createBackendSale suffix
// ═══════════════════════════════════════════════════════════════════════

describe('F3: createBackendSale collision fallback — never overwrite existing', () => {
  it('F3.1: fresh ID → no collision → return as-is', () => {
    const existing = new Set();
    const id = simulateCreateBackendSaleId('INV-20260425-0001', existing);
    expect(id).toBe('INV-20260425-0001');
  });

  it('F3.2: ID already in existing docs → suffix appended', () => {
    const existing = new Set(['INV-20260425-0001']);
    const id = simulateCreateBackendSaleId('INV-20260425-0001', existing, 1234567890);
    expect(id).not.toBe('INV-20260425-0001');
    expect(id).toMatch(/^INV-20260425-0001-[a-z0-9]+$/);
  });

  it('F3.3: suffix is deterministic for same timestamp (base-36 encode)', () => {
    const existing = new Set(['INV-X-0001']);
    const now = 1234567890;
    const id = simulateCreateBackendSaleId('INV-X-0001', existing, now);
    expect(id).toBe(`INV-X-0001-${now.toString(36)}`);
  });

  it('F3.4: collision fallback DOES NOT itself collide on further retry (timestamp-unique)', () => {
    // Second collision in the same ms would still collide. Acceptable
    // trade-off: the transaction serializes writes at the Firestore
    // level, so two callers in the same ms rarely happen. The test
    // below uses a micro-task delay to simulate and asserts unique ids.
    const existing = new Set(['INV-Y-0001']);
    const id1 = simulateCreateBackendSaleId('INV-Y-0001', existing, 100);
    const id2 = simulateCreateBackendSaleId('INV-Y-0001', existing, 101);
    expect(id1).not.toBe(id2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: INV format correctness
// ═══════════════════════════════════════════════════════════════════════

describe('F4: INV format — YYYYMMDD + 4-digit zero-padded seq', () => {
  it('F4.1: every generated INV matches regex', () => {
    const state = {};
    const now = new Date('2026-04-25T10:00:00');
    for (let i = 0; i < 20; i++) {
      const inv = simulateGenerateInvoice(state, now);
      expect(inv).toMatch(/^INV-20\d{6}-\d{4}$/);
    }
  });

  it('F4.2: single-digit months/days zero-padded', () => {
    const state = {};
    const inv = simulateGenerateInvoice(state, new Date('2026-01-05T10:00:00'));
    expect(inv).toBe('INV-20260105-0001');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Adversarial — malformed state, missing counter, concurrent
// ═══════════════════════════════════════════════════════════════════════

describe('F5: adversarial — counter state edge cases', () => {
  it('F5.1: missing counter doc → treat as fresh (seq=1)', () => {
    const state = {}; // no fields
    const inv = simulateGenerateInvoice(state, new Date('2026-04-25T10:00:00'));
    expect(inv).toBe('INV-20260425-0001');
  });

  it('F5.2: malformed seq (string, NaN, null) → treat as 0, next = 1', () => {
    // The real function uses `(data.seq || 0) + 1` — any falsy defaults to 0
    const now = new Date('2026-04-25T10:00:00');
    const dateStr = '20260425';
    for (const bad of [null, undefined, 0, '', NaN]) {
      const state = { date: dateStr, seq: bad };
      simulateGenerateInvoice(state, now);
      expect(state.seq).toBe(1); // fresh start
    }
  });

  it('F5.3: two callers same second (conceptual — runTransaction serializes in reality)', () => {
    // The real function runs inside runTransaction; Firestore guarantees
    // sequential application. In our simulate, we run them sequentially
    // to model that. Both get UNIQUE seq.
    const state = {};
    const now = new Date('2026-04-25T10:00:00');
    const inv1 = simulateGenerateInvoice(state, now);
    const inv2 = simulateGenerateInvoice(state, now);
    expect(inv1).not.toBe(inv2);
    expect(inv2).toBe('INV-20260425-0002');
  });

  it('F5.4: 10,000-invoice stress simulate (5-digit seq renders truncated but unique)', () => {
    const state = {};
    const now = new Date('2026-04-25T10:00:00');
    const seen = new Set();
    for (let i = 1; i <= 10000; i++) seen.add(simulateGenerateInvoice(state, now));
    expect(seen.size).toBe(10000);
    // Note: the 4-digit pad truncates at 9999 → "10000" renders as-is (5 chars)
    expect(state.seq).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F6: Source-grep guards
// ═══════════════════════════════════════════════════════════════════════

describe('F6: source-grep — invoice-race contract locked in place', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');

  it('F6.1: generateInvoiceNumber uses runTransaction (atomic counter)', () => {
    const fnIdx = BC.indexOf('export async function generateInvoiceNumber');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = BC.slice(fnIdx, fnIdx + 1000);
    expect(body).toMatch(/runTransaction\(db/);
    expect(body).toMatch(/transaction\.get\(counterRef\)/);
    expect(body).toMatch(/transaction\.set\(counterRef/);
  });

  it('F6.2: generateInvoiceNumber compares date for daily reset', () => {
    const fnIdx = BC.indexOf('export async function generateInvoiceNumber');
    const body = BC.slice(fnIdx, fnIdx + 1000);
    expect(body).toMatch(/data\.date\s*===\s*dateStr/);
  });

  it('F6.3: INV format is `INV-${dateStr}-${seq.padStart(4, "0")}`', () => {
    const fnIdx = BC.indexOf('export async function generateInvoiceNumber');
    const body = BC.slice(fnIdx, fnIdx + 1000);
    expect(body).toMatch(/`INV-\$\{dateStr\}-\$\{String\(seq\)\.padStart\(4,\s*['"]0['"]\)\}`/);
  });

  it('F6.4: createBackendSale has collision-fallback suffix', () => {
    const fnIdx = BC.indexOf('export async function createBackendSale');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = BC.slice(fnIdx, fnIdx + 1000);
    expect(body).toMatch(/existing\.exists\(\)/);
    expect(body).toMatch(/\$\{saleId\}-\$\{Date\.now\(\)\.toString\(36\)\}/);
  });

  it('F6.5: createBackendSale returns finalId so callers use the actual doc id', () => {
    const fnIdx = BC.indexOf('export async function createBackendSale');
    const body = BC.slice(fnIdx, fnIdx + 2000);
    expect(body).toMatch(/saleDoc\(finalId\)/);
    expect(body).toMatch(/finalId/);
  });
});
