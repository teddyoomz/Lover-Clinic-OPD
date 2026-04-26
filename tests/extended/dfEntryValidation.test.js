// ─── Phase 14.3.1 · DF entry validation adversarial tests ────────────────
import { describe, it, expect } from 'vitest';
import {
  validateDfEntry,
  normalizeDfEntry,
  emptyDfEntry,
  generateDfEntryId,
  buildDefaultRows,
  isDoctorAlreadyEntered,
  DF_ENTRY_ID_RE,
} from '../src/lib/dfEntryValidation.js';

const goodRow = (over = {}) => ({
  courseId: 'C1', courseName: 'Botox', enabled: true, value: 500, type: 'baht', ...over,
});
const goodEntry = (over = {}) => ({
  ...emptyDfEntry(),
  doctorId: 'D1',
  doctorName: 'หมอ A',
  dfGroupId: 'DFG-1',
  rows: [goodRow()],
  ...over,
});

describe('validateDfEntry — required fields', () => {
  it('DFE-V1: rejects non-object entry', () => {
    expect(validateDfEntry(null)?.[0]).toBe('form');
    expect(validateDfEntry([])?.[0]).toBe('form');
    expect(validateDfEntry('s')?.[0]).toBe('form');
  });
  it('DFE-V2: rejects missing doctorId (DFE-1 invariant)', () => {
    expect(validateDfEntry({ ...goodEntry(), doctorId: '' })?.[0]).toBe('doctorId');
    expect(validateDfEntry({ ...goodEntry(), doctorId: '   ' })?.[0]).toBe('doctorId');
  });
  it('DFE-V3: rejects missing dfGroupId (DFE-2 invariant)', () => {
    expect(validateDfEntry({ ...goodEntry(), dfGroupId: '' })?.[0]).toBe('dfGroupId');
  });
  it('DFE-V4: accepts minimal valid entry', () => {
    expect(validateDfEntry(goodEntry())).toBeNull();
  });
  it('DFE-V5: rejects non-array rows (DFE-3)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: null })?.[0]).toBe('rows');
    expect(validateDfEntry({ ...goodEntry(), rows: 'str' })?.[0]).toBe('rows');
    expect(validateDfEntry({ ...goodEntry(), rows: {} })?.[0]).toBe('rows');
  });
});

describe('validateDfEntry — row-level invariants', () => {
  it('DFE-V6: rejects row missing courseId (DFE-4)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ courseId: '' })] })?.[0]).toBe('rows');
  });
  it('DFE-V7: rejects row with non-boolean enabled (DFE-5)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ enabled: 'yes' })] })?.[0]).toBe('rows');
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ enabled: 1 })] })?.[0]).toBe('rows');
  });
  it('DFE-V8: rejects row with negative value (DFE-6)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ value: -10 })] })?.[0]).toBe('rows');
  });
  it('DFE-V9: rejects row with non-numeric value (DFE-6)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ value: 'abc' })] })?.[0]).toBe('rows');
  });
  it('DFE-V10: rejects row with unknown type (DFE-7)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ type: 'dollar' })] })?.[0]).toBe('rows');
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ type: undefined })] })?.[0]).toBe('rows');
  });
  it('DFE-V11: rejects percent value >100 (DFE-8)', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ type: 'percent', value: 101 })] })?.[0]).toBe('rows');
  });
  it('DFE-V12: accepts percent value ≤100', () => {
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ type: 'percent', value: 100 })] })).toBeNull();
    expect(validateDfEntry({ ...goodEntry(), rows: [goodRow({ type: 'percent', value: 0 })] })).toBeNull();
  });
  it('DFE-V13: rejects duplicate courseId (DFE-9)', () => {
    expect(validateDfEntry({
      ...goodEntry(),
      rows: [goodRow(), goodRow({ value: 200 })],
    })?.[0]).toBe('rows');
  });
  it('DFE-V14: accepts multiple distinct courses', () => {
    expect(validateDfEntry({
      ...goodEntry(),
      rows: [goodRow(), goodRow({ courseId: 'C2', courseName: 'Filler' })],
    })).toBeNull();
  });
  it('DFE-V15: rejects entry with zero enabled rows (DFE-10)', () => {
    const r = validateDfEntry({
      ...goodEntry(),
      rows: [goodRow({ enabled: false })],
    });
    expect(r?.[0]).toBe('rows');
    expect(r?.[1]).toMatch(/อย่างน้อยหนึ่ง/);
  });
  it('DFE-V16: rejects empty rows array (DFE-10 — zero enabled follows)', () => {
    const r = validateDfEntry({ ...goodEntry(), rows: [] });
    expect(r?.[0]).toBe('rows');
  });
});

