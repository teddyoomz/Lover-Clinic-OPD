// ─── Phase 17.2 — BranchContext rewrite RTL ──────────────────────────────
// Verifies per-user uid localStorage key + newest-default + single-branch
// hide + legacy-key migration shim + no 'main' fallback.
//
// IMPLEMENTER NOTE (Batch 4): The plan template mocked firebase.js (auth) +
// scopedDataLayer.js (listBranches). The actual BranchProvider uses
// useUserPermission() + onSnapshot directly. So this file adapts the mocks
// to (a) UserPermissionContext.jsx for the user/staff context, and (b)
// firebase/firestore + firebase.js for the onSnapshot branches stream.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Mocked state — mutated per test via beforeEach + per-test setters.
const userState = { user: { uid: 'user-A' }, staff: null };
const branchState = { branches: [] };

// 1) Mock UserPermissionContext.useUserPermission() — supplies user + staff.
//    BranchProvider reads `user.uid` (currentUid) + `staff.branchIds[]`
//    (staffAccessible). useBranchVisibility also reads staff via the same hook.
vi.mock('../src/contexts/UserPermissionContext.jsx', () => ({
  useUserPermission: () => ({
    user: userState.user,
    staff: userState.staff,
    permissions: {},
    isAdmin: true,
    groupName: '',
    bootstrap: false,
    loaded: true,
    hasPermission: () => true,
  }),
}));

// 2) Mock firebase.js — db + appId required by branchesCol() inside provider.
vi.mock('../src/firebase.js', () => ({
  db: {},
  appId: 'test-app',
  auth: { currentUser: null, onAuthStateChanged: () => () => {} },
}));

// 3) Mock firebase/firestore — onSnapshot fires once with branchState.branches
//    so render kicks the BranchProvider into its first-snapshot path. We
//    return a fake unsubscribe.
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: (...args) => args[0],
  where: () => ({}),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: (_q, onNext) => {
    // Fire synchronously with current branchState — wrapped in microtask so
    // useState updates inside the callback don't fire during render.
    Promise.resolve().then(() => {
      onNext({
        docs: branchState.branches.map((b) => ({
          id: b.branchId || b.id,
          data: () => b,
        })),
      });
    });
    return () => {};
  },
}));

// Now import the module under test (after mocks are registered).
import { BranchProvider, useSelectedBranch, useBranchVisibility } from '../src/lib/BranchContext.jsx';

function Probe() {
  const { branchId } = useSelectedBranch();
  const vis = useBranchVisibility();
  return (
    <div data-testid="probe">
      {JSON.stringify({
        branchId,
        showSelector: vis.showSelector,
        accessibleCount: vis.branches.length,
      })}
    </div>
  );
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
  userState.user = { uid: 'user-A' };
  userState.staff = null; // null staff → "all branches" backward compat
  branchState.branches = [];
});

describe('Phase 17.2 BranchContext — per-user uid localStorage key', () => {
  it('BC1.1 first-load with no localStorage + 1 accessible branch → that branch auto-selected', async () => {
    branchState.branches = [{ branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' }];
    userState.staff = { branchIds: ['BR-A'] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-A');
    });
  });

  it('BC1.2 first-load with no localStorage + 2 accessible → newest-created selected', async () => {
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-03-01' },
    ];
    userState.staff = { branchIds: ['BR-A', 'BR-B'] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-B');
    });
  });

  it('BC1.3 localStorage with uid-keyed value → that value used', async () => {
    window.localStorage.setItem('selectedBranchId:user-A', 'BR-Z');
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-Z', name: 'Z', createdAt: '2026-01-02' },
    ];
    userState.staff = { branchIds: ['BR-A', 'BR-Z'] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-Z');
    });
  });

  it('BC1.4 legacy unkeyed localStorage → migrated to per-user key', async () => {
    window.localStorage.setItem('selectedBranchId', 'BR-LEGACY');
    branchState.branches = [{ branchId: 'BR-LEGACY', name: 'L', createdAt: '2026-01-01' }];
    userState.staff = { branchIds: ['BR-LEGACY'] };
    render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      expect(window.localStorage.getItem('selectedBranchId:user-A')).toBe('BR-LEGACY');
      expect(window.localStorage.getItem('selectedBranchId')).toBeNull();
    });
  });

  it('BC1.5 useBranchVisibility.showSelector === false when only 1 accessible branch', async () => {
    branchState.branches = [{ branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' }];
    userState.staff = { branchIds: ['BR-A'] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.showSelector).toBe(false);
      expect(data.accessibleCount).toBe(1);
    });
  });

  it('BC1.6 useBranchVisibility.showSelector === true when 2+ accessible', async () => {
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-02-01' },
    ];
    userState.staff = { branchIds: ['BR-A', 'BR-B'] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.showSelector).toBe(true);
    });
  });

  it('BC1.7 different uid → different localStorage key (per-user isolation)', async () => {
    window.localStorage.setItem('selectedBranchId:user-A', 'BR-A');
    window.localStorage.setItem('selectedBranchId:user-B', 'BR-B');
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-01-02' },
    ];
    userState.staff = { branchIds: ['BR-A', 'BR-B'] };

    userState.user = { uid: 'user-A' };
    let probe = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(probe.getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-A');
    });

    probe.unmount();
    userState.user = { uid: 'user-B' };
    probe = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(probe.getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-B');
    });
  });

  it('BC1.8 no `main` literal fallback (Phase 17.2 anti-regression)', async () => {
    branchState.branches = [];
    userState.staff = { branchIds: [] };
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).not.toBe('main');
    });
  });
});
