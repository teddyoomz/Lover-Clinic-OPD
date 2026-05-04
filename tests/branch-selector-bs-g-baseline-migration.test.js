// ─── BS-G — /api/admin/customer-branch-baseline endpoint + UI section ───
// Pure helper test for findUntaggedCustomers + source-grep guards on
// the endpoint structure (admin gate, two-phase action contract, audit
// emission) + MasterDataTab's CustomerBranchBaselinePanel wiring.
//
// Endpoint runs server-side via firebase-admin SDK (mirrors
// cleanup-orphan-stock.js shape). Tests focus on the pure helper +
// the source-grep contract; integration runs via preview_eval after
// deploy.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { findUntaggedCustomers } from '../api/admin/customer-branch-baseline.js';

const endpointSrc = readFileSync(
  resolve(__dirname, '../api/admin/customer-branch-baseline.js'),
  'utf-8',
);
const masterDataSrc = readFileSync(
  resolve(__dirname, '../src/components/backend/MasterDataTab.jsx'),
  'utf-8',
);
const clientSrc = readFileSync(
  resolve(__dirname, '../src/lib/customerBranchBaselineClient.js'),
  'utf-8',
);

describe('BS-G.1 — findUntaggedCustomers (pure helper)', () => {
  it('splits customers with empty/missing branchId into untagged', () => {
    const customers = [
      { id: 'C1' },                                       // missing — untagged
      { id: 'C2', branchId: '' },                         // empty   — untagged
      { id: 'C3', branchId: '   ' },                      // whitespace — untagged
      { id: 'C4', branchId: 'BR-A' },                     // tagged
      { id: 'C5', branchId: 'BR-B' },                     // tagged
    ];
    const { untagged, tagged, total } = findUntaggedCustomers(customers);
    expect(untagged.map(c => c.id).sort()).toEqual(['C1', 'C2', 'C3']);
    expect(tagged.map(c => c.id).sort()).toEqual(['C4', 'C5']);
    expect(total).toBe(5);
  });

  it('handles non-array input', () => {
    expect(findUntaggedCustomers(null).total).toBe(0);
    expect(findUntaggedCustomers(undefined).untagged).toEqual([]);
    expect(findUntaggedCustomers('not-array').tagged).toEqual([]);
  });

  it('skips falsy entries defensively', () => {
    const customers = [{ id: 'C1', branchId: '' }, null, undefined, { id: 'C2', branchId: 'BR-A' }];
    const { untagged, tagged } = findUntaggedCustomers(customers);
    expect(untagged.map(c => c.id)).toEqual(['C1']);
    expect(tagged.map(c => c.id)).toEqual(['C2']);
  });

  it('treats non-string branchId as untagged', () => {
    const customers = [
      { id: 'C1', branchId: null },
      { id: 'C2', branchId: undefined },
      { id: 'C3', branchId: 0 },
      { id: 'C4', branchId: 'BR-A' },
    ];
    const { untagged } = findUntaggedCustomers(customers);
    expect(untagged.map(c => c.id).sort()).toEqual(['C1', 'C2', 'C3']);
  });
});

