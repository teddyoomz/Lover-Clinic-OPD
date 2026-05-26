// Finance sub-tab CROSS-WIRING (2026-05-20). Verifies that a deposit created
// from ANY surface (DepositPanel create + Frontend booking-pair) routes to the
// "ใช้งานอยู่" pill, and that the real status transitions (apply/cancel/refund/
// expire) migrate it to "สิ้นสุดแล้ว" correctly. Source-grep grounds the claim
// against the REAL creation/transition code; pure flow chains the helper.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterDepositsBySubTab } from '../src/lib/depositSubTabFilter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = readFileSync(join(__dirname, '../src/lib/backendClient.js'), 'utf8');
const BATCH = readFileSync(join(__dirname, '../src/lib/appointmentDepositBatch.js'), 'utf8');

const sliceFrom = (src, anchor, len = 1600) => {
  const i = src.indexOf(anchor);
  return i < 0 ? '' : src.slice(i, i + len);
};

// =============================================================================
describe('W1 — createDeposit routing contract (DepositPanel surface)', () => {
  it('W1.1 createDeposit sets status active', () => {
    // V-deposit-noappt (2026-05-27) — widened slice: createDeposit's payload
    // gained purpose/customerNameTemp/customerPhoneTemp, pushing `status` down.
    const body = sliceFrom(BACKEND, 'export async function createDeposit', 2200);
    expect(body).toBeTruthy();
    expect(body).toMatch(/status:\s*'active'/);
  });
  it('W1.2 a created deposit (status active) lands on the ใช้งานอยู่ pill', () => {
    const created = { depositId: 'DEP-NEW', status: 'active', remainingAmount: 5000 };
    expect(filterDepositsBySubTab([created], 'active')).toEqual([created]);
    expect(filterDepositsBySubTab([created], 'finished')).toEqual([]);
  });
});

// =============================================================================
describe('W2 — Frontend booking-pair deposit routes to active', () => {
  it('W2.1 createDepositBookingPair builds the deposit payload with status active', () => {
    expect(BATCH).toMatch(/status:\s*'active'/);
  });
  it('W2.2 booking-pair payload mirrors createDeposit shape (status active → active pill)', () => {
    const bookingDeposit = { depositId: 'DEP-FE', status: 'active', hasAppointment: true };
    expect(filterDepositsBySubTab([bookingDeposit], 'active')).toEqual([bookingDeposit]);
    expect(filterDepositsBySubTab([bookingDeposit], 'finished')).toEqual([]);
  });
});

// =============================================================================
describe('W3 — status transitions migrate to สิ้นสุดแล้ว correctly', () => {
  it('W3.1 applyDepositToSale: remaining 0 → used; else → partial', () => {
    const body = sliceFrom(BACKEND, 'export async function applyDepositToSale');
    expect(body).toBeTruthy();
    expect(body).toMatch(/newRemaining === 0 \? 'used' : 'partial'/);
  });
  it('W3.2 full apply (used) migrates active → finished', () => {
    let deposits = [{ depositId: 'DEP-1', status: 'active' }];
    expect(filterDepositsBySubTab(deposits, 'active')).toHaveLength(1);
    deposits = [{ depositId: 'DEP-1', status: 'used' }];
    expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-1']);
    expect(filterDepositsBySubTab(deposits, 'active')).toEqual([]);
  });
  it('W3.3 partial apply stays on active pill (still usable)', () => {
    const deposits = [{ depositId: 'DEP-1', status: 'partial' }];
    expect(filterDepositsBySubTab(deposits, 'active').map(d => d.depositId)).toEqual(['DEP-1']);
  });
  it('W3.4 cancel → cancelled → finished pill', () => {
    expect(BACKEND).toMatch(/status:\s*'cancelled'/);
    const deposits = [{ depositId: 'DEP-1', status: 'cancelled' }];
    expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-1']);
  });
  it('W3.5 full refund → refunded → finished pill', () => {
    expect(BACKEND).toMatch(/status:\s*fullRefund \? 'refunded'/);
    const deposits = [{ depositId: 'DEP-1', status: 'refunded' }];
    expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-1']);
  });
  it('W3.6 expired → finished pill', () => {
    const deposits = [{ depositId: 'DEP-1', status: 'expired' }];
    expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-1']);
  });
  it('W3.7 active|partial = usable convention matches codebase getDepositBalance', () => {
    // backendClient sums active+partial as the usable deposit balance — our
    // active pill set must match this exact semantic.
    expect(BACKEND).toMatch(/status === 'active' \|\| (x|d)\.status === 'partial'/);
  });
});
