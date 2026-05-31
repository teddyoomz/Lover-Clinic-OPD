// V142-bis (2026-05-31) — CREATE-flow buy→deduct serialization.
//
// User worry (verbatim): "ซื้อคอร์สใน TFP ที่เพิ่งสร้างแล้วตัดคอร์สเลย คิดเงิน
// เอายากลับบ้าน ภายในการกดบันทึกครั้งเดียว ... ที่พลาดรอบที่แล้วคือซื้อแล้วตัด
// คอร์สเลยทันที พร้อมคิดเงิน แล้วมันไม่ไปลดคอร์ส".
//
// The piece that decides WHICH courses get deducted on save is the V101 two-pass
// serialization, extracted (verbatim) from the TFP inline IIFE to
// buildCourseItemsForSave so it's directly testable. These tests prove the
// SINGLE-SAVE create flow (buy a course in-session + use it immediately)
// produces a NON-EMPTY deduct list → deductCourseItems WILL deduct it.
//
// The data already corroborates this (real prod BT-1780203508072: the CREATE
// save deducted to "0/1"; the revert was the 2nd/edit save = V142). These tests
// + the e2e (scripts/e2e-v142bis-single-save-buy-deduct-charge-meds.mjs) prove
// the create path with the REAL serialization, not a mock.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildCourseItemsForSave,
  buildPurchasedCourseEntry,
  isPurchasedSessionRowId,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';

// Mirror of confirmBuyModal: a buy-modal course item → customerCourses entry.
function buyAndStage(buyModalItem) {
  const entry = buildPurchasedCourseEntry(buyModalItem);
  const product = entry.products[0];
  const rowId = product.rowId;
  const selectedCourseItems = new Set([rowId]);
  const treatmentItems = [{ id: rowId, name: product.name, qty: 1, unit: product.unit, productId: product.productId }];
  return { entry, rowId, selectedCourseItems, treatmentItems };
}

