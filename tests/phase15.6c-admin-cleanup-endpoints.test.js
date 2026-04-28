// ─── Phase 15.6 — Admin cleanup endpoints (Issue 3 + Issue 5) ───────────────
// 3 endpoints: cleanup-orphan-stock + cleanup-test-products + cleanup-test-sales
// Pattern reference: api/admin/cleanup-test-probes.js (V27).
//
// All 3 endpoints share:
//   - verifyAdminToken gate (admin: true claim required)
//   - Two-phase action: 'list' (DRY-RUN) → 'delete' (with confirm IDs)
//   - Audit doc written to be_admin_audit on successful delete
//   - Run via curl from bash — no UI per V29 directive
//
// Coverage:
//   ACE.A — cleanup-orphan-stock: helper unit + source-grep
//   ACE.B — cleanup-test-products: helper unit + source-grep + cascade gate
//   ACE.C — cleanup-test-sales: helper unit + source-grep + prefix gate
//   ACE.D — common patterns (verifyAdminToken, audit doc, dry-run default)
//   ACE.E — firestore.rules be_admin_audit lockdown

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  findOrphanBatches,
} from '../api/admin/cleanup-orphan-stock.js';
import {
  isTestProductId,
  findTestProducts,
} from '../api/admin/cleanup-test-products.js';
import {
  isTestSaleId,
  findTestSales,
} from '../api/admin/cleanup-test-sales.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const orphanSrc = read('api/admin/cleanup-orphan-stock.js');
const testProductsSrc = read('api/admin/cleanup-test-products.js');
const testSalesSrc = read('api/admin/cleanup-test-sales.js');
const rulesSrc = read('firestore.rules');

