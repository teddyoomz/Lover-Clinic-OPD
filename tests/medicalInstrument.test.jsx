// ─── Medical Instrument — Phase 11.4 adversarial tests ────────────────────
// Fields per Triangle intel + our extensions (status, maintenanceLog).
// Validator / normalizer / daysUntilMaintenance helper + Tab + Modal flows.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validateMedicalInstrument,
  normalizeMedicalInstrument,
  emptyMedicalInstrumentForm,
  daysUntilMaintenance,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  CODE_MAX_LENGTH,
  MAX_LOG_ENTRIES,
} from '../src/lib/medicalInstrumentValidation.js';

/* ─── MIV: validator ────────────────────────────────────────────────────── */

describe('validateMedicalInstrument — MIV1..MIV16', () => {
  const good = () => ({ ...emptyMedicalInstrumentForm(), name: 'Ultraformer III' });

  it('MIV1: minimal valid (name only)', () => {
    expect(validateMedicalInstrument(good())).toBeNull();
  });

  it('MIV2: rejects null / undefined / array', () => {
    expect(validateMedicalInstrument(null)?.[0]).toBe('form');
    expect(validateMedicalInstrument([])?.[0]).toBe('form');
  });

  it('MIV3: rejects missing / blank / non-string name', () => {
    expect(validateMedicalInstrument({})?.[0]).toBe('name');
    expect(validateMedicalInstrument({ name: '' })?.[0]).toBe('name');
    expect(validateMedicalInstrument({ name: '  ' })?.[0]).toBe('name');
    expect(validateMedicalInstrument({ name: 42 })?.[0]).toBe('name');
  });

  it('MIV4: name boundary', () => {
    expect(validateMedicalInstrument({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH) })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), name: 'a'.repeat(NAME_MAX_LENGTH + 1) })?.[0]).toBe('name');
  });

  it('MIV5: code optional — empty/undefined accepted', () => {
    expect(validateMedicalInstrument({ ...good(), code: '' })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), code: undefined })).toBeNull();
  });

  it('MIV6: code length bound', () => {
    expect(validateMedicalInstrument({ ...good(), code: 'x'.repeat(CODE_MAX_LENGTH + 1) })?.[0]).toBe('code');
  });

  it('MIV7: costPrice optional — empty accepted', () => {
    expect(validateMedicalInstrument({ ...good(), costPrice: '' })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), costPrice: null })).toBeNull();
  });

  it('MIV8: costPrice rejects negative / NaN', () => {
    expect(validateMedicalInstrument({ ...good(), costPrice: -1 })?.[0]).toBe('costPrice');
    expect(validateMedicalInstrument({ ...good(), costPrice: 'xyz' })?.[0]).toBe('costPrice');
  });

  it('MIV9: costPrice accepts 0 + positive', () => {
    expect(validateMedicalInstrument({ ...good(), costPrice: 0 })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), costPrice: 850000 })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), costPrice: '850000' })).toBeNull();
  });

  it('MIV10: purchaseDate must be YYYY-MM-DD', () => {
    expect(validateMedicalInstrument({ ...good(), purchaseDate: '2026/01/15' })?.[0]).toBe('purchaseDate');
    expect(validateMedicalInstrument({ ...good(), purchaseDate: '15-01-2026' })?.[0]).toBe('purchaseDate');
    expect(validateMedicalInstrument({ ...good(), purchaseDate: '2026-01-15' })).toBeNull();
  });

  it('MIV11: maintenanceIntervalMonths must be integer ≥ 0', () => {
    expect(validateMedicalInstrument({ ...good(), maintenanceIntervalMonths: 6 })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), maintenanceIntervalMonths: 0 })).toBeNull();
    expect(validateMedicalInstrument({ ...good(), maintenanceIntervalMonths: -1 })?.[0]).toBe('maintenanceIntervalMonths');
    expect(validateMedicalInstrument({ ...good(), maintenanceIntervalMonths: 2.5 })?.[0]).toBe('maintenanceIntervalMonths');
  });

  it('MIV12: nextMaintenanceDate validates format + cross-field rule', () => {
    expect(validateMedicalInstrument({ ...good(), nextMaintenanceDate: 'abc' })?.[0]).toBe('nextMaintenanceDate');
    expect(validateMedicalInstrument({ ...good(), purchaseDate: '2026-06-01', nextMaintenanceDate: '2026-03-01' })?.[0]).toBe('nextMaintenanceDate');
    expect(validateMedicalInstrument({ ...good(), purchaseDate: '2026-01-01', nextMaintenanceDate: '2026-07-01' })).toBeNull();
  });

  it('MIV13: status enum', () => {
    expect(validateMedicalInstrument({ ...good(), status: 'active' })?.[0]).toBe('status');
    for (const s of STATUS_OPTIONS) {
      expect(validateMedicalInstrument({ ...good(), status: s })).toBeNull();
    }
  });

  it('MIV14: maintenanceLog array + each entry valid', () => {
    expect(validateMedicalInstrument({ ...good(), maintenanceLog: 'x' })?.[0]).toBe('maintenanceLog');
    expect(validateMedicalInstrument({ ...good(), maintenanceLog: [{}] })?.[0]).toBe('maintenanceLog.0.date');
    expect(validateMedicalInstrument({ ...good(), maintenanceLog: [{ date: '2026-02-01', cost: -1 }] })?.[0]).toBe('maintenanceLog.0.cost');
    expect(validateMedicalInstrument({ ...good(), maintenanceLog: [{ date: '2026-02-01', cost: 1000, note: 123 }] })?.[0]).toBe('maintenanceLog.0.note');
  });

  it('MIV15: maintenanceLog caps at MAX_LOG_ENTRIES', () => {
    const many = Array.from({ length: MAX_LOG_ENTRIES + 1 }, () => ({ date: '2026-02-01' }));
    expect(validateMedicalInstrument({ ...good(), maintenanceLog: many })?.[0]).toBe('maintenanceLog');
  });

  it('MIV16: all optional fields truly optional in minimal form', () => {
    const r = validateMedicalInstrument({
      name: 'Laser',
      // everything else absent
    });
    expect(r).toBeNull();
  });
});

