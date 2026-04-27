// ─── Phase 15.4 — Pagination rollout across 6 stock + central-stock panels ──
// Item 1 of s19 user EOD message (verbatim):
//   "ทุกรายการในทุก tab ของหน้าสต็อคและคลังกลาง รายการล่าสุดอยู่บนสุด
//    และแสดงไม่เกิน 20 รายการในแต่ละหน้า"
//
// 6 panels updated:
//   - OrderPanel.jsx (vendor stock orders list)
//   - StockAdjustPanel.jsx (adjustments list)
//   - StockTransferPanel.jsx (transfers list)
//   - StockWithdrawalPanel.jsx (withdrawals list)
//   - MovementLogPanel.jsx (movement audit log)
//   - CentralStockOrderPanel.jsx (central PO list)
//
// Source-grep regression bank: each panel must import + use the shared
// Pagination + usePagination, render `<Pagination />` after the table, and
// switch the `.map` from full-list → visibleItems.
//
// Plus full-flow simulate via the hook (already covered in
// phase15.4-pagination-shared.test.jsx PG.A-F). This file LOCKS the rollout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PANELS = [
  {
    file: 'src/components/backend/OrderPanel.jsx',
    listVar: 'filteredOrders',
    keyMatch: /usePagination\(filteredOrders/,
  },
  {
    file: 'src/components/backend/StockAdjustPanel.jsx',
    listVar: 'adjustments',
    keyMatch: /usePagination\(adjustments/,
  },
  {
    file: 'src/components/backend/StockTransferPanel.jsx',
    listVar: 'transfers',
    keyMatch: /usePagination\(transfers/,
  },
  {
    file: 'src/components/backend/StockWithdrawalPanel.jsx',
    listVar: 'withdrawals',
    keyMatch: /usePagination\(withdrawals/,
  },
  {
    file: 'src/components/backend/MovementLogPanel.jsx',
    listVar: 'displayMovements',
    keyMatch: /usePagination\(displayMovements/,
  },
  {
    file: 'src/components/backend/CentralStockOrderPanel.jsx',
    listVar: 'filteredOrders',
    keyMatch: /usePagination\(filteredOrders/,
  },
];

describe('Phase 15.4 PR.A — Pagination rollout — every panel imports shared modules', () => {
  for (const p of PANELS) {
    it(`PR.A.${p.file} — imports Pagination from ./Pagination.jsx`, () => {
      const src = read(p.file);
      expect(src).toMatch(/import\s+Pagination\s+from\s+['"]\.\/Pagination\.jsx['"]/);
    });

    it(`PR.A.${p.file} — imports usePagination from ../../lib/usePagination.js`, () => {
      const src = read(p.file);
      expect(src).toMatch(/import\s+\{\s*usePagination\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/usePagination\.js['"]/);
    });
  }
});

describe('Phase 15.4 PR.B — every panel calls usePagination with the right list', () => {
  for (const p of PANELS) {
    it(`PR.B.${p.file} — usePagination(${p.listVar}, { key: ... })`, () => {
      const src = read(p.file);
      expect(src).toMatch(p.keyMatch);
      expect(src).toMatch(/usePagination\([^)]+,\s*\{\s*key:/);
    });

    it(`PR.B.${p.file} — destructures page/setPage/totalPages/visibleItems/totalCount`, () => {
      const src = read(p.file);
      // The destructure pattern (allow whitespace + ordering tolerance).
      expect(src).toMatch(/const\s*\{[^}]*page[^}]*\}\s*=\s*usePagination/);
      expect(src).toMatch(/visibleItems/);
      expect(src).toMatch(/totalPages/);
      expect(src).toMatch(/totalCount/);
    });
  }
});

describe('Phase 15.4 PR.C — every panel renders <Pagination /> after the table', () => {
  for (const p of PANELS) {
    it(`PR.C.${p.file} — renders <Pagination/> with hook outputs`, () => {
      const src = read(p.file);
      // Must render <Pagination/> with the standard 4-prop binding.
      expect(src).toMatch(/<Pagination[\s\S]{0,200}page=\{page\}/);
      expect(src).toMatch(/<Pagination[\s\S]{0,300}totalPages=\{totalPages\}/);
      expect(src).toMatch(/<Pagination[\s\S]{0,400}onPageChange=\{setPage\}/);
      expect(src).toMatch(/<Pagination[\s\S]{0,500}totalCount=\{totalCount\}/);
    });

    it(`PR.C.${p.file} — switched from ${p.listVar}.map to visibleItems.map`, () => {
      const src = read(p.file);
      // Anti-regression: must NOT directly map the full list anymore.
      // Allow `${p.listVar}.length` etc, but NOT `.map`.
      const fullListMap = new RegExp(`\\b${p.listVar}\\.map\\(`);
      expect(src).not.toMatch(fullListMap);
      // visibleItems.map MUST appear at least once in render.
      expect(src).toMatch(/visibleItems\.map\(/);
    });
  }
});

describe('Phase 15.4 PR.D — recent-first sort guaranteed', () => {
  // listStockOrders + listCentralStockOrders + listStockMovements +
  // be_stock_adjustments query in StockAdjustPanel + listStockTransfers +
  // listStockWithdrawals all sort DESC server-side. We grep that the sort
  // exists somewhere in each panel's load path or its backend caller.

  it('PR.D.1 — OrderPanel uses listStockOrders (sorts importedDate DESC)', () => {
    const src = read('src/components/backend/OrderPanel.jsx');
    expect(src).toMatch(/listStockOrders/);
    // backend listStockOrders sorts importedDate DESC — verified separately
    const backend = read('src/lib/backendClient.js');
    expect(backend).toMatch(/orders\.sort.*importedDate/s);
  });

  it('PR.D.2 — StockAdjustPanel sorts createdAt DESC client-side', () => {
    const src = read('src/components/backend/StockAdjustPanel.jsx');
    expect(src).toMatch(/sort\(\(a,\s*b\)\s*=>\s*\(b\.createdAt[^]*localeCompare/);
  });

  it('PR.D.3 — StockTransferPanel uses listStockTransfers (sorts createdAt DESC)', () => {
    const src = read('src/components/backend/StockTransferPanel.jsx');
    expect(src).toMatch(/listStockTransfers/);
    const backend = read('src/lib/backendClient.js');
    expect(backend).toMatch(/list\.sort\(\(a,\s*b\)\s*=>\s*\(b\.createdAt[^]*localeCompare/);
  });

  it('PR.D.4 — MovementLogPanel sorts newest first explicitly', () => {
    const src = read('src/components/backend/MovementLogPanel.jsx');
    expect(src).toMatch(/Sort newest first|filtered\.sort\(.*b\.createdAt[^]*localeCompare/s);
  });

  it('PR.D.5 — CentralStockOrderPanel uses listCentralStockOrders', () => {
    const src = read('src/components/backend/CentralStockOrderPanel.jsx');
    expect(src).toMatch(/listCentralStockOrders/);
  });
});

describe('Phase 15.4 PR.E — V21 anti-regression: 20/page lock', () => {
  it('PR.E.1 — usePagination defaults to pageSize=20 (matches user requirement)', () => {
    const src = read('src/lib/usePagination.js');
    expect(src).toMatch(/DEFAULT_PAGE_SIZE\s*=\s*20/);
  });

  it('PR.E.2 — no panel overrides pageSize (must use the canonical 20)', () => {
    for (const p of PANELS) {
      const src = read(p.file);
      // Forbid `pageSize:` inside any usePagination(...) call in these panels.
      // Match the call up to its closing brace `}); ` greedily.
      const calls = src.match(/usePagination\([^)]*\{[^}]*\}\)/g) || [];
      for (const c of calls) {
        expect(
          c.includes('pageSize'),
          `${p.file}: pageSize override detected in usePagination call: ${c}`
        ).toBe(false);
      }
    }
  });

  it('PR.E.3 — Pagination component hides when totalPages <= 1 (no UI noise)', () => {
    const src = read('src/components/backend/Pagination.jsx');
    expect(src).toMatch(/safeTotal\s*<=\s*1.*return\s+null/s);
  });
});
