// Task 4 (2026-05-31) — source-grep regression for the SaleTab ยอดชำระจริง column
// + rename + 30/page pagination wiring. Locks the cosmetic-shell contract so a
// future edit can't silently drop the column / rename / helper / pager (V21 guard).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'src/components/backend/SaleTab.jsx'), 'utf8');
// the table-header array line (anchor: starts with 'เลขที่' and ends with 'จัดการ')
const HEADER = SRC.match(/\[\s*'เลขที่'[^\]]*'จัดการ'\s*\]/)?.[0] || '';

describe('SaleTab paid-column + rename wiring', () => {
  it('header has ยอดสุทธิ + ยอดชำระจริง, no ยอดรวม (in the header array)', () => {
    expect(HEADER).toContain("'ยอดสุทธิ'");
    expect(HEADER).toContain("'ยอดชำระจริง'");
    expect(HEADER).not.toContain("'ยอดรวม'");
  });
  it('imports the resolvers from financeUtils', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*resolveSalePaidAmount[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/financeUtils\.js'/);
    expect(SRC).toContain('resolveSalePaidTone');
    expect(SRC).toContain('resolveSaleOutstanding');
  });
  it('new cell uses helper + tone classes (both themes)', () => {
    expect(SRC).toContain('resolveSalePaidAmount(sale)');
    expect(SRC).toContain('resolveSalePaidTone(');
    expect(SRC).toMatch(/text-emerald-400/); expect(SRC).toMatch(/text-emerald-700/);
    expect(SRC).toMatch(/text-amber-400/);   expect(SRC).toMatch(/text-amber-700/);
    expect(SRC).toMatch(/text-gray-500/);    expect(SRC).toMatch(/text-slate-400/);
  });
  it('pay-modal uses resolveSaleOutstanding (inline channel-reduce gone)', () => {
    expect(SRC).toContain('resolveSaleOutstanding(payModal)');
    expect(SRC).not.toMatch(/payModal\.payment\?\.channels\|\|\[\]\)\.reduce/);
  });
});

describe('SaleTab pagination wiring', () => {
  it('usePagination at pageSize 30 + Pagination imported/rendered', () => {
    expect(SRC).toMatch(/import\s+Pagination\s+from\s+'\.\/Pagination\.jsx'/);
    expect(SRC).toMatch(/usePagination\(filtered,\s*\{\s*pageSize:\s*30/);
    expect(SRC).toContain('visibleItems.map(');
    expect(SRC).toMatch(/<Pagination\b/);
  });
  it('page key resets on subTab/search/status/branch', () => {
    expect(SRC).toMatch(/_pageKey\s*=\s*`\$\{subTab\}\|\$\{filterQuery\}\|\$\{filterStatus\}\|\$\{BRANCH_ID\}`/);
  });
  it('table render no longer maps filtered directly', () => {
    expect(SRC).not.toContain('filtered.map(');
  });
});