/* ─── MIN: normalizer ──────────────────────────────────────────────────── */

describe('normalizeMedicalInstrument — MIN1..MIN5', () => {
  it('MIN1: trims strings; coerces empty to null for numeric fields', () => {
    const out = normalizeMedicalInstrument({
      name: '  Laser  ', code: ' C ', note: ' hi ',
      costPrice: '', maintenanceIntervalMonths: '',
    });
    expect(out.name).toBe('Laser');
    expect(out.code).toBe('C');
    expect(out.note).toBe('hi');
    expect(out.costPrice).toBeNull();
    expect(out.maintenanceIntervalMonths).toBeNull();
  });

  it('MIN2: coerces numeric strings to numbers', () => {
    const out = normalizeMedicalInstrument({ name: 'X', costPrice: '850000', maintenanceIntervalMonths: '6' });
    expect(out.costPrice).toBe(850000);
    expect(out.maintenanceIntervalMonths).toBe(6);
  });

  it('MIN3: defaults status to ใช้งาน', () => {
    const out = normalizeMedicalInstrument({ name: 'X' });
    expect(out.status).toBe('ใช้งาน');
  });

  it('MIN4: drops maintenanceLog entries without date', () => {
    const out = normalizeMedicalInstrument({
      name: 'X',
      maintenanceLog: [
        { date: '2026-02-01', cost: 1000 },
        { date: '', cost: 500 },        // dropped
        { date: '2026-04-01' },
      ],
    });
    expect(out.maintenanceLog).toHaveLength(2);
  });

  it('MIN5: trims + coerces inside maintenanceLog entries', () => {
    const out = normalizeMedicalInstrument({
      name: 'X',
      maintenanceLog: [
        { date: '2026-02-01', cost: '1500', note: '  ok  ', performedBy: ' tech ' },
      ],
    });
    expect(out.maintenanceLog[0].cost).toBe(1500);
    expect(out.maintenanceLog[0].note).toBe('ok');
    expect(out.maintenanceLog[0].performedBy).toBe('tech');
  });
});

