// M9 (2026-04-26) — admin reconciler button in PermissionGroupsTab
//
// User directive in P1-P3 polish queue: "M9 admin button — recomputeCustomerSummary
// helper exists, no UI button to trigger batch reconcile" (from SESSION_HANDOFF
// known-tech-debt list).
//
// Verifies:
//   1. Source-grep guards lock the button shape + reconcileAllCustomerSummaries import
//   2. RTL: button only appears for admin users (gated by useTabAccess.isAdmin)
//   3. RTL: clicking button confirms → invokes reconcileAllCustomerSummaries
//   4. RTL: progress + success states render correctly

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PermissionGroupsTab from '../src/components/backend/PermissionGroupsTab.jsx';

const TAB_SRC = readFileSync('src/components/backend/PermissionGroupsTab.jsx', 'utf8');

// Mock backend client
vi.mock('../src/lib/backendClient.js', () => ({
  listPermissionGroups: vi.fn().mockResolvedValue([]),
  deletePermissionGroup: vi.fn().mockResolvedValue({}),
  reconcileAllCustomerSummaries: vi.fn().mockImplementation(async ({ onProgress } = {}) => {
    // Simulate 3 customers reconciled
    if (onProgress) {
      onProgress({ done: 1, total: 3, customerId: 'c1', name: 'Customer 1' });
      onProgress({ done: 2, total: 3, customerId: 'c2', name: 'Customer 2' });
      onProgress({ done: 3, total: 3, customerId: 'c3', name: 'Customer 3' });
    }
    return { total: 3, succeeded: 3, failed: [] };
  }),
}));

// Mock useTabAccess to control isAdmin in tests. vi.hoisted lifts the
// state object above the vi.mock factory hoisting so we can mutate it
// per test.
const tabAccessState = vi.hoisted(() => ({ isAdmin: false }));
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: () => true, // permit delete in all test variants
  useTabAccess: () => ({ isAdmin: tabAccessState.isAdmin }),
}));

// ─── M9.A — source-grep regression guards ────────────────────────────────
describe('M9.A — source-grep regression guards', () => {
  test('M9.A.1 imports reconcileAllCustomerSummaries from backendClient', () => {
    expect(TAB_SRC).toMatch(/reconcileAllCustomerSummaries/);
    expect(TAB_SRC).toMatch(/from ['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });
  test('M9.A.2 imports useTabAccess for isAdmin gate', () => {
    expect(TAB_SRC).toMatch(/useTabAccess/);
  });
  test('M9.A.3 button has data-testid="m9-reconcile-btn"', () => {
    expect(TAB_SRC).toMatch(/data-testid=["']m9-reconcile-btn["']/);
  });
  test('M9.A.4 admin gate: isAdmin AND condition wraps the m9 card', () => {
    // Either inline `{isAdmin && (` OR the const m9Card = isAdmin && (...)
    expect(TAB_SRC).toMatch(/(isAdmin && \(|m9Card = isAdmin && )/);
  });
  test('M9.A.5 confirm dialog before destructive walk', () => {
    expect(TAB_SRC).toMatch(/window\.confirm\(['"]สรุปยอดลูกค้าใหม่ทั้งหมด/);
  });
  test('M9.A.6 onProgress callback wired into reconcileAllCustomerSummaries', () => {
    expect(TAB_SRC).toMatch(/onProgress:\s*\(\{[\s\S]*?\}\)\s*=>/);
  });
  test('M9.A.7 result UI shows succeeded + failed counts', () => {
    expect(TAB_SRC).toMatch(/reconcileResult\.succeeded/);
    expect(TAB_SRC).toMatch(/reconcileResult\.failed/);
  });
  test('M9.A.8 marker comment present (institutional memory)', () => {
    expect(TAB_SRC).toMatch(/M9 \(2026-04-26\)/);
  });
});

// ─── M9.B — RTL functional tests ──────────────────────────────────────────
describe('M9.B — RTL functional tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabAccessState.isAdmin = false;
    // Stub window.confirm to true
    vi.stubGlobal('confirm', () => true);
  });

  test('M9.B.1 button HIDDEN when user is NOT admin', async () => {
    tabAccessState.isAdmin = false;
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.queryByTestId('m9-reconcile-btn')).not.toBeInTheDocument());
  });

  test('M9.B.2 button VISIBLE when user IS admin', async () => {
    tabAccessState.isAdmin = true;
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-btn')).toBeInTheDocument());
    expect(screen.getByTestId('m9-reconciler-card')).toBeInTheDocument();
  });

  test('M9.B.3 clicking button confirms then runs reconciler', async () => {
    tabAccessState.isAdmin = true;
    const { reconcileAllCustomerSummaries } = await import('../src/lib/backendClient.js');
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('m9-reconcile-btn'));
    await waitFor(() => expect(reconcileAllCustomerSummaries).toHaveBeenCalledTimes(1));
    // Should pass an onProgress callback
    expect(reconcileAllCustomerSummaries.mock.calls[0][0]).toHaveProperty('onProgress');
    expect(typeof reconcileAllCustomerSummaries.mock.calls[0][0].onProgress).toBe('function');
  });

  test('M9.B.4 success state shows succeeded count after run', async () => {
    tabAccessState.isAdmin = true;
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('m9-reconcile-btn'));
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-success')).toBeInTheDocument());
    expect(screen.getByTestId('m9-reconcile-success').textContent).toMatch(/3.*\/.*3/);
  });

  test('M9.B.5 declined confirm dialog does NOT trigger reconciler', async () => {
    tabAccessState.isAdmin = true;
    vi.stubGlobal('confirm', () => false);
    const { reconcileAllCustomerSummaries } = await import('../src/lib/backendClient.js');
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('m9-reconcile-btn'));
    // After microtask flush
    await new Promise(r => setTimeout(r, 0));
    expect(reconcileAllCustomerSummaries).not.toHaveBeenCalled();
  });

  test('M9.B.6 error state shows when reconciler throws', async () => {
    tabAccessState.isAdmin = true;
    const { reconcileAllCustomerSummaries } = await import('../src/lib/backendClient.js');
    reconcileAllCustomerSummaries.mockRejectedValueOnce(new Error('Network down'));
    render(<PermissionGroupsTab clinicSettings={{}} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('m9-reconcile-btn'));
    await waitFor(() => expect(screen.getByTestId('m9-reconcile-error')).toBeInTheDocument());
    expect(screen.getByTestId('m9-reconcile-error').textContent).toMatch(/Network down/);
  });
});
