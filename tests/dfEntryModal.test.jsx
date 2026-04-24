// ─── Phase 14.3.2 · DfEntryModal UI smoke tests ────────────────────────
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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

import DfEntryModal from '../src/components/backend/DfEntryModal.jsx';

// Fixtures mirror the shapes TreatmentFormPage will pass in Phase 14.4.
const treatmentCourses = [
  { courseId: 'C1', courseName: 'Botox' },
  { courseId: 'C2', courseName: 'Filler' },
];
const people = [
  { id: 'D1', name: 'หมอ A', position: 'แพทย์', defaultDfGroupId: 'DFG-1' },
  { id: 'D2', name: 'หมอ B', position: 'แพทย์', defaultDfGroupId: 'DFG-2' },
  { id: 'A1', name: 'ผู้ช่วย X', position: 'ผู้ช่วยแพทย์', defaultDfGroupId: 'DFG-1' },
];
const dfGroups = [
  { id: 'DFG-1', groupId: 'DFG-1', name: 'กลุ่ม A', rates: [
    { courseId: 'C1', value: 500, type: 'baht' },
    { courseId: 'C2', value: 10, type: 'percent' },
  ]},
  { id: 'DFG-2', groupId: 'DFG-2', name: 'กลุ่ม B', rates: [
    { courseId: 'C1', value: 300, type: 'baht' },
  ]},
];
const staffRates = [
  { staffId: 'D2', rates: [{ courseId: 'C1', value: 400, type: 'baht' }] }, // override
];

function renderModal(overrides = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <DfEntryModal
      treatmentCourses={treatmentCourses}
      people={people}
      dfGroups={dfGroups}
      staffRates={staffRates}
      existingEntries={[]}
      onSave={onSave}
      onClose={onClose}
      clinicSettings={{}}
      {...overrides}
    />
  );
  return { ...utils, onSave, onClose };
}

describe('DfEntryModal — ADD mode', () => {
  it('DFM1: renders add title + empty dropdowns', () => {
    renderModal();
    expect(screen.getByText(/เพิ่มค่ามือ/)).toBeInTheDocument();
    const docSel = document.querySelector('[data-field="doctorId"] select');
    expect(docSel.value).toBe('');
    const grpSel = document.querySelector('[data-field="dfGroupId"] select');
    expect(grpSel.value).toBe('');
  });

  it('DFM2: picking a doctor auto-fills default group + computes rows', async () => {
    renderModal();
    const docSel = document.querySelector('[data-field="doctorId"] select');
    fireEvent.change(docSel, { target: { value: 'D1' } });
    // D1 has defaultDfGroupId='DFG-1' → group auto-fills
    const grpSel = document.querySelector('[data-field="dfGroupId"] select');
    await waitFor(() => expect(grpSel.value).toBe('DFG-1'));
    // DFG-1 rates cover C1 (500 baht) + C2 (10 percent)
    const rowsSection = document.querySelector('[data-field="rows"]');
    const rowDivs = rowsSection.querySelectorAll('input[type="number"]');
    expect(rowDivs).toHaveLength(2);
    expect(rowDivs[0].value).toBe('500');
    expect(rowDivs[1].value).toBe('10');
  });

  it('DFM3: switching doctor with staff-override resolves override (D2 → C1 value 400 not 300)', async () => {
    renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D2' } });
    const rowsSection = document.querySelector('[data-field="rows"]');
    const first = rowsSection.querySelector('input[type="number"]');
    await waitFor(() => expect(first.value).toBe('400')); // staff override wins over group
  });

  it('DFM4: changing group rebuilds rows to match new group rates', async () => {
    renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      const grp = document.querySelector('[data-field="dfGroupId"] select');
      expect(grp.value).toBe('DFG-1');
    });
    // Switch to DFG-2 — only C1 defined (value 300), C2 should drop to 0 / disabled
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('300'));
    expect(rows[1].value).toBe('0'); // no rate for C2 in DFG-2
  });

  it('DFM5: dup-guard warns + blocks save when selecting a doctor already entered', async () => {
    const existingEntries = [{ doctorId: 'D1', dfGroupId: 'DFG-1', rows: [] }];
    const { onSave } = renderModal({ existingEntries });
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => expect(screen.getByText(/มีรายการค่ามืออยู่แล้ว/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('ยืนยัน'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('DFM6: save callback fires with normalized entry when valid', async () => {
    const { onSave } = renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      const grp = document.querySelector('[data-field="dfGroupId"] select');
      expect(grp.value).toBe('DFG-1');
    });
    fireEvent.click(screen.getByText('ยืนยัน'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.doctorId).toBe('D1');
    expect(payload.doctorName).toBe('หมอ A');
    expect(payload.dfGroupId).toBe('DFG-1');
    expect(payload.id).toMatch(/^DFE-/);
    expect(payload.rows.filter((r) => r.enabled).length).toBeGreaterThan(0);
  });

  it('DFM7: save blocks with error when no row is enabled', async () => {
    const { onSave } = renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      const grp = document.querySelector('[data-field="dfGroupId"] select');
      expect(grp.value).toBe('DFG-1');
    });
    // Uncheck every row
    const checkboxes = document.querySelectorAll('[data-field="rows"] input[type="checkbox"]');
    checkboxes.forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText('ยืนยัน'));
    await waitFor(() => expect(screen.getByText(/อย่างน้อยหนึ่ง/)).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('DFM8: "คำนวณใหม่" button re-runs resolver after manual edits', async () => {
    renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      const first = document.querySelector('[data-field="rows"] input[type="number"]');
      expect(first.value).toBe('500');
    });
    // Edit the first row value to 999
    const first = document.querySelector('[data-field="rows"] input[type="number"]');
    fireEvent.change(first, { target: { value: '999' } });
    await waitFor(() => expect(first.value).toBe('999'));
    // Click recalc
    fireEvent.click(screen.getByText(/คำนวณใหม่/));
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('500')); // restored from resolver
  });
});

