// ─── Permission Group — Phase 11.7 adversarial tests ──────────────────────
// 130 permissions in 14 modules; flat Record<string, boolean> storage.
// Validator / normalizer (drop unknown keys + drop false entries) / module
// seed integrity / hasPermission + countPermissions helpers.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validatePermissionGroup,
  normalizePermissionGroup,
  emptyPermissionGroupForm,
  countPermissions,
  hasPermission,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  DESC_MAX_LENGTH,
  PERMISSION_MODULES,
  ALL_PERMISSION_KEYS,
} from '../src/lib/permissionGroupValidation.js';

/* ─── PGV: validator ────────────────────────────────────────────────────── */

describe('validatePermissionGroup — PGV1..PGV10', () => {
  const good = () => ({ ...emptyPermissionGroupForm(), name: 'Admin' });

  it('PGV1: minimal valid (name)', () => expect(validatePermissionGroup(good())).toBeNull());
  it('PGV2: null/array rejected', () => {
    expect(validatePermissionGroup(null)?.[0]).toBe('form');
    expect(validatePermissionGroup([])?.[0]).toBe('form');
  });
  it('PGV3: blank name rejected', () => {
    expect(validatePermissionGroup({ name: '' })?.[0]).toBe('name');
    expect(validatePermissionGroup({ name: '  ' })?.[0]).toBe('name');
  });
  it('PGV4: non-string name rejected', () => {
    expect(validatePermissionGroup({ name: 42 })?.[0]).toBe('name');
  });
  it('PGV5: name length bound', () => {
    expect(validatePermissionGroup({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH + 1) })?.[0]).toBe('name');
    expect(validatePermissionGroup({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH) })).toBeNull();
  });
  it('PGV6: description optional, bound by DESC_MAX_LENGTH', () => {
    expect(validatePermissionGroup({ ...good(), description: 'ok' })).toBeNull();
    expect(validatePermissionGroup({ ...good(), description: null })).toBeNull();
    expect(validatePermissionGroup({ ...good(), description: 'a'.repeat(DESC_MAX_LENGTH + 1) })?.[0]).toBe('description');
    expect(validatePermissionGroup({ ...good(), description: 42 })?.[0]).toBe('description');
  });
  it('PGV7: permissions must be object (not array)', () => {
    expect(validatePermissionGroup({ ...good(), permissions: [] })?.[0]).toBe('permissions');
    expect(validatePermissionGroup({ ...good(), permissions: 'x' })?.[0]).toBe('permissions');
    expect(validatePermissionGroup({ ...good(), permissions: {} })).toBeNull();
    expect(validatePermissionGroup({ ...good(), permissions: null })).toBeNull();
  });
  it('PGV8: permissions values must be boolean', () => {
    expect(validatePermissionGroup({ ...good(), permissions: { customer_view: 'yes' } })?.[0]).toBe('permissions.customer_view');
    expect(validatePermissionGroup({ ...good(), permissions: { customer_view: 1 } })?.[0]).toBe('permissions.customer_view');
    expect(validatePermissionGroup({ ...good(), permissions: { customer_view: true } })).toBeNull();
    expect(validatePermissionGroup({ ...good(), permissions: { customer_view: false } })).toBeNull();
  });
  it('PGV9: status enum', () => {
    expect(validatePermissionGroup({ ...good(), status: 'xxx' })?.[0]).toBe('status');
    for (const s of STATUS_OPTIONS) expect(validatePermissionGroup({ ...good(), status: s })).toBeNull();
  });
  it('PGV10: accepts 130 real permission keys', () => {
    const all = {};
    for (const k of ALL_PERMISSION_KEYS) all[k] = true;
    expect(validatePermissionGroup({ ...good(), permissions: all })).toBeNull();
  });
});

/* ─── PGN: normalizer ──────────────────────────────────────────────────── */

