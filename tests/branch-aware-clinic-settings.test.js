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
    const cs = { clinicName: 'Global', address: 'Global address', phone: '02-1', taxId: 'TAX-1', accentColor: '#dc2626' };
    const branch = { id: 'BR-1', name: 'Branch A', address: 'BA address', phone: '02-2', taxId: 'TAX-2', nameEn: 'Branch A EN' };
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.clinicName).toBe('Branch A');
    expect(out.clinicNameEn).toBe('Branch A EN');
    expect(out.address).toBe('BA address');
    expect(out.phone).toBe('02-2');
    expect(out.taxId).toBe('TAX-2');
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
    const cs = { clinicName: 'Global', address: 'Global address', phone: '02-1' };
    const branch = { name: 'Branch A', address: '', phone: '   ' }; // empty / whitespace
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.clinicName).toBe('Branch A');
    expect(out.address).toBe('Global address'); // empty branch → fallback
    expect(out.phone).toBe('02-1'); // whitespace branch → fallback
  });

  it('A.5 licenseNo + website also flow from branch', () => {
    const cs = {};
    const branch = { name: 'Branch', licenseNo: 'LIC-123', website: 'https://x.test' };
    const out = mergeBranchIntoClinic(cs, branch);
    expect(out.licenseNo).toBe('LIC-123');
    expect(out.website).toBe('https://x.test');
  });

  it('A.6 idempotent — running twice = same shape', () => {
    const cs = { clinicName: 'G', address: 'GA' };
    const branch = { name: 'B', address: 'BA' };
    const once = mergeBranchIntoClinic(cs, branch);
    const twice = mergeBranchIntoClinic(once, branch);
    expect(twice).toEqual(once);
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
    expect(saleTabSrc).toMatch(/\['เลขที่','ลูกค้า','วันที่','รายการขาย','ยอดรวม','สถานะ','จัดการ'\]/);
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

  it('C.4 ยอดรวม cell shows amount AND badge together (no XOR)', () => {
    // Anti-regression: must NOT have the OLD ternary that hid amount when source was set
    expect(saleTabSrc).not.toMatch(/sale\.source === 'treatment' \? <span[^>]+>จาก OPD<\/span>\s*: sale\.source === 'addRemaining'/);
    // NEW: amount is always rendered + badge appears as inline tag (use && conditional)
    expect(saleTabSrc).toMatch(/sale\.source === 'treatment' && \(/);
    expect(saleTabSrc).toMatch(/sale\.source === 'exchange' && \(/);
    expect(saleTabSrc).toMatch(/จาก OPD/);
    expect(saleTabSrc).toMatch(/เปลี่ยนสินค้า/);
    // Amount span exists alongside badges (always rendered)
    expect(saleTabSrc).toMatch(/<span>\{fmtMoney\(sale\.billing\?\.netTotal\)\}\s*฿<\/span>/);
  });
});
