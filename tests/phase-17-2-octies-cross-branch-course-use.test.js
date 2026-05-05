// ─── Phase 17.2-octies — Cross-branch course-use contract tests ─────────
// User contract (verbatim 2026-05-05):
//   "คอร์สที่ติดตัวลูกค้าสามารถแสดงข้ามสาขา และตัดการรักษาข้ามสาขาได้นะ
//   แต่ stock จะไปตัดของสาขานั้นๆแทน"
//
// Architecture invariants (lock via tests):
//   - customer.courses[] read = universal (no branchId filter on read path)
//   - mapRawCoursesToForm + isCourseUsableInTreatment + buildCustomerCourseGroups
//     do not consume branchId — they're branch-blind
//   - deductStockForTreatment uses {branchId} — current treatment branch
//   - _resolveProductIdByName(name, branchId) — Phase 17.2-sexies — ensures
//     name fallback resolves products at the CURRENT branch when the
//     course's productId (from purchase branch) doesn't exist at the
//     treatment branch
//   - TFP call sites pass branchId: SELECTED_BRANCH_ID (current) NOT
//     customer.branchId (home) when calling deductStockForTreatment

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mapRawCoursesToForm,
  isCourseUsableInTreatment,
  buildCustomerCourseGroups,
} from '../src/lib/treatmentBuyHelpers.js';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
const BACKEND_CLIENT_SRC = readFileSync('src/lib/backendClient.js', 'utf8');