describe('normalizePermissionGroup — PGN1..PGN5', () => {
  it('PGN1: trims name + description', () => {
    const out = normalizePermissionGroup({ name: '  X  ', description: ' hi ' });
    expect(out.name).toBe('X');
    expect(out.description).toBe('hi');
  });

  it('PGN2: drops falsy permission entries (keeps doc compact)', () => {
    const out = normalizePermissionGroup({
      name: 'X',
      permissions: { customer_view: true, customer_delete: false, sale_management: true },
    });
    expect(out.permissions.customer_view).toBe(true);
    expect(out.permissions.sale_management).toBe(true);
    expect(out.permissions.customer_delete).toBeUndefined();
  });

  it('PGN3: drops unknown permission keys', () => {
    const out = normalizePermissionGroup({
      name: 'X',
      permissions: { customer_view: true, totally_fake_permission: true },
    });
    expect(out.permissions.customer_view).toBe(true);
    expect(out.permissions.totally_fake_permission).toBeUndefined();
  });

  it('PGN4: defaults status to ใช้งาน', () => {
    expect(normalizePermissionGroup({ name: 'X' }).status).toBe('ใช้งาน');
  });

  it('PGN5: non-object permissions becomes empty map', () => {
    expect(normalizePermissionGroup({ name: 'X', permissions: 'bad' }).permissions).toEqual({});
    expect(normalizePermissionGroup({ name: 'X', permissions: null }).permissions).toEqual({});
    expect(normalizePermissionGroup({ name: 'X' }).permissions).toEqual({});
  });
});

/* ─── PGS: seed integrity ─────────────────────────────────────────────── */

describe('Permission module seed — PGS1..PGS4', () => {
  it('PGS1: PERMISSION_MODULES frozen + non-empty', () => {
    expect(Object.isFrozen(PERMISSION_MODULES)).toBe(true);
    expect(PERMISSION_MODULES.length).toBeGreaterThan(0);
  });

  it('PGS2: every module has id + label + items[] (≥ 1)', () => {
    for (const m of PERMISSION_MODULES) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.label).toBe('string');
      expect(Array.isArray(m.items)).toBe(true);
      expect(m.items.length).toBeGreaterThan(0);
    }
  });

  it('PGS3: every item has unique key + Thai label', () => {
    const keys = new Set();
    for (const m of PERMISSION_MODULES) {
      for (const it of m.items) {
        expect(keys.has(it.key)).toBe(false);
        keys.add(it.key);
        expect(typeof it.label).toBe('string');
        expect(it.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('PGS4: ALL_PERMISSION_KEYS equals flatten of modules', () => {
    const flat = PERMISSION_MODULES.flatMap(m => m.items.map(i => i.key));
    expect(ALL_PERMISSION_KEYS).toEqual(flat);
    // Sanity: expect ≥ 100 permissions given ProClinic's surface area.
    expect(ALL_PERMISSION_KEYS.length).toBeGreaterThanOrEqual(100);
  });
});

/* ─── PGH: helpers ─────────────────────────────────────────────────────── */

describe('Helpers — PGH1..PGH4', () => {
  it('PGH1: countPermissions counts only true entries', () => {
    expect(countPermissions({ a: true, b: false, c: true })).toBe(2);
    expect(countPermissions({})).toBe(0);
    expect(countPermissions(null)).toBe(0);
    expect(countPermissions('x')).toBe(0);
  });

  it('PGH2: hasPermission returns boolean', () => {
    const g = { permissions: { customer_view: true } };
    expect(hasPermission(g, 'customer_view')).toBe(true);
    expect(hasPermission(g, 'customer_delete')).toBe(false);
  });

  it('PGH3: hasPermission null-safe', () => {
    expect(hasPermission(null, 'customer_view')).toBe(false);
    expect(hasPermission({}, 'customer_view')).toBe(false);
    expect(hasPermission({ permissions: {} }, 'customer_view')).toBe(false);
  });

  it('PGH4: hasPermission rejects non-true values (1 / "yes" / null)', () => {
    expect(hasPermission({ permissions: { customer_view: 1 } }, 'customer_view')).toBe(false);
    expect(hasPermission({ permissions: { customer_view: 'yes' } }, 'customer_view')).toBe(false);
    expect(hasPermission({ permissions: { customer_view: null } }, 'customer_view')).toBe(false);
  });
});

/* ─── Rule E ───────────────────────────────────────────────────────────── */

describe('Phase 11.7 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('E1: validator clean', () => {
    const src = fs.readFileSync('src/lib/permissionGroupValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
  it('E2: Tab + Modal clean', () => {
    for (const f of ['src/components/backend/PermissionGroupsTab.jsx', 'src/components/backend/PermissionGroupFormModal.jsx']) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });
});

/* ─── Tab + Modal flows ────────────────────────────────────────────────── */

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
  listPermissionGroups: (...a) => mockList(...a),
  savePermissionGroup:  (...a) => mockSave(...a),
  deletePermissionGroup: (...a) => mockDelete(...a),
  getPermissionGroup:   vi.fn(),
}));

