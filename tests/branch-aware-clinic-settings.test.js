// ─── Branch-aware clinic settings — 2026-04-28 ──────────────────────────────
//
// User report: "ในใบเสร็จและใบขายยังไม่มีที่อยู่คลินิก โดยให้ดึงข้อมูลมา
// จาก ข้อมูลของสาขา ในหน้า สาขา ของ Backend ของเรา"
// "เปลี่ยนให้ระบบ Gen PDF ของเราทั้งหมดดึงข้อมูลคลินิกจาก ข้อมูลของสาขา"
//
// Tests cover:
//   BAC.A — mergeBranchIntoClinic pure helper
//   BAC.B — print views import + use useEffectiveClinicSettings
//   BAC.C — SaleTab table — รายการขาย column + amount+badge inline

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mergeBranchIntoClinic } from '../src/lib/BranchContext.jsx';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const branchCtxSrc = read('src/lib/BranchContext.jsx');
const salePrintSrc = read('src/components/backend/SalePrintView.jsx');
const quotationPrintSrc = read('src/components/backend/QuotationPrintView.jsx');
const documentPrintModalSrc = read('src/components/backend/DocumentPrintModal.jsx');
const saleTabSrc = read('src/components/backend/SaleTab.jsx');

// ============================================================================
describe('BAC.A — mergeBranchIntoClinic pure helper', () => {
  it('A.1 returns clinicSettings unchanged when branch missing', () => {
    const cs = { clinicName: 'X', address: 'A', phone: '02', accentColor: '#dc2626' };
    expect(mergeBranchIntoClinic(cs, null)).toEqual(cs);
    expect(mergeBranchIntoClinic(cs, undefined)).toEqual(cs);
    expect(mergeBranchIntoClinic(cs, 'string')).toEqual(cs);
  });

  it('A.2 branch fields override clinicSettings (name/address/phone/taxId)', () => {
    const cs = { clinicName: 'Lover Clinic', address: 'Global address', phone: '02-1', taxId: 'TAX-1', accentColor: '#dc2626' };
    // V51 Phase 3 cleanup (2026-05-08): merger reads from branch.settings.X
    // (per-branch override layer); flat branch.X fallback removed. Fixture
    // uses the post-cleanup shape. clinicName + nameEn stay top-level.
    const branch = {
      id: 'BR-1',
      name: 'นครราชสีมา',
      nameEn: 'Korat',
      settings: {
        address: 'BA address',
        phone: '02-2',
        taxId: 'TAX-2',
      },
    };
    const out = mergeBranchIntoClinic(cs, branch);
    // 2026-04-28: clinicName CONCATS as "<brand> <branch>" (user directive)
    expect(out.clinicName).toBe('Lover Clinic นครราชสีมา');
    expect(out.clinicNameEn).toBe('Korat');
    expect(out.address).toBe('BA address');
    expect(out.phone).toBe('02-2');
    expect(out.taxId).toBe('TAX-2');
  });

  it('A.2-bis clinicName concat — brand-only when no branch.name', () => {
    const cs = { clinicName: 'Lover Clinic' };
    const branch = { id: 'BR-1', address: 'A' };
    expect(mergeBranchIntoClinic(cs, branch).clinicName).toBe('Lover Clinic');
  });

  it('A.2-tris clinicName concat — branch-only when no brand', () => {
    const cs = {};
    const branch = { name: 'นครราชสีมา' };
    expect(mergeBranchIntoClinic(cs, branch).clinicName).toBe('นครราชสีมา');
  });

  it('A.2-quater clinicName concat — single space separator', () => {
    const cs = { clinicName: 'Lover Clinic' };
    const branch = { name: 'นครราชสีมา' };
    expect(mergeBranchIntoClinic(cs, branch).clinicName).toBe('Lover Clinic นครราชสีมา');
    // Whitespace stripped before concat
    const cs2 = { clinicName: '  Lover Clinic  ' };
    const branch2 = { name: '  นครราชสีมา  ' };
    expect(mergeBranchIntoClinic(cs2, branch2).clinicName).toBe('Lover Clinic นครราชสีมา');
  });

  it('A.3 brand assets (accentColor / logo) keep coming from clinicSettings', () => {
    const cs = { clinicName: 'X', accentColor: '#dc2626', logoUrl: 'logo.png', logoUrlLight: 'light.png' };
    const branch = { name: 'Branch A' };
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.accentColor).toBe('#dc2626');
    expect(out.logoUrl).toBe('logo.png');
    expect(out.logoUrlLight).toBe('light.png');
  });

  it('A.4 empty branch field falls back to clinicSettings (defensive)', () => {
    const cs = { clinicName: 'Lover Clinic', address: 'Global address', phone: '02-1' };
    // V51 Phase 3 cleanup: per-branch overrides under branch.settings.X.
    const branch = { name: 'Branch A', settings: { address: '', phone: '   ' } }; // empty / whitespace
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.clinicName).toBe('Lover Clinic Branch A');
    expect(out.address).toBe('Global address'); // empty branch → fallback
    expect(out.phone).toBe('02-1'); // whitespace branch → fallback
  });

  it('A.5 licenseNo flows from branch.settings; website still flat (not migrated)', () => {
    const cs = {};
    // V51 Phase 3: licenseNo migrated under branch.settings; website remains
    // top-level on the branch doc (V40 baseline; not in Phase 3 migration set).
    const branch = { name: 'Branch', settings: { licenseNo: 'LIC-123' }, website: 'https://x.test' };
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.licenseNo).toBe('LIC-123');
    expect(out.website).toBe('https://x.test');
  });

  it('A.6 deterministic — same raw inputs always produce same output', () => {
    // 2026-04-28: clinicName CONCATS, so re-feeding the merged output
    // would double-concat. Determinism is on RAW inputs (always pass the
    // raw cs + branch to the helper, never the merged result).
    const cs = { clinicName: 'G', address: 'GA' };
    // V51 Phase 3: address now under branch.settings.address.
    const branch = { name: 'B', settings: { address: 'BA' } };
    const a = mergeBranchIntoClinic(cs, branch);
    const b = mergeBranchIntoClinic(cs, branch);
    expect(b).toEqual(a);
    expect(a.clinicName).toBe('G B');
  });
});