describe('validateDfEntry — id format', () => {
  it('DFE-V17: rejects malformed id', () => {
    expect(validateDfEntry({ ...goodEntry(), id: 'bogus' })?.[0]).toBe('id');
    expect(validateDfEntry({ ...goodEntry(), id: 'DFE-abc' })?.[0]).toBe('id');
  });
  it('DFE-V18: accepts well-formed id (from generateDfEntryId)', () => {
    const id = generateDfEntryId();
    expect(DF_ENTRY_ID_RE.test(id)).toBe(true);
    expect(validateDfEntry({ ...goodEntry(), id })).toBeNull();
  });
});

describe('normalizeDfEntry', () => {
  it('DFE-N1: trims string fields', () => {
    const n = normalizeDfEntry({ ...goodEntry(), doctorId: '  D1  ', doctorName: '  หมอ  ', dfGroupId: '  DFG-1  ' });
    expect(n.doctorId).toBe('D1');
    expect(n.doctorName).toBe('หมอ');
    expect(n.dfGroupId).toBe('DFG-1');
  });
  it('DFE-N2: coerces row.value to non-negative number', () => {
    const n = normalizeDfEntry({ ...goodEntry(), rows: [goodRow({ value: -5 }), goodRow({ courseId: 'C2', value: '1500' })] });
    expect(n.rows[0].value).toBe(0);
    expect(n.rows[1].value).toBe(1500);
  });
  it('DFE-N3: filters out rows with empty courseId', () => {
    const n = normalizeDfEntry({ ...goodEntry(), rows: [goodRow(), goodRow({ courseId: '' }), goodRow({ courseId: 'C2' })] });
    expect(n.rows).toHaveLength(2);
    expect(n.rows.map((r) => r.courseId)).toEqual(['C1', 'C2']);
  });
  it('DFE-N4: defaults unknown type to baht', () => {
    const n = normalizeDfEntry({ ...goodEntry(), rows: [goodRow({ type: 'foo' })] });
    expect(n.rows[0].type).toBe('baht');
  });
  it('DFE-N5: coerces enabled to boolean', () => {
    const n = normalizeDfEntry({ ...goodEntry(), rows: [goodRow({ enabled: 'yes' }), goodRow({ courseId: 'C2', enabled: '' })] });
    expect(n.rows[0].enabled).toBe(true);
    expect(n.rows[1].enabled).toBe(false);
  });
  it('DFE-N6: non-object entry returns as-is', () => {
    expect(normalizeDfEntry(null)).toBeNull();
    expect(normalizeDfEntry('x')).toBe('x');
  });
});

describe('generateDfEntryId', () => {
  it('DFE-G1: matches DFE-{b36ts}-{16hex}', () => {
    const id = generateDfEntryId();
    expect(id).toMatch(/^DFE-[0-9a-z]+-[0-9a-f]{16}$/);
  });
  it('DFE-G2: distinct on consecutive calls', () => {
    const set = new Set();
    for (let i = 0; i < 50; i++) set.add(generateDfEntryId());
    expect(set.size).toBe(50);
  });
});

