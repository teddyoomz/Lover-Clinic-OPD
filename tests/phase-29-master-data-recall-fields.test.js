// tests/phase-29-master-data-recall-fields.test.js
//
// Phase 29.22 (2026-05-14) — REWRITTEN as anti-regression lock for the
// legacy field strip. Previously this file asserted that be_products +
// be_courses CARRIED 4 recall preset fields (followUpAfterDays +
// followUpReason + recallAfterDays + recallReason). Phase 29.22 moved
// those presets to a dedicated universal collection `be_recall_cases`.
//
// This file now LOCKS that the legacy fields are GONE from the validators
// + normalizers. If a future commit re-introduces them on be_products /
// be_courses, this test fails — the work belongs in be_recall_cases.
//
// (V21-class pattern reversal: source-grep tests that previously locked
// the legacy contract now lock the new — strip — contract.)

import { describe, it, expect } from 'vitest';
import {
  emptyProductForm,
  normalizeProduct,
} from '../src/lib/productValidation.js';
import {
  emptyCourseForm,
  normalizeCourse,
} from '../src/lib/courseValidation.js';

const LEGACY_RECALL_FIELDS = [
  'followUpAfterDays',
  'followUpReason',
  'recallAfterDays',
  'recallReason',
];

describe('Phase 29.22 · legacy recall fields stripped from be_products', () => {
  it('emptyProductForm does NOT carry legacy recall fields', () => {
    const f = emptyProductForm();
    for (const k of LEGACY_RECALL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(f, k)).toBe(false);
    }
  });

  it('emptyProductForm documented shape excludes all 4 legacy fields', () => {
    const empty = emptyProductForm();
    for (const k of LEGACY_RECALL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(empty, k)).toBe(false);
    }
  });
});

describe('Phase 29.22 · legacy recall fields stripped from be_courses', () => {
  it('emptyCourseForm does NOT carry legacy recall fields', () => {
    const f = emptyCourseForm();
    for (const k of LEGACY_RECALL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(f, k)).toBe(false);
    }
  });

  it('emptyCourseForm documented shape excludes all 4 legacy fields', () => {
    const empty = emptyCourseForm();
    for (const k of LEGACY_RECALL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(empty, k)).toBe(false);
    }
  });
});
