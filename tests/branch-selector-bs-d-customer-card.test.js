// ─── BS-D — CustomerDetailView "สาขาที่สร้างรายการ" card display ────────
// Source-grep regression guards on CustomerDetailView.jsx. Verifies the
// card uses resolveBranchName (not raw branchId), gracefully shows '—'
// for legacy untagged customers, and reads from useSelectedBranch (the
// FULL list — not user-scoped, so customers tagged with a branch the
// current user can't access still display their origin name).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const cdvSrc = readFileSync(
  resolve(__dirname, '../src/components/backend/CustomerDetailView.jsx'),
  'utf-8',
);

describe('BS-D.1 — CustomerDetailView imports', () => {
  it('imports useSelectedBranch + resolveBranchName from BranchContext', () => {
    expect(cdvSrc).toMatch(
      /import\s+\{[^}]*useSelectedBranch[^}]*resolveBranchName[^}]*\}\s+from\s+['"][^'"]*BranchContext/,
    );
  });

  it('imports Building2 icon from lucide-react', () => {
    expect(cdvSrc).toMatch(/import\s+\{[^}]*Building2[^}]*\}\s+from\s+['"]lucide-react['"]/);
  });
});

describe('BS-D.2 — Card renders "สาขาที่สร้างรายการ" InfoRow', () => {
  it('label "สาขาที่สร้างรายการ" appears verbatim', () => {
    expect(cdvSrc).toMatch(/สาขาที่สร้างรายการ/);
  });

  it('uses resolveBranchName helper (not raw customer.branchId)', () => {
    expect(cdvSrc).toMatch(/resolveBranchName\(customerBranchId/);
  });

  it('falls back to "—" when branchId is empty', () => {
    expect(cdvSrc).toMatch(/customerBranchName\s*\|\|\s*['"]—['"]/);
  });

  it('reads branches from useSelectedBranch (FULL list, not scoped)', () => {
    // The display must work even for branches the current user can't
    // switch to (legacy customer tagged with a now-restricted branch).
    expect(cdvSrc).toMatch(/useSelectedBranch\(\)/);
  });

  it('icon is <Building2 size={11} />', () => {
    expect(cdvSrc).toMatch(/<Building2\s+size=\{11\}\s*\/>/);
  });
});

describe('BS-D.3 — Defensive customer.branchId read', () => {
  it('treats non-string branchId as empty', () => {
    expect(cdvSrc).toMatch(
      /typeof\s+customer\?\.branchId\s*===\s*['"]string['"]/,
    );
  });

  it('falls back to raw branchId when name unresolvable (defensive)', () => {
    // Pattern: resolveBranchName(...) || customerBranchId
    expect(cdvSrc).toMatch(/resolveBranchName\([^)]*\)\s*\|\|\s*customerBranchId/);
  });
});