describe('buildDefaultRows — resolver injection', () => {
  const courses = [
    { courseId: 'C1', courseName: 'Botox' },
    { courseId: 'C2', courseName: 'Filler' },
    { courseId: '', courseName: 'broken' }, // dropped
  ];
  const stubResolver = (staffId, courseId) => {
    if (courseId === 'C1') return { value: 500, type: 'baht', source: 'group' };
    if (courseId === 'C2') return { value: 10, type: 'percent', source: 'staff' };
    return null;
  };

  it('DFE-B1: empty treatmentCourses → empty rows', () => {
    expect(buildDefaultRows([], 'D1', 'DFG-1', [], [], stubResolver)).toEqual([]);
  });
  it('DFE-B2: non-array treatmentCourses → empty rows (defensive)', () => {
    expect(buildDefaultRows(null, 'D1', 'DFG-1', [], [], stubResolver)).toEqual([]);
    expect(buildDefaultRows(undefined, 'D1', 'DFG-1', [], [], stubResolver)).toEqual([]);
  });
  it('DFE-B3: drops courses with empty courseId', () => {
    const rows = buildDefaultRows(courses, 'D1', 'DFG-1', [], [], stubResolver);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.courseId)).toEqual(['C1', 'C2']);
  });
  it('DFE-B4: resolver hit sets value + type + enabled=true', () => {
    const rows = buildDefaultRows(courses, 'D1', 'DFG-1', [], [], stubResolver);
    expect(rows[0]).toMatchObject({ courseId: 'C1', value: 500, type: 'baht', enabled: true, source: 'group' });
    expect(rows[1]).toMatchObject({ courseId: 'C2', value: 10, type: 'percent', enabled: true, source: 'staff' });
  });
  it('DFE-B5: resolver miss sets value=0, enabled=false (user can override manually)', () => {
    const miss = () => null;
    const rows = buildDefaultRows([{ courseId: 'C1', courseName: 'X' }], 'D1', 'DFG-1', [], [], miss);
    expect(rows[0]).toMatchObject({ courseId: 'C1', value: 0, enabled: false, type: 'baht', source: null });
  });
  it('DFE-B6: no doctor → all rows value=0, enabled=false', () => {
    const rows = buildDefaultRows(courses, '', 'DFG-1', [], [], stubResolver);
    expect(rows.every((r) => r.value === 0 && r.enabled === false)).toBe(true);
  });
  it('DFE-B7: no resolver provided → all rows value=0, enabled=false', () => {
    const rows = buildDefaultRows(courses, 'D1', 'DFG-1', [], []);
    expect(rows.every((r) => r.value === 0 && r.enabled === false)).toBe(true);
  });
  it('DFE-B8: resolver returning negative value is clamped to 0', () => {
    const weird = () => ({ value: -100, type: 'baht', source: 'group' });
    const rows = buildDefaultRows([{ courseId: 'C1', courseName: 'X' }], 'D1', 'DFG-1', [], [], weird);
    expect(rows[0].value).toBe(0);
    // value=0 ⇒ enabled=false (no auto-on for zero)
    expect(rows[0].enabled).toBe(false);
  });
});

describe('isDoctorAlreadyEntered — dup-guard for ADD modal', () => {
  const existing = [
    { doctorId: 'D1', dfGroupId: 'DFG-1' },
    { doctorId: 'D2', dfGroupId: 'DFG-2' },
  ];
  it('DFE-D1: true when doctor already in list', () => {
    expect(isDoctorAlreadyEntered('D1', existing)).toBe(true);
  });
  it('DFE-D2: false when doctor not in list', () => {
    expect(isDoctorAlreadyEntered('D3', existing)).toBe(false);
  });
  it('DFE-D3: false for empty doctorId', () => {
    expect(isDoctorAlreadyEntered('', existing)).toBe(false);
  });
  it('DFE-D4: false for empty / null existingEntries', () => {
    expect(isDoctorAlreadyEntered('D1', [])).toBe(false);
    expect(isDoctorAlreadyEntered('D1', null)).toBe(false);
    expect(isDoctorAlreadyEntered('D1', undefined)).toBe(false);
  });
  it('DFE-D5: string/number id match survives coercion', () => {
    expect(isDoctorAlreadyEntered(1, [{ doctorId: '1' }])).toBe(true);
    expect(isDoctorAlreadyEntered('1', [{ doctorId: 1 }])).toBe(true);
  });
});