describe('V142-bis.B — buildCourseItemsForSave: single-save CREATE buy→deduct', () => {
  it('B1 — ★ ซื้อคอร์สแล้วใช้เลยในการกดบันทึกครั้งเดียว → deduct list NON-EMPTY (course WILL be deducted)', () => {
    const { entry, selectedCourseItems, treatmentItems } = buyAndStage({
      id: '38699', name: 'Testoviron 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า',
      products: [{ id: '38699', name: 'Testoviron', qty: 1, unit: 'ครั้ง' }],
    });
    const courseItems = buildCourseItemsForSave(selectedCourseItems, [entry], treatmentItems);
    expect(courseItems).toHaveLength(1);                       // ← NOT empty
    expect(courseItems[0].productName).toBe('Testoviron');
    expect(courseItems[0].deductQty).toBe(1);
    expect(isPurchasedSessionRowId(courseItems[0].rowId)).toBe(true); // routed to purchasedDeductions
  });

  it('B2 — buy 3 courses + use all in one save → all 3 serialize (matches the real-prod LC-26000115 shape)', () => {
    const defs = [
      { id: 'A', name: 'Testoviron 1 ครั้ง', products: [{ id: 'A', name: 'Testoviron', qty: 1, unit: 'ครั้ง' }] },
      { id: 'B', name: 'ปรึกษาโรคทั่วไป (20นาที) 1 ครั้ง', products: [{ id: 'B', name: 'ปรึกษาโรคทั่วไป (20นาที)', qty: 1, unit: 'ครั้ง' }] },
      { id: 'C', name: 'เจาะเลือดตรวจสมมรถภาพ เบื้องต้น', products: [{ id: 'C', name: 'ค่าบริการอ่านและแปลผลเลือด โดยแพทย์', qty: 1, unit: 'ครั้ง' }] },
    ].map(d => ({ ...d, courseType: 'ระบุสินค้าและจำนวนสินค้า' }));
    const entries = [], selected = new Set(), tItems = [];
    for (const d of defs) {
      const e = buildPurchasedCourseEntry(d);
      entries.push(e);
      const p = e.products[0];
      selected.add(p.rowId);
      tItems.push({ id: p.rowId, name: p.name, qty: 1, productId: p.productId });
    }
    const courseItems = buildCourseItemsForSave(selected, entries, tItems);
    expect(courseItems).toHaveLength(3);
    expect(courseItems.every(ci => isPurchasedSessionRowId(ci.rowId))).toBe(true);
  });

  it('B3 — Pass-2 productId fallback: existing course used by productId (no rowId in selection)', () => {
    // mapRawCoursesToForm reads the COURSE-LEVEL productId (c.productId) onto
    // products[].productId; remaining is derived from the course qty string.
    const customerCourses = mapRawCoursesToForm([
      { name: 'CourseX', product: 'ProdX', productId: 'PX', qty: '5 / 5 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    ]);
    // selectedCourseItems empty; only a treatmentItem with productId carries the link
    const courseItems = buildCourseItemsForSave(new Set(), customerCourses, [{ id: 'tmp', name: 'ProdX', qty: 1, productId: 'PX' }]);
    expect(courseItems).toHaveLength(1);
    expect(courseItems[0]._v101AutoLinked).toBe(true);
    expect(courseItems[0].productName).toBe('ProdX');
  });

  it('B4 — EDIT-reload of a consumed purchased course → EMPTY (the V142 premise)', () => {
    // post-reload the bought course is at remaining 0 → mapRawCoursesToForm
    // DROPS it from the picker entirely (line 409: total>0 && remaining<=0 →
    // null), so customerCourses no longer contains it. The saved courseItems
    // rowId was `purchased-…` (now in selectedCourseItems) → Pass-1 finds
    // nothing; the courseItems-derived treatmentItem has NO productId →
    // Pass-2 can't run. Result: EMPTY deduct list → exactly why the EDIT
    // re-deduct step needs buildReDeductListWithCarryForward (V142).
    const customerCourses = mapRawCoursesToForm([
      { name: 'Testoviron 1 ครั้ง', product: 'Testoviron', productId: '38699', qty: '0 / 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    ]);
    expect(customerCourses).toHaveLength(0); // consumed course filtered out of the picker
    const selected = new Set(['purchased-38699-row-self']);                 // stale purchased rowId
    const treatmentItems = [{ id: 'purchased-38699-row-self', name: 'Testoviron', qty: 1 }]; // no productId (1158 strip)
    const courseItems = buildCourseItemsForSave(selected, customerCourses, treatmentItems);
    expect(courseItems).toHaveLength(0); // ← empty → why the reverse needs the V142 carry-forward
  });

  it('B5 — adversarial: empty / Set vs Array / null inputs', () => {
    expect(buildCourseItemsForSave(new Set(), [], [])).toEqual([]);
    expect(buildCourseItemsForSave(null, null, null)).toEqual([]);
    // Array selectedCourseItems accepted (not just Set)
    const { entry, rowId, treatmentItems } = buyAndStage({ id: 'Z', name: 'Z 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: 'Z', name: 'Zp', qty: 1, unit: 'ครั้ง' }] });
    expect(buildCourseItemsForSave([rowId], [entry], treatmentItems)).toHaveLength(1);
  });
});

describe('V142-bis.SG — source-grep: TFP uses the extracted helper (no inline IIFE)', () => {
  const tfp = readFileSync(path.resolve('src/components/TreatmentFormPage.jsx'), 'utf8');
  const helper = readFileSync(path.resolve('src/lib/treatmentBuyHelpers.js'), 'utf8');
  it('SG1 — TFP calls buildCourseItemsForSave(selectedCourseItems, options?.customerCourses, treatmentItems)', () => {
    expect(tfp).toMatch(/courseItems: buildCourseItemsForSave\(selectedCourseItems, options\?\.customerCourses, treatmentItems\)/);
  });
  it('SG2 — the inline courseItems IIFE is GONE', () => {
    expect(tfp).not.toMatch(/courseItems: \(\(\) => \{/);
  });
  it('SG3 — helper carries both passes (verbatim extraction)', () => {
    expect(helper).toMatch(/export function buildCourseItemsForSave\(/);
    expect(helper).toMatch(/Pass 1 — original rowId-based serialization/);
    expect(helper).toMatch(/Pass 2 — V101 defensive auto-link via productId/);
  });
});
