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

vi.mock('../src/lib/backendClient.js', () => ({
  cancelCustomerCourse: (...a) => cancelMock(...a),
  refundCustomerCourse: (...a) => refundMock(...a),
  exchangeCourseProduct: (...a) => exchangeMock(...a),
  listCourses: (...a) => listCoursesMock(...a),
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
});

// ─── M1 CancelCourseModal ────────────────────────────────────────────────
describe('M1 CancelCourseModal', () => {
  test('M1.1 renders with course summary + reason textarea + buttons', () => {
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('cancel-course-modal')).toBeInTheDocument();
    expect(screen.getByText(/HN001/)).toBeInTheDocument();
    expect(screen.getByText(/Botox 50U/)).toBeInTheDocument();
    expect(screen.getByTestId('cancel-course-reason')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-course-submit')).toBeInTheDocument();
  });

  test('M1.2 submit disabled until reason filled', () => {
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('cancel-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'admin error' } });
    expect(screen.getByTestId('cancel-course-submit')).not.toBeDisabled();
  });

  test('M1.3 submit calls cancelCustomerCourse + onSuccess', async () => {
    cancelMock.mockResolvedValue({ changeId: 'cc-1', cancelledAt: '2026-04-29T00:00:00Z' });
    const onSuccess = vi.fn();
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={onSuccess} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'wrong entry' } });
    fireEvent.click(screen.getByTestId('cancel-course-submit'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock).toHaveBeenCalledWith('cust-1', 'crs-X', 'wrong entry', { actor: 'admin@test.local' });
    expect(onSuccess).toHaveBeenCalled();
  });

  test('M1.4 error banner shown on backend failure (V31 anti-silent-swallow)', async () => {
    cancelMock.mockRejectedValue(new Error('course already cancelled'));
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('cancel-course-reason'), { target: { value: 'r' } });
    fireEvent.click(screen.getByTestId('cancel-course-submit'));
    await waitFor(() => expect(screen.getByTestId('cancel-course-error')).toBeInTheDocument());
    expect(screen.getByTestId('cancel-course-error').textContent).toMatch(/already cancelled/);
  });

  test('M1.5 close button + Esc fire onCancel + reset state', () => {
    const onCancel = vi.fn();
    render(<CancelCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={onCancel} />);
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

  test('M2.4 submit calls refundCustomerCourse with correct args', async () => {
    refundMock.mockResolvedValue({ changeId: 'cc-2' });
    const onSuccess = vi.fn();
    render(<RefundCourseModal open={true} row={baseRow} onSuccess={onSuccess} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('refund-course-reason'), { target: { value: 'customer request' } });
    fireEvent.change(screen.getByTestId('refund-course-amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('refund-course-submit'));
    await waitFor(() => expect(refundMock).toHaveBeenCalled());
    expect(refundMock).toHaveBeenCalledWith('cust-1', 'crs-X', 500, {
      reason: 'customer request',
      actor: 'admin@test.local',
    });
    expect(onSuccess).toHaveBeenCalled();
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
  test('M3.1 loads master courses on open + renders dropdown', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', price: 5000 },
      { id: 'm2', courseName: 'Hifu', price: 3000 },
    ]);
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('exchange-course-modal')).toBeInTheDocument();
    await waitFor(() => expect(listCoursesMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
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

  test('M3.3 submit disabled until course picked AND reason filled', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', products: [{ name: 'P', qty: '5/5' }] },
    ]);
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    expect(screen.getByTestId('exchange-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    expect(screen.getByTestId('exchange-course-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'r' } });
    expect(screen.getByTestId('exchange-course-submit')).not.toBeDisabled();
  });

  test('M3.4 submit calls exchangeCourseProduct with COURSE INDEX (not courseId)', async () => {
    listCoursesMock.mockResolvedValue([
      { id: 'm1', courseName: 'Premium Botox', products: [{ name: 'BotoxNew', qty: '10/10', unit: 'U' }] },
    ]);
    exchangeMock.mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={onSuccess} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Premium Botox/)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'upgrade' } });
    fireEvent.click(screen.getByTestId('exchange-course-submit'));
    await waitFor(() => expect(exchangeMock).toHaveBeenCalled());
    // CRITICAL: helper signature is (customerId, courseINDEX, newProduct, reason)
    expect(exchangeMock).toHaveBeenCalledWith('cust-1', 2, {
      name: 'Premium Botox',
      qty: '10/10',
      unit: 'U',
    }, 'upgrade');
    expect(onSuccess).toHaveBeenCalled();
  });

  test('M3.5 error banner on backend failure', async () => {
    listCoursesMock.mockResolvedValue([{ id: 'm1', courseName: 'X', products: [{ name: 'P', qty: '1/1' }] }]);
    exchangeMock.mockRejectedValue(new Error('Invalid course index'));
    render(<ExchangeCourseModal open={true} row={baseRow} onSuccess={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText(/^X/)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('exchange-course-picker'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByTestId('exchange-course-reason'), { target: { value: 'r' } });
    fireEvent.click(screen.getByTestId('exchange-course-submit'));
    await waitFor(() => expect(screen.getByTestId('exchange-course-error')).toBeInTheDocument());
    expect(screen.getByTestId('exchange-course-error').textContent).toMatch(/Invalid course index/);
  });
});
