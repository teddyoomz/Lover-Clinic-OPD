// ─── Branch — Phase 11.6 adversarial tests ────────────────────────────────
// Core 13 fields + isDefault/status. Weekly schedule hours defer to Phase 13.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validateBranch,
  normalizeBranch,
  emptyBranchForm,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  ADDRESS_MAX_LENGTH,
} from '../src/lib/branchValidation.js';

describe('validateBranch — BV1..BV15', () => {
  const good = () => ({ ...emptyBranchForm(), name: 'Main', phone: '0812345678' });

  it('BV1: minimal valid (name + phone)', () => expect(validateBranch(good())).toBeNull());
  it('BV2: null/array rejected', () => {
    expect(validateBranch(null)?.[0]).toBe('form');
    expect(validateBranch([])?.[0]).toBe('form');
  });
  it('BV3: missing/blank name rejected', () => {
    expect(validateBranch({ phone: '0812345678' })?.[0]).toBe('name');
    expect(validateBranch({ ...good(), name: '   ' })?.[0]).toBe('name');
  });
  it('BV4: name bound', () => {
    expect(validateBranch({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH + 1) })?.[0]).toBe('name');
    expect(validateBranch({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH) })).toBeNull();
  });
  it('BV5: non-string name rejected', () => {
    expect(validateBranch({ ...good(), name: 42 })?.[0]).toBe('name');
  });
  it('BV6: missing phone rejected', () => {
    expect(validateBranch({ name: 'X' })?.[0]).toBe('phone');
    expect(validateBranch({ ...good(), phone: '' })?.[0]).toBe('phone');
  });
  it('BV7: phone regex — 0 prefix + 8..10 digits', () => {
    expect(validateBranch({ ...good(), phone: '02345678' })?.[0]).toBe('phone');       // 7 digits after 0 = too short
    expect(validateBranch({ ...good(), phone: '021234567' })).toBeNull();                 // 8 digits
    expect(validateBranch({ ...good(), phone: '0812345678' })).toBeNull();                // 9 digits
    expect(validateBranch({ ...good(), phone: '08123456789' })).toBeNull();               // 10 digits
    expect(validateBranch({ ...good(), phone: '081234567890' })?.[0]).toBe('phone');      // 11 digits — too long
    expect(validateBranch({ ...good(), phone: '112345678' })?.[0]).toBe('phone');         // no 0 prefix
  });
  it('BV8: phone accepts spaces/dashes (normalized later)', () => {
    expect(validateBranch({ ...good(), phone: '081-234-5678' })).toBeNull();
    expect(validateBranch({ ...good(), phone: '081 234 5678' })).toBeNull();
  });
  it('BV9: website URL validated if present', () => {
    expect(validateBranch({ ...good(), website: 'example.com' })?.[0]).toBe('website');
    expect(validateBranch({ ...good(), website: 'https://example.com' })).toBeNull();
    expect(validateBranch({ ...good(), website: '' })).toBeNull();
  });
  it('BV10: googleMapUrl validated if present', () => {
    expect(validateBranch({ ...good(), googleMapUrl: 'maps.goo.gl/x' })?.[0]).toBe('googleMapUrl');
    expect(validateBranch({ ...good(), googleMapUrl: 'https://maps.app.goo.gl/x' })).toBeNull();
  });
  it('BV11: latitude range -90..90', () => {
    expect(validateBranch({ ...good(), latitude: -91 })?.[0]).toBe('latitude');
    expect(validateBranch({ ...good(), latitude: 91 })?.[0]).toBe('latitude');
    expect(validateBranch({ ...good(), latitude: 'x' })?.[0]).toBe('latitude');
    expect(validateBranch({ ...good(), latitude: -90 })).toBeNull();
    expect(validateBranch({ ...good(), latitude: 90 })).toBeNull();
    expect(validateBranch({ ...good(), latitude: 13.7563 })).toBeNull();
  });
  it('BV12: longitude range -180..180', () => {
    expect(validateBranch({ ...good(), longitude: -181 })?.[0]).toBe('longitude');
    expect(validateBranch({ ...good(), longitude: 181 })?.[0]).toBe('longitude');
    expect(validateBranch({ ...good(), longitude: 100 })).toBeNull();
  });
  it('BV13: address / addressEn length bounds', () => {
    expect(validateBranch({ ...good(), address: 'a'.repeat(ADDRESS_MAX_LENGTH + 1) })?.[0]).toBe('address');
    expect(validateBranch({ ...good(), addressEn: 'a'.repeat(ADDRESS_MAX_LENGTH + 1) })?.[0]).toBe('addressEn');
  });
  it('BV14: status enum', () => {
    expect(validateBranch({ ...good(), status: 'xxx' })?.[0]).toBe('status');
    for (const s of STATUS_OPTIONS) expect(validateBranch({ ...good(), status: s })).toBeNull();
  });
  it('BV15: isDefault must be boolean if present', () => {
    expect(validateBranch({ ...good(), isDefault: 'x' })?.[0]).toBe('isDefault');
    expect(validateBranch({ ...good(), isDefault: true })).toBeNull();
    expect(validateBranch({ ...good(), isDefault: false })).toBeNull();
  });
});

