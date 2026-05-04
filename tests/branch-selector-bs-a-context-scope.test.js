// ─── BS-A — Phase BS BranchContext user-scope ─────────────────────────
// Tests filterBranchesByStaffAccess pure helper + the contract
// useUserScopedBranches relies on. Pure unit test (no React mount)
// because the helper is pure + the hook just composes useSelectedBranch
// + useUserPermission.
//
// Backward-compat semantic locked here (V36 multi-reader-sweep guard):
// empty/missing branchIds[] = visible everywhere; explicit non-empty =
// scoped subset.

import { describe, it, expect } from 'vitest';
import { filterBranchesByStaffAccess } from '../src/lib/BranchContext.jsx';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BS_A = describe;

BS_A('BS-A.1 — filterBranchesByStaffAccess (pure helper)', () => {
  const branches = [
    { id: 'BR-A', name: 'นครราชสีมา' },
    { id: 'BR-B', name: 'กรุงเทพ' },
    { id: 'BR-C', name: 'เชียงใหม่' },
  ];

  it('returns full list when staff is null (legacy fallback)', () => {
    expect(filterBranchesByStaffAccess(branches, null)).toEqual(branches);
  });

  it('returns full list when staff has no branchIds field (legacy)', () => {
    expect(filterBranchesByStaffAccess(branches, { id: 'STF-1' })).toEqual(branches);
  });

  it('returns full list when staff.branchIds is empty array', () => {
    expect(filterBranchesByStaffAccess(branches, { id: 'STF-1', branchIds: [] })).toEqual(branches);
  });

  it('returns scoped subset when staff.branchIds has entries', () => {
    const scoped = filterBranchesByStaffAccess(branches, { branchIds: ['BR-A', 'BR-C'] });
    expect(scoped.map(b => b.id)).toEqual(['BR-A', 'BR-C']);
  });

  it('coerces string ids on both sides (Number → String safety)', () => {
    const branchesWithNumberIds = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const scoped = filterBranchesByStaffAccess(branchesWithNumberIds, { branchIds: ['1', 3] });
    expect(scoped.map(b => b.id)).toEqual([1, 3]);
  });

  it('matches via branchId field if present (preferred over doc id)', () => {
    const list = [
      { id: 'doc-1', branchId: 'BR-A' },
      { id: 'doc-2', branchId: 'BR-B' },
    ];
    const scoped = filterBranchesByStaffAccess(list, { branchIds: ['BR-A'] });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].id).toBe('doc-1');
  });

  it('returns [] when branches arg is non-array', () => {
    expect(filterBranchesByStaffAccess(null, { branchIds: ['BR-A'] })).toEqual([]);
    expect(filterBranchesByStaffAccess(undefined, null)).toEqual([]);
    expect(filterBranchesByStaffAccess('not-array', null)).toEqual([]);
  });

  it('returns [] when staff has explicit branchIds but no branch matches', () => {
    const scoped = filterBranchesByStaffAccess(branches, { branchIds: ['BR-X'] });
    expect(scoped).toEqual([]);
  });

  it('handles falsy entries in branches list defensively', () => {
    const list = [{ id: 'BR-A' }, null, undefined, { id: 'BR-B' }];
    const scoped = filterBranchesByStaffAccess(list, { branchIds: ['BR-A'] });
    expect(scoped).toEqual([{ id: 'BR-A' }]);
  });
});

BS_A('BS-A.2 — Source-grep regression guards', () => {
  const branchContextSrc = readFileSync(
    resolve(__dirname, '../src/lib/BranchContext.jsx'),
    'utf-8',
  );

  it('exports filterBranchesByStaffAccess', () => {
    expect(branchContextSrc).toMatch(/export\s+function\s+filterBranchesByStaffAccess/);
  });

  it('exports useUserScopedBranches hook', () => {
    expect(branchContextSrc).toMatch(/export\s+function\s+useUserScopedBranches/);
  });

  it('useUserScopedBranches composes useSelectedBranch + useUserPermission', () => {
    expect(branchContextSrc).toMatch(/useSelectedBranch/);
    expect(branchContextSrc).toMatch(/useUserPermission/);
  });

  it('useUserScopedBranches exposes both branches AND allBranches', () => {
    // branches = scoped; allBranches = full list (for admin views)
    expect(branchContextSrc).toMatch(/allBranches/);
  });

  it('imports useUserPermission from UserPermissionContext', () => {
    expect(branchContextSrc).toMatch(
      /import\s+\{\s*useUserPermission\s*\}\s+from\s+['"][^'"]*UserPermissionContext/,
    );
  });

  it('BranchSelector consumes useUserScopedBranches (not useSelectedBranch)', () => {
    const selectorSrc = readFileSync(
      resolve(__dirname, '../src/components/backend/BranchSelector.jsx'),
      'utf-8',
    );
    expect(selectorSrc).toMatch(/useUserScopedBranches/);
    // Legacy useSelectedBranch import should be gone for this component
    expect(selectorSrc).not.toMatch(/import\s+\{[^}]*useSelectedBranch[^}]*\}\s+from/);
  });
});
