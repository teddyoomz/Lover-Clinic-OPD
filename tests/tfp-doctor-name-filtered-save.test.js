// doctorName-edge fix (2026-07-19) — AV208 watchlist item closed.
//
// BUG: TFP picker options are branch+hidden+status FILTERED (V41/AV20 at the
// load mapper). A doctor selected earlier — or restored via edit-mode
// hydration (`setDoctorId(t.doctorId)`) — can be ABSENT from the filtered
// options at save time (hidden after selection / suspended / branch-moved /
// admin switched the top-right branch mid-edit). Every save-time resolve was
// `(options?.doctors || []).find(...)?.name || ''` → doctorName '' written to
// the OPD record + assistants[].name '' + blank staff-chat card doctor. A
// RE-SAVE of an old treatment OVERWROTE a previously-correct doctorName with ''.
//
// FIX: resolvePersonNameById chain — filtered options → options.doctorsUnfiltered
// (all be_doctors, save-time lookup ONLY, never a picker source) → the
// treatment's persisted name (edit mode, same-person only) → ''.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TFP = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');

// ── Pure mirror of the TFP resolver (locked to the impl by DN.5 source-grep) ──
function mirrorResolvePersonNameById(id, options, persisted) {
  const s = String(id || '');
  if (!s) return '';
  const hit = (options?.doctors || []).find(d => String(d.id) === s)
    || (options?.assistants || []).find(d => String(d.id) === s)
    || (options?.doctorsUnfiltered || []).find(d => String(d.id) === s);
  if (hit?.name) return hit.name;
  if (s === persisted.doctorId && persisted.doctorName) return persisted.doctorName;
  if (persisted.assistantNames[s]) return persisted.assistantNames[s];
  return '';
}

const EMPTY_PERSISTED = { doctorId: '', doctorName: '', assistantNames: {} };

describe('DN — doctorName filtered-save resolution chain', () => {
  it('DN.1 doctor still in filtered options → filtered name wins', () => {
    const options = { doctors: [{ id: 'd1', name: 'หมอเอ' }], doctorsUnfiltered: [{ id: 'd1', name: 'หมอเอ-เก่า' }] };
    expect(mirrorResolvePersonNameById('d1', options, EMPTY_PERSISTED)).toBe('หมอเอ');
  });

  it('DN.2 doctor HIDDEN after selection (absent from filtered) → unfiltered lookup resolves (pre-fix: "")', () => {
    const options = { doctors: [], assistants: [], doctorsUnfiltered: [{ id: 'd2', name: 'หมอบี (ซ่อน)' }] };
    expect(mirrorResolvePersonNameById('d2', options, EMPTY_PERSISTED)).toBe('หมอบี (ซ่อน)');
  });

  it('DN.3 doctor DELETED entirely (edit-mode re-save) → persisted name, same person only', () => {
    const options = { doctors: [], assistants: [], doctorsUnfiltered: [] };
    const persisted = { doctorId: 'd3', doctorName: 'หมอซี (ลบแล้ว)', assistantNames: {} };
    expect(mirrorResolvePersonNameById('d3', options, persisted)).toBe('หมอซี (ลบแล้ว)');
    // admin CHANGED the doctor in edit mode → the stale persisted name must NOT leak
    expect(mirrorResolvePersonNameById('d9', options, persisted)).toBe('');
  });

  it('DN.4 assistants resolve through the same chain (persisted per-id map)', () => {
    const options = { doctors: [], assistants: [], doctorsUnfiltered: [] };
    const persisted = { doctorId: '', doctorName: '', assistantNames: { a1: 'ผู้ช่วยหนึ่ง' } };
    expect(mirrorResolvePersonNameById('a1', options, persisted)).toBe('ผู้ช่วยหนึ่ง');
    expect(mirrorResolvePersonNameById('', options, persisted)).toBe('');
  });

  it('DN.5 source-grep: TFP resolver matches the mirror chain + all 3 save sites use it', () => {
    // the resolver exists with the exact 3-tier chain
    expect(TFP).toMatch(/const resolvePersonNameById = \(id\) =>/);
    expect(TFP).toMatch(/options\?\.doctorsUnfiltered \|\| \[\]/);
    expect(TFP).toMatch(/persistedAttributionRef\.current/);
    // site 1+2: backendDetail doctorName + assistants
    expect(TFP).toMatch(/doctorName: resolvePersonNameById\(doctorId\),\s*\n\s*assistants: assistantIds\.map\(aid => \(\{ id: aid, name: resolvePersonNameById\(aid\) \}\)\)/);
    // site 3: staff-chat card
    expect(TFP).toMatch(/doctorName: resolvePersonNameById\(doctorId\), \/\/ doctorName-edge fix/);
    // ANTI-REGRESSION: the pre-fix blanking pattern is gone from save paths
    expect(TFP).not.toMatch(/doctorName: \(options\?\.doctors \|\| \[\]\)\.find\(d => String\(d\.id\) === String\(doctorId\)\)\?\.name \|\| ''/);
  });

  it('DN.6 source-grep: doctorsUnfiltered is save-time-only (never a picker source) + edit stash exists', () => {
    // built from the PRE-filter doctorItems
    expect(TFP).toMatch(/doctorsUnfiltered: \(doctorItems \|\| \[\]\)\.map\(d => \(\{ id: d\.id, name: d\.name \}\)\)/);
    // no render/picker maps over doctorsUnfiltered (save-time lookup only)
    expect(TFP).not.toMatch(/doctorsUnfiltered\)\.map\(d => \(\s*<option/);
    expect(TFP.match(/doctorsUnfiltered/g).length).toBeLessThanOrEqual(4); // build + resolver + comments
    // edit-mode stash captures persisted attribution
    expect(TFP).toMatch(/persistedAttributionRef\.current = \{\s*\n\s*doctorId: String\(t\.doctorId \|\| ''\)/);
  });
});
