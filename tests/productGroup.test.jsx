// ─── Product Group — Phase 11.2 adversarial tests ──────────────────────────
// Pure validator + UI flows (mocked backendClient). Covers PV1-PV15 (validator),
// PC1-PC5 (constants), PE1-PE2 (empty form), PU1-PU10 (tab), PM1-PM10 (modal).
//
// Iron-clad:
//   - Rule E: validator + UI must not import brokerClient — static grep (E1, E2)
//   - Rule C2: ID via crypto-random — guarded by reusing generateMarketingId
//   - Rule D: every branch of validateProductGroup has an adversarial case

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validateProductGroup,
  emptyProductGroupForm,
  PRODUCT_TYPES,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
} from '../src/lib/productGroupValidation.js';

/* ─── PV: validateProductGroup adversarial ──────────────────────────────── */

describe('validateProductGroup — PV1..PV15', () => {
  const good = () => ({ ...emptyProductGroupForm(), name: 'Botox' });

  it('PV1: passes minimal valid form (name + productType=default)', () => {
    expect(validateProductGroup(good())).toBeNull();
  });

  it('PV2: rejects null form', () => {
    expect(validateProductGroup(null)?.[0]).toBe('form');
  });

  it('PV3: rejects undefined form', () => {
    expect(validateProductGroup(undefined)?.[0]).toBe('form');
  });

  it('PV4: rejects non-object form (string/number/bool/array)', () => {
    expect(validateProductGroup('x')?.[0]).toBe('form');
    expect(validateProductGroup(42)?.[0]).toBe('form');
    expect(validateProductGroup(true)?.[0]).toBe('form');
    expect(validateProductGroup([1, 2])?.[0]).toBe('form');
  });

  it('PV5: rejects missing name (undefined)', () => {
    expect(validateProductGroup({ productType: 'ยา' })?.[0]).toBe('name');
  });

  it('PV6: rejects blank / whitespace-only name', () => {
    expect(validateProductGroup({ ...good(), name: '' })?.[0]).toBe('name');
    expect(validateProductGroup({ ...good(), name: '   ' })?.[0]).toBe('name');
    expect(validateProductGroup({ ...good(), name: '\t\n ' })?.[0]).toBe('name');
  });

  it('PV7: rejects non-string name (number, bool, null, object)', () => {
    for (const bad of [42, true, null, {}, [], undefined]) {
      const r = validateProductGroup({ ...good(), name: bad });
      expect(r?.[0]).toBe('name');
    }
  });

  it('PV8: rejects name beyond NAME_MAX_LENGTH', () => {
    const long = 'a'.repeat(NAME_MAX_LENGTH + 1);
    expect(validateProductGroup({ ...good(), name: long })?.[0]).toBe('name');
  });

  it('PV9: accepts name == NAME_MAX_LENGTH boundary', () => {
    const ok = 'a'.repeat(NAME_MAX_LENGTH);
    expect(validateProductGroup({ ...good(), name: ok })).toBeNull();
  });

  it('PV10: rejects productType outside enum (case-sensitive)', () => {
    expect(validateProductGroup({ ...good(), productType: 'xxx' })?.[0]).toBe('productType');
    expect(validateProductGroup({ ...good(), productType: 'ยา ' })?.[0]).toBe('productType'); // trailing space
    expect(validateProductGroup({ ...good(), productType: '' })?.[0]).toBe('productType');
    expect(validateProductGroup({ ...good(), productType: null })?.[0]).toBe('productType');
    expect(validateProductGroup({ ...good(), productType: undefined })?.[0]).toBe('productType');
  });

  it('PV11: accepts every enum value for productType', () => {
    for (const t of PRODUCT_TYPES) {
      expect(validateProductGroup({ ...good(), productType: t })).toBeNull();
    }
  });

  it('PV12: rejects status outside enum (when provided)', () => {
    expect(validateProductGroup({ ...good(), status: 'xxx' })?.[0]).toBe('status');
    expect(validateProductGroup({ ...good(), status: 'active' })?.[0]).toBe('status'); // Phase 9 English leaks
  });

  it('PV13: accepts null/undefined status (defaults apply downstream)', () => {
    expect(validateProductGroup({ ...good(), status: null })).toBeNull();
    expect(validateProductGroup({ ...good(), status: undefined })).toBeNull();
  });

  it('PV14: productIds must be array if provided', () => {
    expect(validateProductGroup({ ...good(), productIds: 'x' })?.[0]).toBe('productIds');
    expect(validateProductGroup({ ...good(), productIds: 42 })?.[0]).toBe('productIds');
    expect(validateProductGroup({ ...good(), productIds: {} })?.[0]).toBe('productIds');
    expect(validateProductGroup({ ...good(), productIds: [] })).toBeNull();
    expect(validateProductGroup({ ...good(), productIds: ['P1', 'P2'] })).toBeNull();
  });

  it('PV15: trims name before length check', () => {
    const padded = '  ' + 'a'.repeat(NAME_MAX_LENGTH) + '  ';
    expect(validateProductGroup({ ...good(), name: padded })).toBeNull();
    const tooLongTrimmed = '  ' + 'a'.repeat(NAME_MAX_LENGTH + 1);
    expect(validateProductGroup({ ...good(), name: tooLongTrimmed })?.[0]).toBe('name');
  });
});

