// Phase 24.0 — DeleteCustomerCascadeModal RTL tests (3-dropdown gate +
// ProClinic-cloned warning + branch-scope filter + ลบ disabled state).
//
// Adaptation 5: warning banner is "⚠️ ลูกค้าจาก ProClinic sync — ..." —
//   matches /ProClinic sync/ as plan specified.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock layers — keep the modal's logic isolated from real Firebase.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listStaff: vi.fn(async () => [
    { id: 'BS-1', name: 'พนง A', branchIds: ['BR-1'], status: 'active' },
    { id: 'BS-2', name: 'พนง B', branchIds: ['BR-2'], status: 'active' },
    { id: 'BS-3', name: 'พนง พักใช้งาน', branchIds: ['BR-1'], status: 'พักใช้งาน' },
  ]),
  listDoctors: vi.fn(async () => [
    { id: 'BD-1', name: 'Dr X', branchIds: ['BR-1'], status: 'active' },
    { id: 'BD-2', name: 'Dr Y', branchIds: ['BR-1'], status: 'active' },
    { id: 'BD-3', name: 'Dr Z', branchIds: ['BR-2'], status: 'active' },
  ]),
}));

vi.mock('../src/lib/branchScopeUtils.js', async () => {
  const actual = await vi.importActual('../src/lib/branchScopeUtils.js');
  return actual;
});

vi.mock('../src/lib/customerDeleteClient.js', () => ({
  deleteCustomerViaApi: vi.fn(),
}));

import DeleteCustomerCascadeModal from '../src/components/backend/DeleteCustomerCascadeModal.jsx';
import { deleteCustomerViaApi } from '../src/lib/customerDeleteClient.js';

const customerThai = {
  id: 'LC-26000003',
  hn_no: 'LC-26000003',
  prefix: 'นาย',
  firstname: 'ทดสอบ',
  lastname: 'ระบบ',
  branchId: 'BR-1',
  isManualEntry: true,
};
const customerProClinic = {
  ...customerThai,
  id: 'PC-2853',
  hn_no: '2853',
  isManualEntry: false,
};

beforeEach(() => {
  deleteCustomerViaApi.mockReset();
});

// Adaptation 6 — CustomerCard mounting tests need the useTabAccess hooks
// stubbed since the real hooks depend on Firestore listeners. Mock at the
// hook module level so CustomerCard's import resolves to controllable values.
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: vi.fn(() => true),     // perm granted by default
  useTabAccess: vi.fn(() => ({ isAdmin: false })),
}));

describe('Phase 24.0 / M0 — CustomerCard delete-icon visibility (Adaptation 6)', () => {
  it('M0.1 mode="search" + onDeleteClick supplied → ✕ icon NOT rendered', async () => {
    const CustomerCard = (await import('../src/components/backend/CustomerCard.jsx')).default;
    const customer = { id: 'C1', proClinicId: 'C1', name: 'X', patientData: {} };
    render(<CustomerCard customer={customer} mode="search" onDeleteClick={() => {}} />);
    expect(screen.queryByTestId('delete-customer-C1')).toBeNull();
  });

  it('M0.2 mode="cloned" + onDeleteClick supplied + perm true → ✕ icon RENDERED', async () => {
    const CustomerCard = (await import('../src/components/backend/CustomerCard.jsx')).default;
    const customer = { id: 'C2', proClinicId: 'C2', name: 'Y', patientData: {} };
    render(<CustomerCard customer={customer} mode="cloned" onDeleteClick={() => {}} onView={() => {}} />);
    expect(screen.queryByTestId('delete-customer-C2')).toBeTruthy();
  });
});

