import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomerPatientLinkModal from '../src/components/backend/CustomerPatientLinkModal.jsx';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  generateCustomerPatientLink: vi.fn(async () => 'tok123tok123tok1'),
  setCustomerPatientLinkEnabled: vi.fn(async () => {}),
  revokeCustomerPatientLink: vi.fn(async () => {}),
}));
import * as sdl from '../src/lib/scopedDataLayer.js';

describe('CustomerPatientLinkModal', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('M1: no token → shows สร้างลิงก์ button; click calls generate + onUpdated', async () => {
    const onUpdated = vi.fn();
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'นาง ราตรี' }} onClose={() => {}} onUpdated={onUpdated} isDark />);
    fireEvent.click(screen.getByRole('button', { name: /สร้างลิงก์ดูข้อมูล/ }));
    await waitFor(() => expect(sdl.generateCustomerPatientLink).toHaveBeenCalledWith('C1'));
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('M2: has token → shows link URL (?patient=) + revoke', () => {
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'นาง ราตรี', patientLinkToken: 'tok123tok123tok1', patientLinkEnabled: true }} onClose={() => {}} onUpdated={() => {}} isDark />);
    expect(screen.getByDisplayValue(/\?patient=tok123tok123tok1/)).toBeTruthy();
    expect(screen.getByText(/เพิกถอน/)).toBeTruthy();
  });

  it('M3: revoke (confirmed) calls revokeCustomerPatientLink', async () => {
    const onUpdated = vi.fn();
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'น', patientLinkToken: 'tok123tok123tok1', patientLinkEnabled: true }} onClose={() => {}} onUpdated={onUpdated} isDark />);
    fireEvent.click(screen.getByText(/เพิกถอน/));
    await waitFor(() => expect(sdl.revokeCustomerPatientLink).toHaveBeenCalledWith('C1'));
  });

  it('M3b: toggle calls setCustomerPatientLinkEnabled(false) when enabled', async () => {
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'น', patientLinkToken: 'tok123tok123tok1', patientLinkEnabled: true }} onClose={() => {}} onUpdated={() => {}} isDark />);
    fireEvent.click(screen.getByText(/ปิดใช้งานลิงก์/));
    await waitFor(() => expect(sdl.setCustomerPatientLinkEnabled).toHaveBeenCalledWith('C1', false));
  });

  it('M4: backdrop click does NOT close (AV78 explicit-close-only)', () => {
    const onClose = vi.fn();
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'น' }} onClose={onClose} onUpdated={() => {}} isDark />);
    fireEvent.click(screen.getByTestId('cust-link-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('M5: X button closes', () => {
    const onClose = vi.fn();
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'น' }} onClose={onClose} onUpdated={() => {}} isDark />);
    fireEvent.click(screen.getByLabelText('ปิด'));
    expect(onClose).toHaveBeenCalled();
  });

  it('M6: disabled token → shows ปิดใช้งานอยู่ banner', () => {
    render(<CustomerPatientLinkModal customer={{ id: 'C1', name: 'น', patientLinkToken: 'tok123tok123tok1', patientLinkEnabled: false }} onClose={() => {}} onUpdated={() => {}} isDark />);
    expect(screen.getByText(/ถูกปิดใช้งานอยู่/)).toBeTruthy();
    expect(screen.getByText(/เปิดใช้งานลิงก์/)).toBeTruthy();
  });
});