/* ─── PC: Constants shape ───────────────────────────────────────────────── */

describe('Constants — PC1..PC5', () => {
  it('PC1: PRODUCT_TYPES has exactly 4 entries matching ProClinic', () => {
    expect(PRODUCT_TYPES).toHaveLength(4);
    expect(PRODUCT_TYPES).toEqual(['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ']);
  });

  it('PC2: PRODUCT_TYPES is frozen (prevent accidental mutation)', () => {
    expect(Object.isFrozen(PRODUCT_TYPES)).toBe(true);
  });

  it('PC3: STATUS_OPTIONS Thai-only, no English', () => {
    expect(STATUS_OPTIONS).toEqual(['ใช้งาน', 'พักใช้งาน']);
    expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
  });

  it('PC4: NAME_MAX_LENGTH within reasonable UI bound (40..200)', () => {
    expect(NAME_MAX_LENGTH).toBeGreaterThanOrEqual(40);
    expect(NAME_MAX_LENGTH).toBeLessThanOrEqual(200);
  });

  it('PC5: no duplicate values in either enum', () => {
    expect(new Set(PRODUCT_TYPES).size).toBe(PRODUCT_TYPES.length);
    expect(new Set(STATUS_OPTIONS).size).toBe(STATUS_OPTIONS.length);
  });
});

/* ─── PE: emptyProductGroupForm shape ───────────────────────────────────── */

describe('emptyProductGroupForm — PE1..PE2', () => {
  it('PE1: returns a valid starting form (passes validator as-is after name set)', () => {
    const form = emptyProductGroupForm();
    expect(form.productType).toBeTruthy();
    expect(PRODUCT_TYPES).toContain(form.productType);
    expect(STATUS_OPTIONS).toContain(form.status);
    expect(Array.isArray(form.productIds)).toBe(true);
    expect(form.productIds).toHaveLength(0);
  });

  it('PE2: each call returns a NEW object (no shared mutation)', () => {
    const a = emptyProductGroupForm();
    const b = emptyProductGroupForm();
    a.name = 'mutated';
    a.productIds.push('x');
    expect(b.name).toBe('');
    expect(b.productIds).toHaveLength(0);
  });
});

/* ─── Rule E compliance ─────────────────────────────────────────────────── */

describe('Phase 11.2 — Rule E (Firestore ONLY) compliance', () => {
  // Match import/require statements only — comments mentioning "brokerClient"
  // as a rule name are fine. Regex captures any form of `from '...brokerClient...'`
  // or `require('...brokerClient...')`.
  const IMPORT_BROKER_RE = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC_RE = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('E1: validator has zero broker/proclinic imports', () => {
    const src = fs.readFileSync('src/lib/productGroupValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER_RE);
    expect(src).not.toMatch(FETCH_PROCLINIC_RE);
  });

  it('E2: ProductGroupsTab + FormModal never import brokerClient', () => {
    const tab = fs.readFileSync('src/components/backend/ProductGroupsTab.jsx', 'utf-8');
    const modal = fs.readFileSync('src/components/backend/ProductGroupFormModal.jsx', 'utf-8');
    expect(tab).not.toMatch(IMPORT_BROKER_RE);
    expect(tab).not.toMatch(FETCH_PROCLINIC_RE);
    expect(modal).not.toMatch(IMPORT_BROKER_RE);
    expect(modal).not.toMatch(FETCH_PROCLINIC_RE);
  });

  it('E3: firestore.rules has be_product_groups entry with clinicStaff gate (Rule B trigger)', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf-8');
    expect(rules).toMatch(/match \/be_product_groups\/\{groupId\}/);
    // Same line or next must reference isClinicStaff (not `if true`, not uid).
    const block = rules.split(/match \/be_product_groups\/\{groupId\}/)[1].split('}')[0];
    expect(block).toMatch(/isClinicStaff\(\)/);
    expect(block).not.toMatch(/if true/);
  });
});

