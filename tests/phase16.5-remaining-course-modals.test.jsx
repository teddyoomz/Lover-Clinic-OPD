// Phase 16.5 (2026-04-29) — RTL tests for the 3 action modals.
// Verifies render shape + reason-required gate + helper-call + error banner.
//
// Each modal mocks its specific backendClient helper. Auth is mocked to
// return a stable email for the actor field.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { email: 'admin@test.local', uid: 'uid-test' } },
}));

const cancelMock = vi.fn();
const refundMock = vi.fn();
const exchangeMock = vi.fn();
const listCoursesMock = vi.fn();
const listStaffByBranchMock = vi.fn().mockResolvedValue([
  { id: 'staff-1', name: 'นาง สมหญิง ใจดี' },
  { id: 'staff-2', name: 'นางสาว วันใส รักษ์ดี' },
]);

vi.mock('../src/lib/backendClient.js', () => ({
  cancelCustomerCourse: (...a) => cancelMock(...a),
  refundCustomerCourse: (...a) => refundMock(...a),
  exchangeCourseProduct: (...a) => exchangeMock(...a),
  listCourses: (...a) => listCoursesMock(...a),
  listStaffByBranch: (...a) => listStaffByBranchMock(...a),
}));

vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-test', branches: [], selectBranch: () => {}, isReady: true }),
}));

vi.mock('../src/lib/financeUtils.js', () => ({
  fmtMoney: (n) => `${Number(n).toLocaleString('en-US')} บาท`,
}));

import CancelCourseModal from '../src/components/backend/CancelCourseModal.jsx';
import RefundCourseModal from '../src/components/backend/RefundCourseModal.jsx';
import ExchangeCourseModal from '../src/components/backend/ExchangeCourseModal.jsx';

const baseRow = {
  customerId: 'cust-1',
  customerHN: 'HN001',
  customerName: 'นาย ทดสอบ',
  courseIndex: 2,
  courseId: 'crs-X',
  courseName: 'Botox 50U',
  totalSpent: 1000,
  qtyTotal: 5,
  qtyRemaining: 3,
};

beforeEach(() => {
  cancelMock.mockReset();
  refundMock.mockReset();
  exchangeMock.mockReset();
  listCoursesMock.mockReset();
  listStaffByBranchMock.mockReset().mockResolvedValue([
    { id: 'staff-1', name: 'นาง สมหญิง ใจดี' },
    { id: 'staff-2', name: 'นางสาว วันใส รักษ์ดี' },
  ]);
});

// Helper: wait for staff list to load + pick the first staff member.
async function pickFirstStaff(testId = 'cancel-course-staff') {
  // Wait for ActorPicker dropdown to render with staff options
  await waitFor(() => expect(listStaffByBranchMock).toHaveBeenCalled());
  await waitFor(() => {
    const sel = document.querySelector(`[data-testid="${testId}"]`);
    if (!sel || sel.options.length < 2) throw new Error('staff list not loaded yet');
  });
  const sel = document.querySelector(`[data-testid="${testId}"]`);
  fireEvent.change(sel, { target: { value: 'staff-1' } });
}

