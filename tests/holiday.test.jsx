// ─── Holiday — Phase 11.5 adversarial tests ────────────────────────────────
// Validator (specific + weekly types) / normalizer / isDateHoliday pure
// decider + Tab + Modal flows.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import {
  validateHoliday,
  normalizeHoliday,
  emptyHolidayForm,
  isDateHoliday,
  HOLIDAY_TYPES,
  STATUS_OPTIONS,
  DAY_OF_WEEK_LABELS,
  NOTE_MAX_LENGTH,
  MAX_SPECIFIC_DATES,
} from '../src/lib/holidayValidation.js';

/* ─── HV: validator ─────────────────────────────────────────────────────── */

describe('validateHoliday — HV1..HV13', () => {
  const specificGood = () => ({ ...emptyHolidayForm('specific'), dates: ['2026-04-13'] });
  const weeklyGood   = () => ({ ...emptyHolidayForm('weekly'), dayOfWeek: 0 });

  it('HV1: specific happy path', () => {
    expect(validateHoliday(specificGood())).toBeNull();
  });

  it('HV2: weekly happy path', () => {
    expect(validateHoliday(weeklyGood())).toBeNull();
  });

  it('HV3: rejects null / array form', () => {
    expect(validateHoliday(null)?.[0]).toBe('form');
    expect(validateHoliday([])?.[0]).toBe('form');
  });

  it('HV4: rejects invalid type', () => {
    expect(validateHoliday({ ...specificGood(), type: 'xxx' })?.[0]).toBe('type');
    expect(validateHoliday({ ...specificGood(), type: '' })?.[0]).toBe('type');
  });

  it('HV5: specific: requires ≥ 1 date', () => {
    expect(validateHoliday({ type: 'specific', dates: [] })?.[0]).toBe('dates');
    expect(validateHoliday({ type: 'specific' })?.[0]).toBe('dates');
  });

  it('HV6: specific: rejects malformed date string', () => {
    expect(validateHoliday({ type: 'specific', dates: ['2026/04/13'] })?.[0]).toBe('dates.0');
    expect(validateHoliday({ type: 'specific', dates: ['2026-04-13', 'abc'] })?.[0]).toBe('dates.1');
  });

  it('HV7: specific: rejects duplicate dates', () => {
    expect(validateHoliday({ type: 'specific', dates: ['2026-04-13', '2026-04-13'] })?.[0]).toBe('dates.1');
  });

  it('HV8: specific: caps at MAX_SPECIFIC_DATES', () => {
    const many = Array.from({ length: MAX_SPECIFIC_DATES + 1 }, (_, i) =>
      `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
    // Dedup the synthetic set by appending unique days — use sequential real dates.
    const unique = new Set();
    let d = new Date(Date.UTC(2026, 0, 1));
    while (unique.size < MAX_SPECIFIC_DATES + 1) {
      unique.add(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86400000);
    }
    expect(validateHoliday({ type: 'specific', dates: Array.from(unique) })?.[0]).toBe('dates');
  });

  it('HV9: weekly: dayOfWeek must be integer 0..6', () => {
    expect(validateHoliday({ type: 'weekly', dayOfWeek: 7 })?.[0]).toBe('dayOfWeek');
    expect(validateHoliday({ type: 'weekly', dayOfWeek: -1 })?.[0]).toBe('dayOfWeek');
    expect(validateHoliday({ type: 'weekly', dayOfWeek: 1.5 })?.[0]).toBe('dayOfWeek');
    expect(validateHoliday({ type: 'weekly', dayOfWeek: 'x' })?.[0]).toBe('dayOfWeek');
    for (let i = 0; i <= 6; i++) {
      expect(validateHoliday({ type: 'weekly', dayOfWeek: i })).toBeNull();
    }
  });

  it('HV10: note optional, bound by NOTE_MAX_LENGTH', () => {
    expect(validateHoliday({ ...specificGood(), note: 'ok' })).toBeNull();
    expect(validateHoliday({ ...specificGood(), note: null })).toBeNull();
    expect(validateHoliday({ ...specificGood(), note: 'a'.repeat(NOTE_MAX_LENGTH + 1) })?.[0]).toBe('note');
  });

  it('HV11: status enum', () => {
    expect(validateHoliday({ ...specificGood(), status: 'xxx' })?.[0]).toBe('status');
    for (const s of STATUS_OPTIONS) {
      expect(validateHoliday({ ...specificGood(), status: s })).toBeNull();
    }
  });

  it('HV12: non-string note rejected', () => {
    expect(validateHoliday({ ...specificGood(), note: 42 })?.[0]).toBe('note');
  });

  it('HV13: HOLIDAY_TYPES is frozen + exactly 2 entries', () => {
    expect(HOLIDAY_TYPES).toEqual(['specific', 'weekly']);
    expect(Object.isFrozen(HOLIDAY_TYPES)).toBe(true);
  });
});

/* ─── HN: normalizer ───────────────────────────────────────────────────── */

describe('normalizeHoliday — HN1..HN5', () => {
  it('HN1: specific: dedup + sort ascending', () => {
    const out = normalizeHoliday({
      type: 'specific',
      dates: ['2026-04-15', '2026-04-13', '2026-04-13', '2026-04-14'],
    });
    expect(out.dates).toEqual(['2026-04-13', '2026-04-14', '2026-04-15']);
  });

  it('HN2: specific: drops invalid date strings', () => {
    const out = normalizeHoliday({
      type: 'specific',
      dates: ['2026-04-13', 'garbage', '2026/04/14'],
    });
    expect(out.dates).toEqual(['2026-04-13']);
  });

  it('HN3: weekly: clamps dayOfWeek into 0..6', () => {
    expect(normalizeHoliday({ type: 'weekly', dayOfWeek: -3 }).dayOfWeek).toBe(0);
    expect(normalizeHoliday({ type: 'weekly', dayOfWeek: 99 }).dayOfWeek).toBe(6);
    expect(normalizeHoliday({ type: 'weekly', dayOfWeek: 'x' }).dayOfWeek).toBe(0);
  });

  it('HN4: specific removes dayOfWeek; weekly removes dates', () => {
    const a = normalizeHoliday({ type: 'specific', dates: ['2026-04-13'], dayOfWeek: 3 });
    expect(a.dayOfWeek).toBeUndefined();
    const b = normalizeHoliday({ type: 'weekly', dayOfWeek: 2, dates: ['x'] });
    expect(b.dates).toBeUndefined();
  });

  it('HN5: trims note + defaults status', () => {
    const out = normalizeHoliday({ type: 'specific', dates: ['2026-04-13'], note: '  x  ' });
    expect(out.note).toBe('x');
    expect(out.status).toBe('ใช้งาน');
  });
});

/* ─── HIS: isDateHoliday pure decider ──────────────────────────────────── */

describe('isDateHoliday — HIS1..HIS8', () => {
  it('HIS1: returns null for empty holidays or bad date', () => {
    expect(isDateHoliday('2026-04-13', [])).toBeNull();
    expect(isDateHoliday('', [{ type: 'specific', dates: ['2026-04-13'] }])).toBeNull();
    expect(isDateHoliday('bad', [{ type: 'specific', dates: ['2026-04-13'] }])).toBeNull();
  });

  it('HIS2: specific-date match returns the holiday', () => {
    const h = { type: 'specific', dates: ['2026-04-13'], note: 'Songkran' };
    expect(isDateHoliday('2026-04-13', [h])).toBe(h);
    expect(isDateHoliday('2026-04-14', [h])).toBeNull();
  });

  it('HIS3: multi-date specific covers the range', () => {
    const h = { type: 'specific', dates: ['2026-04-13', '2026-04-14', '2026-04-15'] };
    expect(isDateHoliday('2026-04-14', [h])).toBe(h);
    expect(isDateHoliday('2026-04-16', [h])).toBeNull();
  });

  it('HIS4: weekly Sunday (0) matches', () => {
    // 2026-04-19 = Sunday
    const h = { type: 'weekly', dayOfWeek: 0, note: 'ปิดวันอาทิตย์' };
    expect(isDateHoliday('2026-04-19', [h])).toBe(h);
    expect(isDateHoliday('2026-04-20', [h])).toBeNull();  // Monday
  });

  it('HIS5: weekly Saturday (6) matches', () => {
    // 2026-04-18 = Saturday
    const h = { type: 'weekly', dayOfWeek: 6 };
    expect(isDateHoliday('2026-04-18', [h])).toBe(h);
  });

  it('HIS6: skips holidays with status=พักใช้งาน', () => {
    const h = { type: 'specific', dates: ['2026-04-13'], status: 'พักใช้งาน' };
    expect(isDateHoliday('2026-04-13', [h])).toBeNull();
    const ok = { type: 'specific', dates: ['2026-04-13'], status: 'ใช้งาน' };
    expect(isDateHoliday('2026-04-13', [ok])).toBe(ok);
  });

  it('HIS7: returns FIRST match when multiple apply', () => {
    const h1 = { type: 'specific', dates: ['2026-04-13'], note: 'a' };
    const h2 = { type: 'specific', dates: ['2026-04-13'], note: 'b' };
    expect(isDateHoliday('2026-04-13', [h1, h2])).toBe(h1);
  });

  it('HIS8: null in holidays array is tolerated (skipped)', () => {
    const h = { type: 'specific', dates: ['2026-04-13'] };
    expect(isDateHoliday('2026-04-13', [null, undefined, h])).toBe(h);
  });
});

/* ─── Rule E + constants ───────────────────────────────────────────────── */

describe('Phase 11.5 — constants + Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('C1: DAY_OF_WEEK_LABELS has 7 Thai labels (Sun..Sat)', () => {
    expect(DAY_OF_WEEK_LABELS).toHaveLength(7);
    expect(DAY_OF_WEEK_LABELS[0]).toBe('อาทิตย์');
    expect(DAY_OF_WEEK_LABELS[6]).toBe('เสาร์');
    expect(Object.isFrozen(DAY_OF_WEEK_LABELS)).toBe(true);
  });

  it('E1: validator no broker/proclinic imports', () => {
    const src = fs.readFileSync('src/lib/holidayValidation.js', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });

  it('E2: Tab + FormModal no broker/proclinic imports', () => {
    const tab = fs.readFileSync('src/components/backend/HolidaysTab.jsx', 'utf-8');
    const modal = fs.readFileSync('src/components/backend/HolidayFormModal.jsx', 'utf-8');
    expect(tab).not.toMatch(IMPORT_BROKER);
    expect(tab).not.toMatch(FETCH_PROCLINIC);
    expect(modal).not.toMatch(IMPORT_BROKER);
    expect(modal).not.toMatch(FETCH_PROCLINIC);
  });
});

/* ─── HT: Tab flow ─────────────────────────────────────────────────────── */

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
  listHolidays:  (...a) => mockList(...a),
  // Phase 14.7.H follow-up H (2026-04-26): HolidaysTab migrated to listener.
  // Mock invokes mockList for backwards-compat with existing test setups
  // (mockResolvedValueOnce) and pipes to onChange like onSnapshot would.
  listenToHolidays: (onChange, onError) => {
    Promise.resolve(mockList()).then(
      (items) => onChange(items || []),
      (err) => (onError || (() => {}))(err),
    );
    return () => {};
  },
  saveHoliday:   (...a) => mockSave(...a),
  deleteHoliday: (...a) => mockDelete(...a),
  getHoliday:    vi.fn(),
}));

import HolidaysTab from '../src/components/backend/HolidaysTab.jsx';
import HolidayFormModal from '../src/components/backend/HolidayFormModal.jsx';

function makeHoliday(over = {}) {
  return {
    holidayId: 'HOL-1',
    type: 'specific',
    dates: ['2026-04-13', '2026-04-14'],
    note: 'สงกรานต์',
    status: 'ใช้งาน',
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...over,
  };
}

describe('HolidaysTab — HT1..HT6', () => {
  beforeEach(() => { mockList.mockReset(); mockSave.mockReset(); mockDelete.mockReset(); });

  it('HT1: empty state', async () => {
    mockList.mockResolvedValueOnce([]);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีวันหยุด/)).toBeInTheDocument());
  });

  it('HT2: renders specific-type card with date chips', async () => {
    mockList.mockResolvedValueOnce([makeHoliday()]);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สงกรานต์'));
    expect(screen.getByText('2026-04-13')).toBeInTheDocument();
    expect(screen.getByText('2026-04-14')).toBeInTheDocument();
  });

  it('HT3: renders weekly-type card with day-of-week label', async () => {
    mockList.mockResolvedValueOnce([makeHoliday({
      holidayId: 'HOL-2', type: 'weekly', dayOfWeek: 0, dates: [], note: '',
    })]);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/ทุกวันอาทิตย์/));
  });

  it('HT4: type filter narrows list', async () => {
    mockList.mockResolvedValueOnce([
      makeHoliday(),
      makeHoliday({ holidayId: 'HOL-2', type: 'weekly', dayOfWeek: 0, dates: [], note: 'อาทิตย์' }),
    ]);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สงกรานต์'));
    fireEvent.change(screen.getByDisplayValue('ประเภททั้งหมด'), { target: { value: 'weekly' } });
    expect(screen.queryByText('สงกรานต์')).not.toBeInTheDocument();
  });

  it('HT5: search matches note + date strings', async () => {
    mockList.mockResolvedValueOnce([makeHoliday()]);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สงกรานต์'));
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: '2026-04-14' } });
    expect(screen.getByText('สงกรานต์')).toBeInTheDocument();
  });

  it('HT6: delete confirm YES calls backend', async () => {
    mockList.mockResolvedValueOnce([makeHoliday()]);
    mockList.mockResolvedValueOnce([]);
    mockDelete.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HolidaysTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สงกรานต์'));
    fireEvent.click(screen.getByLabelText('ลบวันหยุด สงกรานต์'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('HOL-1'));
    spy.mockRestore();
  });
});

/* ─── HM: Modal flow ───────────────────────────────────────────────────── */

describe('HolidayFormModal — HM1..HM7', () => {
  beforeEach(() => { mockSave.mockReset(); });

  it('HM1: create mode defaults to specific type', () => {
    render(<HolidayFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText('เพิ่มวันหยุด')).toBeInTheDocument();
    expect(screen.getByText('วันที่เฉพาะ')).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีวันที่/)).toBeInTheDocument();
  });

  it('HM2: switch to weekly reveals day-of-week grid', () => {
    render(<HolidayFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('รายสัปดาห์'));
    for (const label of DAY_OF_WEEK_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('HM3: save empty specific dates → error', async () => {
    render(<HolidayFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/อย่างน้อย 1 วัน/)).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('HM4: save weekly with HOL crypto id', async () => {
    mockSave.mockResolvedValueOnce();
    render(<HolidayFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('รายสัปดาห์'));
    fireEvent.click(screen.getByText('อังคาร'));   // dayOfWeek=2
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [id, payload] = mockSave.mock.calls[0];
    expect(id).toMatch(/^HOL-/);
    expect(payload.type).toBe('weekly');
    expect(payload.dayOfWeek).toBe(2);
  });

  it('HM5: edit specific mode prefills dates', () => {
    render(<HolidayFormModal
      holiday={makeHoliday()}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByDisplayValue('สงกรานต์')).toBeInTheDocument();
    expect(screen.getByText('2026-04-13')).toBeInTheDocument();
    expect(screen.getByText('2026-04-14')).toBeInTheDocument();
  });

  it('HM6: remove date chip removes it from the list', () => {
    render(<HolidayFormModal
      holiday={makeHoliday()}
      onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByLabelText('ลบวัน 2026-04-13'));
    expect(screen.queryByText('2026-04-13')).not.toBeInTheDocument();
    expect(screen.getByText('2026-04-14')).toBeInTheDocument();
  });

  it('HM7: ESC closes modal', () => {
    const onClose = vi.fn();
    render(<HolidayFormModal onClose={onClose} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
