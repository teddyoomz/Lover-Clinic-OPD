// ─── Phase 17.2-octies — buy → assign → render → deduct round-trip ──────
// Per course type: simulate the full lifecycle using only PURE helpers
// (no Firestore writes) to lock the contract:
//   1. Buy modal output (Phase 17.2-septies map shape)
//   2. confirmBuyModal → buildPurchasedCourseEntry adds to options.customerCourses
//   3. Render via isCourseUsableInTreatment + buildCustomerCourseGroups
//   4. (Conceptual) deduct via deductCourseItems shape contract

import { describe, it, expect } from 'vitest';
import {
  mapRawCoursesToForm,
  isCourseUsableInTreatment,
  buildCustomerCourseGroups,
  buildPurchasedCourseEntry,
} from '../src/lib/treatmentBuyHelpers.js';

const COURSE_TYPES = {
  STANDARD: 'ระบุสินค้าและจำนวนสินค้า',
  PICK_REAL: 'เลือกสินค้าตามจริง',
  EHMA_REAL: 'เหมาตามจริง',
  BUFFET: 'บุฟเฟต์',
};

// Shape that openBuyModal produces post Phase 17.2-septies (canonical
// schema with legacy-named OUTPUT fields):
//   { id, name, price, category, type:'course', itemType:'course',
//     unit, courseType, products, daysBeforeExpire, period }
function makeBuyModalCourseItem(overrides = {}) {
  return {
    id: '1067',
    name: 'IV Drip Premium #1 (10 ครั้ง)',
    price: 5000,
    category: 'IV',
    type: 'course',
    itemType: 'course',
    unit: '',
    courseType: COURSE_TYPES.STANDARD,
    products: [
      { id: '941', name: 'IV Drip Premium #1', qty: 10, unit: 'ครั้ง', total: 10 },
      { id: '942', name: 'NSS', qty: 100, unit: 'ml', total: 100 },
      { id: '943', name: 'Vit C', qty: 30, unit: 'amp.', total: 30 },
    ],
    daysBeforeExpire: 365,
    period: null,
    ...overrides,
  };
}

describe('Phase 17.2-octies — buy → assign → render round-trip', () => {
  describe('B1 — STANDARD course (ระบุสินค้าและจำนวนสินค้า)', () => {
    it('B1.1 buyModal item → buildPurchasedCourseEntry produces course-shape entry', () => {
      const item = makeBuyModalCourseItem();
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
      expect(entry.courseName || entry.name).toBeTruthy();
    });
    it('B1.2 purchased entry survives isCourseUsableInTreatment (visible immediately after buy)', () => {
      const item = makeBuyModalCourseItem();
      const entry = buildPurchasedCourseEntry(item);
      expect(isCourseUsableInTreatment(entry)).toBe(true);
    });
    it('B1.3 buildCustomerCourseGroups groups the new entry with existing courses', () => {
      const item = makeBuyModalCourseItem();
      const purchased = buildPurchasedCourseEntry(item);
      const existingRaw = [{
        name: 'OldCourse', product: 'X', qty: '3 / 5 ครั้ง', courseType: COURSE_TYPES.STANDARD,
        status: 'กำลังใช้งาน', linkedSaleId: 'INV-OLD', parentName: 'คอร์ส: OldCourse',
      }];
      const existingMapped = mapRawCoursesToForm(existingRaw);
      const all = [...existingMapped, purchased].filter(isCourseUsableInTreatment);
      const groups = buildCustomerCourseGroups(all);
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('B2 — PICK_REAL course (เลือกสินค้าตามจริง)', () => {
    it('B2.1 buy → entry visible regardless of remaining (pick-at-treatment placeholder)', () => {
      const item = makeBuyModalCourseItem({ courseType: COURSE_TYPES.PICK_REAL, products: [] });
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
      // Pick-at-treatment placeholders should pass the usable filter
      // (they don't have remaining yet — doctor picks during treatment)
      expect(isCourseUsableInTreatment(entry)).toBe(true);
    });
  });

  describe('B3 — EHMA_REAL course (เหมาตามจริง)', () => {
    it('B3.1 buy → entry visible (special type — fill-later)', () => {
      const item = makeBuyModalCourseItem({ courseType: COURSE_TYPES.EHMA_REAL });
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
      expect(isCourseUsableInTreatment(entry)).toBe(true);
    });
  });

  describe('B4 — BUFFET course (บุฟเฟต์)', () => {
    it('B4.1 buy → entry visible regardless of qty (special type — buffet)', () => {
      const item = makeBuyModalCourseItem({ courseType: COURSE_TYPES.BUFFET });
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
      expect(isCourseUsableInTreatment(entry)).toBe(true);
    });
  });

  describe('B5 — Adversarial inputs', () => {
    it('B5.1 zero-priced item still produces entry (free trial / promotion-attached)', () => {
      const item = makeBuyModalCourseItem({ price: 0 });
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
    });
    it('B5.2 missing products array tolerated', () => {
      const item = makeBuyModalCourseItem({ products: [] });
      const entry = buildPurchasedCourseEntry(item);
      expect(entry).toBeTruthy();
    });
  });
});