// ============================================================================
describe('Phase 15.6 ACE.A — cleanup-orphan-stock', () => {
  describe('ACE.A.1 findOrphanBatches helper', () => {
    it('returns empty when all batches have valid productIds', () => {
      const products = new Set(['P-1', 'P-2']);
      const batches = [
        { id: 'B-1', productId: 'P-1', productName: 'A', branchId: 'main' },
        { id: 'B-2', productId: 'P-2', productName: 'B', branchId: 'main' },
      ];
      expect(findOrphanBatches(batches, products)).toEqual([]);
    });

    it('returns batches whose productId is missing from product set', () => {
      const products = new Set(['P-1']);
      const batches = [
        { id: 'B-1', productId: 'P-1', productName: 'A', branchId: 'main' },
        { id: 'B-ORPH', productId: 'P-MISSING', productName: 'Acetin 6', branchId: 'BR-1', qty: { total: 91, remaining: 21 } },
      ];
      const orphans = findOrphanBatches(batches, products);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toMatchObject({
        batchId: 'B-ORPH',
        productId: 'P-MISSING',
        productName: 'Acetin 6',
        branchId: 'BR-1',
      });
    });

    it('skips batches with no productId (separate concern)', () => {
      const products = new Set(['P-1']);
      const batches = [
        { id: 'B-1', productId: '', productName: 'No Prod' },
        { id: 'B-2', productId: 'P-1' },
      ];
      expect(findOrphanBatches(batches, products)).toEqual([]);
    });

    it('coerces productId to string when comparing', () => {
      const products = new Set(['123']);
      const batches = [{ id: 'B-1', productId: 123, productName: 'X' }]; // numeric
      expect(findOrphanBatches(batches, products)).toEqual([]); // matches via String coercion
    });

    it('handles real-world orphan shape from user screenshot (Acetin 6, Aloe gel 010)', () => {
      const products = new Set(['ALG-100', 'BTX-50']); // real products
      const batches = [
        { id: 'B-acetin', productId: 'ACETIN-6', productName: 'Acetin 6', branchId: 'main', qty: { total: 91, remaining: 21 } },
        { id: 'B-aloe', productId: 'ALOEGEL-010', productName: 'Aloe gel 010', branchId: 'main', qty: { total: 64, remaining: 64 } },
        { id: 'B-real', productId: 'ALG-100', productName: 'Allergan 100', branchId: 'main' },
      ];
      const orphans = findOrphanBatches(batches, products);
      expect(orphans).toHaveLength(2);
      expect(orphans.map(o => o.productName).sort()).toEqual(['Acetin 6', 'Aloe gel 010']);
    });
  });

  describe('ACE.A.2 source-grep guards', () => {
    it('endpoint imports verifyAdminToken', () => {
      expect(orphanSrc).toMatch(/import\s*\{\s*verifyAdminToken\s*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
    });

    it('endpoint gates entry via verifyAdminToken before any DB query', () => {
      expect(orphanSrc).toMatch(/const caller = await verifyAdminToken\(req, res\)/);
      expect(orphanSrc).toMatch(/if\s*\(!caller\)\s*return/);
    });

    it('endpoint accepts action=list as default (DRY-RUN safe)', () => {
      expect(orphanSrc).toMatch(/req\.body\?\.action\s*\|\|\s*['"]list['"]/);
    });

    it('endpoint requires confirmBatchIds for action=delete (no surprise mass-delete)', () => {
      expect(orphanSrc).toMatch(/confirmBatchIds\.length\s*===\s*0/);
      expect(orphanSrc).toMatch(/confirmBatchIds\[\]\s+required/);
    });

    it('endpoint writes audit doc to be_admin_audit on successful delete', () => {
      expect(orphanSrc).toMatch(/be_admin_audit/);
      expect(orphanSrc).toMatch(/cleanup-orphan-/);
    });

    it('endpoint uses Promise/firebase-admin batched delete (500 limit)', () => {
      expect(orphanSrc).toMatch(/inBatch\s*>=\s*500/);
    });

    it('NO UI marker — endpoint is bash-only per V29', () => {
      expect(orphanSrc).toMatch(/no UI/);
    });
  });
});

// ============================================================================
describe('Phase 15.6 ACE.B — cleanup-test-products', () => {
  describe('ACE.B.1 isTestProductId helper', () => {
    it.each([
      ['ADVS-PA-1776555752987-pzdvf5', true],
      ['ADVS-PB-1776555443788-tpi3j2', true],
      ['ADVS-POPT-1776555752987-pzdvf5', true],
      ['ADVS-PUNT-1776555443788-tpi3j2', true],
      ['ADVT-CON-1776555444856-bfjqjn', true],
      ['ADVT-MED-x', true],
      ['TEST-PROD-1234', true],
      ['E2E-PROD-5678', true],
      ['TEST-1234', true],
      ['E2E-1234', true],
      ['ALG-100', false],
      ['BTX-50-U', false],
      ['ACETIN-6', false], // user-mentioned orphan; this is NOT a test prefix
      ['', false],
      [null, false],
      [undefined, false],
    ])('isTestProductId(%j) === %s', (id, expected) => {
      expect(isTestProductId(id)).toBe(expected);
    });
  });

  describe('ACE.B.2 findTestProducts helper', () => {
    it('returns subset matching prefixes', () => {
      const docs = [
        { id: 'ADVS-PA-1', name: 'Test Prod A' },
        { id: 'ALG-100', name: 'Allergan' },
        { id: 'TEST-PROD-2', name: 'Test 2', category: 'med' },
      ];
      const result = findTestProducts(docs);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.productId).sort()).toEqual(['ADVS-PA-1', 'TEST-PROD-2']);
    });

    it('skips docs with no id', () => {
      const docs = [{ name: 'No ID' }, { id: 'TEST-1', name: 'Yes' }];
      const result = findTestProducts(docs);
      expect(result.map(r => r.productId)).toEqual(['TEST-1']);
    });

    it('handles empty input', () => {
      expect(findTestProducts([])).toEqual([]);
      expect(findTestProducts(null)).toEqual([]);
      expect(findTestProducts(undefined)).toEqual([]);
    });
  });

  describe('ACE.B.3 source-grep guards', () => {
    it('endpoint refuses to delete production-looking IDs', () => {
      expect(testProductsSrc).toMatch(/does not match test-prefix pattern/);
    });

    it('cascade gate: refuses if be_stock_batches references the product', () => {
      expect(testProductsSrc).toMatch(/cascade-gate/);
      expect(testProductsSrc).toMatch(/blockedByBatches/);
    });

    it('writes audit doc on delete', () => {
      expect(testProductsSrc).toMatch(/cleanup-test-products-/);
      expect(testProductsSrc).toMatch(/be_admin_audit/);
    });
  });
});

// ============================================================================
describe('Phase 15.6 ACE.C — cleanup-test-sales', () => {
  describe('ACE.C.1 isTestSaleId helper', () => {
    it.each([
      ['TEST-SALE-DEFAULT-1777123845203', true],
      ['TEST-SALE-1777123823846', true],
      ['E2E-SALE-1234', true],
      ['INV-202604280001', false],
      ['SAL-2026-001', false],
      ['', false],
      [null, false],
    ])('isTestSaleId(%j) === %s', (id, expected) => {
      expect(isTestSaleId(id)).toBe(expected);
    });
  });

  describe('ACE.C.2 findTestSales helper', () => {
    it('returns user-named test sales from screenshot', () => {
      const docs = [
        { id: 'TEST-SALE-DEFAULT-1777123845203', customerId: '', billing: { netTotal: 0 } },
        { id: 'TEST-SALE-1777123823846', customerId: 'CUST-1', billing: { netTotal: 100 } },
        { id: 'INV-202604280001', customerId: 'CUST-2', billing: { netTotal: 5000 } },
      ];
      const result = findTestSales(docs);
      expect(result).toHaveLength(2);
      const ids = result.map(r => r.saleId).sort();
      expect(ids).toEqual(['TEST-SALE-1777123823846', 'TEST-SALE-DEFAULT-1777123845203']);
    });

    it('handles malformed test sale (no billing)', () => {
      const docs = [{ id: 'TEST-SALE-X' }]; // no billing field
      const result = findTestSales(docs);
      expect(result).toHaveLength(1);
      expect(result[0].netTotal).toBe(0);
    });
  });

  describe('ACE.C.3 source-grep guards', () => {
    it('endpoint refuses production-looking IDs', () => {
      expect(testSalesSrc).toMatch(/does not match test-prefix pattern/);
    });

    it('SKIPS linked-treatments cascade (test sales have none)', () => {
      // Source-grep: must NOT call _clearLinkedTreatmentsHasSale or similar
      // (the test sales typically don't have real treatments to detach)
      expect(testSalesSrc).not.toMatch(/_clearLinkedTreatmentsHasSale/);
      expect(testSalesSrc).not.toMatch(/clearLinkedTreatments/);
    });

    it('writes audit doc on delete', () => {
      expect(testSalesSrc).toMatch(/cleanup-test-sales-/);
      expect(testSalesSrc).toMatch(/be_admin_audit/);
    });
  });
});

// ============================================================================
describe('Phase 15.6 ACE.D — common patterns across all 3 endpoints', () => {
  for (const [name, src] of [
    ['cleanup-orphan-stock', orphanSrc],
    ['cleanup-test-products', testProductsSrc],
    ['cleanup-test-sales', testSalesSrc],
  ]) {
    describe(name, () => {
      it('verifyAdminToken gate present', () => {
        expect(src).toMatch(/verifyAdminToken\(req, res\)/);
      });

      it('OPTIONS preflight returns 204', () => {
        expect(src).toMatch(/method\s*===\s*['"]OPTIONS['"][\s\S]{0,80}status\(204\)/);
      });

      it('non-POST returns 405', () => {
        expect(src).toMatch(/method\s*!==\s*['"]POST['"][\s\S]{0,150}status\(405\)/);
      });

      it('Phase 15.6 marker present', () => {
        expect(src).toMatch(/Phase 15\.6/);
      });

      it('Run via curl from bash directive present (per V29)', () => {
        expect(src).toMatch(/curl|bash|UI/i);
      });

      it('uses CORS preflight headers', () => {
        expect(src).toMatch(/Access-Control-Allow-Origin/);
        expect(src).toMatch(/Access-Control-Allow-Methods/);
      });
    });
  }
});

// ============================================================================
describe('Phase 15.6 ACE.E — firestore.rules be_admin_audit lockdown', () => {
  it('be_admin_audit match block exists', () => {
    expect(rulesSrc).toMatch(/match\s+\/be_admin_audit\/\{auditId\}/);
  });

  it('be_admin_audit is locked to admin SDK only (read,write: if false)', () => {
    const block = rulesSrc.match(/match\s+\/be_admin_audit\/\{auditId\}\s*\{[\s\S]{0,300}\}/);
    expect(block, 'be_admin_audit block not found').not.toBeNull();
    expect(block[0]).toMatch(/allow\s+read,\s*write:\s*if\s+false/);
  });

  it('Phase 15.6 marker comment present near rule', () => {
    expect(rulesSrc).toMatch(/Phase 15\.6[\s\S]{0,300}be_admin_audit/);
  });
});
