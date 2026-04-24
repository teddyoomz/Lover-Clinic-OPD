// ─── Phase 12.1 · StaffTab + DoctorsTab UI tests + Rule E compliance ───────
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('tok') } } }));

const mockListStaff = vi.fn();
const mockDeleteStaff = vi.fn();
const mockSaveStaff = vi.fn();
const mockListDoctors = vi.fn();
const mockDeleteDoctor = vi.fn();
const mockSaveDoctor = vi.fn();
const mockListBranches = vi.fn();
const mockListPermissionGroups = vi.fn();
const mockListDfGroups = vi.fn();

vi.mock('../src/lib/backendClient.js', () => ({
  listStaff: (...a) => mockListStaff(...a),
  deleteStaff: (...a) => mockDeleteStaff(...a),
  saveStaff: (...a) => mockSaveStaff(...a),
  listDoctors: (...a) => mockListDoctors(...a),
  deleteDoctor: (...a) => mockDeleteDoctor(...a),
  saveDoctor: (...a) => mockSaveDoctor(...a),
  listBranches: (...a) => mockListBranches(...a),
  listPermissionGroups: (...a) => mockListPermissionGroups(...a),
  listDfGroups: (...a) => mockListDfGroups(...a),
  getStaff: vi.fn(),
  getDoctor: vi.fn(),
}));

const mockDeleteAdminUser = vi.fn();
const mockCreateAdminUser = vi.fn();
const mockUpdateAdminUser = vi.fn();
vi.mock('../src/lib/adminUsersClient.js', () => ({
  deleteAdminUser: (...a) => mockDeleteAdminUser(...a),
  createAdminUser: (...a) => mockCreateAdminUser(...a),
  updateAdminUser: (...a) => mockUpdateAdminUser(...a),
  listAdminUsers: vi.fn(),
  getAdminUser: vi.fn(),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
}));

import StaffTab from '../src/components/backend/StaffTab.jsx';
import StaffFormModal from '../src/components/backend/StaffFormModal.jsx';
import DoctorsTab from '../src/components/backend/DoctorsTab.jsx';
import DoctorFormModal from '../src/components/backend/DoctorFormModal.jsx';

function makeStaff(o = {}) {
  return {
    staffId: 'STAFF-1', firstname: 'สมชาย', lastname: 'ใจดี', nickname: 'สม',
    employeeCode: 'EMP-001', email: 'som@clinic.com', position: 'พนักงานต้อนรับ',
    permissionGroupId: '', branchIds: ['BR-1'], color: '#111111', backgroundColor: '#ffffff',
    hasSales: false, disabled: false, firebaseUid: '', note: '', status: 'ใช้งาน',
    createdAt: '2026-04-20', updatedAt: '2026-04-20', ...o,
  };
}

function makeDoctor(o = {}) {
  return {
    doctorId: 'DOC-1', firstname: 'สมหญิง', lastname: 'เก่งจริง',
    firstnameEn: 'Dr.', lastnameEn: 'Smith', nickname: '',
    email: 'dr@clinic.com', position: 'แพทย์', professionalLicense: 'ว.12345',
    permissionGroupId: '', branchIds: [], color: '', backgroundColor: '',
    hourlyIncome: 2000, defaultDfGroupId: 'DFG-TEST', dfPaidType: '', minimumDfType: '',
    hasSales: true, disabled: false, firebaseUid: '', note: '', status: 'ใช้งาน',
    createdAt: '2026-04-20', updatedAt: '2026-04-20', ...o,
  };
}

/* ─── StaffTab smoke ──────────────────────────────────────────────────── */

