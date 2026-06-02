// V148 (2026-06-02) — customer.courses[] read-modify-write atomicity.
// SOURCE-GREP regression lock (shape). BEHAVIOR proven by the real-prod L2 e2e
// scripts/e2e-course-deduct-concurrency.mjs (5 concurrent uses → only 1 applied
// BEFORE, all 5 applied AFTER) + e2e-course-mutation-concurrency.mjs (assign /
// deduct / reverse / add all apply under concurrency). Per Rule Q, mock tests
// are shape-coverage only; the e2e is the behavior proof.
//
// Bug: every customer.courses[] mutator was getDoc(customerDoc) → mutate
// courses[] → updateCustomer({courses}) with NO transaction → two concurrent
// mutators both read the same courses[], last write wins → a use/buy/reverse is
// LOST → course silently OVER-CREDITED (money-adjacent). The course analog of
// the V147 stock race.
// Fix: shared _mutateCustomerCoursesAtomic(customerId, mutate) helper wrapping
// read+write in runTransaction (Firestore OCC serializes); the 2 multi-field /
// filter writers use inline runTransaction. The 3 exchange/refund/cancel
// customer-course fns were already atomic (tx.get + tx.update).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');

describe('V148 — atomic course-mutation helper', () => {
  it('V148.1 — _mutateCustomerCoursesAtomic exists + uses runTransaction + tx.get + tx.update', () => {
    const start = SRC.indexOf('async function _mutateCustomerCoursesAtomic');
    expect(start).toBeGreaterThan(-1);
    const seg = SRC.slice(start, start + 800);
    expect(seg).toContain('runTransaction(db, async (tx) =>');
    expect(seg).toMatch(/await tx\.get\(ref\)/);
    expect(seg).toMatch(/tx\.update\(ref, \{ courses \}\)/);
  });

  it('V148.2 — the 6 clean writers route through the helper', () => {
    // function name → must contain a _mutateCustomerCoursesAtomic call in its body
    const fns = [
      'deductCourseItems',
      'reverseCourseDeduction',
      'addCourseRemainingQty',
      'assignCourseToCustomer',
      'resolvePickedCourseInCustomer',
      'addPicksToResolvedGroup',
    ];
    for (const fn of fns) {
      const start = SRC.indexOf(`export async function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const next = SRC.indexOf('\nexport async function ', start + 30);
      const body = SRC.slice(start, next > -1 ? next : start + 8000);
      expect(body, `${fn} must route through _mutateCustomerCoursesAtomic`).toContain('_mutateCustomerCoursesAtomic(customerId,');
    }
  });

  it('V148.3 — the 3 special writers use inline runTransaction + tx.get(customerDoc)', () => {
    // exchangeCourseProduct (2-field write), removeLinkedSaleCourses (filter +
    // sale-doc read first), applySaleCancelToCourses (writeBatch → tx).
    for (const fn of ['exchangeCourseProduct', 'removeLinkedSaleCourses', 'applySaleCancelToCourses']) {
      const start = SRC.indexOf(`export async function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const next = SRC.indexOf('\nexport async function ', start + 30);
      const body = SRC.slice(start, next > -1 ? next : start + 8000);
      expect(body, `${fn} must use runTransaction`).toContain('runTransaction(db, async (tx) =>');
      expect(body, `${fn} must tx.get the customer doc`).toMatch(/await tx\.get\(_?c?ref\)/i);
      expect(body, `${fn} must not writeBatch the customer courses`).not.toMatch(/batch\.update\(customerDoc/);
    }
  });

  it('V148.4 — anti-regression: NO course-writer uses the old getDoc→updateCustomer({courses}) pattern', () => {
    // The exact pre-V148 write pattern must be gone everywhere.
    expect(SRC).not.toMatch(/await updateCustomer\(customerId, \{ courses \}\)/);
    expect(SRC).not.toMatch(/await updateCustomer\(customerId, \{ courses: next \}\)/);
  });

  it('V148.5 — the already-atomic exchange/refund/cancel customer-course fns still tx.get+tx.update', () => {
    for (const fn of ['exchangeCustomerCourse', 'refundCustomerCourse', 'cancelCustomerCourse']) {
      const start = SRC.indexOf(`export async function ${fn}(`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const next = SRC.indexOf('\nexport async function ', start + 30);
      const body = SRC.slice(start, next > -1 ? next : start + 8000);
      expect(body).toContain('runTransaction(db, async (tx) =>');
      expect(body).toMatch(/tx\.update\(cRef, \{ courses: nextCourses/);
    }
  });
});
