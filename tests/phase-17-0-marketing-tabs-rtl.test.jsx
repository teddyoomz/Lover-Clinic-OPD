// ─── Phase 17.0 — Marketing Tabs RTL — V21 mitigation ─────────────────────
// Source-grep tests can lock in broken behavior. RTL mount + simulated
// branch switch verifies Promotion/Coupon/Voucher tabs ACTUALLY re-fetch
// when the user switches branch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

// Mock scopedDataLayer with spy listers BEFORE component imports.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listPromotions: vi.fn(async () => []),
  deletePromotion: vi.fn(async () => {}),
  listCoupons: vi.fn(async () => []),
  deleteCoupon: vi.fn(async () => {}),
  listVouchers: vi.fn(async () => []),
  deleteVoucher: vi.fn(async () => {}),
}));

// Mock BranchContext to expose a controllable selectedBranchId.
const branchState = { branchId: 'BR-A' };
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: branchState.branchId }),
  BranchProvider: ({ children }) => children,
}));

// Mock useTabAccess hooks (PromotionTab uses useHasPermission).
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: () => true,
}));

// Mock MarketingTabShell to render its children directly so RTL queries work.
vi.mock('../src/components/backend/MarketingTabShell.jsx', () => ({
  default: ({ children }) => <div data-testid="marketing-shell">{children}</div>,
}));

// Mock form modals (we don't exercise them).
vi.mock('../src/components/backend/PromotionFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/backend/CouponFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/components/backend/VoucherFormModal.jsx', () => ({ default: () => null }));
vi.mock('../src/lib/marketingUiUtils.js', () => ({ resolveIsDark: () => true }));

import * as scopedDataLayer from '../src/lib/scopedDataLayer.js';
import PromotionTab from '../src/components/backend/PromotionTab.jsx';
import CouponTab from '../src/components/backend/CouponTab.jsx';
import VoucherTab from '../src/components/backend/VoucherTab.jsx';

const settings = { accentColor: '#dc2626' };

beforeEach(() => {
  branchState.branchId = 'BR-A';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Phase 17.0 RTL — PromotionTab branch refresh', () => {
  it('R1.1 calls listPromotions on initial mount', async () => {
    render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(1));
  });

  it('R1.2 calls listPromotions again after branch switch', async () => {
    const { rerender } = render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(1));
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<PromotionTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listPromotions).toHaveBeenCalledTimes(2));
  });

  it('R1.3 marketing-shell renders', async () => {
    render(<PromotionTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(screen.getByTestId('marketing-shell')).toBeTruthy());
  });
});

describe('Phase 17.0 RTL — CouponTab branch refresh', () => {
  it('R2.1 calls listCoupons on initial mount', async () => {
    render(<CouponTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(1));
  });

  it('R2.2 calls listCoupons again after branch switch', async () => {
    const { rerender } = render(<CouponTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(1));
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<CouponTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listCoupons).toHaveBeenCalledTimes(2));
  });
});

describe('Phase 17.0 RTL — VoucherTab branch refresh', () => {
  it('R3.1 calls listVouchers on initial mount', async () => {
    render(<VoucherTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(1));
  });

  it('R3.2 calls listVouchers again after branch switch', async () => {
    const { rerender } = render(<VoucherTab clinicSettings={settings} theme="dark" />);
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(1));
    await act(async () => {
      branchState.branchId = 'BR-B';
      rerender(<VoucherTab clinicSettings={settings} theme="dark" />);
    });
    await waitFor(() => expect(scopedDataLayer.listVouchers).toHaveBeenCalledTimes(2));
  });
});
