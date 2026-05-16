// tests/v81-fix5-customer-card-branch-name.test.js
//
// V81-fix5 (2026-05-17 EOD+2): Bug "หน้าข้อมูลลูกค้าขึ้นสาขามั่ว" regression bank.
//
// Root cause: CustomerCard rendered `customer.branchName || customer.branchId || ''`
// but customer doc has NO branchName field → fallback to raw BR-... id.
//
// Fix: parent (CustomerListTab) loads branches + builds Map<branchId, {id, name}>,
// passes as `branchesMap` prop to CustomerCard. Card resolves name via map.
//
// AV71 — Any UI surface displaying a customer's branch MUST resolve the name
// via a branch lookup map (or denormalized branchName), NEVER show raw branchId.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
function read(p) { return readFileSync(resolve(REPO_ROOT, p), 'utf8'); }

describe('V81-fix5 AV71 — CustomerCard resolves branchId → name via branchesMap', () => {
  const card = read('src/components/backend/CustomerCard.jsx');
  const list = read('src/components/backend/CustomerListTab.jsx');

  it('AV71.1 — CustomerCard accepts branchesMap prop', () => {
    expect(card).toMatch(/branchesMap/);
    // Should be in the destructured props (search the export default function signature area)
    expect(card).toMatch(/branchesMap,?\s*\n.*}\)\s*{/s);
  });

  it('AV71.2 — CustomerCard uses branchesMap.get(branchId)?.name as primary source', () => {
    expect(card).toMatch(/branchesMap\.get\(bid\)/);
    expect(card).toMatch(/found\?\.name|found\.name/);
  });

  it('AV71.3 — V81-fix4 marker comment present on branchName resolution', () => {
    expect(card).toMatch(/V81-fix4.*branches.*ม.*ว|V81-fix5/);
  });

  it('AV71.4 — CustomerListTab loads branches via listBranches', () => {
    expect(list).toMatch(/import\s+\{[^}]*listBranches[^}]*\}\s*from\s+['"][^'"]*scopedDataLayer/);
  });

  it('AV71.5 — CustomerListTab builds branchesMap state', () => {
    expect(list).toMatch(/setBranchesMap|branchesMap.*useState/);
  });

  it('AV71.6 — CustomerListTab fetches branches in parallel with customers (Promise.all)', () => {
    expect(list).toMatch(/Promise\.all\(\[[^\]]*getAllCustomers[^\]]*listBranches/s);
  });

  it('AV71.7 — listBranches called with allBranches:true (universal — not branch-scoped per BSA)', () => {
    expect(list).toMatch(/listBranches\(\s*\{\s*allBranches:\s*true\s*\}/);
  });

  it('AV71.8 — CustomerListTab passes branchesMap prop to every CustomerCard render', () => {
    expect(list).toMatch(/<CustomerCard[\s\S]*?branchesMap=\{branchesMap\}/);
  });

  it('AV71.9 — Defensive: branchesMap entries include both id-key AND branchId-key mappings (for legacy docs)', () => {
    expect(list).toMatch(/branchData/);
    // Should iterate branch list and add to map
    expect(list).toMatch(/map\.set\(b\.id/);
  });

  it('AV71.10 — Fallback chain preserved (branchesMap > branchName field > raw branchId)', () => {
    // Card still has the legacy chain as the LAST resort
    expect(card).toMatch(/customer\.branchName\s*\|\|\s*customer\.branchId/);
  });
});