import PermissionGroupsTab from '../src/components/backend/PermissionGroupsTab.jsx';
import PermissionGroupFormModal from '../src/components/backend/PermissionGroupFormModal.jsx';

function makeRole(over = {}) {
  return {
    permissionGroupId: 'ROLE-1',
    name: 'Admin',
    description: 'Full access',
    permissions: { customer_view: true, customer_management: true },
    status: 'ใช้งาน',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('PermissionGroupsTab — PGT1..PGT5', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('PGT1: empty state', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<PermissionGroupsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีกลุ่มสิทธิ์/)).toBeInTheDocument());
  });

  it('PGT2: renders card + count bar', async () => {
    mockList.mockResolvedValueOnce([makeRole()]);
    render(<PermissionGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Admin'));
    // Card says "2 / 130+ สิทธิ์"
    const card = screen.getByTestId('permission-card-ROLE-1');
    expect(card.textContent).toMatch(/2 \/ \d{2,3} สิทธิ์/);
  });

  it('PGT3: search matches description', async () => {
    mockList.mockResolvedValueOnce([makeRole(), makeRole({ permissionGroupId: 'ROLE-2', name: 'Staff', description: 'Front desk' })]);
    render(<PermissionGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Admin'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'front' } });
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });

  it('PGT4: delete confirm YES calls backend', async () => {
    mockList.mockResolvedValueOnce([makeRole()]);
    mockList.mockResolvedValueOnce([]);
    mockDelete.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PermissionGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Admin'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่มสิทธิ์ Admin'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('ROLE-1'));
    spy.mockRestore();
  });

  it('PGT5: load error surfaces', async () => {
    mockList.mockRejectedValueOnce(new Error('perm denied'));
    render(<PermissionGroupsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
  });
});

describe('PermissionGroupFormModal — PGM1..PGM6', () => {
  beforeEach(() => { mockSave.mockReset(); });

  it('PGM1: create mode opens blank', () => {
    render(<PermissionGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('สร้างกลุ่มสิทธิ์')).toBeInTheDocument();
    expect(screen.getByText(/ใช้งานทุกระบบ/)).toBeInTheDocument();
  });

  it('PGM2: empty name → error', async () => {
    render(<PermissionGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อ/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('PGM3: save with crypto ROLE id', async () => {
    mockSave.mockResolvedValueOnce();
    render(<PermissionGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/พนักงานต้อนรับ/), { target: { value: 'TestRole' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toMatch(/^ROLE-/);
  });

  it('PGM4: "ใช้งานทุกระบบ" master toggle grants ALL permissions', async () => {
    mockSave.mockResolvedValueOnce();
    render(<PermissionGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/พนักงานต้อนรับ/), { target: { value: 'Admin' } });
    fireEvent.click(screen.getByLabelText(/ใช้งานทุกระบบ/));
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const payload = mockSave.mock.calls[0][1];
    // Expect at least 100 permissions granted (100 is a sanity floor).
    const grantedCount = Object.values(payload.permissions).filter(v => v === true).length;
    expect(grantedCount).toBeGreaterThanOrEqual(100);
  });

  it('PGM5: edit mode prefills', () => {
    render(<PermissionGroupFormModal
      permissionGroup={makeRole()}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('Admin')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Full access')).toBeInTheDocument();
  });

  it('PGM6: ESC closes modal', () => {
    const onClose = vi.fn();
    render(<PermissionGroupFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
