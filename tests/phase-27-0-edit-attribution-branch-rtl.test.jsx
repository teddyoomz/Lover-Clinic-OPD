/**
 * Phase 27.0 Task 6 — EditTreatmentBranchModal RTL tests
 *
 * Tests the NEW named export EditTreatmentBranchModal from EditAttributionModal.jsx.
 * This modal lets admins correct a treatment's branchId after the fact
 * (Phase 27.0: fix historical mis-tags).
 *
 * Keeps the default export (EditAttributionModal / Phase 26.1c editor attribution)
 * completely untouched — these tests only import the named export.
 */
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Restore global.fetch after this file to avoid cross-file flake (Phase 17.1 pattern)
const ORIGINAL_FETCH = global.fetch;
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});
afterEach(() => {
  vi.clearAllMocks();
});

// Mock scopedDataLayer — note: must include listStaff + listDoctors for the
// default export used in the same file (avoids "not a function" errors if
// vitest loads the module for the named export too).
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listBranches: vi.fn(() =>
    Promise.resolve([
      { branchId: 'BR-A', name: 'นครราชสีมา' },
      { branchId: 'BR-B', name: 'พระราม 3' },
    ]),
  ),
  listDoctors: vi.fn(() => Promise.resolve([])),
  listStaff: vi.fn(() => Promise.resolve([])),
  updateBackendTreatment: vi.fn(() => Promise.resolve()),
}));

// Mock BranchContext (needed by the default export in same file)
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A' }),
}));

import { EditTreatmentBranchModal } from '../src/components/backend/EditAttributionModal.jsx';

const WAIT_FOR_OPTS = { timeout: 3000 };

describe('Phase 27.0 Task 6 — EditTreatmentBranchModal', () => {
  // EA1.1 — branch picker pre-seeded with treatment.detail.branchId
  it('EA1.1 — renders สาขาที่รักษา label and pre-selects current branchId', async () => {
    const treatment = {
      id: 'T1',
      detail: { branchId: 'BR-A', treatmentDate: '2026-05-01', doctorId: 'DOC-1' },
    };
    render(
      <EditTreatmentBranchModal
        treatment={treatment}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Label must exist (aria-label on the select)
    const picker = await screen.findByLabelText('สาขาที่รักษา', {}, WAIT_FOR_OPTS);
    expect(picker).toBeInTheDocument();

    // Pre-selected value matches treatment.detail.branchId
    await waitFor(() => {
      expect(picker.value).toBe('BR-A');
    }, WAIT_FOR_OPTS);

    // Both branches appear as options
    const options = Array.from(picker.querySelectorAll('option'));
    const names = options.map(o => o.textContent);
    expect(names.some(n => /นครราชสีมา/.test(n))).toBe(true);
    expect(names.some(n => /พระราม/.test(n))).toBe(true);
  });

  // EA1.2 — change branch + save fires updateBackendTreatment + onSaved
  it('EA1.2 — changing branch and clicking บันทึก calls updateBackendTreatment + onSaved', async () => {
    const { updateBackendTreatment } = await import('../src/lib/scopedDataLayer.js');
    const onSaved = vi.fn();
    const treatment = {
      id: 'T1',
      detail: { branchId: 'BR-A', treatmentDate: '2026-05-01', doctorId: 'DOC-1' },
    };
    render(
      <EditTreatmentBranchModal
        treatment={treatment}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const picker = await screen.findByLabelText('สาขาที่รักษา', {}, WAIT_FOR_OPTS);

    // Change to BR-B
    fireEvent.change(picker, { target: { value: 'BR-B' } });

    // Click save
    const saveBtn = screen.getByRole('button', { name: /บันทึก/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updateBackendTreatment).toHaveBeenCalledWith('T1', {
        branchId: 'BR-B',
        treatmentDate: '2026-05-01',
        doctorId: 'DOC-1',
      });
      expect(onSaved).toHaveBeenCalled();
    }, WAIT_FOR_OPTS);
  });

  // EA1.3 — works with no initial branchId (empty string seed)
  it('EA1.3 — renders correctly when treatment has no branchId', async () => {
    const treatment = {
      id: 'T2',
      detail: { treatmentDate: '2026-05-01' },
    };
    render(
      <EditTreatmentBranchModal
        treatment={treatment}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const picker = await screen.findByLabelText('สาขาที่รักษา', {}, WAIT_FOR_OPTS);
    expect(picker).toBeInTheDocument();
    // Value starts empty (placeholder or first option)
    expect(picker.value === '' || picker.value === 'BR-A').toBe(true);
  });
});
