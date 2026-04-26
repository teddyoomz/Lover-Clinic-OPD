// ─── Product Unit Group — Phase 11.3 adversarial tests ─────────────────────
// Conversion-group model (Triangle-captured ProClinic form reveals
// product_unit_group_name + unit_name[] + unit_amount[] with row 0 = base).
//
// Rule D: every validator branch + normalizer invariant has an adversarial
// case. No integration with real Firestore (PERMISSION_DENIED at master) —
// client CRUD is mocked.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validateProductUnitGroup,
  normalizeProductUnitGroup,
  emptyProductUnitGroupForm,
  STATUS_OPTIONS,
  GROUP_NAME_MAX_LENGTH,
  UNIT_NAME_MAX_LENGTH,
  MIN_UNITS,
  MAX_UNITS,
} from '../src/lib/productUnitValidation.js';

/* ─── PUV: validateProductUnitGroup adversarial ────────────────────────── */

describe('validateProductUnitGroup — PUV1..PUV20', () => {
  const good = () => ({
    ...emptyProductUnitGroupForm(),
    groupName: 'ampoule',
    units: [
      { name: 'เข็ม', amount: 1, isBase: true },
      { name: 'amp',  amount: 10, isBase: false },
    ],
  });

  it('PUV1: happy path — group + 2 units passes', () => {
    expect(validateProductUnitGroup(good())).toBeNull();
  });

  it('PUV2: rejects null / undefined / array form', () => {
    expect(validateProductUnitGroup(null)?.[0]).toBe('form');
    expect(validateProductUnitGroup(undefined)?.[0]).toBe('form');
    expect(validateProductUnitGroup([])?.[0]).toBe('form');
  });

  it('PUV3: rejects missing groupName', () => {
    expect(validateProductUnitGroup({ units: good().units })?.[0]).toBe('groupName');
  });

  it('PUV4: rejects whitespace-only groupName', () => {
    expect(validateProductUnitGroup({ ...good(), groupName: '   ' })?.[0]).toBe('groupName');
  });

  it('PUV5: rejects non-string groupName', () => {
    for (const bad of [42, true, null, {}, []]) {
      expect(validateProductUnitGroup({ ...good(), groupName: bad })?.[0]).toBe('groupName');
    }
  });

  it('PUV6: rejects groupName longer than GROUP_NAME_MAX_LENGTH', () => {
    const long = 'a'.repeat(GROUP_NAME_MAX_LENGTH + 1);
    expect(validateProductUnitGroup({ ...good(), groupName: long })?.[0]).toBe('groupName');
  });

  it('PUV7: accepts boundary groupName length', () => {
    const ok = 'a'.repeat(GROUP_NAME_MAX_LENGTH);
    expect(validateProductUnitGroup({ ...good(), groupName: ok })).toBeNull();
  });

  it('PUV8: rejects non-array units', () => {
    expect(validateProductUnitGroup({ ...good(), units: 'x' })?.[0]).toBe('units');
    expect(validateProductUnitGroup({ ...good(), units: {} })?.[0]).toBe('units');
  });

  it('PUV9: rejects empty units (< MIN_UNITS)', () => {
    expect(validateProductUnitGroup({ ...good(), units: [] })?.[0]).toBe('units');
  });

  it('PUV10: rejects units longer than MAX_UNITS', () => {
    const tooMany = Array.from({ length: MAX_UNITS + 1 }, (_, i) =>
      ({ name: `u${i}`, amount: i === 0 ? 1 : 2, isBase: i === 0 }));
    expect(validateProductUnitGroup({ ...good(), units: tooMany })?.[0]).toBe('units');
  });

  it('PUV11: accepts units exactly at MAX_UNITS', () => {
    const atMax = Array.from({ length: MAX_UNITS }, (_, i) =>
      ({ name: `u${i}`, amount: i === 0 ? 1 : (i + 1), isBase: i === 0 }));
    expect(validateProductUnitGroup({ ...good(), units: atMax })).toBeNull();
  });

  it('PUV12: rejects unit row with missing name', () => {
    const r = validateProductUnitGroup({
      ...good(),
      units: [
        { name: '', amount: 1, isBase: true },
        { name: 'amp', amount: 10, isBase: false },
      ],
    });
    expect(r?.[0]).toBe('units.0.name');
  });

  it('PUV13: rejects unit name longer than UNIT_NAME_MAX_LENGTH', () => {
    const long = 'a'.repeat(UNIT_NAME_MAX_LENGTH + 1);
    const r = validateProductUnitGroup({
      ...good(),
      units: [
        { name: 'เข็ม', amount: 1, isBase: true },
        { name: long, amount: 10, isBase: false },
      ],
    });
    expect(r?.[0]).toBe('units.1.name');
  });

  it('PUV14: rejects duplicate unit names (case-insensitive)', () => {
    const r = validateProductUnitGroup({
      ...good(),
      units: [
        { name: 'amp', amount: 1, isBase: true },
        { name: 'AMP', amount: 10, isBase: false },
      ],
    });
    expect(r?.[0]).toBe('units.1.name');
  });

  it('PUV15: rejects non-integer / < 1 amount', () => {
    for (const bad of [0, -1, 1.5, 'x', NaN, null]) {
      const r = validateProductUnitGroup({
        ...good(),
        units: [
          { name: 'เข็ม', amount: 1, isBase: true },
          { name: 'amp', amount: bad, isBase: false },
        ],
      });
      expect(r?.[0]).toBe('units.1.amount');
    }
  });

  it('PUV16: requires row 0 amount === 1 (base unit rule)', () => {
    const r = validateProductUnitGroup({
      ...good(),
      units: [
        { name: 'เข็ม', amount: 5, isBase: true },   // wrong — base must be 1
        { name: 'amp', amount: 10, isBase: false },
      ],
    });
    expect(r?.[0]).toBe('units.0.amount');
  });

  it('PUV17: rejects more than one isBase:true in the list', () => {
    const r = validateProductUnitGroup({
      ...good(),
      units: [
        { name: 'เข็ม', amount: 1, isBase: true },
        { name: 'amp', amount: 10, isBase: true },   // also base?
      ],
    });
    expect(r?.[0]).toBe('units');
  });

  it('PUV18: accepts units with only base (single-unit group is valid)', () => {
    const r = validateProductUnitGroup({
      ...good(),
      units: [{ name: 'ชิ้น', amount: 1, isBase: true }],
    });
    expect(r).toBeNull();
  });

  it('PUV19: rejects status outside enum', () => {
    expect(validateProductUnitGroup({ ...good(), status: 'active' })?.[0]).toBe('status');
    expect(validateProductUnitGroup({ ...good(), status: 'xxx' })?.[0]).toBe('status');
  });

  it('PUV20: accepts null / undefined status (defaults downstream)', () => {
    expect(validateProductUnitGroup({ ...good(), status: null })).toBeNull();
    expect(validateProductUnitGroup({ ...good(), status: undefined })).toBeNull();
  });
});

