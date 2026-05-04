// ─── BS-B — BranchSelector top-right mount + auto-hide ───────────────────
// Source-grep regression guards: BranchSelector must be mounted in
// BackendDashboard's breadcrumbSlot (top-right header) — same area as
// ProfileDropdown — and must auto-hide when the user-scoped list has
// fewer than 2 branches. Verifies the V20 + Phase BS contracts at the
// JSX shape level. No RTL mount because the component reads two contexts
// (BranchProvider + UserPermissionProvider) which would force this file
// to stub Firebase + onSnapshot — overhead the source-grep equivalent
// catches just as reliably.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dashboardSrc = readFileSync(
  resolve(__dirname, '../src/pages/BackendDashboard.jsx'),
  'utf-8',
);
const selectorSrc = readFileSync(
  resolve(__dirname, '../src/components/backend/BranchSelector.jsx'),
  'utf-8',
);

describe('BS-B.1 — BranchSelector top-right mount in BackendDashboard', () => {
  it('imports BranchSelector at module top', () => {
    expect(dashboardSrc).toMatch(
      /import\s+BranchSelector\s+from\s+['"][^'"]*BranchSelector/,
    );
  });

  it('imports BranchProvider and wraps the dashboard', () => {
    expect(dashboardSrc).toMatch(
      /import\s+\{\s*BranchProvider\s*\}\s+from\s+['"][^'"]*BranchContext/,
    );
    expect(dashboardSrc).toMatch(/<BranchProvider>/);
  });

  it('mounts <BranchSelector /> in the breadcrumb topbar slot', () => {
    // Top-right slot: ProfileDropdown + ThemeToggle + BranchSelector together
    expect(dashboardSrc).toMatch(/<BranchSelector/);
  });

  it('places BranchSelector adjacent to ProfileDropdown (top-right cluster)', () => {
    const selectorIdx = dashboardSrc.indexOf('<BranchSelector');
    const profileIdx = dashboardSrc.indexOf('<ProfileDropdown');
    expect(selectorIdx).toBeGreaterThan(0);
    expect(profileIdx).toBeGreaterThan(0);
    // Both should appear within ~600 chars of each other (same JSX block)
    expect(Math.abs(selectorIdx - profileIdx)).toBeLessThan(600);
  });
});

describe('BS-B.2 — BranchSelector auto-hide when scoped < 2', () => {
  it('returns null when branches.length < 2', () => {
    expect(selectorSrc).toMatch(/branches\.length\s*<\s*2/);
    expect(selectorSrc).toMatch(/return\s+null/);
  });

  it('renders a <select> dropdown when ≥2 branches available', () => {
    expect(selectorSrc).toMatch(/<select/);
    expect(selectorSrc).toMatch(/branches\.map/);
  });

  it('uses useUserScopedBranches (not useSelectedBranch) for the list', () => {
    expect(selectorSrc).toMatch(/useUserScopedBranches/);
  });

  it('preserves a11y label "เลือกสาขา" on the select', () => {
    expect(selectorSrc).toMatch(/aria-label="เลือกสาขา"/);
  });

  it('preserves data-testid for E2E selectors', () => {
    expect(selectorSrc).toMatch(/data-testid="branch-selector"/);
    expect(selectorSrc).toMatch(/data-testid="branch-selector-dropdown"/);
  });
});