describe('StaffTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBranches.mockResolvedValue([]);
    mockListPermissionGroups.mockResolvedValue([]);
    mockListDfGroups.mockResolvedValue([{ id: 'DFG-TEST', name: 'ทดสอบ' }]);
  });

  it('ST1: empty state', async () => {
    mockListStaff.mockResolvedValueOnce([]);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีพนักงาน/)).toBeInTheDocument());
  });

  it('ST2: renders card with name + position + email', async () => {
    mockListStaff.mockResolvedValueOnce([makeStaff()]);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    // Position appears in both the filter dropdown <option> AND card badge — use testid scope.
    const card = screen.getByTestId('staff-card-STAFF-1');
    expect(card).toHaveTextContent('พนักงานต้อนรับ');
    expect(card).toHaveTextContent('som@clinic.com');
  });

  it('ST3: search filters by employee code', async () => {
    mockListStaff.mockResolvedValueOnce([makeStaff(), makeStaff({ staffId: 'STAFF-2', firstname: 'A', lastname: 'B', employeeCode: 'EMP-002', email: 'a@b.c' })]);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'EMP-002' } });
    expect(screen.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
    expect(screen.getByText('A B')).toBeInTheDocument();
  });

  it('ST4: position filter isolates', async () => {
    mockListStaff.mockResolvedValueOnce([
      makeStaff(),
      makeStaff({ staffId: 'STAFF-2', firstname: 'B', position: 'ผู้จัดการ' }),
    ]);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    fireEvent.change(screen.getByDisplayValue('ตำแหน่งทั้งหมด'), { target: { value: 'ผู้จัดการ' } });
    expect(screen.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
  });

  it('ST5: delete without firebaseUid skips Firebase call', async () => {
    mockListStaff.mockResolvedValueOnce([makeStaff()]);
    mockListStaff.mockResolvedValueOnce([]);
    mockDeleteStaff.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    fireEvent.click(screen.getByLabelText('ลบพนักงาน สมชาย ใจดี'));
    await waitFor(() => expect(mockDeleteStaff).toHaveBeenCalledWith('STAFF-1'));
    expect(mockDeleteAdminUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ST6: delete with firebaseUid invokes Firebase delete', async () => {
    mockListStaff.mockResolvedValueOnce([makeStaff({ firebaseUid: 'UID-1' })]);
    mockListStaff.mockResolvedValueOnce([]);
    mockDeleteStaff.mockResolvedValueOnce();
    mockDeleteAdminUser.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    fireEvent.click(screen.getByLabelText('ลบพนักงาน สมชาย ใจดี'));
    await waitFor(() => expect(mockDeleteStaff).toHaveBeenCalledWith('STAFF-1'));
    expect(mockDeleteAdminUser).toHaveBeenCalledWith('UID-1');
    spy.mockRestore();
  });

  it('ST7: load error displays', async () => {
    mockListStaff.mockRejectedValueOnce(new Error('perm denied'));
    render(<StaffTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
  });
});

describe('StaffFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBranches.mockResolvedValue([{ branchId: 'BR-1', name: 'สาขาหลัก' }]);
    mockListPermissionGroups.mockResolvedValue([{ permissionGroupId: 'PG-1', name: 'Admin' }]);
    mockListDfGroups.mockResolvedValue([{ id: 'DFG-TEST', name: 'ทดสอบ' }]);
  });

  it('SM1: create mode blank', async () => {
    render(<StaffFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('เพิ่มพนักงาน')).toBeInTheDocument();
  });

  it('SM2: edit mode prefills + shows Firebase UID', async () => {
    render(<StaffFormModal staff={makeStaff({ firebaseUid: 'UID-42' })} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('สมชาย')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ใจดี')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/UID-42/)).toBeInTheDocument());
  });

  it('SM3: empty firstname rejected', async () => {
    render(<StaffFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อ/)).toBeInTheDocument());
    expect(mockSaveStaff).not.toHaveBeenCalled();
  });

  it('SM4: weak password rejected', async () => {
    render(<StaffFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('user@clinic.com'), { target: { value: 'x@y.z' } });
    fireEvent.change(screen.getByPlaceholderText(/≥ 8 ตัว/), { target: { value: 'weak' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/รหัสผ่านต้อง/)).toBeInTheDocument());
    expect(mockSaveStaff).not.toHaveBeenCalled();
    expect(mockCreateAdminUser).not.toHaveBeenCalled();
  });

  it('SM5: valid create with email+password fires Firebase create BEFORE Firestore', async () => {
    mockCreateAdminUser.mockResolvedValueOnce({ uid: 'NEW-UID' });
    mockSaveStaff.mockResolvedValueOnce();
    render(<StaffFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ/), { target: { value: 'ใหม่' } });
    fireEvent.change(screen.getByPlaceholderText('user@clinic.com'), { target: { value: 'new@c.co' } });
    fireEvent.change(screen.getByPlaceholderText(/≥ 8 ตัว/), { target: { value: 'Strong1pw' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSaveStaff).toHaveBeenCalled());
    expect(mockCreateAdminUser).toHaveBeenCalled();
    const savedForm = mockSaveStaff.mock.calls[0][1];
    expect(savedForm.firebaseUid).toBe('NEW-UID');
  });

  it('SM6: valid create with NO password skips Firebase', async () => {
    mockSaveStaff.mockResolvedValueOnce();
    render(<StaffFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ/), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSaveStaff).toHaveBeenCalled());
    expect(mockCreateAdminUser).not.toHaveBeenCalled();
  });
});

/* ─── DoctorsTab smoke ────────────────────────────────────────────────── */