describe('BS-G.2 — Endpoint structure', () => {
  it('uses verifyAdminToken admin gate', () => {
    expect(endpointSrc).toMatch(/import\s+\{\s*verifyAdminToken\s*\}\s+from\s+['"][^'"]*adminAuth/);
    expect(endpointSrc).toMatch(/await\s+verifyAdminToken\(req,\s*res\)/);
  });

  it('supports two actions: list (DRY-RUN) and apply', () => {
    expect(endpointSrc).toMatch(/action\s*===\s*['"]list['"]/);
    expect(endpointSrc).toMatch(/action\s*===\s*['"]apply['"]/);
  });

  it('list action returns dryRun:true + untagged + total', () => {
    const listIdx = endpointSrc.indexOf("action === 'list'");
    expect(listIdx).toBeGreaterThan(0);
    const listBlock = endpointSrc.slice(listIdx, listIdx + 1500);
    expect(listBlock).toMatch(/dryRun:\s*true/);
    expect(listBlock).toMatch(/findUntaggedCustomers/);
  });

  it('apply action requires both targetBranchId and confirmCustomerIds[]', () => {
    const applyIdx = endpointSrc.indexOf("action === 'apply'");
    expect(applyIdx).toBeGreaterThan(0);
    const applyBlock = endpointSrc.slice(applyIdx, applyIdx + 2500);
    expect(applyBlock).toMatch(/targetBranchId\s+required/);
    expect(applyBlock).toMatch(/confirmCustomerIds\[\]\s+required/);
  });

  it('apply action validates targetBranchId exists in be_branches', () => {
    expect(endpointSrc).toMatch(/be_branches/);
    expect(endpointSrc).toMatch(/branchIds\.has\(targetBranchId\)/);
  });

  it('apply action writeBatches up to 500 ops per commit', () => {
    expect(endpointSrc).toMatch(/inBatch\s*>=\s*500/);
    expect(endpointSrc).toMatch(/batchOp\s*=\s*db\.batch\(\)/);
  });

  it('apply action writes audit doc to be_admin_audit', () => {
    expect(endpointSrc).toMatch(/be_admin_audit/);
    expect(endpointSrc).toMatch(/customer-branch-baseline-/);
    expect(endpointSrc).toMatch(/type:\s*['"]customer-branch-baseline['"]/);
  });

  it('exports findUntaggedCustomers helper for testability', () => {
    expect(endpointSrc).toMatch(/export\s+function\s+findUntaggedCustomers/);
  });
});

describe('BS-G.3 — Admin client wrapper', () => {
  it('exports listUntaggedCustomers + applyCustomerBranchBaseline', () => {
    expect(clientSrc).toMatch(/export\s+function\s+listUntaggedCustomers/);
    expect(clientSrc).toMatch(/export\s+function\s+applyCustomerBranchBaseline/);
  });

  it('uses Firebase ID token (Bearer)', () => {
    expect(clientSrc).toMatch(/getIdToken/);
    expect(clientSrc).toMatch(/Authorization:\s*`Bearer/);
  });

  it('posts to /api/admin/customer-branch-baseline', () => {
    expect(clientSrc).toMatch(/['"]\/api\/admin\/customer-branch-baseline['"]/);
  });
});

describe('BS-G.4 — MasterDataTab CustomerBranchBaselinePanel UI', () => {
  it('renders <CustomerBranchBaselinePanel /> after [A3] section', () => {
    expect(masterDataSrc).toMatch(/CustomerBranchBaselinePanel/);
    // Section comment marker
    expect(masterDataSrc).toMatch(/A4.*Phase BS.*Customer Branch Baseline/);
  });

  it('imports listBranches from backendClient', () => {
    expect(masterDataSrc).toMatch(/listBranches/);
  });

  it('imports listUntaggedCustomers + applyCustomerBranchBaseline from client', () => {
    expect(masterDataSrc).toMatch(
      /import\s+\{[^}]*listUntaggedCustomers[^}]*applyCustomerBranchBaseline[^}]*\}\s+from\s+['"][^'"]*customerBranchBaselineClient/,
    );
  });

  it('renders dry-run + apply buttons with data-testid hooks', () => {
    expect(masterDataSrc).toMatch(/data-testid="cbbl-dry-run"/);
    expect(masterDataSrc).toMatch(/data-testid="cbbl-apply"/);
    expect(masterDataSrc).toMatch(/data-testid="cbbl-target-branch"/);
  });

  it('confirms with admin before apply (window.confirm prompt)', () => {
    // Defensive — admin must explicitly approve mass mutation
    expect(masterDataSrc).toMatch(/window\.confirm/);
  });

  it('disables apply button until dry-run loads + branch picked', () => {
    // disabled={busy || !dryRun || dryRun.total === 0 || !targetBranchId}
    expect(masterDataSrc).toMatch(/!dryRun\s*\|\|\s*dryRun\.total\s*===\s*0\s*\|\|\s*!targetBranchId/);
  });
});