describe('Phase 24.0 / M1 — modal render + branch-scoped roster', () => {
  it('M1.1 renders Thai title + customer name + HN', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByRole('heading', { name: /ยืนยันลบลูกค้า/ });
    expect(screen.getByText(/ทดสอบ/)).toBeTruthy();
    expect(screen.getByText(/HN: LC-26000003/)).toBeTruthy();
  });

  it('M1.2 lists 3 dropdowns (พนง / ผู้ช่วย / แพทย์)', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(3);
    });
  });

  it('M1.3 dropdowns filter by customer.branchId (BR-1 → 1 staff + 2 doctors, no พักใช้งาน)', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => {
      const allOptions = screen.getAllByRole('option');
      const labels = allOptions.map(o => o.textContent || '');
      expect(labels.some(l => l.includes('พนง A'))).toBe(true);
      expect(labels.some(l => l.includes('พนง B'))).toBe(false);  // BR-2, filtered out
      expect(labels.some(l => l.includes('Dr X'))).toBe(true);
      expect(labels.some(l => l.includes('Dr Y'))).toBe(true);
      expect(labels.some(l => l.includes('Dr Z'))).toBe(false);  // BR-2, filtered out
      expect(labels.some(l => l.includes('พักใช้งาน'))).toBe(false);  // status filtered
    });
  });
});

describe('Phase 24.0 / M2 — ลบถาวร button gate', () => {
  it('M2.1 disabled until all 3 dropdowns selected', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    const btn = await screen.findByTestId('delete-customer-confirm');
    expect(btn.disabled).toBe(true);

    // Wait for roster load (>3 = at least one real option per dropdown beyond placeholders)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    expect(btn.disabled).toBe(true);  // only 1 of 3
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    expect(btn.disabled).toBe(true);  // only 2 of 3
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    expect(btn.disabled).toBe(false);
  });
});

describe('Phase 24.0 / M3 — ProClinic-cloned warning banner', () => {
  it('M3.1 isManualEntry !== true → warning visible', async () => {
    render(<DeleteCustomerCascadeModal customer={customerProClinic} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByText(/ProClinic sync/);
  });
  it('M3.2 isManualEntry === true → no warning', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByRole('heading', { name: /ยืนยันลบลูกค้า/ });
    expect(screen.queryByText(/ProClinic sync/)).toBeNull();
  });
});

describe('Phase 24.0 / M4 — submit flow', () => {
  it('M4.1 click ลบ → calls deleteCustomerViaApi with all required fields', async () => {
    const onDeleted = vi.fn();
    deleteCustomerViaApi.mockResolvedValue({
      success: true,
      customerId: 'LC-26000003',
      cascadeCounts: { treatments: 1, sales: 0, deposits: 0 },
      auditDocId: 'customer-delete-LC-26000003-1-abc',
      totalDeletes: 2,
    });
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await waitFor(() => expect(deleteCustomerViaApi).toHaveBeenCalledTimes(1));
    expect(deleteCustomerViaApi).toHaveBeenCalledWith({
      customerId: 'LC-26000003',
      authorizedBy: {
        staffId: 'BS-1', staffName: 'พนง A',
        assistantId: 'BD-1', assistantName: 'Dr X',
        doctorId: 'BD-2', doctorName: 'Dr Y',
      },
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('M4.2 server error surfaces in red banner', async () => {
    deleteCustomerViaApi.mockRejectedValue(Object.assign(new Error('test fail'), { userMessage: 'staffId not in branch roster' }));
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await screen.findByText(/staffId not in branch roster/);
  });
});

describe('Phase 24.0 / M5 — close paths', () => {
  it('M5.1 ESC closes modal', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    await screen.findByRole('heading', { name: /ยืนยันลบลูกค้า/ });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('M5.2 backdrop click closes', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    const backdrop = await screen.findByTestId('delete-customer-modal');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('M5.3 X button closes', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    await screen.findByRole('heading', { name: /ยืนยันลบลูกค้า/ });
    const buttons = screen.getAllByRole('button');
    const xBtn = buttons.find(b => b.querySelector('svg'));
    fireEvent.click(xBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