describe('DfEntryModal — EDIT mode', () => {
  const existingEntry = {
    id: 'DFE-test-0123456789abcdef',
    doctorId: 'D1',
    doctorName: 'หมอ A',
    dfGroupId: 'DFG-1',
    rows: [
      { courseId: 'C1', courseName: 'Botox', enabled: true, value: 600, type: 'baht' }, // manually overridden
      { courseId: 'C2', courseName: 'Filler', enabled: true, value: 10, type: 'percent' },
    ],
  };

  it('DFM9: loads existing entry + shows edit title', () => {
    renderModal({ entry: existingEntry });
    expect(screen.getByText(/แก้ไขค่ามือ/)).toBeInTheDocument();
    expect(document.querySelector('[data-field="doctorId"] select').value).toBe('D1');
    expect(document.querySelector('[data-field="dfGroupId"] select').value).toBe('DFG-1');
    // First row value should be the overridden 600, not the resolver-default 500.
    const first = document.querySelector('[data-field="rows"] input[type="number"]');
    expect(first.value).toBe('600');
  });

  it('DFM10: doctor dropdown is disabled in edit mode', () => {
    renderModal({ entry: existingEntry });
    const docSel = document.querySelector('[data-field="doctorId"] select');
    expect(docSel.disabled).toBe(true);
  });

  it('DFM11: save in edit mode callbacks with same id (no regenerate)', async () => {
    const { onSave } = renderModal({ entry: existingEntry });
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload.id).toBe('DFE-test-0123456789abcdef');
  });

  it('DFM12: changing group in edit mode rebuilds rows', async () => {
    renderModal({ entry: existingEntry });
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('300')); // DFG-2 C1 rate
  });
});