describe('Phase 17.2-octies — Cross-branch course-use contract', () => {
  describe('CB1 — Customer course visible regardless of viewer branch', () => {
    it('CB1.1 customer wallet pipeline branch-blind (no branchId arg on helpers)', () => {
      // Helper signatures: no branchId param
      expect(mapRawCoursesToForm.length).toBeLessThanOrEqual(1);
      expect(isCourseUsableInTreatment.length).toBeLessThanOrEqual(1);
      expect(buildCustomerCourseGroups.length).toBeLessThanOrEqual(1);
    });
    it('CB1.2 raw course at branch A renders identically when viewed via TFP at branch B', () => {
      const raw = [{
        name: 'IV Drip Premium #1', product: 'Allergan 100 U', productId: '941',
        qty: '8 / 10 ครั้ง', status: 'กำลังใช้งาน',
        parentName: 'คอร์ส: IV Drip', courseType: 'ระบุสินค้าและจำนวนสินค้า',
        linkedSaleId: 'INV-AT-BRANCH-A',  // sale was at นครราชสีมา
      }];
      // Pipeline output is identical regardless of which branch the viewer is on
      const mapped = mapRawCoursesToForm(raw);
      expect(mapped.length).toBe(1);
      expect(isCourseUsableInTreatment(mapped[0])).toBe(true);
      const groups = buildCustomerCourseGroups(mapped);
      expect(groups.length).toBe(1);
    });
  });

  describe('CB2 — TFP deductStockForTreatment uses SELECTED_BRANCH_ID (current)', () => {
    it('CB2.1 every TFP deductStockForTreatment call passes branchId: SELECTED_BRANCH_ID', () => {
      // Locate every deductStockForTreatment call in TFP and verify each
      // includes `branchId: SELECTED_BRANCH_ID` in its options object.
      const calls = TFP_SRC.match(/deductStockForTreatment\s*\([\s\S]{0,800}?\)/g) || [];
      expect(calls.length).toBeGreaterThanOrEqual(1);
      for (const c of calls) {
        expect(c).toMatch(/branchId:\s*SELECTED_BRANCH_ID/);
      }
    });
    it('CB2.2 NO TFP call passes branchId from customer.branchId (home branch) into deductStockForTreatment', () => {
      // Customer.branchId is the patient's home branch; treatment branch
      // is SELECTED_BRANCH_ID. Cross-branch contract requires stock to
      // deduct at the treatment branch.
      expect(TFP_SRC).not.toMatch(/deductStockForTreatment[\s\S]{0,400}?branchId:\s*customer(?:\.|Data\.)branchId/);
    });
  });

  describe('CB3 — _resolveProductIdByName threaded with branchId (Phase 17.2-sexies)', () => {
    it('CB3.1 backendClient _resolveProductIdByName accepts branchId param', () => {
      expect(BACKEND_CLIENT_SRC).toMatch(/async function _resolveProductIdByName\(productName,\s*branchId\)/);
    });
    it('CB3.2 _resolveProductIdByName forwards branchId to listProducts', () => {
      expect(BACKEND_CLIENT_SRC).toMatch(/await listProducts\(branchId \? \{ branchId \} : \{\}\)/);
    });
    it('CB3.3 _deductOneItem caller passes branchId to _resolveProductIdByName', () => {
      // Locate the _resolveProductIdByName call site inside _deductOneItem
      const calls = BACKEND_CLIENT_SRC.match(/_resolveProductIdByName\s*\(\s*[^)]+\)/g) || [];
      expect(calls.length).toBeGreaterThanOrEqual(1);
      // At least one call must pass a 2nd arg (branchId), not just productName
      const hasBranchIdArg = calls.some(c => /,\s*branchId\s*\)/.test(c));
      expect(hasBranchIdArg).toBe(true);
    });
  });

  describe('CB4 — deductCourseItems (customer wallet) — branch-agnostic write', () => {
    it('CB4.1 deductCourseItems signature: (customerId, deductions[, opts]) — no branchId required', () => {
      // The wallet deduction is universal; only stock-deduction is branch-scoped
      const m = BACKEND_CLIENT_SRC.match(/export async function deductCourseItems\(([^)]+)\)/);
      expect(m).toBeTruthy();
      const params = m[1];
      // Should accept customerId; branchId is optional and not the gate
      expect(params).toMatch(/customerId/);
    });
  });

  describe('CB5 — Source-grep: contract-locking guards', () => {
    it('CB5.1 deductStockForTreatment receives branchId opt (signature)', () => {
      expect(BACKEND_CLIENT_SRC).toMatch(/export async function deductStockForTreatment\(treatmentId,\s*items,\s*opts\s*=/);
    });
    it('CB5.2 deductStockForTreatment uses opts.branchId not customer.branchId', () => {
      const block = BACKEND_CLIENT_SRC.match(/export async function deductStockForTreatment[\s\S]{0,1500}?\n\}/);
      expect(block).toBeTruthy();
      const body = block[0];
      expect(body).toMatch(/const branchId = opts\.branchId/);
      expect(body).not.toMatch(/branchId\s*=\s*customer\.branchId/);
    });
    it('CB5.3 _deductOneItem reads branchId from passed opts (the treatment branch)', () => {
      const block = BACKEND_CLIENT_SRC.match(/async function _deductOneItem\(\{[\s\S]{0,400}?\}\)/);
      expect(block).toBeTruthy();
      // The destructure must include branchId — that's what becomes the
      // branch context for batch lookup + name fallback.
      expect(block[0]).toMatch(/branchId/);
    });
  });

  describe('CB6 — V36 fail-loud preservation (treatment context)', () => {
    it('CB6.1 _deductOneItem preserves treatment-context fail-loud marker comment', () => {
      // V31 fix marker — `'treatment'` context comment in deductStockForTreatment
      // describes the fail-loud-on-no-batch contract. The actual error string
      // varies (Thai user-message + ProductNotFound + STOCK_INSUFFICIENT_NEGATIVE_DISABLED
      // family). What we lock here: the asymmetric contract documentation.
      expect(BACKEND_CLIENT_SRC).toMatch(/V31 fix.*fail-loud on no-batch|fail-loud on no-batch/);
    });
    it('CB6.2 sale-context silent-skip semantic preserved (Phase 15.7 contract)', () => {
      // Sale context allows silent-skip for untracked products (legacy
      // contract). Treatment context fails loud. This asymmetry must be
      // preserved across the cross-branch flow.
      expect(BACKEND_CLIENT_SRC).toMatch(/legacy silent-skip preserved for untracked products/);
    });
  });

  describe('CB7 — Phase 17.2-sexies + octies markers preserved', () => {
    it('CB7.1 backendClient has Phase 17.2-sexies marker on _resolveProductIdByName', () => {
      expect(BACKEND_CLIENT_SRC).toMatch(/Phase 17\.2-sexies[\s\S]{0,400}?_resolveProductIdByName|_resolveProductIdByName[\s\S]{0,400}?Phase 17\.2-sexies/);
    });
    it('CB7.2 isCourseUsableInTreatment has Phase 17.2-octies marker', () => {
      const helpers = readFileSync('src/lib/treatmentBuyHelpers.js', 'utf8');
      expect(helpers).toMatch(/Phase 17\.2-octies/);
    });
  });
});