describe('normalizeBranch — BN1..BN4', () => {
  it('BN1: trims strings + strips phone whitespace/dashes', () => {
    const out = normalizeBranch({
      name: '  X  ', phone: '  081-234-5678  ', address: '  here  ',
    });
    expect(out.name).toBe('X');
    expect(out.phone).toBe('0812345678');
    expect(out.address).toBe('here');
  });
  it('BN2: coerces empty numeric → null', () => {
    const out = normalizeBranch({ name: 'X', phone: '0812345678', latitude: '', longitude: '' });
    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
  });
  it('BN3: coerces numeric strings to numbers', () => {
    const out = normalizeBranch({ name: 'X', phone: '0812345678', latitude: '13.7563', longitude: '100.5018' });
    expect(out.latitude).toBe(13.7563);
    expect(out.longitude).toBe(100.5018);
  });
  it('BN4: defaults status + boolean isDefault', () => {
    const out = normalizeBranch({ name: 'X', phone: '0812345678' });
    expect(out.status).toBe('ใช้งาน');
    expect(out.isDefault).toBe(false);
    expect(normalizeBranch({ name: 'X', phone: '0812345678', isDefault: 'truthy' }).isDefault).toBe(true);
  });
});

/* ─── Rule E ───────────────────────────────────────────────────────────── */

describe('Phase 11.6 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('E1: validator clean', () => {
    const src = fs.readFileSync('src/lib/branchValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
  it('E2: Tab + Modal clean', () => {
    for (const f of ['src/components/backend/BranchesTab.jsx', 'src/components/backend/BranchFormModal.jsx']) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });
});

/* ─── Tab/Modal flows ─────────────────────────────────────────────────── */

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

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

const mockList = vi.fn();
const mockSave = vi.fn();
const mockDelete = vi.fn();
vi.mock('../src/lib/backendClient.js', () => ({
  listBranches: (...a) => mockList(...a),
  saveBranch:   (...a) => mockSave(...a),
  deleteBranch: (...a) => mockDelete(...a),
  getBranch:    vi.fn(),
}));

import BranchesTab from '../src/components/backend/BranchesTab.jsx';
import BranchFormModal from '../src/components/backend/BranchFormModal.jsx';

