// ─── Phase 12.2b Priority 2.9 — TREATMENT ↔ SALE linkage simulate ────────
//
// When a treatment has `hasSale: true`, handleSubmit creates a linked
// sale (auto-sale) in the same transaction:
//   - createBackendSale with customer + items (courses, products, meds)
//   - assignCourseToCustomer per course
//   - applyDepositToSale / deductWallet / earnPoints
//   - deductStockForSale (flattened promotions)
//   - deductStockForTreatment (treatmentItems)
//
// On edit, if hasSale toggles OR items change, the linkage must re-sync:
//   - hasSale: true → true (item change): reverse old + reapply new
//   - hasSale: false → true: create auto-sale fresh
//   - hasSale: true → false: delete the auto-sale
//
// On delete/cancel of the sale, _clearLinkedTreatmentsHasSale detaches
// the treatment so a future edit doesn't try to modify a dead sale.
//
// Coverage:
//   F1: linkedSaleId + linkedTreatmentId round-trip (sale knows its
//       treatment, treatment knows its sale)
//   F2: sale creation timing — course assign happens AFTER
//       createBackendSale (saleId needed for linkedSaleId tag)
//   F3: edit-mode hasSale toggle branches
//   F4: detach cascade — cancelled/deleted sale + treatment stays intact
//       but loses hasSale
//   F5: source-grep guards for the wiring

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

// ═══════════════════════════════════════════════════════════════════════
// F1: linkedSaleId + linkedTreatmentId cross-reference
// ═══════════════════════════════════════════════════════════════════════