describe('DoctorsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBranches.mockResolvedValue([]);
    mockListPermissionGroups.mockResolvedValue([]);
    mockListDfGroups.mockResolvedValue([{ id: 'DFG-TEST', name: 'ทดสอบ' }]);
  });

  it('DT1: renders doctor card with English name + license', async () => {
    mockListDoctors.mockResolvedValueOnce([makeDoctor()]);
    render(<DoctorsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมหญิง เก่งจริง'));
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
    expect(screen.getByText(/ว.12345/)).toBeInTheDocument();
  });

  it('DT2: position filter isolates assistants', async () => {
    mockListDoctors.mockResolvedValueOnce([
      makeDoctor(),
      makeDoctor({ doctorId: 'ASST-1', firstname: 'ผู้ช่วย', lastname: 'A', position: 'ผู้ช่วยแพทย์' }),
    ]);
    render(<DoctorsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมหญิง เก่งจริง'));
    fireEvent.change(screen.getByDisplayValue('ตำแหน่งทั้งหมด'), { target: { value: 'ผู้ช่วยแพทย์' } });
    expect(screen.queryByText('สมหญิง เก่งจริง')).not.toBeInTheDocument();
    expect(screen.getByText('ผู้ช่วย A')).toBeInTheDocument();
  });

  it('DT3: delete with firebaseUid calls Firebase delete', async () => {
    mockListDoctors.mockResolvedValueOnce([makeDoctor({ firebaseUid: 'DUID' })]);
    mockListDoctors.mockResolvedValueOnce([]);
    mockDeleteDoctor.mockResolvedValueOnce();
    mockDeleteAdminUser.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DoctorsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมหญิง เก่งจริง'));
    fireEvent.click(screen.getByLabelText('ลบ สมหญิง เก่งจริง'));
    await waitFor(() => expect(mockDeleteDoctor).toHaveBeenCalledWith('DOC-1'));
    expect(mockDeleteAdminUser).toHaveBeenCalledWith('DUID');
    spy.mockRestore();
  });
});

describe('DoctorFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBranches.mockResolvedValue([]);
    mockListPermissionGroups.mockResolvedValue([]);
    mockListDfGroups.mockResolvedValue([{ id: 'DFG-TEST', name: 'ทดสอบ' }]);
  });

  it('DM1: edit mode preserves id + English names', async () => {
    mockSaveDoctor.mockResolvedValueOnce();
    render(<DoctorFormModal doctor={makeDoctor()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('Dr.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Smith')).toBeInTheDocument();
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSaveDoctor).toHaveBeenCalled());
    expect(mockSaveDoctor.mock.calls[0][0]).toBe('DOC-1');
  });

  it('DM2: create mode with ผู้ช่วยแพทย์ generates ASST-* id', async () => {
    mockSaveDoctor.mockResolvedValueOnce();
    render(<DoctorFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    // Wait for dfGroups to load so the dropdown has a selectable option.
    await waitFor(() => expect(document.querySelector('[data-field="defaultDfGroupId"] select option[value="DFG-TEST"]')).toBeTruthy());
    const firstInput = document.querySelector('[data-field="firstname"] input');
    fireEvent.change(firstInput, { target: { value: 'ผู้ช่วยใหม่' } });
    // Switch position to ผู้ช่วยแพทย์
    const posSel = document.querySelector('[data-field="position"] select');
    fireEvent.change(posSel, { target: { value: 'ผู้ช่วยแพทย์' } });
    // Phase 14.1: defaultDfGroupId required for any doctor/assistant save.
    const dfSel = document.querySelector('[data-field="defaultDfGroupId"] select');
    fireEvent.change(dfSel, { target: { value: 'DFG-TEST' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSaveDoctor).toHaveBeenCalled());
    expect(mockSaveDoctor.mock.calls[0][0]).toMatch(/^ASST-/);
  });
});

/* ─── Rule E compliance + H-bis (no dev-only markers in production files) ── */

describe('Phase 12.1 — Rule E + structure', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('RE1: validators have no broker / proclinic import', () => {
    for (const f of ['src/lib/staffValidation.js', 'src/lib/doctorValidation.js']) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });

  it('RE2: StaffTab + StaffFormModal + DoctorsTab + DoctorFormModal have no broker import', () => {
    for (const f of [
      'src/components/backend/StaffTab.jsx',
      'src/components/backend/StaffFormModal.jsx',
      'src/components/backend/DoctorsTab.jsx',
      'src/components/backend/DoctorFormModal.jsx',
    ]) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });

  it('RE3: adminUsersClient targets /api/admin/users ONLY (not /api/proclinic)', () => {
    const src = fs.readFileSync('src/lib/adminUsersClient.js', 'utf-8');
    expect(src).toContain('/api/admin/users');
    expect(src).not.toMatch(/\/api\/proclinic/);
  });
});
