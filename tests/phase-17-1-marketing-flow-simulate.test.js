// ─── Phase 17.1 marketing extension — Rule I full-flow simulate ────────────
// Per .claude/rules/00-session-start.md Rule I (full-flow simulate at sub-
// phase end), every sub-phase touching a user-visible flow must chain EVERY
// step. This file mirrors the v41-test-cross-branch-import.mjs pattern in
// pure JS (no Firestore writes) for the 3 marketing adapters.
//
// Spec: docs/superpowers/specs/2026-05-07-phase-17-1-marketing-extension-design.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

const SOURCE = 'BR-source-test';
const TARGET = 'BR-target-test';

/**
 * Mirror api/admin/cross-branch-import.js post-clone stamp logic:
 *   cloned.id = newId;
 *   if (adapter.canonicalIdField) cloned[canonicalIdField] = newId;
 */
function simulateEndpointStamp(adapter, sourceItem, newId) {
  const cloned = adapter.clone(sourceItem, TARGET, 'admin-uid');
  cloned.id = newId;
  if (adapter.canonicalIdField) cloned[adapter.canonicalIdField] = newId;
  return cloned;
}

describe('F1 — full chain: source → clone → endpoint stamp → final shape', () => {
  it('F1.1 promotions: branchId=target, promotionId=newId, id=newId', () => {
    const source = {
      id: 'SRC-PROMO-1',
      promotionId: 'SRC-PROMO-1',
      promotion_name: 'Summer Sale',
      sale_price: 1000,
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('promotions'), source, 'PROMOTIONS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.promotionId).toBe('PROMOTIONS_T_NEW1');
    expect(final.id).toBe('PROMOTIONS_T_NEW1');
    expect(final.promotion_name).toBe('Summer Sale');  // preserved
    expect(final.sale_price).toBe(1000);                // preserved
  });

  it('F1.2 coupons: branchId=target, couponId=newId, id=newId, branch_ids=[]', () => {
    const source = {
      id: 'SRC-COUP-1',
      couponId: 'SRC-COUP-1',
      coupon_code: 'SUMMER2026',
      coupon_name: 'Summer 2026',
      discount: 15,
      discount_type: 'percent',
      branch_ids: ['28', '29'],
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('coupons'), source, 'COUPONS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.couponId).toBe('COUPONS_T_NEW1');
    expect(final.id).toBe('COUPONS_T_NEW1');
    expect(final.coupon_code).toBe('SUMMER2026');
    expect(final.discount).toBe(15);
    expect(final.branch_ids).toEqual([]);  // V41 Q2 lock
  });

  it('F1.3 vouchers: branchId=target, voucherId=newId, id=newId', () => {
    const source = {
      id: 'SRC-VOU-1',
      voucherId: 'SRC-VOU-1',
      voucher_name: 'Promo HDmall',
      sale_price: 500,
      commission_percent: 30,
      platform: 'HDmall',
      branchId: SOURCE,
    };
    const final = simulateEndpointStamp(getAdapter('vouchers'), source, 'VOUCHERS_T_NEW1');
    expect(final.branchId).toBe(TARGET);
    expect(final.voucherId).toBe('VOUCHERS_T_NEW1');
    expect(final.id).toBe('VOUCHERS_T_NEW1');
    expect(final.voucher_name).toBe('Promo HDmall');
    expect(final.platform).toBe('HDmall');
  });
});

describe('F2 — promotion FK resolution simulator', () => {
  const adapter = getAdapter('promotions');

  it('F2.1 fkRefs returns shape that matches endpoint resolveFkAdapter expectation', () => {
    const refs = adapter.fkRefs({
      courses: [{ id: 'C-1' }, { id: 'C-2' }],
      products: [{ id: 'P-1' }],
    });
    // Endpoint expects: [{ collection: 'be_*', ids: [...] }, ...]
    for (const ref of refs) {
      expect(ref).toHaveProperty('collection');
      expect(ref).toHaveProperty('ids');
      expect(Array.isArray(ref.ids)).toBe(true);
      expect(ref.collection).toMatch(/^be_/);
    }
  });

  it('F2.2 missingFKs detection — when target lacks the dedupKey-matching FK, ref appears in missingFKs', () => {
    // Simulate endpoint's classifier:
    //   for each FK ref, look up sourceFkLookup[col][refId] → dedupKey
    //   check if fkTargetIdSets[col].has(dedupKey)
    //   if not, push to missingFKs
    const promo = { courses: [{ id: 'C-source-1' }], products: [{ id: 'P-source-1' }] };
    const sourceFkLookup = {
      'be_courses': { 'C-source-1': 'CourseA' },
      'be_products': { 'P-source-1': 'ProductA' },
    };
    const fkTargetIdSets = {
      'be_courses': new Set(['CourseB']),  // CourseA NOT at target
      'be_products': new Set(['ProductA']),  // ProductA AT target
    };
    const refs = adapter.fkRefs(promo);
    const missingFKs = [];
    for (const ref of refs) {
      for (const refId of ref.ids) {
        const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
        if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
          missingFKs.push({ collection: ref.collection, sourceId: refId });
        }
      }
    }
    expect(missingFKs.length).toBe(1);
    expect(missingFKs[0].collection).toBe('be_courses');
    expect(missingFKs[0].sourceId).toBe('C-source-1');
  });

  it('F2.3 all-FK-present → empty missingFKs', () => {
    const promo = { courses: [{ id: 'C-1' }], products: [{ id: 'P-1' }] };
    const sourceFkLookup = {
      'be_courses': { 'C-1': 'CA' },
      'be_products': { 'P-1': 'PA' },
    };
    const fkTargetIdSets = {
      'be_courses': new Set(['CA']),
      'be_products': new Set(['PA']),
    };
    const refs = adapter.fkRefs(promo);
    const missingFKs = [];
    for (const ref of refs) {
      for (const refId of ref.ids) {
        const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
        if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
          missingFKs.push({ collection: ref.collection, sourceId: refId });
        }
      }
    }
    expect(missingFKs).toEqual([]);
  });
});