describe('DfEntryModal — Phase 12.2b Step 5 group-switch robustness', () => {
  // These tests cover the user-reported bug "เลือก 10% แล้วเปลี่ยน group
  // อื่น ค่ามือกลุ่มอื่นไม่แสดง". Root cause was (a) resolveRows reading
  // stale doctorId/dfGroupId from the render closure during batched state
  // updates, and (b) no UI cue when the new group genuinely has no rate
  // for a course so the zero-value disabled row looked like a missing rate.

  it('DFM-S5-1: row with no rate in selected group shows "ไม่มีอัตราในกลุ่มนี้" hint', async () => {
    renderModal();
    // D1 picks DFG-1 auto — DFG-1 has rates for both C1 + C2 → no hint yet
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      expect(document.querySelector('[data-field="dfGroupId"] select').value).toBe('DFG-1');
    });
    expect(screen.queryByText(/ไม่มีอัตราในกลุ่มนี้/)).not.toBeInTheDocument();
    // Switch to DFG-2 — only C1 has a rate; C2 falls through to null source
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    await waitFor(() => {
      expect(screen.getByText(/ไม่มีอัตราในกลุ่มนี้/)).toBeInTheDocument();
    });
  });

  it('DFM-S5-2: manual row value edit is overwritten on group switch (documents expected behavior)', async () => {
    renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    await waitFor(() => {
      const first = document.querySelector('[data-field="rows"] input[type="number"]');
      expect(first.value).toBe('500');
    });
    // User manually types 12345 into C1's value
    const first = document.querySelector('[data-field="rows"] input[type="number"]');
    fireEvent.change(first, { target: { value: '12345' } });
    await waitFor(() => expect(first.value).toBe('12345'));
    // Switch group → rows rebuild from resolver; manual edit is lost
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('300'));
  });

  it('DFM-S5-3: row type dropdown refreshes when group switch changes the type (baht→percent)', async () => {
    // Craft a fixture where DFG-A has baht, DFG-B has percent, same course.
    const groupsTypeFlip = [
      { id: 'G-A', groupId: 'G-A', name: 'กลุ่ม Baht', rates: [{ courseId: 'C1', value: 100, type: 'baht' }] },
      { id: 'G-B', groupId: 'G-B', name: 'กลุ่ม Percent', rates: [{ courseId: 'C1', value: 15, type: 'percent' }] },
    ];
    const peopleFlip = [{ id: 'D-FLIP', name: 'หมอ Flip', position: 'แพทย์', defaultDfGroupId: 'G-A' }];
    renderModal({ dfGroups: groupsTypeFlip, people: peopleFlip, staffRates: [], treatmentCourses: [{ courseId: 'C1', courseName: 'Botox' }] });
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D-FLIP' } });
    await waitFor(() => {
      expect(document.querySelector('[data-field="rows"] select').value).toBe('baht');
    });
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'G-B' } });
    await waitFor(() => {
      expect(document.querySelector('[data-field="rows"] select').value).toBe('percent');
    });
  });

  it('DFM-S5-4: staff override survives group switch (source=staff pinned to the staff doc, not the group)', async () => {
    // D2 has a staff override for C1 (400 baht). Switching groups should
    // leave C1 at 400 because staff override wins over group rates.
    renderModal();
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D2' } });
    await waitFor(() => {
      const first = document.querySelector('[data-field="rows"] input[type="number"]');
      expect(first.value).toBe('400');
    });
    // Verify source badge shows "override ส่วนบุคคล"
    expect(screen.getByText(/override ส่วนบุคคล/)).toBeInTheDocument();
    // Switch group to DFG-2 — D2's staff override for C1 still wins
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('400'));
    // Source badge remains "override ส่วนบุคคล" (still staff, not group)
    expect(screen.getByText(/override ส่วนบุคคล/)).toBeInTheDocument();
  });

  it('DFM-S5-5: handleGroupChange uses updater-form setForm so stale doctorId closures cannot corrupt rows', async () => {
    // Regression for the setForm-updater fix: if the setter were reading a
    // stale `form.doctorId` from the pre-change closure, switching group
    // immediately after doctor would produce rows against the OLD doctor.
    // Exercise by firing both changes back-to-back without awaiting render.
    renderModal();
    // Fire doctor change + group change in the same tick — React batches
    // these state updates. Without the updater-form fix, the group handler
    // reads the pre-doctor-change form value.
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    fireEvent.change(document.querySelector('[data-field="dfGroupId"] select'), { target: { value: 'DFG-2' } });
    // Final state must reflect D1 + DFG-2: C1=300 (DFG-2 group rate, no D1 override)
    const rows = document.querySelector('[data-field="rows"]').querySelectorAll('input[type="number"]');
    await waitFor(() => expect(rows[0].value).toBe('300'));
    // doctorName preserved through the updater
    expect(document.querySelector('[data-field="doctorId"] select').value).toBe('D1');
    expect(document.querySelector('[data-field="dfGroupId"] select').value).toBe('DFG-2');
  });

  it('DFM-S5-6: empty group (no rates at all) → every row marked "ไม่มีอัตราในกลุ่มนี้"', async () => {
    const emptyGroup = [{ id: 'G-EMPTY', groupId: 'G-EMPTY', name: 'Empty', rates: [] }];
    renderModal({ dfGroups: emptyGroup, people: [{ id: 'D-E', name: 'Dr E', position: 'แพทย์', defaultDfGroupId: 'G-EMPTY' }], staffRates: [] });
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D-E' } });
    await waitFor(() => {
      const hints = screen.getAllByText(/ไม่มีอัตราในกลุ่มนี้/);
      // Both C1 + C2 get the hint since neither has a rate in G-EMPTY
      expect(hints.length).toBe(2);
    });
  });
});

describe('DfEntryModal — empty state', () => {
  it('DFM13: no treatmentCourses → shows "ไม่พบคอร์ส" empty state after doctor+group pick', async () => {
    renderModal({ treatmentCourses: [] });
    fireEvent.change(document.querySelector('[data-field="doctorId"] select'), { target: { value: 'D1' } });
    // rows stay empty; empty-state text depends on whether doctor+group are set
    await waitFor(() => expect(screen.getByText(/ไม่พบคอร์ส/)).toBeInTheDocument());
  });

  it('DFM14: empty dfGroups list shows helper text', () => {
    renderModal({ dfGroups: [] });
    expect(screen.getByText(/ยังไม่มีกลุ่มค่ามือ/)).toBeInTheDocument();
  });

  it('DFM15: without doctor or group, rows section shows pick prompt', () => {
    renderModal();
    expect(screen.getByText(/เลือกแพทย์ \+ กลุ่ม เพื่อคำนวณอัตโนมัติ/)).toBeInTheDocument();
  });
});
