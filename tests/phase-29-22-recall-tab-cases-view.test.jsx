import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock all dependencies BEFORE importing RecallTab.
vi.mock('../src/hooks/useRecallListener.js', () => ({
  useRecallListener: () => ({ recalls: [], loading: false, error: '' }),
}));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createRecall: vi.fn(),
  createRecallPair: vi.fn(),
  recordRecallOutcome: vi.fn(),
  recordRecallLineSend: vi.fn(),
  snoozeRecall: vi.fn(),
  // Phase 29.22 — Cases admin panel reads these
  listRecallCases: vi.fn().mockResolvedValue([]),
  saveRecallCase: vi.fn(),
  setRecallCaseHidden: vi.fn(),
}));

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'admin-uid', getIdToken: async () => 'mock-tok' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

// Spy mock — flips between admin and non-admin between describe blocks
const mockUseTabAccess = vi.fn();
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => mockUseTabAccess(),
}));

import { RecallTab } from '../src/components/backend/recall/RecallTab.jsx';

describe('Phase 29.22 · L10 — RecallTab sub-pill (admin)', () => {
  beforeEach(() => {
    mockUseTabAccess.mockReturnValue({
      isAdmin: true,
      permissions: {},
      loaded: true,
      hasPermission: () => true,
    });
  });

  it('L10.1 admin sees "จัดการเคส" sub-pill', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-subpill-cases')).toBeInTheDocument();
    expect(screen.getByTestId('recall-subpill-list')).toBeInTheDocument();
  });

  it('L10.2 click "จัดการเคส" pill renders admin panel', () => {
    render(<RecallTab />);
    fireEvent.click(screen.getByTestId('recall-subpill-cases'));
    expect(screen.getByTestId('recall-cases-admin-panel')).toBeInTheDocument();
  });
});

describe('Phase 29.22 · L10 — RecallTab sub-pill (non-admin without permission)', () => {
  beforeEach(() => {
    mockUseTabAccess.mockReturnValue({
      isAdmin: false,
      permissions: {},
      loaded: true,
      hasPermission: () => false,
    });
  });

  it('L10.3 non-admin without permission does NOT see "จัดการเคส" sub-pill', () => {
    render(<RecallTab />);
    expect(screen.queryByTestId('recall-subpill-cases')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-tab-subpill-bar')).not.toBeInTheDocument();
  });
});

describe('Phase 29.22 · L10 — RecallTab sub-pill (non-admin WITH permission)', () => {
  beforeEach(() => {
    mockUseTabAccess.mockReturnValue({
      isAdmin: false,
      permissions: { recall_management: true },
      loaded: true,
      hasPermission: (key) => key === 'recall_management',
    });
  });

  it('L10.4 non-admin with recall_management perm sees "จัดการเคส" sub-pill', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-subpill-cases')).toBeInTheDocument();
  });
});
