// ─── Phase 24.0-vicies-novies-septies — catalog tabs use allBranches:true ──
//
// User report (2026-05-07, after Phase 24.0-vicies-novies-sexies branch
// switch to พระราม 3): "ตอนนี้ กดลบสินค้า และลบคอร์ส สาขาพระราม 3 ไม่ได้
// แก้ก่อน แล้วดูว่าเป็นที่อะไร แล้วตรงไหนที่อื่นจะเป็นแบบนี้อีกไหม".
//
// Root cause:
//   1. master-data migrate mappers (mapMasterToProduct / mapMasterToCourse /
//      mapMasterToDfGroup / mapMasterToMedicalInstrument / etc.) DON'T stamp
//      `branchId` on the migrated be_* doc.
//   2. Catalog Tab UIs (ProductsTab, CoursesTab, DfGroupsTab, etc.) called
//      `listX({ branchId: selectedBranchId })` — Firestore where('branchId',
//      '==', X) — items with no branchId field never match → empty list →
//      admin can't see + click delete.
//
// Fix: switch the 6 catalog tabs to `{ allBranches: true }` so the catalog
// is visible across every branch context. Catalog is logically clinic-wide
// (single ProClinic feed); branch dimension is for transactional data
// (sales, treatments, stock) which IS branch-stamped at write time.
//
// Sweep coverage (6 tabs):
//   ProductsTab, CoursesTab, DfGroupsTab,
//   MedicalInstrumentsTab, ProductUnitsTab, ProductGroupsTab
//
// NOT in this sweep (already correct):
//   - Voucher/Coupon/Promotion tabs use OR-merge `allBranches:true` doc-field
//   - FinanceMasterTab BankAccounts/ExpenseCategories — admin-CRUD, branchId
//     stamped at saveX time, correctly per-branch
//   - HolidaysTab uses listenToHolidays via useBranchAwareListener (live
//     listener pattern; same root cause if migrate mapper doesn't stamp
//     branchId, but lower priority — defer until user reports)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');

const TABS = Object.freeze([
  {
    file: 'src/components/backend/ProductsTab.jsx',
    listFn: 'listProducts',
    label: 'Products',
  },
  {
    file: 'src/components/backend/CoursesTab.jsx',
    listFn: 'listCourses',
    label: 'Courses',
  },
  {
    file: 'src/components/backend/DfGroupsTab.jsx',
    listFn: 'listDfGroups',
    label: 'DfGroups',
  },
  {
    file: 'src/components/backend/MedicalInstrumentsTab.jsx',
    listFn: 'listMedicalInstruments',
    label: 'MedicalInstruments',
  },
  {
    file: 'src/components/backend/ProductUnitsTab.jsx',
    listFn: 'listProductUnitGroups',
    label: 'ProductUnits',
  },
  {
    file: 'src/components/backend/ProductGroupsTab.jsx',
    listFn: 'listProductGroups',
    label: 'ProductGroups',
  },
]);

describe('Phase 24.0-vicies-novies-septies — A: each catalog tab uses allBranches:true', () => {
  for (const tab of TABS) {
    it(`VNS.A.${tab.label} — ${tab.file} calls ${tab.listFn}({ allBranches: true })`, () => {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      // Must use allBranches:true on the list call
      expect(src).toMatch(
        new RegExp(`${tab.listFn}\\(\\s*\\{\\s*allBranches:\\s*true\\s*\\}`),
      );
    });
  }
});

describe('Phase 24.0-vicies-novies-septies — B: anti-regression (no branchId:selectedBranchId on these tabs)', () => {
  for (const tab of TABS) {
    it(`VNS.B.${tab.label} — ${tab.file} does NOT use branchId:selectedBranchId for the catalog list`, () => {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      // The specific listFn must NOT be called with branchId:selectedBranchId
      expect(src).not.toMatch(
        new RegExp(`${tab.listFn}\\(\\s*\\{\\s*branchId:\\s*selectedBranchId`),
      );
    });
  }
});

describe('Phase 24.0-vicies-novies-septies — C: audit-branch-scope annotation present', () => {
  for (const tab of TABS) {
    it(`VNS.C.${tab.label} — ${tab.file} has audit-branch-scope BS-1 catalog-global annotation`, () => {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      expect(src).toMatch(/audit-branch-scope:\s*BS-1\s+catalog-global/);
    });
  }
});

describe('Phase 24.0-vicies-novies-septies — D: explanatory comment cites user report', () => {
  // At least one tab carries the user's verbatim report so future devs see
  // WHY the change happened (V21 anti-regression-comment pattern).
  it('VNS.D.1 — at least one tab cites user report verbatim', () => {
    let found = false;
    for (const tab of TABS) {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      if (/กดลบ.*สาขาพระราม 3 ไม่ได้/.test(src)) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('VNS.D.2 — Phase 24.0-vicies-novies-septies marker present in each touched tab', () => {
    for (const tab of TABS) {
      const src = fs.readFileSync(path.join(ROOT, tab.file), 'utf8');
      expect(src).toMatch(/Phase 24\.0-vicies-novies-septies/);
    }
  });
});

describe('Phase 24.0-vicies-novies-septies — E: NOT-in-sweep tabs unchanged (intentional)', () => {
  // Voucher / Coupon / Promotion tabs use a different OR-merge pattern (with
  // allBranches:true doc-field on each item). They should KEEP using
  // {branchId:selectedBranchId} because the OR-merge is in the lib helper.
  // Same for marketing-CRUD-style tabs.
  it('VNS.E.1 — VoucherTab still uses branchId-aware filter (OR-merge pattern in lib)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/components/backend/VoucherTab.jsx'),
      'utf8',
    );
    // Voucher tab must KEEP its branch-aware filter — different pattern
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('VNS.E.2 — FinanceMasterTab BankAccounts + ExpenseCategories keep per-branch filter', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/components/backend/FinanceMasterTab.jsx'),
      'utf8',
    );
    // Bank accounts + expense categories ARE branch-scoped (admin creates
    // per branch via CRUD; saveX stamps branchId). Keep filter as-is.
    expect(src).toMatch(/listBankAccounts\(\s*\{\s*branchId:\s*selectedBranchId/);
    expect(src).toMatch(/listExpenseCategories\(\s*\{\s*branchId:\s*selectedBranchId/);
  });

  it('VNS.E.3 — Transactional tabs (Quotation/VendorSales/OnlineSales/etc.) keep per-branch filter', () => {
    // Sanity check — they should NOT have been touched
    const transactionalFiles = [
      'QuotationTab.jsx',
      'VendorSalesTab.jsx',
      'OnlineSalesTab.jsx',
      'SaleInsuranceClaimsTab.jsx',
    ];
    for (const f of transactionalFiles) {
      const fullPath = path.join(ROOT, 'src/components/backend', f);
      if (!fs.existsSync(fullPath)) continue;
      const src = fs.readFileSync(fullPath, 'utf8');
      // Each should still filter by branchId (transactional = correctly per-branch)
      expect(src).toMatch(/branchId:\s*selectedBranchId/);
    }
  });
});
