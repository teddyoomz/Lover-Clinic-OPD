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
  previewCustomerDeleteViaApi: vi.fn(),
}));

import DeleteCustomerCascadeModal from '../src/components/backend/DeleteCustomerCascadeModal.jsx';
import { deleteCustomerViaApi, previewCustomerDeleteViaApi } from '../src/lib/customerDeleteClient.js';

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
  previewCustomerDeleteViaApi.mockReset();
  // Default: preview resolves with empty counts so modal renders cleanly.
  // M6 tests override per-case.
  previewCustomerDeleteViaApi.mockResolvedValue({
    success: true,
    customerId: 'LC-26000003',
    cascadeCounts: {
      treatments: 0, sales: 0, deposits: 0, appointments: 0,
      wallets: 0, walletTransactions: 0, memberships: 0,
      pointTransactions: 0, courseChanges: 0, linkRequests: 0,
      customerLinkTokens: 0,
    },
    exists: true,
  });
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

  it('M1.2 lists ONE dropdown with optgroup (พนักงาน + แพทย์/ผู้ช่วยแพทย์) — Phase 24.0-bis', async () => {
    // Phase 24.0-bis collapsed 3 dropdowns → 1 dropdown per user UX directive.
    // Single <select> with 2 <optgroup>s allowing admin to pick any authorizer.
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(1);
    });
    // Optgroup labels rendered.
    const select = await screen.findByTestId('delete-customer-authorizer-select');
    expect(select.querySelector('optgroup[label="พนักงาน"]')).toBeTruthy();
    expect(select.querySelector('optgroup[label="แพทย์ / ผู้ช่วยแพทย์"]')).toBeTruthy();
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

describe('Phase 24.0 / M2 — ลบถาวร button gate (Phase 24.0-bis: single authorizer)', () => {
  it('M2.1 disabled until authorizer is selected', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    const btn = await screen.findByTestId('delete-customer-confirm');
    expect(btn.disabled).toBe(true);

    // Wait for roster load — 1 staff (พนง A) + 2 doctors (Dr X, Dr Y) under BR-1
    // gives ≥ 3 real options + 1 placeholder = 4 total.
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const select = screen.getByTestId('delete-customer-authorizer-select');
    fireEvent.change(select, { target: { value: 'BS-1' } });
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
  it('M4.1 click ลบ → calls deleteCustomerViaApi with single-authorizer payload (Phase 24.0-bis)', async () => {
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
    const select = screen.getByTestId('delete-customer-authorizer-select');
    // Pick a staff member — server-authoritative role derivation should yield 'staff'.
    fireEvent.change(select, { target: { value: 'BS-1' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await waitFor(() => expect(deleteCustomerViaApi).toHaveBeenCalledTimes(1));
    expect(deleteCustomerViaApi).toHaveBeenCalledWith({
      customerId: 'LC-26000003',
      authorizedBy: {
        authorizerId: 'BS-1',
        authorizerName: 'พนง A',
        authorizerRole: 'staff',
      },
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('M4.1-bis picking a doctor yields role: "doctor"', async () => {
    const onDeleted = vi.fn();
    deleteCustomerViaApi.mockResolvedValue({ success: true, customerId: 'LC-26000003', cascadeCounts: {}, auditDocId: 'a', totalDeletes: 1 });
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const select = screen.getByTestId('delete-customer-authorizer-select');
    fireEvent.change(select, { target: { value: 'BD-1' } });  // doctor list
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await waitFor(() => expect(deleteCustomerViaApi).toHaveBeenCalledTimes(1));
    expect(deleteCustomerViaApi).toHaveBeenCalledWith({
      customerId: 'LC-26000003',
      authorizedBy: {
        authorizerId: 'BD-1',
        authorizerName: 'Dr X',
        authorizerRole: 'doctor',
      },
    });
  });

  it('M4.2 server error surfaces in red banner', async () => {
    deleteCustomerViaApi.mockRejectedValue(Object.assign(new Error('test fail'), { userMessage: 'authorizerId not in branch roster' }));
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const select = screen.getByTestId('delete-customer-authorizer-select');
    fireEvent.change(select, { target: { value: 'BS-1' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await screen.findByText(/authorizerId not in branch roster/);
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

// ─── M6 — Issue #1 cascade preview row ──────────────────────────────────────
// Spec §5.1 + §13: modal must show cascade counts BEFORE user confirms so
// admin sees what will be removed. Preview is informational; failing to load
// it MUST NOT block the ลบ button (3-dropdown gate is independent).
describe('Phase 24.0 / M6 — cascade preview row (Issue #1)', () => {
  it('M6.1 modal calls previewCustomerDeleteViaApi on mount with customerId', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => expect(previewCustomerDeleteViaApi).toHaveBeenCalledTimes(1));
    expect(previewCustomerDeleteViaApi).toHaveBeenCalledWith({ customerId: 'LC-26000003' });
  });

  it('M6.2 cascade preview row renders 11 counts when preview succeeds', async () => {
    previewCustomerDeleteViaApi.mockResolvedValue({
      success: true,
      customerId: 'LC-26000003',
      cascadeCounts: {
        treatments: 3, sales: 2, deposits: 1, appointments: 5,
        wallets: 1, walletTransactions: 7, memberships: 1,
        pointTransactions: 4, courseChanges: 2, linkRequests: 0,
        customerLinkTokens: 0,
      },
      exists: true,
    });
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    const preview = await screen.findByTestId('delete-customer-cascade-preview');
    expect(preview).toBeTruthy();
    // Spot-check labels for each of the 11 counts.
    expect(preview.textContent).toMatch(/3 การรักษา/);
    expect(preview.textContent).toMatch(/2 การขาย/);
    expect(preview.textContent).toMatch(/1 มัดจำ/);
    expect(preview.textContent).toMatch(/5 นัดหมาย/);
    // Note: adjacent spans concatenate with no whitespace in textContent.
    // We assert each count+label substring; "1 wallet" overlaps with
    // "1 wallet tx" so use the per-span boundaries directly via DOM lookup.
    expect(preview.textContent).toContain('1 wallet');
    expect(preview.textContent).toMatch(/7 wallet tx/);
    expect(preview.textContent).toMatch(/1 membership/);
    expect(preview.textContent).toMatch(/4 point tx/);
    expect(preview.textContent).toMatch(/2 course changes/);
    expect(preview.textContent).toMatch(/0 link requests/);
    expect(preview.textContent).toMatch(/0 link tokens/);
  });

  it('M6.3 preview error shows amber banner but does NOT disable the ลบ button (single-authorizer gate independent)', async () => {
    previewCustomerDeleteViaApi.mockRejectedValue(
      Object.assign(new Error('preview failed'), { userMessage: 'network down' })
    );
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    // Wait for the amber preview-error banner.
    await screen.findByTestId('delete-customer-preview-error');
    // The cascade-preview row should NOT have rendered.
    expect(screen.queryByTestId('delete-customer-cascade-preview')).toBeNull();
    // Now exercise the single-authorizer gate — failing preview must NOT block delete.
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const btn = screen.getByTestId('delete-customer-confirm');
    expect(btn.disabled).toBe(true);  // disabled because no authorizer selected, NOT because of preview
    const select = screen.getByTestId('delete-customer-authorizer-select');
    fireEvent.change(select, { target: { value: 'BS-1' } });
    // Authorizer selected → button enabled even though preview failed.
    expect(btn.disabled).toBe(false);
  });
});
