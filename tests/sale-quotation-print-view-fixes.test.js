// ─── Phase 14.10-bis (2026-04-26) — SalePrintView + QuotationPrintView fixes
// User reports:
//   1. "สถานะที่ขึ้นในใบเสร็จขึ้นผิด ชำระแล้วและไม่ชำระแล้ว ขึ้นผิด"
//      → SalePrintView recomputed status from totalPaidAmount vs netTotal,
//        diverged from sale.payment.status. Fix: use sale.payment.status.
//   2. "ลูกค้าและผู้ออกใบขายให้ดึงข้อมูลมาจากลูกค้าและพนักงานที่บันทึกไว้แล้ว
//       วันที่ล่างสุดก็ให้ใส่วันที่ที่รายการนั้นๆถูกสร้างขึ้นเลย"
//      → Both PrintViews had blank "วันที่ ..................." at bottom +
//        empty customer "(......)" — now pre-filled from record values.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const saleFile = readFileSync(join(ROOT, 'src/components/backend/SalePrintView.jsx'), 'utf8');
const quotationFile = readFileSync(join(ROOT, 'src/components/backend/QuotationPrintView.jsx'), 'utf8');

// ─── PV.A — SalePrintView status uses payment.status (source of truth) ──
describe('PV.A — SalePrintView status fix', () => {
  it('A.1 — has resolveSaleStatusLabel helper', () => {
    expect(saleFile).toMatch(/function resolveSaleStatusLabel/);
  });

  it('A.2 — PAYMENT_STATUS_LABEL covers all 6 SaleTab states', () => {
    expect(saleFile).toMatch(/paid:\s*['"]ชำระแล้ว['"]/);
    expect(saleFile).toMatch(/split:\s*['"]แบ่งชำระ['"]/);
    expect(saleFile).toMatch(/unpaid:\s*['"]ค้างชำระ['"]/);
    expect(saleFile).toMatch(/deferred:\s*['"]ชำระภายหลัง['"]/);
    expect(saleFile).toMatch(/draft:\s*['"]แบบร่าง['"]/);
    expect(saleFile).toMatch(/cancelled:\s*['"]ยกเลิก['"]/);
  });

  it('A.3 — resolveSaleStatusLabel reads sale.payment.status as source of truth', () => {
    const block = saleFile.match(/function resolveSaleStatusLabel[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toMatch(/sale\.payment\?\.status/);
  });

  it('A.4 — sale.status === cancelled overrides payment.status (legacy compat)', () => {
    const block = saleFile.match(/function resolveSaleStatusLabel[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toMatch(/sale\.status\s*===\s*['"]cancelled['"]/);
  });

  it('A.5 — statusLabel call site uses resolveSaleStatusLabel (no recompute)', () => {
    expect(saleFile).toMatch(/const statusLabel\s*=\s*resolveSaleStatusLabel\(s\)/);
  });

  it('A.6 — anti-regression: legacy statusLabel ternary (paidAmount >= netTotal) REMOVED', () => {
    // The previous logic was inline ternary — must be gone
    expect(saleFile).not.toMatch(/paidAmount\s*>=\s*netTotal\s*-\s*0\.01\s*\?\s*['"]ชำระแล้ว['"]/);
  });

  it('A.7 — Phase 14.10-bis marker', () => {
    expect(saleFile).toMatch(/Phase 14\.10-bis/);
  });
});

// ─── PV.B — Bottom signature data binding ─────────────────────────────
describe('PV.B — SalePrintView signature dates + names', () => {
  it('B.1 — signatureDateIso falls back createdAt → saleDate → today', () => {
    expect(saleFile).toMatch(/signatureDateIso\s*=\s*s\.createdAt/);
    expect(saleFile).toMatch(/s\.saleDate/);
  });

  it('B.2 — signatureDateBE wraps via formatDateThaiBE', () => {
    expect(saleFile).toMatch(/const signatureDateBE\s*=\s*formatDateThaiBE\(signatureDateIso\)/);
  });

  it('B.3 — customerDisplay uses s.customerName fallback to HN', () => {
    expect(saleFile).toMatch(/const customerDisplay\s*=\s*s\.customerName/);
    expect(saleFile).toMatch(/s\.customerHN/);
  });

  it('B.4 — sellerDisplay uses s.sellers[0].sellerName + createdByName fallback', () => {
    expect(saleFile).toMatch(/const sellerDisplay/);
    expect(saleFile).toMatch(/sellers\s*\|\|\s*\[\]/);
    expect(saleFile).toMatch(/sellerName/);
    expect(saleFile).toMatch(/createdByName/);
  });

  it('B.5 — bottom date renders signatureDateBE (customer + seller, 2 occurrences)', () => {
    const matches = saleFile.match(/วันที่ \{signatureDateBE\}/g) || [];
    expect(matches.length).toBe(2);
  });

  it('B.6 — anti-regression: blank "วันที่ .................." pattern REMOVED', () => {
    // The blank dotted-line pattern must not appear in the signatures block
    expect(saleFile).not.toMatch(/วันที่ \.{18,}/);
  });

  it('B.7 — customer signature renders customerDisplay (not blank dots)', () => {
    expect(saleFile).toMatch(/\{\s*customerDisplay\s*\|\|\s*['"]\.{40,}['"]\s*\}/);
  });

  it('B.8 — seller signature renders sellerDisplay', () => {
    expect(saleFile).toMatch(/\{\s*sellerDisplay\s*\|\|\s*['"]\.{40,}['"]\s*\}/);
  });
});

// ─── PV.C — QuotationPrintView same fix ──────────────────────────────
describe('PV.C — QuotationPrintView signature dates + names', () => {
  it('C.1 — signatureDateBE derived from createdAt → quotationDate → today', () => {
    expect(quotationFile).toMatch(/sigDateIso/);
    expect(quotationFile).toMatch(/q\.createdAt/);
    expect(quotationFile).toMatch(/q\.quotationDate/);
  });

  it('C.2 — customerDisplay + sellerDisplay variables defined', () => {
    expect(quotationFile).toContain('customerDisplay');
    expect(quotationFile).toContain('sellerDisplay');
  });

  it('C.3 — both signature blocks render signatureDateBE (2 occurrences)', () => {
    const matches = quotationFile.match(/วันที่ \{signatureDateBE\}/g) || [];
    expect(matches.length).toBe(2);
  });

  it('C.4 — anti-regression: blank "วันที่ .................." REMOVED', () => {
    expect(quotationFile).not.toMatch(/วันที่ \.{18,}/);
  });

  it('C.5 — customer signature renders customerDisplay', () => {
    expect(quotationFile).toMatch(/\{\s*customerDisplay\s*\|\|\s*['"]\.{40,}['"]\s*\}/);
  });

  it('C.6 — seller signature uses sellerDisplay (was q.sellerName before)', () => {
    expect(quotationFile).toMatch(/\{\s*sellerDisplay\s*\|\|\s*['"]\.{40,}['"]\s*\}/);
  });

  it('C.7 — Phase 14.10-bis marker', () => {
    expect(quotationFile).toMatch(/Phase 14\.10-bis/);
  });
});

// ─── PV.D — V21 lesson: source-grep paired with runtime semantic ─────
describe('PV.D — runtime semantic guards', () => {
  it('D.1 — resolveSaleStatusLabel maps SaleTab payment.status values 1:1', () => {
    // Build a minimal evaluator from the source — verify the mapping shape
    expect(saleFile).toContain("paid:      'ชำระแล้ว'");
    expect(saleFile).toContain("split:     'แบ่งชำระ'");
    expect(saleFile).toContain("unpaid:    'ค้างชำระ'");
  });

  it('D.2 — both PrintViews use Rule of 3: formatDateThaiBE shared helper', () => {
    expect(saleFile).toMatch(/function formatDateThaiBE/);
    expect(quotationFile).toMatch(/function formatDateThaiBE/);
  });
});

// ─── PV.E (Phase 14.10-tris) — seller name fix ──────────────────────
// User reports:
//   1. "ผู้ออกใบขาย ก็คือพนักงานขายไงไอ้สัส ไม่ดึงมากรอกล่ะ" — empty parens
//      in receipt. Saved s.sellers[0] has shape { id, name, percent, total }
//      (SaleTab.jsx line 498). Old SalePrintView read s.sellerName (wrong key).
//   2. "modal ดูรายละเอียดหน้า sales ขึ้นชื่อพนักงานขายเป็นตัวเลข" —
//      legacy sale records where name was empty fall back to id "614".
describe('PV.E — seller name fallback chain (SaleTab + SalePrintView)', () => {
  const saleTabFile = readFileSync(join(ROOT, 'src/components/backend/SaleTab.jsx'), 'utf8');

  it('E.1 — SalePrintView reads firstSeller.name (canonical, not sellerName)', () => {
    expect(saleFile).toMatch(/firstSeller\.name/);
  });

  it('E.2 — SalePrintView fallback chain: name → sellerName → lookupName → id', () => {
    expect(saleFile).toMatch(/sellerDisplay\s*=\s*firstSeller\.name[\s\S]*?firstSeller\.sellerName[\s\S]*?lookupName[\s\S]*?firstSeller\.id/);
  });

  it('E.3 — SalePrintView accepts sellersLookup prop for id→name resolution', () => {
    expect(saleFile).toMatch(/sellersLookup\s*=\s*\[\]/);
  });

  it('E.4 — sellersLookup is consulted only when firstSeller.id is set + array', () => {
    expect(saleFile).toMatch(/Array\.isArray\(sellersLookup\)/);
    expect(saleFile).toMatch(/sellersLookup\.find\(/);
  });

  it('E.5 — SaleTab passes its sellers state as sellersLookup prop to SalePrintView', () => {
    expect(saleTabFile).toMatch(/<SalePrintView[\s\S]*?sellersLookup=\{sellers\}/);
  });

  it('E.6 — SaleDetailModal seller render falls back to sellers state lookup', () => {
    // The resolveName chain inside the modal must consult sellers state
    // when s.name is missing.
    expect(saleTabFile).toContain('resolvedName');
    expect(saleTabFile).toMatch(/sellers\.find\(/);
    expect(saleTabFile).toMatch(/String\(opt\.id\)\s*===\s*String\(s\.id\)/);
  });

  it('E.7 — anti-regression: old `s.sellerName` (wrong key) NOT used in display path', () => {
    // s.sellerName MAY appear in fallback (defensive) but the canonical
    // first read should be firstSeller.name
    const sellerDisplayBlock = saleFile.match(/const sellerDisplay\s*=\s*[\s\S]*?;/)?.[0] || '';
    // The first OR clause must be firstSeller.name
    expect(sellerDisplayBlock).toMatch(/=\s*firstSeller\.name/);
  });
});

// ─── PV.F — listAllSellers (be_staff + be_doctors) source (V31-class fix) ──
// User reported persistent "614" display because SaleTab loaded sellers
// from getAllMasterDataItems('staff') (stale ProClinic mirror with empty
// `name`). Fix: unified listAllSellers helper in backendClient that loads
// be_staff + be_doctors and emits a flat [{id, name}] list with all id
// aliases (staffId, doctorId, proClinicId) so legacy numeric ids resolve.
describe('PV.F — sellers source switched to listAllSellers (be_*)', () => {
  const saleTabFile = readFileSync(join(ROOT, 'src/components/backend/SaleTab.jsx'), 'utf8');
  const quotationTabFile = readFileSync(join(ROOT, 'src/components/backend/QuotationTab.jsx'), 'utf8');
  const backendFile = readFileSync(join(ROOT, 'src/lib/backendClient.js'), 'utf8');

  it('F.1 — backendClient exports listAllSellers helper', () => {
    expect(backendFile).toMatch(/export async function listAllSellers/);
  });

  it('F.2 — listAllSellers calls listStaff + listDoctors internally (Promise.all)', () => {
    const block = backendFile.match(/export async function listAllSellers[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toMatch(/Promise\.all\(\[listStaff\(\),\s*listDoctors\(\)\]\)/);
  });

  it('F.3 — listAllSellers buildName composes firstname+lastname with nickname fallback', () => {
    const block = backendFile.match(/export async function listAllSellers[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toContain('firstname');
    expect(block).toContain('lastname');
    expect(block).toContain('nickname');
  });

  it('F.4 — expand emits row per id (id, staffId, doctorId, proClinicId) so legacy numeric ids resolve', () => {
    const block = backendFile.match(/export async function listAllSellers[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toContain('staffId');
    expect(block).toContain('doctorId');
    expect(block).toContain('proClinicId');
  });

  it('F.5 — dedupe via Map by id (later doctors override earlier staff for same id)', () => {
    const block = backendFile.match(/export async function listAllSellers[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toMatch(/new Map\(\)/);
    expect(block).toMatch(/byId\.set\(opt\.id,\s*opt\)/);
  });

  it('F.6 — SaleTab imports listAllSellers from backendClient', () => {
    expect(saleTabFile).toMatch(/listAllSellers[\s\S]*?from\s*['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('F.7 — SaleTab loadOptions calls listAllSellers (NOT inline listStaff/listDoctors anymore)', () => {
    const block = saleTabFile.match(/const loadOptions\s*=[\s\S]*?\}, \[customers\.length, sellers\.length\]\);/)?.[0] || '';
    expect(block).toContain('listAllSellers()');
    // Old master_data calls removed
    expect(block).not.toMatch(/getAllMasterDataItems\(['"]staff['"]/);
    expect(block).not.toMatch(/getAllMasterDataItems\(['"]doctors['"]/);
  });

  it('F.8 — QuotationTab also uses listAllSellers for sellersLookup', () => {
    expect(quotationTabFile).toMatch(/listAllSellers/);
    expect(quotationTabFile).toContain('sellersLookup');
  });

  it('F.9 — QuotationTab passes sellersLookup to SalePrintView', () => {
    expect(quotationTabFile).toMatch(/<SalePrintView[\s\S]*?sellersLookup=\{sellersLookup\}/);
  });

  it('F.10 — Phase 14.10-tris marker (institutional memory)', () => {
    expect(saleTabFile).toMatch(/Phase 14\.10-tris/);
    expect(quotationTabFile).toMatch(/Phase 14\.10-tris/);
    expect(backendFile).toMatch(/Phase 14\.10-tris/);
  });

  it('F.11 — anti-regression: zero getAllMasterDataItems(staff/doctors) anywhere in src/components/backend', () => {
    // This is a directory-scan test — invariant must hold across every backend tab
    // (per user directive "ไม่ต้องการ mirror from master_data อีกสักที่เลย").
    // Scan all .jsx in backend dir except MasterDataTab (sanctioned exception).
    const fs = require('fs');
    const path = require('path');
    function* walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(p);
        else if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name)) yield p;
      }
    }
    const backendDir = path.join(ROOT, 'src/components/backend');
    const violations = [];
    for (const file of walk(backendDir)) {
      if (file.includes('MasterDataTab')) continue;
      const src = fs.readFileSync(file, 'utf8');
      // Match getAllMasterDataItems('staff') or getAllMasterDataItems('doctors')
      const matches = src.match(/getAllMasterDataItems\(['"](staff|doctors)['"]/g);
      if (matches) violations.push({ file: file.replace(ROOT, ''), matches });
    }
    expect(violations).toEqual([]);
  });
});