// ============================================================================
describe('BAC.B — print views use useEffectiveClinicSettings', () => {
  it('B.1 BranchContext exports useEffectiveClinicSettings hook', () => {
    expect(branchCtxSrc).toMatch(/export function useEffectiveClinicSettings/);
    expect(branchCtxSrc).toMatch(/mergeBranchIntoClinic/);
  });

  it('B.2 SalePrintView imports + uses useEffectiveClinicSettings', () => {
    expect(salePrintSrc).toMatch(/import\s*\{[^}]*useEffectiveClinicSettings[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
    expect(salePrintSrc).toMatch(/const clinic = useEffectiveClinicSettings\(clinicSettings\)/);
  });

  it('B.3 QuotationPrintView imports + uses useEffectiveClinicSettings', () => {
    expect(quotationPrintSrc).toMatch(/import\s*\{[^}]*useEffectiveClinicSettings[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
    expect(quotationPrintSrc).toMatch(/const clinic = useEffectiveClinicSettings\(clinicSettings\)/);
  });

  it('B.4 DocumentPrintModal imports + uses useEffectiveClinicSettings', () => {
    expect(documentPrintModalSrc).toMatch(/import\s*\{[^}]*useEffectiveClinicSettings[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
    expect(documentPrintModalSrc).toMatch(/useEffectiveClinicSettings\(rawClinicSettings\)/);
  });
});

// ============================================================================
describe('BAC.C — SaleTab table — รายการขาย column + amount+badge inline', () => {
  it('C.1 table header includes รายการขาย column', () => {
    // V21 fixup (2026-05-31 + 2026-06-01): header now 8-col — added 'ยอดชำระจริง'
    // and renamed 'ยอดรวม'→'ยอดสุทธิ'.
    expect(saleTabSrc).toMatch(/\['เลขที่','ลูกค้า','วันที่','รายการขาย','ยอดสุทธิ','ยอดชำระจริง','สถานะ','จัดการ'\]/);
  });

  it('C.2 imports formatOrderItemsSummary helper', () => {
    expect(saleTabSrc).toMatch(/import\s*\{\s*formatOrderItemsSummary\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/orderItemsSummary\.js['"]/);
  });

  it('C.3 flattenSaleItemsForSummary helper handles grouped items shape', () => {
    expect(saleTabSrc).toMatch(/function flattenSaleItemsForSummary\(sale\)/);
    expect(saleTabSrc).toMatch(/items\.promotions/);
    expect(saleTabSrc).toMatch(/items\.courses/);
    expect(saleTabSrc).toMatch(/items\.products/);
    expect(saleTabSrc).toMatch(/items\.medications/);
  });

  it('C.3-bis รายการขาย uses NEW SaleItemsCell component (redesign)', () => {
    // 2026-04-28: redesigned cell — colored category dots + compact stack +
    // +N counter + tooltip. Replaces plain-text formatOrderItemsSummary
    // output (user reported "ลายตาและอ่านยากมาก").
    expect(saleTabSrc).toMatch(/function SaleItemsCell\(/);
    expect(saleTabSrc).toMatch(/<SaleItemsCell items=\{flattenSaleItemsForSummary/);
    // Category visual config exists
    expect(saleTabSrc).toMatch(/CATEGORY_VISUAL\s*=\s*\{[\s\S]+?promotion[\s\S]+?course[\s\S]+?product[\s\S]+?medication/);
    // Helper now returns category per item
    expect(saleTabSrc).toMatch(/category:\s*['"]promotion['"]/);
    expect(saleTabSrc).toMatch(/category:\s*['"]course['"]/);
    expect(saleTabSrc).toMatch(/category:\s*['"]product['"]/);
    expect(saleTabSrc).toMatch(/category:\s*['"]medication['"]/);
  });

  it('C.4 money cell is clean nowrap; source badge moved to SaleSourceTag (2026-06-01 redesign)', () => {
    // V21 fixup: the 2026-06-01 redesign moved the source badge OUT of the money
    // column into รายการขาย via <SaleSourceTag/>; the net amount is now a clean
    // single-line nowrap td (no inline badge / flex-wrap).
    expect(saleTabSrc).not.toMatch(/sale\.source === 'treatment' && \(/);            // badges no longer inline in money cell
    expect(saleTabSrc).not.toMatch(/justify-end gap-1\.5 flex-wrap/);                // old money-cell flex-wrap gone
    expect(saleTabSrc).toContain('<SaleSourceTag source={sale.source}');             // moved to รายการขาย
    expect(saleTabSrc).toMatch(/fmtMoney\(sale\.billing\?\.netTotal\)\}\s*฿<\/td>/);  // clean nowrap td (no <span> wrapper)
  });
});