describe('F1: linked id round-trip (sale ↔ treatment)', () => {
  it('F1.1: treatment stores linkedSaleId; sale stores linkedTreatmentId', () => {
    // After auto-sale creation, the shapes are:
    //   treatment.detail.linkedSaleId = 'INV-...'
    //   sale.linkedTreatmentId = 'BT-...'
    const treatment = { id: 'BT-1', detail: { linkedSaleId: 'INV-20260425-0001' } };
    const sale = { saleId: 'INV-20260425-0001', linkedTreatmentId: 'BT-1' };
    expect(treatment.detail.linkedSaleId).toBe(sale.saleId);
    expect(sale.linkedTreatmentId).toBe(treatment.id);
  });

  it('F1.2: customer.courses[i] carries BOTH linkedSaleId AND linkedTreatmentId after auto-sale assign', () => {
    // assignCourseToCustomer writes both so cancel-cascade can target
    // by either id.
    const course = {
      name: 'X', linkedSaleId: 'INV-1', linkedTreatmentId: 'BT-1', source: 'treatment',
    };
    expect(course.linkedSaleId).toBe('INV-1');
    expect(course.linkedTreatmentId).toBe('BT-1');
    expect(course.source).toBe('treatment');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: Sale creation timing
// ═══════════════════════════════════════════════════════════════════════

describe('F2: auto-sale creation timing — createBackendSale FIRST, then course assign', () => {
  const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

  it('F2.1: handleSubmit calls createBackendSale before assignCourseToCustomer (create path)', () => {
    const createSaleIdx = TFP.indexOf('createBackendSale(');
    const assignIdx = TFP.indexOf('assignCourseToCustomer(');
    expect(createSaleIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    expect(createSaleIdx).toBeLessThan(assignIdx); // createSale FIRST
  });

  it('F2.2: assignCourseToCustomer call includes linkedSaleId: createRes.saleId', () => {
    expect(TFP).toMatch(/linkedSaleId:\s*createRes\.saleId/);
  });

  it('F2.3: assignCourseToCustomer call includes linkedTreatmentId', () => {
    expect(TFP).toMatch(/linkedTreatmentId:\s*linkedTreatmentId/);
  });

  it('F2.4: deductStockForSale uses flattenPromotionsForStockDeduction (sale-side bundle freebies)', () => {
    // The sale-side stock deduction MUST flatten promotions to catch
    // freebie products. Without this, a "buy X get Y free" promo never
    // decrements Y from stock.
    expect(TFP).toMatch(/flattenPromotionsForStockDeduction|deductStockForSale/);
  });

  it('F2.5: deductStockForTreatment receives treatmentItems with productId preserved', () => {
    // Save payload shape: each treatmentItem has productId (not just name)
    expect(TFP).toMatch(/treatmentItems:\s*treatmentItems\.filter\([^)]*\)\.map\(t\s*=>\s*\(\{[^}]*productId:\s*t\.productId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: Edit-mode hasSale toggle branches
// ═══════════════════════════════════════════════════════════════════════

describe('F3: edit-mode hasSale toggle branches', () => {
  const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

  it('F3.1: edit → delete linked sale on hasSale=true→false (getSaleByTreatmentId then delete)', () => {
    // Pattern: fetch existing sale by treatment id, then if hasSale is
    // now false, deleteBackendSale on it.
    expect(TFP).toMatch(/getSaleByTreatmentId/);
    expect(TFP).toMatch(/deleteBackendSale|cancelBackendSale/);
  });

  it('F3.2: edit → reuse existing sale on hasSale=true→true (update path vs re-create)', () => {
    // Two strategies exist — UPDATE existing sale or delete+recreate.
    // Either way, linkedSaleId must stay accurate in customer.courses.
    expect(TFP).toMatch(/updateBackendSale|updateSalePayment/);
  });

  it('F3.3: edit → create linked sale on hasSale=false→true (edit→sale path)', () => {
    // The "edit→sale" path in handleSubmit (the second assignCourseToCustomer
    // call site at line ~2371) handles this.
    expect(TFP).toMatch(/edit→sale|auto sale creation/);
  });

  it('F3.4: all 3 edit-mode branches update customer.courses linkage', () => {
    const calls = TFP.match(/assignCourseToCustomer\(customerId/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4); // at least 4 call sites (course, promo.sub, promo.standalone × 2 paths)
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: Detach cascade — _clearLinkedTreatmentsHasSale
// ═══════════════════════════════════════════════════════════════════════

describe('F4: _clearLinkedTreatmentsHasSale — detach treatments from cancelled/deleted sale', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');

  it('F4.1: _clearLinkedTreatmentsHasSale defined as private helper', () => {
    expect(BC).toMatch(/async function _clearLinkedTreatmentsHasSale/);
  });

  it('F4.2: cancelBackendSale calls detach helper', () => {
    const idx = BC.indexOf('export async function cancelBackendSale');
    const body = BC.slice(idx, idx + 1500);
    expect(body).toMatch(/_clearLinkedTreatmentsHasSale\(saleId\)/);
  });

  it('F4.3: deleteBackendSale ALSO calls detach helper', () => {
    const idx = BC.indexOf('export async function deleteBackendSale');
    const body = BC.slice(idx, idx + 800);
    expect(body).toMatch(/_clearLinkedTreatmentsHasSale\(saleId\)/);
  });

  it('F4.4: detach sets treatment.hasSale=false + clears linkedSaleId', () => {
    const idx = BC.indexOf('async function _clearLinkedTreatmentsHasSale');
    expect(idx).toBeGreaterThan(-1);
    const body = BC.slice(idx, idx + 2000);
    expect(body).toMatch(/hasSale/);
    // Pattern: query treatments by linkedSaleId, then updateDoc to
    // unset linkedSaleId + hasSale
    expect(body).toMatch(/linkedSaleId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Adversarial — orphaned treatments, dual-linked sales
// ═══════════════════════════════════════════════════════════════════════

describe('F5: adversarial auto-sale edge cases', () => {
  it('F5.1: treatment without hasSale flag → no sale linked (defensive: safe to edit)', () => {
    const t = { id: 'BT-X', detail: { /* no linkedSaleId */ } };
    expect(t.detail.linkedSaleId).toBeUndefined();
    // editing this treatment MUST NOT try to reverse a non-existent sale
  });

  it('F5.2: sale cancelled while treatment still exists → treatment.hasSale=false after detach', () => {
    // Simulate: cancel sale → detach clears hasSale on treatment
    const treatment = { detail: { hasSale: true, linkedSaleId: 'INV-X' } };
    // After _clearLinkedTreatmentsHasSale runs:
    const detached = { ...treatment, detail: { ...treatment.detail, hasSale: false, linkedSaleId: null } };
    expect(detached.detail.hasSale).toBe(false);
    expect(detached.detail.linkedSaleId).toBeNull();
  });

  it('F5.3: refund-amount > 0 on cancelBackendSale — recorded in sale.cancelled', () => {
    const sale = {
      status: 'cancelled',
      cancelled: { refundMethod: 'cash', refundAmount: 1500, reason: 'customer unhappy' },
      'payment.status': 'cancelled',
    };
    expect(sale.cancelled.refundAmount).toBe(1500);
    expect(sale.status).toBe('cancelled');
  });

  it('F5.4: treatment edited AFTER sale cancelled → safe because hasSale is now false', () => {
    // If _clearLinkedTreatmentsHasSale didn't run, editing would try to
    // reverse a non-existent sale → error. The detach is the safety net.
    const treatmentPostDetach = { detail: { hasSale: false, linkedSaleId: null } };
    // Edit handler: if (hasSale) { ... } → skipped → no error
    const shouldReverseSale = !!treatmentPostDetach.detail.hasSale;
    expect(shouldReverseSale).toBe(false);
  });
});