// ─── M1 CancelCourseModal ────────────────────────────────────────────────
describe('M1 CancelCourseModal', () => {
  test('M1.1 renders with course summary + staff picker + reason textarea + buttons', async () => {
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('cancel-course-modal')).toBeInTheDocument();
    expect(screen.getByText(/HN001/)).toBeInTheDocument();
    expect(screen.getByText(/Botox 50U/)).toBeInTheDocument();
    expect(screen.getByTestId('cancel-course-reason')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-course-submit')).toBeInTheDocument();
    // Phase 16.5-ter — staff dropdown rendered + listStaffByBranch invoked
    await waitFor(() => expect(listStaffByBranchMock).toHaveBeenCalled());
    expect(document.querySelector('[data-testid="cancel-course-staff"]')).toBeTruthy();
  });

  test('M1.2 Phase 16.5-ter — submit disabled until staff picked AND reason filled', async () => {
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(listStaffByBranchMock).toHaveBeenCalled());
    expect(screen.getByTestId('cancel-course-submit')).toBeDisabled();
    // Reason alone — still disabled (staff missing)
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'admin error' } });
    expect(screen.getByTestId('cancel-course-submit')).toBeDisabled();
    // Pick staff — now enabled
    await pickFirstStaff('cancel-course-staff');
    expect(screen.getByTestId('cancel-course-submit')).not.toBeDisabled();
  });

  test('M1.3 submit passes staffId + staffName + courseIndex (real courseId)', async () => {
    cancelMock.mockResolvedValue({ changeId: 'cc-1', cancelledAt: '2026-04-29T00:00:00Z' });
    const onSuccess = vi.fn();
    render(<CancelCourseModal open={true} row={{ ...baseRow, hasRealCourseId: true }} onSuccess={onSuccess} onCancel={() => {}} />);
    await pickFirstStaff('cancel-course-staff');
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'wrong entry' } });
    fireEvent.click(screen.getByTestId('cancel-course-submit'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock).toHaveBeenCalledWith('cust-1', 'crs-X', 'wrong entry', {
      actor: 'admin@test.local',
      courseIndex: 2,
      staffId: 'staff-1',
      staffName: 'นาง สมหญิง ใจดี',
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  test('M1.3-bis legacy course (hasRealCourseId=false) → empty courseId + courseIndex + staff', async () => {
    cancelMock.mockResolvedValue({ changeId: 'cc-2', cancelledAt: '2026-04-29T00:00:00Z' });
    const legacyRow = { ...baseRow, courseId: 'idx-2', hasRealCourseId: false };
    render(<CancelCourseModal open={true} row={legacyRow} onSuccess={() => {}} onCancel={() => {}} />);
    await pickFirstStaff('cancel-course-staff');
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'r' } });
    fireEvent.click(screen.getByTestId('cancel-course-submit'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalled());
    expect(cancelMock).toHaveBeenCalledWith('cust-1', '', 'r', {
      actor: 'admin@test.local',
      courseIndex: 2,
      staffId: 'staff-1',
      staffName: 'นาง สมหญิง ใจดี',
    });
  });

  test('M1.4 error banner shown on backend failure (V31 anti-silent-swallow)', async () => {
    cancelMock.mockRejectedValue(new Error('course already cancelled'));
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await pickFirstStaff('cancel-course-staff');
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'r' } });
    fireEvent.click(screen.getByTestId('cancel-course-submit'));
    await waitFor(() => expect(screen.getByTestId('cancel-course-error')).toBeInTheDocument());
    expect(screen.getByTestId('cancel-course-error').textContent).toMatch(/already cancelled/);
  });

  test('M1.5 close button fires onCancel + resets state', async () => {
    const onCancel = vi.fn();
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={onCancel} />);
    await waitFor(() => expect(listStaffByBranchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('cancel-course-close'));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ─── M2 RefundCourseModal ────────────────────────────────────────────────
describe('M2 RefundCourseModal', () => {
  test('M2.1 renders with course summary + amount + reason + pro-rata default', () => {
    render(<RefundCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('refund-course-modal')).toBeInTheDocument();
    // pro-rata = floor(3/5 × 1000) = 600
    expect(screen.getByTestId('refund-course-amount')).toHaveValue(600);
    expect(screen.getByText(/ค่าแนะนำ/)).toBeInTheDocument();
  });

  test('M2.2 submit disabled when amount=0 or reason empty', () => {
    render(<RefundCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    // amount 600 default, reason empty → disabled
    expect(screen.getByTestId('refund-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'r' } });
    expect(screen.getByTestId('refund-course-submit')).not.toBeDisabled();
    fireEvent.change(screen.getByTestId('refund-course-amount'), { target: { value: '0' } });
    expect(screen.getByTestId('refund-course-submit')).toBeDisabled();
  });

  test('M2.3 amount > totalSpent → submit disabled', () => {
    render(<RefundCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'r' } });
    fireEvent.change(screen.getByTestId('refund-course-amount'), { target: { value: '99999' } });
    expect(screen.getByTestId('refund-course-submit')).toBeDisabled();
  });

  test('M2.4 submit calls refundCustomerCourse with courseIndex (real courseId path)', async () => {
    refundMock.mockResolvedValue({ changeId: 'cc-2' });
    const onSuccess = vi.fn();
    render(<RefundCourseModal open={true} row={{ ...baseRow, hasRealCourseId: true }} onSuccess={onSuccess} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'customer request' } });
    fireEvent.change(screen.getByTestId('refund-course-amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('refund-course-submit'));
    await waitFor(() => expect(refundMock).toHaveBeenCalled());
    // Phase 16.5: helper now receives courseIndex (defensive courseIndex fallback)
    expect(refundMock).toHaveBeenCalledWith('cust-1', 'crs-X', 500, {
      reason: 'customer request',
      actor: 'admin@test.local',
      courseIndex: 2,
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  test('M2.4-bis Phase 16.5 — legacy refund with empty courseId + courseIndex fallback', async () => {
    refundMock.mockResolvedValue({ changeId: 'cc-3' });
    const legacyRow = { ...baseRow, courseId: 'idx-2', hasRealCourseId: false };
    render(<RefundCourseModal open={true} row={legacyRow} onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'r' } });
    fireEvent.change(screen.getByTestId('refund-course-amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('refund-course-submit'));
    await waitFor(() => expect(refundMock).toHaveBeenCalled());
    expect(refundMock).toHaveBeenCalledWith('cust-1', '', 500, {
      reason: 'r', actor: 'admin@test.local', courseIndex: 2,
    });
  });

  test('M2.5 error banner on failure', async () => {
    refundMock.mockRejectedValue(new Error('insufficient balance'));
    render(<RefundCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'r' } });
    fireEvent.click(screen.getByTestId('refund-course-submit'));
    await waitFor(() => expect(screen.getByTestId('refund-course-error')).toBeInTheDocument());
  });
});

// ─── M3 ExchangeCourseModal ──────────────────────────────────────────────
describe('M3 ExchangeCourseModal', () => {
  test('M3.1 loads master courses + staff list on open', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', price: 5000 },
      { id: 'm2', courseName: 'Hifu', price: 3000 },
    ]);
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('exchange-course-modal')).toBeInTheDocument();
    await waitFor(() => expect(listCoursesMock).toHaveBeenCalled());
    await waitFor(() => expect(listStaffByBranchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    expect(document.querySelector('[data-testid="exchange-course-staff"]')).toBeTruthy();
  });

  test('M3.2 search filters dropdown (case-insensitive substring)', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox' },
      { id: 'm2', courseName: 'Hifu' },
    ]);
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('exchange-course-search'), { target: { value: 'hifu' } });
    expect(screen.queryByText(/Premium Botox/)).not.toBeInTheDocument();
    expect(screen.getByText(/Hifu/)).toBeInTheDocument();
  });

  test('M3.3 Phase 16.5-ter — submit disabled until course picked AND staff picked AND reason filled', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', products: [{ name: 'P', qty: '5/5' }] },
    ]);
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    expect(screen.getByTestId('exchange-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    expect(screen.getByTestId('exchange-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'r' } });
    // Still disabled — staff not picked yet
    expect(screen.getByTestId('exchange-course-submit')).toBeDisabled();
    await pickFirstStaff('exchange-course-staff');
    expect(screen.getByTestId('exchange-course-submit')).not.toBeDisabled();
  });

  test('M3.4 submit passes courseIndex + staff (V32-tris-bis signature + Phase 16.5-ter staff opts)', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', products: [{ name: 'BotoxNew', qty: '10/10', unit: 'U' }] },
    ]);
    exchangeMock.mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={onSuccess} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'upgrade' } });
    await pickFirstStaff('exchange-course-staff');
    fireEvent.click(screen.getByTestId('exchange-course-submit'));
    await waitFor(() => expect(exchangeMock).toHaveBeenCalled());
    expect(exchangeMock).toHaveBeenCalledWith('cust-1', 2, {
      name: 'Premium Botox',
      qty: '10/10',
      unit: 'U',
    }, 'upgrade', { staffId: 'staff-1', staffName: 'นาง สมหญิง ใจดี' });
    expect(onSuccess).toHaveBeenCalled();
  });

  test('M3.5 error banner on backend failure', async () => {
    listCoursesMock.mockResolvedValue([{ id: 'm1', courseName: 'X', products: [{ name: 'P', qty: '1/1' }] }]);
    exchangeMock.mockRejectedValue(new Error('Invalid course index'));
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/^X/)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'r' } });
    await pickFirstStaff('exchange-course-staff');
    fireEvent.click(screen.getByTestId('exchange-course-submit'));
    await waitFor(() => expect(screen.getByTestId('exchange-course-error')).toBeInTheDocument());
    expect(screen.getByTestId('exchange-course-error').textContent).toMatch(/Invalid course index/);
  });
});