describe('F3 — V40 backup-tier inclusion (anti-regression)', () => {
  it('F3.1 be_promotions in T1_COLLECTIONS', () => {
    const src = readFileSync('src/lib/branchBackupCore.js', 'utf-8');
    // T1_COLLECTIONS literal block — be_promotions should appear in it
    expect(src).toMatch(/'be_promotions',/);
  });

  it('F3.2 be_coupons + be_vouchers in T1_COLLECTIONS', () => {
    const src = readFileSync('src/lib/branchBackupCore.js', 'utf-8');
    expect(src).toMatch(/'be_coupons',/);
    expect(src).toMatch(/'be_vouchers',/);
  });
});

describe('F4 — V38 delete equivalence (canonicalIdField === docId)', () => {
  it('F4.1 promotion handleDelete `p.promotionId || p.id` resolves to docId', () => {
    const adapter = getAdapter('promotions');
    const sourceItem = { promotionId: 'SRC', promotion_name: 'X' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'PROMOTIONS_T_NEW');
    // handleDelete pattern: const id = p.promotionId || p.id;
    const resolvedId = final.promotionId || final.id;
    expect(resolvedId).toBe('PROMOTIONS_T_NEW');
  });

  it('F4.2 coupon handleDelete `c.couponId || c.id` resolves to docId', () => {
    const adapter = getAdapter('coupons');
    const sourceItem = { couponId: 'SRC', coupon_code: 'X' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'COUPONS_T_NEW');
    const resolvedId = final.couponId || final.id;
    expect(resolvedId).toBe('COUPONS_T_NEW');
  });

  it('F4.3 voucher handleDelete `v.voucherId || v.id` resolves to docId', () => {
    const adapter = getAdapter('vouchers');
    const sourceItem = { voucherId: 'SRC', voucher_name: 'X', platform: 'HDmall' };
    const final = simulateEndpointStamp(adapter, sourceItem, 'VOUCHERS_T_NEW');
    const resolvedId = final.voucherId || final.id;
    expect(resolvedId).toBe('VOUCHERS_T_NEW');
  });
});