/* ─── MID: daysUntilMaintenance helper ─────────────────────────────────── */

describe('daysUntilMaintenance — MID1..MID5', () => {
  it('MID1: null / invalid input returns null', () => {
    expect(daysUntilMaintenance(null)).toBeNull();
    expect(daysUntilMaintenance(undefined)).toBeNull();
    expect(daysUntilMaintenance('abc')).toBeNull();
    expect(daysUntilMaintenance('')).toBeNull();
  });

  it('MID2: future date returns positive days', () => {
    expect(daysUntilMaintenance('2026-05-10', '2026-05-01')).toBe(9);
  });

  it('MID3: today returns 0', () => {
    expect(daysUntilMaintenance('2026-05-01', '2026-05-01')).toBe(0);
  });

  it('MID4: past date returns negative (overdue)', () => {
    expect(daysUntilMaintenance('2026-04-20', '2026-05-01')).toBe(-11);
  });

  it('MID5: cross-month boundary correct', () => {
    expect(daysUntilMaintenance('2026-02-01', '2026-01-30')).toBe(2);
  });
});

/* ─── Rule E ───────────────────────────────────────────────────────────── */

describe('Phase 11.4 — Rule E compliance', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('E1: validator has no broker/proclinic imports', () => {
    const src = fs.readFileSync('src/lib/medicalInstrumentValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });

  it('E2: Tab + FormModal have no broker/proclinic imports', () => {
    const tab = fs.readFileSync('src/components/backend/MedicalInstrumentsTab.jsx', 'utf-8');
    const modal = fs.readFileSync('src/components/backend/MedicalInstrumentFormModal.jsx', 'utf-8');
    expect(tab).not.toMatch(IMPORT_BROKER);
    expect(tab).not.toMatch(FETCH_PROCLINIC);
    expect(modal).not.toMatch(IMPORT_BROKER);
    expect(modal).not.toMatch(FETCH_PROCLINIC);
  });
});

/* ─── MIT: Tab flow ────────────────────────────────────────────────────── */

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
  listMedicalInstruments:   (...a) => mockList(...a),
  saveMedicalInstrument:    (...a) => mockSave(...a),
  deleteMedicalInstrument:  (...a) => mockDelete(...a),
  getMedicalInstrument:     vi.fn(),
}));

import MedicalInstrumentsTab from '../src/components/backend/MedicalInstrumentsTab.jsx';
import MedicalInstrumentFormModal from '../src/components/backend/MedicalInstrumentFormModal.jsx';

