// ─── Phase 14.10-bis — SaleTab Print receipt button integration ─────────
// User directive (2026-04-26):
//   "ในหน้า .../tab=sales ต้องสามารถ Gen ใบเสร็จได้ทุกรายการ เป็นใบเสร็จ/
//    ใบขาย แบบเดียวกันกับ หน้า .../tab=quotations"
//
// SP.A — SaleTab imports + state for SalePrintView
// SP.B — Print button on every sale row
// SP.C — SalePrintView modal renders when printingSale set
// SP.D — Anti-regression markers

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const saleTabFile = readFileSync(join(ROOT, 'src/components/backend/SaleTab.jsx'), 'utf8');
const quotationTabFile = readFileSync(join(ROOT, 'src/components/backend/QuotationTab.jsx'), 'utf8');

describe('SP.A — SaleTab imports + state for SalePrintView', () => {
  it('A.1 — imports SalePrintView (same component QuotationTab uses)', () => {
    expect(saleTabFile).toMatch(/import\s+SalePrintView\s+from\s+['"]\.\/SalePrintView\.jsx['"]/);
  });

  it('A.2 — imports Printer icon from lucide-react', () => {
    expect(saleTabFile).toMatch(/Printer[^}]*}\s*from\s*['"]lucide-react['"]/);
  });

  it('A.3 — declares printingSale state (matches QuotationTab printingSale pattern)', () => {
    expect(saleTabFile).toMatch(/const \[printingSale, setPrintingSale\]/);
  });

  it('A.4 — Phase 14.10-bis marker present (institutional memory)', () => {
    expect(saleTabFile).toMatch(/Phase 14\.10-bis/);
  });
});

describe('SP.B — Print button on every sale row', () => {
  it('B.1 — Print button uses Printer icon', () => {
    expect(saleTabFile).toMatch(/<Printer\s+size=\{13\}/);
  });

  it('B.2 — Print button onClick sets printingSale', () => {
    expect(saleTabFile).toMatch(/onClick=\{\(\)\s*=>\s*setPrintingSale\(sale\)/);
  });

  it('B.3 — Print button has data-testid for E2E (matches QuotationTab convention)', () => {
    expect(saleTabFile).toMatch(/data-testid=\{`saletab-print-/);
  });

  it('B.4 — Print button has Thai aria-label "พิมพ์ใบเสร็จ"', () => {
    expect(saleTabFile).toMatch(/aria-label="พิมพ์ใบเสร็จ"/);
  });

  it('B.5 — Print button shown for ALL sales (not gated by status)', () => {
    // The button block must NOT be inside a status condition like
    // `sale.status !== 'cancelled'` — it's available for every row.
    const block = saleTabFile.match(/data-testid=\{`saletab-print-[\s\S]*?<Printer[\s\S]*?<\/button>/)?.[0] || '';
    expect(block).not.toMatch(/sale\.status\s*!==\s*['"]cancelled['"]/);
    expect(block).not.toMatch(/sale\.payment\?\.status/);
  });

  it('B.6 — Print button positioned BETWEEN Eye and Edit3 buttons (consistent UI ordering)', () => {
    const eyeIdx = saleTabFile.indexOf('aria-label="ดูรายละเอียด"');
    const printIdx = saleTabFile.indexOf('aria-label="พิมพ์ใบเสร็จ"');
    const editIdx = saleTabFile.indexOf('aria-label="แก้ไข"');
    expect(eyeIdx).toBeGreaterThan(-1);
    expect(printIdx).toBeGreaterThan(-1);
    expect(editIdx).toBeGreaterThan(-1);
    expect(eyeIdx).toBeLessThan(printIdx);
    expect(printIdx).toBeLessThan(editIdx);
  });
});

describe('SP.C — SalePrintView modal renders', () => {
  it('C.1 — SalePrintView rendered when printingSale truthy', () => {
    expect(saleTabFile).toMatch(/{printingSale\s*&&\s*\(\s*<SalePrintView/);
  });

  it('C.2 — SalePrintView receives sale + clinicSettings + onClose props', () => {
    const block = saleTabFile.match(/<SalePrintView[\s\S]*?\/>/)?.[0] || '';
    expect(block).toContain('sale={printingSale}');
    expect(block).toContain('clinicSettings={clinicSettings}');
    expect(block).toContain('onClose={() => setPrintingSale(null)}');
  });

  it('C.3 — same prop contract as QuotationTab uses (Rule of 3)', () => {
    // QuotationTab pattern: <SalePrintView sale={printingSale} clinicSettings={clinicSettings} onClose={() => setPrintingSale(null)} />
    const qBlock = quotationTabFile.match(/<SalePrintView[\s\S]*?\/>/)?.[0] || '';
    const sBlock = saleTabFile.match(/<SalePrintView[\s\S]*?\/>/)?.[0] || '';
    expect(qBlock).toContain('sale={printingSale}');
    expect(sBlock).toContain('sale={printingSale}');
    expect(qBlock).toContain('onClose={() => setPrintingSale(null)}');
    expect(sBlock).toContain('onClose={() => setPrintingSale(null)}');
  });
});

describe('SP.D — Anti-regression', () => {
  it('D.1 — no duplicate <SalePrintView ... /> renders (single mount)', () => {
    const matches = saleTabFile.match(/<SalePrintView/g) || [];
    expect(matches.length).toBe(1);
  });

  it('D.2 — V31 lesson: this is wired via prop pattern, not by inventing a new print API', () => {
    // The fix reuses SalePrintView (existing) — no new SaleReceipt component
    // was created. Any future "I need a different sale receipt" → extend
    // SalePrintView, not branch.
    expect(saleTabFile).not.toMatch(/SaleReceipt(?!View)|SaleInvoice(?!View)/);
  });
});