function makeBranch(over = {}) {
  return {
    branchId: 'BR-1',
    name: 'สาขาหลัก สุขุมวิท',
    nameEn: 'Sukhumvit Main',
    phone: '0812345678',
    website: '',
    licenseNo: '',
    taxId: '0105564001234',
    address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพ',
    addressEn: '',
    googleMapUrl: '',
    latitude: 13.7563,
    longitude: 100.5018,
    isDefault: true,
    status: 'ใช้งาน',
    note: '',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('BranchesTab — BT1..BT6', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('BT1: empty state', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีสาขา/)).toBeInTheDocument());
  });
  it('BT2: renders card + phone + address + default badge', async () => {
    mockList.mockResolvedValueOnce([makeBranch()]);
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สาขาหลัก สุขุมวิท'));
    expect(screen.getByText('0812345678')).toBeInTheDocument();
    // Default badge — exact-match "หลัก" avoids clashing with "สาขาหลัก" in h3.
    expect(screen.getByText('หลัก')).toBeInTheDocument();
  });
  it('BT3: search matches nameEn + taxId', async () => {
    mockList.mockResolvedValueOnce([makeBranch(), makeBranch({ branchId: 'BR-2', name: 'ข้อมูล 2', nameEn: 'Branch2', phone: '0829876543', taxId: '9999999999999', isDefault: false })]);
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สาขาหลัก สุขุมวิท'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: '9999' } });
    expect(screen.queryByText('สาขาหลัก สุขุมวิท')).not.toBeInTheDocument();
    expect(screen.getByText('ข้อมูล 2')).toBeInTheDocument();
  });
  it('BT4: status filter hides non-matching', async () => {
    mockList.mockResolvedValueOnce([makeBranch(), makeBranch({ branchId: 'BR-2', name: 'ปิดชั่วคราว', phone: '0812345679', status: 'พักใช้งาน', isDefault: false })]);
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สาขาหลัก สุขุมวิท'));
    fireEvent.change(screen.getByDisplayValue('สถานะทั้งหมด'), { target: { value: 'พักใช้งาน' } });
    expect(screen.queryByText('สาขาหลัก สุขุมวิท')).not.toBeInTheDocument();
    expect(screen.getByText('ปิดชั่วคราว')).toBeInTheDocument();
  });
  it('BT5: delete confirm YES calls backend', async () => {
    mockList.mockResolvedValueOnce([makeBranch()]);
    mockList.mockResolvedValueOnce([]);
    mockDelete.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สาขาหลัก สุขุมวิท'));
    fireEvent.click(screen.getByLabelText('ลบสาขา สาขาหลัก สุขุมวิท'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('BR-1'));
    spy.mockRestore();
  });
  it('BT6: load error surfaces', async () => {
    mockList.mockRejectedValueOnce(new Error('perm denied'));
    render(<BranchesTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
  });
});

describe('BranchFormModal — BM1..BM7', () => {
  beforeEach(() => { mockSave.mockReset(); });
  it('BM1: create mode blank', () => {
    render(<BranchFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('เพิ่มสาขา')).toBeInTheDocument();
  });
  it('BM2: edit mode prefills', () => {
    render(<BranchFormModal branch={makeBranch()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('สาขาหลัก สุขุมวิท')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0812345678')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0105564001234')).toBeInTheDocument();
  });
  it('BM3: save empty name → error', async () => {
    render(<BranchFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อสาขา/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('BM4: save valid → crypto BR id', async () => {
    mockSave.mockResolvedValueOnce();
    render(<BranchFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/สาขาหลัก/), { target: { value: 'New' } });
    fireEvent.change(screen.getByPlaceholderText('0812345678'), { target: { value: '0812345678' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toMatch(/^BR-/);
  });
  it('BM5: bad phone surfaces validation', async () => {
    render(<BranchFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/สาขาหลัก/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0812345678'), { target: { value: '12345' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/เบอร์ติดต่อต้องเป็น 0/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('BM6: edit preserves id', async () => {
    mockSave.mockResolvedValueOnce();
    render(<BranchFormModal branch={makeBranch()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toBe('BR-1');
  });
  it('BM7: ESC closes', () => {
    const onClose = vi.fn();
    render(<BranchFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