function makeInst(over = {}) {
  return {
    instrumentId: 'INST-1',
    name: 'Ultraformer III',
    code: 'U3-001',
    costPrice: 850000,
    purchaseDate: '2024-01-15',
    maintenanceIntervalMonths: 6,
    nextMaintenanceDate: '2026-07-15',
    maintenanceLog: [],
    status: 'ใช้งาน',
    note: '',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('MedicalInstrumentsTab — MIT1..MIT7', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('MIT1: empty state', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีเครื่องหัตถการ/)).toBeInTheDocument());
  });

  it('MIT2: renders cards with code + cost', async () => {
    mockList.mockResolvedValueOnce([makeInst()]);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Ultraformer III'));
    expect(screen.getByText(/#U3-001/)).toBeInTheDocument();
    // Thai locale number formatting — 850,000
    expect(screen.getByText(/850,000/)).toBeInTheDocument();
  });

  it('MIT3: search matches code and note', async () => {
    mockList.mockResolvedValueOnce([
      makeInst(),
      makeInst({ instrumentId: 'INST-2', name: 'HIFU', code: 'H-02', note: 'Korean import' }),
    ]);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Ultraformer III'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'korean' } });
    expect(screen.queryByText('Ultraformer III')).not.toBeInTheDocument();
    expect(screen.getByText('HIFU')).toBeInTheDocument();
  });

  it('MIT4: status filter narrows list', async () => {
    mockList.mockResolvedValueOnce([
      makeInst(),
      makeInst({ instrumentId: 'INST-2', name: 'Off', status: 'ซ่อมบำรุง' }),
    ]);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Ultraformer III'));
    fireEvent.change(screen.getByDisplayValue('สถานะทั้งหมด'), { target: { value: 'ซ่อมบำรุง' } });
    expect(screen.queryByText('Ultraformer III')).not.toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('MIT5: delete confirm YES calls backend', async () => {
    mockList.mockResolvedValueOnce([makeInst()]);
    mockList.mockResolvedValueOnce([]);
    mockDelete.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Ultraformer III'));
    fireEvent.click(screen.getByLabelText('ลบเครื่อง Ultraformer III'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('INST-1'));
    spy.mockRestore();
  });

  it('MIT6: load error shows message', async () => {
    mockList.mockRejectedValueOnce(new Error('perm denied'));
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('perm denied')).toBeInTheDocument());
  });

  it('MIT7: maintenance log count badge renders when > 0', async () => {
    mockList.mockResolvedValueOnce([makeInst({
      maintenanceLog: [
        { date: '2026-02-01', cost: 1000 },
        { date: '2026-04-01', cost: 500 },
      ],
    })]);
    render(<MedicalInstrumentsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Ultraformer III'));
    const card = screen.getByTestId('instrument-card-INST-1');
    expect(card.textContent).toMatch(/2 ครั้ง/);
  });
});

/* ─── MIM: Modal flow ──────────────────────────────────────────────────── */

describe('MedicalInstrumentFormModal — MIM1..MIM8', () => {
  beforeEach(() => { mockSave.mockReset(); });

  it('MIM1: create mode opens blank', () => {
    render(<MedicalInstrumentFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('สร้างเครื่องหัตถการ')).toBeInTheDocument();
  });

  it('MIM2: edit mode pre-fills', () => {
    render(<MedicalInstrumentFormModal instrument={makeInst()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('Ultraformer III')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U3-001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('850000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
  });

  it('MIM3: save with empty name → error', async () => {
    render(<MedicalInstrumentFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อเครื่อง/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('MIM4: save with only name + INST crypto id', async () => {
    mockSave.mockResolvedValueOnce();
    const onSaved = vi.fn();
    render(<MedicalInstrumentFormModal onClose={() => {}} onSaved={onSaved} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText(/Ultraformer/), { target: { value: 'Laser-X' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [id, payload] = mockSave.mock.calls[0];
    expect(id).toMatch(/^INST-/);
    expect(payload.name).toBe('Laser-X');
  });

  it('MIM5: add maintenance log row appends entry', () => {
    render(<MedicalInstrumentFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText(/เพิ่มประวัติ/));
    expect(screen.getByPlaceholderText(/หมายเหตุ/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ผู้ดำเนินการ/)).toBeInTheDocument();
  });

  it('MIM6: remove log row removes it', () => {
    render(<MedicalInstrumentFormModal
      instrument={makeInst({ maintenanceLog: [{ date: '2026-02-01', cost: 1000, note: 'ok', performedBy: 'tech' }] })}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('ok')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('ลบประวัติแถว 1'));
    expect(screen.queryByDisplayValue('ok')).not.toBeInTheDocument();
  });

  it('MIM7: edit preserves id', async () => {
    mockSave.mockResolvedValueOnce();
    render(<MedicalInstrumentFormModal instrument={makeInst()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toBe('INST-1');
  });

  it('MIM8: ESC closes modal', () => {
    const onClose = vi.fn();
    render(<MedicalInstrumentFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
