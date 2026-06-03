// Regression — doctor display-name chokepoint (2026-06-04).
// Bug: AppointmentFormModal renders `be_doctors.name` RAW (แพทย์ dropdown line 1488
// + ผู้ช่วยแพทย์ checkbox line 1538 + snapshotted appt.doctorName line 1485), but
// DoctorFormModal has NO `name` input and saveDoctor never recomputed it → `name`
// carried verbatim through {...form} → setDoc → went stale on rename. Real prod:
// DOC-mpwmsm1i name="บริบูรณ์ วังแก้ว" while firstname/nickname="หมอมุก" (stale),
// ASST-mowphsbf name="" (empty). Fix = recompute `name` in the saveDoctor write
// chokepoint via composeDoctorName.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composeDoctorName } from '../src/lib/doctorValidation.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('composeDoctorName — pure helper', () => {
  it('full name when firstname+lastname present', () => {
    expect(composeDoctorName({ firstname: 'สมชาย', lastname: 'ใจดี' })).toBe('สมชาย ใจดี');
  });
  it('firstname only (lastname empty — this clinic\'s norm)', () => {
    expect(composeDoctorName({ firstname: 'หมอมุก', lastname: '', nickname: 'หมอมุก' })).toBe('หมอมุก');
  });
  it('falls back to nickname when no firstname/lastname', () => {
    expect(composeDoctorName({ firstname: '', lastname: '', nickname: 'ยาหยี' })).toBe('ยาหยี');
  });
  it('IGNORES any stale incoming `name` (root-cause guard — must NOT read form.name)', () => {
    expect(composeDoctorName({ firstname: 'หมอมุก', nickname: 'หมอมุก', name: 'บริบูรณ์ วังแก้ว' })).toBe('หมอมุก');
  });
  it('trims + tolerates undefined/null/empty', () => {
    expect(composeDoctorName({ firstname: '  วัน  ' })).toBe('วัน');
    expect(composeDoctorName(null)).toBe('');
    expect(composeDoctorName(undefined)).toBe('');
    expect(composeDoctorName({})).toBe('');
  });
  it('reproduces every pre-existing CORRECT prod doc (no regression)', () => {
    // real prod good docs (diag 2026-06-04): name === compose
    expect(composeDoctorName({ firstname: 'โมเม' })).toBe('โมเม');
    expect(composeDoctorName({ firstname: 'หมอมายด์' })).toBe('หมอมายด์');
  });
});

describe('saveDoctor write chokepoint — source-grep regression lock', () => {
  const bc = read('src/lib/backendClient.js');
  it('imports composeDoctorName from doctorValidation', () => {
    expect(bc).toMatch(/normalizeDoctor,\s*validateDoctor,\s*composeDoctorName/);
  });
  it('assigns safe.name = composeDoctorName(normalized) (recompute, never carry verbatim)', () => {
    expect(bc).toMatch(/safe\.name\s*=\s*composeDoctorName\(normalized\)/);
  });
});

describe('AppointmentFormModal reads name RAW — documents WHY the write chokepoint is required', () => {
  const af = read('src/components/backend/AppointmentFormModal.jsx');
  it('doctor dropdown + assistant checkbox both render {d.name} (no resolver/fallback)', () => {
    // 2 raw reads — a read-side fallback would not fix a STALE (non-empty) name.
    const occurrences = (af.match(/\{d\.name\}/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('rename keeps name fresh — flow simulate (pre-fix bug repro + post-fix)', () => {
  it('PRE-FIX: carrying `name` verbatim leaves it stale after rename', () => {
    const loaded = { firstname: 'บริบูรณ์', lastname: 'วังแก้ว', nickname: '', name: 'บริบูรณ์ วังแก้ว' };
    // user edits firstname/nickname; form has no `name` input → name carried as-is
    const afterRename = { ...loaded, firstname: 'หมอมุก', lastname: '', nickname: 'หมอมุก' };
    expect(afterRename.name).toBe('บริบูรณ์ วังแก้ว'); // the BUG
  });
  it('POST-FIX: chokepoint recomputes name from the edited fields', () => {
    const afterRename = { firstname: 'หมอมุก', lastname: '', nickname: 'หมอมุก', name: 'บริบูรณ์ วังแก้ว' };
    const written = { ...afterRename, name: composeDoctorName(afterRename) };
    expect(written.name).toBe('หมอมุก');
  });
});