/* ─── PU: ProductGroupsTab UI flow ───────────────────────────────────────── */

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

// Firebase stub (setup.js loads real firebase which would fail without signed-in user).
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

// backendClient — mock only the fns Tab/Modal use.
const mockList = vi.fn();
const mockSave = vi.fn();
const mockDelete = vi.fn();
vi.mock('../src/lib/backendClient.js', () => ({
  listProductGroups:   (...a) => mockList(...a),
  saveProductGroup:    (...a) => mockSave(...a),
  deleteProductGroup:  (...a) => mockDelete(...a),
  getProductGroup:     vi.fn(),
  findProductGroupByName: vi.fn(),
}));

import ProductGroupsTab from '../src/components/backend/ProductGroupsTab.jsx';
import ProductGroupFormModal from '../src/components/backend/ProductGroupFormModal.jsx';

function makeGroup(over = {}) {
  return {
    groupId: 'GRP-1',
    name: 'Botox',
    productType: 'ยา',
    status: 'ใช้งาน',
    productIds: [],
    note: '',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('ProductGroupsTab — PU1..PU10', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('PU1: renders title + empty state when no groups', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<ProductGroupsTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีกลุ่มสินค้า/)).toBeInTheDocument());
    expect(screen.getByText('กลุ่มสินค้า')).toBeInTheDocument();
  });

  it('PU2: renders cards when groups load', async () => {
    mockList.mockResolvedValueOnce([makeGroup(), makeGroup({ groupId: 'GRP-2', name: 'Filler', productType: 'บริการ' })]);
    render(<ProductGroupsTab clinicSettings={{ accentColor: '#dc2626' }} />);
    await waitFor(() => expect(screen.getByText('Botox')).toBeInTheDocument());
    expect(screen.getByText('Filler')).toBeInTheDocument();
  });

  it('PU3: search filters by name (case-insensitive)', async () => {
    mockList.mockResolvedValueOnce([makeGroup(), makeGroup({ groupId: 'GRP-2', name: 'Filler' })]);
    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'fil' } });
    expect(screen.queryByText('Botox')).not.toBeInTheDocument();
    expect(screen.getByText('Filler')).toBeInTheDocument();
  });

  it('PU4: type filter narrows the list', async () => {
    mockList.mockResolvedValueOnce([
      makeGroup({ productType: 'ยา' }),
      makeGroup({ groupId: 'GRP-2', name: 'Consult', productType: 'บริการ' }),
    ]);
    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.change(screen.getByDisplayValue('ประเภททั้งหมด'), { target: { value: 'บริการ' } });
    expect(screen.queryByText('Botox')).not.toBeInTheDocument();
    expect(screen.getByText('Consult')).toBeInTheDocument();
  });

  it('PU5: status filter hides พักใช้งาน when filter=ใช้งาน', async () => {
    mockList.mockResolvedValueOnce([
      makeGroup(),
      makeGroup({ groupId: 'GRP-2', name: 'Off', status: 'พักใช้งาน' }),
    ]);
    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.change(screen.getByDisplayValue('สถานะทั้งหมด'), { target: { value: 'ใช้งาน' } });
    expect(screen.getByText('Botox')).toBeInTheDocument();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
  });

  it('PU6: delete asks confirm + calls deleteProductGroup on accept', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    mockList.mockResolvedValueOnce([]); // reload after delete
    mockDelete.mockResolvedValueOnce(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่ม Botox'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('GRP-1'));
    confirmSpy.mockRestore();
  });

  it('PU7: delete confirm NO → no backend call', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่ม Botox'));
    expect(mockDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('PU8: delete error surfaces in error banner', async () => {
    mockList.mockResolvedValueOnce([makeGroup()]);
    mockDelete.mockRejectedValueOnce(new Error('perm denied'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    fireEvent.click(screen.getByLabelText('ลบกลุ่ม Botox'));
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('PU9: load failure shows Thai error', async () => {
    mockList.mockRejectedValueOnce(new Error('network'));
    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('network')).toBeInTheDocument());
  });

  it('PU10: displays product count badge from productIds array', async () => {
    mockList.mockResolvedValueOnce([makeGroup({ productIds: ['P1', 'P2', 'P3'] })]);
    render(<ProductGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Botox'));
    // "3 สินค้าในกลุ่ม" with the number bolded separately — verify by testid
    const card = screen.getByTestId('group-card-GRP-1');
    expect(card.textContent).toMatch(/3.*สินค้าในกลุ่ม/);
  });
});

/* ─── PM: ProductGroupFormModal flow ───────────────────────────────────── */

describe('ProductGroupFormModal — PM1..PM10', () => {
  beforeEach(() => { mockSave.mockReset(); });

  it('PM1: opens in create mode with blank defaults', () => {
    render(<ProductGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('สร้างกลุ่มสินค้า')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Botox/)).toHaveValue('');
  });

  it('PM2: opens in edit mode with prefilled data', () => {
    render(<ProductGroupFormModal
      productGroup={makeGroup({ name: 'Filler', productType: 'บริการ', status: 'พักใช้งาน', note: 'hello' })}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('แก้ไขกลุ่มสินค้า')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Botox/)).toHaveValue('Filler');
    expect(screen.getByDisplayValue('บริการ')).toBeInTheDocument();
    expect(screen.getByDisplayValue('พักใช้งาน')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/บันทึกเพิ่มเติม|เงื่อนไข/)).toHaveValue('hello');
  });

  it('PM3: save with empty name → error banner + no save call', async () => {
    render(<ProductGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อ/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('PM4: save with valid form → calls saveProductGroup + onSaved', async () => {
    mockSave.mockResolvedValueOnce(undefined);
    const onSaved = vi.fn();
    render(<ProductGroupFormModal onClose={() => {}} onSaved={onSaved} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/Botox/), { target: { value: 'New Group' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [id, payload] = mockSave.mock.calls[0];
    expect(id).toMatch(/^GRP-/);                // crypto-random prefix
    expect(payload.name).toBe('New Group');
    expect(payload.productType).toBe('ยา');
    expect(payload.status).toBe('ใช้งาน');
    expect(onSaved).toHaveBeenCalled();
  });

  it('PM5: edit mode preserves existing groupId (no new id)', async () => {
    mockSave.mockResolvedValueOnce(undefined);
    render(<ProductGroupFormModal productGroup={makeGroup()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toBe('GRP-1');
  });

  it('PM6: save error surfaces in error banner', async () => {
    mockSave.mockRejectedValueOnce(new Error('firestore down'));
    render(<ProductGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/Botox/), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText('firestore down')).toBeInTheDocument());
  });

  it('PM7: ESC closes modal (via MarketingFormShell ESC handler)', () => {
    const onClose = vi.fn();
    render(<ProductGroupFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('PM8: productType select offers all 4 Thai options', () => {
    render(<ProductGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    for (const t of PRODUCT_TYPES) {
      expect(screen.getByRole('option', { name: t })).toBeInTheDocument();
    }
  });

  it('PM9: trims name before save (no leading/trailing whitespace persists)', async () => {
    mockSave.mockResolvedValueOnce(undefined);
    render(<ProductGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/Botox/), { target: { value: '   Padded   ' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1].name).toBe('Padded');
  });

  it('PM10: edit mode shows linked-product count when productIds present', () => {
    render(<ProductGroupFormModal
      productGroup={makeGroup({ productIds: ['P1', 'P2', 'P3', 'P4'] })}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/4/)).toBeInTheDocument();
    expect(screen.getByText(/สินค้าที่ผูก/)).toBeInTheDocument();
  });
});