/* ─── PUN: normalizeProductUnitGroup ────────────────────────────────────── */

describe('normalizeProductUnitGroup — PUN1..PUN5', () => {
  it('PUN1: trims groupName and note', () => {
    const out = normalizeProductUnitGroup({
      groupName: '  amp  ', note: '  hello  ',
      units: [{ name: 'เข็ม', amount: 1, isBase: true }],
    });
    expect(out.groupName).toBe('amp');
    expect(out.note).toBe('hello');
  });

  it('PUN2: forces row 0 amount=1 + isBase=true', () => {
    const out = normalizeProductUnitGroup({
      groupName: 'amp',
      units: [{ name: 'เข็ม', amount: 5, isBase: false }],
    });
    expect(out.units[0].amount).toBe(1);
    expect(out.units[0].isBase).toBe(true);
  });

  it('PUN3: resets isBase on non-row-0 rows even if input set true', () => {
    const out = normalizeProductUnitGroup({
      groupName: 'amp',
      units: [
        { name: 'เข็ม', amount: 1, isBase: true },
        { name: 'amp', amount: 10, isBase: true },  // claimed base
      ],
    });
    expect(out.units[1].isBase).toBe(false);
  });

  it('PUN4: defaults status to ใช้งาน when missing', () => {
    const out = normalizeProductUnitGroup({
      groupName: 'amp',
      units: [{ name: 'เข็ม', amount: 1, isBase: true }],
    });
    expect(out.status).toBe('ใช้งาน');
  });

  it('PUN5: trims each unit name', () => {
    const out = normalizeProductUnitGroup({
      groupName: 'amp',
      units: [
        { name: '  เข็ม  ', amount: 1, isBase: true },
        { name: ' amp ', amount: 10, isBase: false },
      ],
    });
    expect(out.units[0].name).toBe('เข็ม');
    expect(out.units[1].name).toBe('amp');
  });
});

/* ─── PUC: Constants ────────────────────────────────────────────────────── */

describe('Constants — PUC1..PUC4', () => {
  it('PUC1: STATUS_OPTIONS matches 11.2 Thai enum (frozen)', () => {
    expect(STATUS_OPTIONS).toEqual(['ใช้งาน', 'พักใช้งาน']);
    expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
  });

  it('PUC2: MIN_UNITS ≥ 1', () => {
    expect(MIN_UNITS).toBeGreaterThanOrEqual(1);
  });

  it('PUC3: MAX_UNITS reasonable bound (2..50)', () => {
    expect(MAX_UNITS).toBeGreaterThan(1);
    expect(MAX_UNITS).toBeLessThanOrEqual(50);
  });

  it('PUC4: UNIT_NAME_MAX_LENGTH < GROUP_NAME_MAX_LENGTH', () => {
    expect(UNIT_NAME_MAX_LENGTH).toBeLessThanOrEqual(GROUP_NAME_MAX_LENGTH);
  });
});

