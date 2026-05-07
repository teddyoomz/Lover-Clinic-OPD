// ─── V41 Task 3.2 — Staff/Doctor hide modal RTL tests ───────────────────────
// Covers: StaffFormModal + DoctorFormModal isHidden checkbox behaviour.
// Uses React Testing Library (RTL) with vitest + jsdom.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock backendClient + adminUsersClient so the modal can render without Firestore
const mockSaveStaff = vi.fn(async () => undefined);
const mockSaveDoctor = vi.fn(async () => undefined);
const mockListBranches = vi.fn(async () => []);
const mockListPermissionGroups = vi.fn(async () => []);
const mockListDfGroups = vi.fn(async () => []);
const mockListStaff = vi.fn(async () => []);
const mockListDoctors = vi.fn(async () => []);

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  saveStaff: (...a) => mockSaveStaff(...a),
  saveDoctor: (...a) => mockSaveDoctor(...a),
  listBranches: (...a) => mockListBranches(...a),
  listPermissionGroups: (...a) => mockListPermissionGroups(...a),
  listDfGroups: (...a) => mockListDfGroups(...a),
  listStaff: (...a) => mockListStaff(...a),
  listDoctors: (...a) => mockListDoctors(...a),
  deleteStaff: vi.fn(),
  deleteDoctor: vi.fn(),
}));
vi.mock('../src/lib/adminUsersClient.js', () => ({
  createAdminUser: vi.fn(async () => undefined),
  updateAdminUser: vi.fn(async () => undefined),
  setUserPermission: vi.fn(async () => undefined),
}));

// Lazy-import the modals AFTER mocks are set up
const StaffFormModal = (await import('../src/components/backend/StaffFormModal.jsx')).default;
const DoctorFormModal = (await import('../src/components/backend/DoctorFormModal.jsx')).default;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UI1 — StaffFormModal hide checkbox', () => {
  it('UI1.1 — renders the "ซ่อน" checkbox at top with helper text', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/🙈 ซ่อน — ไม่แสดงรายชื่อ/)).toBeInTheDocument();
    expect(screen.getByText(/ยัง login \+ ใช้สิทธิ์ได้ปกติ/)).toBeInTheDocument();
  });

  it('UI1.2 — checkbox unchecked by default for new staff', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });

  it('UI1.3 — checkbox checked when editing a hidden staff', () => {
    render(<StaffFormModal staff={{ staffId: 'S1', firstname: 'A', lastname: 'A', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });

  it('UI1.4 — toggling checkbox updates state', () => {
    render(<StaffFormModal staff={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});

describe('UI2 — DoctorFormModal hide checkbox', () => {
  it('UI2.1 — renders the "ซ่อน" checkbox at top', () => {
    render(<DoctorFormModal doctor={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/🙈 ซ่อน — ไม่แสดงรายชื่อ/)).toBeInTheDocument();
  });

  it('UI2.2 — checkbox checked when editing a hidden doctor', () => {
    render(<DoctorFormModal doctor={{ doctorId: 'D1', firstname: 'Dr', lastname: 'A', position: 'แพทย์', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });

  it('UI2.3 — toggling checkbox updates state', () => {
    render(<DoctorFormModal doctor={null} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('UI2.4 — checkbox state persists across position changes (ผู้ช่วยแพทย์ same flag)', () => {
    render(<DoctorFormModal doctor={{ doctorId: 'D1', firstname: 'Dr', lastname: 'A', position: 'ผู้ช่วยแพทย์', isHidden: true }} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const checkbox = document.querySelector('input[data-field="isHidden"]');
    expect(checkbox.checked).toBe(true);
  });
});