/* ─── PUE: empty form ───────────────────────────────────────────────────── */

describe('emptyProductUnitGroupForm — PUE1..PUE2', () => {
  it('PUE1: has one base unit row pre-filled (amount=1, isBase=true)', () => {
    const f = emptyProductUnitGroupForm();
    expect(f.units).toHaveLength(1);
    expect(f.units[0].amount).toBe(1);
    expect(f.units[0].isBase).toBe(true);
  });

  it('PUE2: each call returns fresh arrays (no shared mutation)', () => {
    const a = emptyProductUnitGroupForm();
    const b = emptyProductUnitGroupForm();
    a.units.push({ name: 'x', amount: 2, isBase: false });
    expect(b.units).toHaveLength(1);
  });
});

/* ─── Rule E — static grep ──────────────────────────────────────────────── */

describe('Phase 11.3 — Rule E (Firestore ONLY) compliance', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('E1: validator has zero broker/proclinic imports', () => {
    const src = fs.readFileSync('src/lib/productUnitValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });

  it('E2: Tab + FormModal never import brokerClient', () => {
    const tab = fs.readFileSync('src/components/backend/ProductUnitsTab.jsx', 'utf-8');
    const modal = fs.readFileSync('src/components/backend/ProductUnitFormModal.jsx', 'utf-8');
    expect(tab).not.toMatch(IMPORT_BROKER);
    expect(tab).not.toMatch(FETCH_PROCLINIC);
    expect(modal).not.toMatch(IMPORT_BROKER);
    expect(modal).not.toMatch(FETCH_PROCLINIC);
  });
});

/* ─── PUT: ProductUnitsTab UI flow ──────────────────────────────────────── */

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
  listProductUnitGroups:   (...a) => mockList(...a),
  saveProductUnitGroup:    (...a) => mockSave(...a),
  deleteProductUnitGroup:  (...a) => mockDelete(...a),
  getProductUnitGroup:     vi.fn(),
  findProductUnitGroupByName: vi.fn(),
}));

import ProductUnitsTab from '../src/components/backend/ProductUnitsTab.jsx';
import ProductUnitFormModal from '../src/components/backend/ProductUnitFormModal.jsx';

function makeGroup(over = {}) {
  return {
    unitGroupId: 'UNIT-1',
    groupName: 'ampoule',
    units: [
      { name: 'เข็ม', amount: 1, isBase: true },
      { name: 'amp', amount: 10, isBase: false },
    ],
    status: 'ใช้งาน',
    note: '',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('ProductUnitsTab — PUT1..PUT8', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('PUT1: renders empty state when no groups', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีกลุ่มหน่วย/)).toBeInTheDocument());
  });

  it('PUT2: renders cards + conversion chain', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    // Conversion preview shows "1 เข็ม" (base) and "1 amp" with "10 เข็ม"
    expect(screen.getByText(/1 เข็ม/)).toBeInTheDocument();
    expect(screen.getByText(/1 amp/)).toBeInTheDocument();
    expect(screen.getByText(/10 เข็ม/)).toBeInTheDocument();
  });

  it('PUT3: search matches unit names (not just groupName)', async () => {
    mockList.mockResolvedValueOnce([
      makeGroup(),
      makeGroup({ unitGroupId: 'UNIT-2', groupName: 'bottle', units: [
        { name: 'หยด', amount: 1, isBase: true },
        { name: 'ขวด', amount: 50, isBase: false },
      ]}),
    ]);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'ขวด' } });
    expect(screen.queryByText('ampoule')).not.toBeInTheDocument();
    expect(screen.getByText('bottle')).toBeInTheDocument();
  });

  it('PUT4: status filter hides พักใช้งาน', async () => {
    mockList.mockResolvedValueOnce([
      makeGroup(),
      makeGroup({ unitGroupId: 'UNIT-2', groupName: 'off', status: 'พักใช้งาน' }),
    ]);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    fireEvent.change(screen.getByDisplayValue('สถานะทั้งหมด'), { target: { value: 'ใช้งาน' } });
    expect(screen.getByText('ampoule')).toBeInTheDocument();
    expect(screen.queryByText('off')).not.toBeInTheDocument();
  });

  it('PUT5: delete confirm YES → calls backend', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    mockList.mockResolvedValueOnce([]);
    mockDelete.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่มหน่วย ampoule'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('UNIT-1'));
    spy.mockRestore();
  });

  it('PUT6: delete confirm NO → no call', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่มหน่วย ampoule'));
    expect(mockDelete).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('PUT7: load failure shows error banner', async () => {
    mockList.mockRejectedValueOnce(new Error('perm denied'));
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
  });

  it('PUT8: unit count badge shows correct total', async () => {
    mockList.mockResolvedValueOnce([makeGroup({
      units: [
        { name: 'เข็ม', amount: 1, isBase: true },
        { name: 'amp', amount: 10, isBase: false },
        { name: 'กล่อง', amount: 100, isBase: false },
      ],
    })]);
    render(<ProductUnitsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('ampoule'));
    expect(screen.getByText(/3 หน่วย/)).toBeInTheDocument();
  });
});

/* ─── PUM: ProductUnitFormModal flow ────────────────────────────────────── */

describe('ProductUnitFormModal — PUM1..PUM10', () => {
  beforeEach(() => { mockSave.mockReset(); });

  it('PUM1: create mode opens with 1 base row pre-filled (amount=1 readonly)', () => {
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('สร้างกลุ่มหน่วย')).toBeInTheDocument();
    expect(screen.getByText('BASE')).toBeInTheDocument();
  });

  it('PUM2: edit mode pre-fills existing units', () => {
    render(<ProductUnitFormModal
      unitGroup={makeGroup({ units: [
        { name: 'เข็ม', amount: 1, isBase: true },
        { name: 'amp', amount: 10, isBase: false },
        { name: 'กล่อง', amount: 100, isBase: false },
      ]})}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('แก้ไขกลุ่มหน่วย')).toBeInTheDocument();
    expect(screen.getByDisplayValue('เข็ม')).toBeInTheDocument();
    expect(screen.getByDisplayValue('amp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('กล่อง')).toBeInTheDocument();
  });

  it('PUM3: add unit row button adds a new empty row (amount=2 default)', () => {
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const before = screen.getAllByPlaceholderText(/ชื่อหน่วย/).length;
    fireEvent.click(screen.getByText(/เพิ่มหน่วย/));
    const after = screen.getAllByPlaceholderText(/ชื่อหน่วย/).length;
    expect(after).toBe(before + 1);
  });

  it('PUM4: remove unit row removes that row (but keeps row 0)', () => {
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText(/เพิ่มหน่วย/));
    const before = screen.getAllByPlaceholderText(/ชื่อหน่วย/).length;
    const removeBtn = screen.getByLabelText('ลบหน่วยแถว 2');
    fireEvent.click(removeBtn);
    const after = screen.getAllByPlaceholderText(/ชื่อหน่วย/).length;
    expect(after).toBe(before - 1);
    // Base row still there (aria-label "ลบหน่วยแถว 1" is disabled)
    expect(screen.getByLabelText('ลบหน่วยแถว 1')).toBeDisabled();
  });

  it('PUM5: save with empty groupName → error + no save call', async () => {
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อกลุ่ม/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('PUM6: save with valid form calls saveProductUnitGroup with crypto-random UNIT id', async () => {
    mockSave.mockResolvedValueOnce();
    const onSaved = vi.fn();
    render(<ProductUnitFormModal onClose={() => {}} onSaved={onSaved} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/ampoule, bottle/), { target: { value: 'new group' } });
    fireEvent.change(screen.getByPlaceholderText(/ชื่อหน่วยเล็กที่สุด/), { target: { value: 'เข็ม' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [id, payload] = mockSave.mock.calls[0];
    expect(id).toMatch(/^UNIT-/);
    expect(payload.groupName).toBe('new group');
    expect(payload.units[0].name).toBe('เข็ม');
  });

  it('PUM7: edit mode preserves unitGroupId on save (no crypto regen)', async () => {
    mockSave.mockResolvedValueOnce();
    render(<ProductUnitFormModal
      unitGroup={makeGroup()}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toBe('UNIT-1');
  });

  it('PUM8: save error surfaces message', async () => {
    mockSave.mockRejectedValueOnce(new Error('firestore down'));
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/ampoule, bottle/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/ชื่อหน่วยเล็กที่สุด/), { target: { value: 'เข็ม' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText('firestore down')).toBeInTheDocument());
  });

  it('PUM9: base row amount input is read-only (locked to 1)', () => {
    render(<ProductUnitFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    // First number input (base row amount) has readOnly attr.
    const amountInputs = screen.getAllByRole('spinbutton');
    expect(amountInputs[0]).toHaveAttribute('readOnly');
  });

  it('PUM10: ESC closes modal', () => {
    const onClose = vi.fn();
    render(<ProductUnitFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
