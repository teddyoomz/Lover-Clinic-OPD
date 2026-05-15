// V71.A (2026-05-15) — Bug fix + symmetric un-mark.
//
// Bug: AdminDashboard.jsx:onEditTreatmentForAppt JSX prop dropped customerId
//   in the setTreatmentFormMode payload → TFP's V35.2-sexies guard short-
//   circuited to "ไม่พบ customerId" placeholder → users couldn't edit
//   treatment from the "เสร็จแล้ว" sub-pill (or any appt-list row).
//
// Feature: symmetric `unmarkAppointmentServiceCompleted` writer + "↩ กลับไปคิวรอ"
//   button on rows already in completed state — recovers from accidental
//   mark-complete clicks.
//
// AV50: every setTreatmentFormMode({mode:'edit'/'create',...}) call MUST include
//   customerId — locked at source-grep level across all 6 callsites.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');

// ─── U1: unmarkAppointmentServiceCompleted writer ──────────────────────────
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__SERVER_TS__'),
    doc: vi.fn((...args) => ({ __doc: args.join('/') })),
  };
});

vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: null },
  appId: 'loverclinic-opd-4c39b',
}));

import { updateDoc } from 'firebase/firestore';
import {
  markAppointmentServiceCompleted,
  unmarkAppointmentServiceCompleted,
} from '../src/lib/backendClient.js';

describe('V71.A U1 unmarkAppointmentServiceCompleted writer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('U1.1 writes serviceCompletedAt:null + serviceCompletedBy:""', async () => {
    await unmarkAppointmentServiceCompleted('BA-test-unmark');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload).toEqual({
      serviceCompletedAt: null,
      serviceCompletedBy: '',
    });
  });

  it('U1.2 throws exact V71_UNMARK_SERVICE_COMPLETED_REQUIRES_APPT_ID when apptId empty', async () => {
    await expect(unmarkAppointmentServiceCompleted(''))
      .rejects.toThrow('V71_UNMARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  });

  it('U1.3 throws on non-string apptId', async () => {
    await expect(unmarkAppointmentServiceCompleted(null))
      .rejects.toThrow('V71_UNMARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
    await expect(unmarkAppointmentServiceCompleted(undefined))
      .rejects.toThrow('V71_UNMARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  });

  it('U1.4 scopedDataLayer source re-exports unmarkAppointmentServiceCompleted', () => {
    // Source-grep approach (not dynamic import) — robust against the F2-block's
    // vi.mock('../src/lib/scopedDataLayer.js') hoisted mock that replaces the
    // module reference at runtime. We want to verify the REAL source carries
    // the universal pass-through.
    const src = read('src/lib/scopedDataLayer.js');
    expect(src).toMatch(/export const unmarkAppointmentServiceCompleted\s*=/);
    expect(src).toMatch(/raw\.unmarkAppointmentServiceCompleted/);
  });

  it('U1.5 mark + unmark are independent symmetric writers (different fn refs)', () => {
    expect(markAppointmentServiceCompleted).not.toBe(unmarkAppointmentServiceCompleted);
    expect(typeof markAppointmentServiceCompleted).toBe('function');
    expect(typeof unmarkAppointmentServiceCompleted).toBe('function');
  });
});

// ─── U2: RowCard "↩ กลับไปคิวรอ" button visibility + click flow ────────────
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const baseAppt = {
  id: 'BA-V71A-test',
  customerId: 'C-V71A',
  customerName: 'Test',
  date: '2026-05-15',
  startTime: '10:00',
  endTime: '11:00',
  status: 'confirmed',
  doctorName: 'หมอ',
  serviceCompletedAt: null,
};
const baseSummary = { hn: '000001', name: 'Test' };
const treatment = {
  id: 'T-V71A',
  vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
  status: 'vitalsigns-recorded',
};
// Appt already in "completed" state (serviceCompletedAt set).
const completedAppt = { ...baseAppt, serviceCompletedAt: { seconds: 12345 } };

describe('V71.A U2 RowCard unmark-complete button', () => {
  it('U2.1 button VISIBLE when today + serviceCompletedAt set', () => {
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onUnmarkServiceComplete={() => {}}
      />
    );
    expect(screen.getByTestId('row-action-unmark-complete')).toBeInTheDocument();
  });

  it('U2.2 button HIDDEN when serviceCompletedAt is null (already waiting)', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onUnmarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-unmark-complete')).toBeNull();
  });

  it('U2.3 button HIDDEN on non-today tab even if serviceCompletedAt set', () => {
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={false}
        onUnmarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-unmark-complete')).toBeNull();
  });

  it('U2.4 click + confirm-yes → onUnmarkServiceComplete called with appt', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onUnmarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-unmark-complete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(completedAppt);
    confirmSpy.mockRestore();
  });

  it('U2.5 click + confirm-no → handler NOT called', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onUnmarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-unmark-complete'));
    expect(handler).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('U2.6 mark-complete + unmark buttons are mutually exclusive (never both visible)', () => {
    // State 1: waiting (no serviceCompletedAt) → mark visible, unmark hidden
    const { rerender, unmount } = render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
        onUnmarkServiceComplete={() => {}}
      />
    );
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('row-action-unmark-complete')).toBeNull();
    unmount();

    // State 2: completed → unmark visible, mark hidden
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
        onUnmarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
    expect(screen.getByTestId('row-action-unmark-complete')).toBeInTheDocument();
  });
});

// ─── U3: BUG FIX — AdminDashboard onEditTreatmentForAppt passes customerId ─
describe('V71.A U3 BUG FIX — AdminDashboard onEditTreatmentForAppt', () => {
  const src = read('src/pages/AdminDashboard.jsx');

  it('U3.1 onEditTreatmentForAppt setTreatmentFormMode payload includes customerId', () => {
    // Locate the onEditTreatmentForAppt JSX block (up to 800 chars)
    // and assert it now passes customerId in the setTreatmentFormMode payload.
    const m = src.match(/onEditTreatmentForAppt=\{[\s\S]{0,800}\}/);
    expect(m).toBeTruthy();
    const block = m[0];
    expect(block).toMatch(/customerId:\s*appt\.customerId/);
  });

  it('U3.2 V71.A marker comment present near the bug-fix', () => {
    expect(src).toMatch(/V71\.A[^\n]*(?:BUG FIX|customerId)/i);
  });

  it('U3.3 onEditTreatmentForAppt does NOT short-shape with only mode+treatmentId', () => {
    // Pre-fix shape: `setTreatmentFormMode({ mode: 'edit', treatmentId: appt.linkedTreatmentId })` — only 2 fields.
    // Post-fix: must contain customerId. The pre-fix exact pattern must NOT appear.
    expect(src).not.toMatch(/setTreatmentFormMode\(\s*\{\s*mode:\s*['"]edit['"]\s*,\s*treatmentId:\s*appt\.linkedTreatmentId\s*\}\s*\)/);
  });
});

// ─── U4: AV50 — every setTreatmentFormMode call passes customerId ──────────
describe('V71.A U4 AV50 — setTreatmentFormMode customerId invariant', () => {
  // Classifier — enumerate all callsites + verify each passes customerId.
  const FILES_AND_CALLSITES = [
    {
      file: 'src/pages/BackendDashboard.jsx',
      label: 'BackendDashboard.onCreateTreatment (viewingCustomer)',
    },
    {
      file: 'src/pages/BackendDashboard.jsx',
      label: 'BackendDashboard.onEditTreatment (viewingCustomer)',
    },
    {
      file: 'src/pages/AdminDashboard.jsx',
      label: 'AdminDashboard.onOpenCreateForm (OPD session)',
    },
    {
      file: 'src/pages/AdminDashboard.jsx',
      label: 'AdminDashboard.onOpenEditForm (OPD session)',
    },
    {
      file: 'src/pages/AdminDashboard.jsx',
      label: 'AdminDashboard.onCreateTreatmentForAppt',
    },
    {
      file: 'src/pages/AdminDashboard.jsx',
      label: 'AdminDashboard.onEditTreatmentForAppt (V71.A FIX)',
    },
  ];

  // Read once per file
  const fileContents = new Map();
  for (const { file } of FILES_AND_CALLSITES) {
    if (!fileContents.has(file)) fileContents.set(file, read(file));
  }

  it('U4.1 every setTreatmentFormMode callsite includes customerId field', () => {
    // For each file, find all setTreatmentFormMode({...}) blocks + verify
    // every one references `customerId:`.
    for (const [file, content] of fileContents) {
      // Find all setTreatmentFormMode blocks (multi-line)
      const blockRegex = /setTreatmentFormMode\s*\(\s*\{[\s\S]{0,1500}?\}\s*\)/g;
      const blocks = content.match(blockRegex) || [];
      expect(blocks.length).toBeGreaterThan(0); // each file has at least 1 callsite
      for (const block of blocks) {
        expect(block).toMatch(/customerId\s*:/);
      }
    }
  });

  it('U4.2 AV50 classifier — exactly 6 callsites verified', () => {
    let total = 0;
    for (const [, content] of fileContents) {
      const blockRegex = /setTreatmentFormMode\s*\(\s*\{[\s\S]{0,1500}?\}\s*\)/g;
      const blocks = content.match(blockRegex) || [];
      total += blocks.length;
    }
    expect(total).toBe(6);
  });
});

// ─── U5: TFP placeholder copy post-V50 update ──────────────────────────────
describe('V71.A U5 TFP placeholder copy (post-V50 ProClinic-strip)', () => {
  const src = read('src/components/TreatmentFormPage.jsx');

  it('U5.1 placeholder no longer references "clone" or "proClinicId"', () => {
    // Find the placeholder block (within ~500 chars of "ไม่พบ customerId")
    const idx = src.indexOf('ไม่พบ customerId');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 500);
    // The error body (visible to admin) MUST NOT mention proClinicId.
    // Comments above the placeholder may still reference proClinicId for
    // historical context; only check the visible JSX text.
    const jsxStart = block.indexOf('<p');
    const jsxBlock = block.slice(jsxStart);
    expect(jsxBlock).not.toMatch(/proClinicId/);
    expect(jsxBlock).not.toMatch(/clone/);
  });

  it('U5.2 placeholder mentions customerId as the missing field (post-V50 generic copy)', () => {
    const idx = src.indexOf('ไม่พบ customerId');
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/customerId ว่างเปล่า/);
  });

  it('U5.3 data-testid tfp-missing-customer-id added for RTL targeting', () => {
    expect(src).toMatch(/data-testid="tfp-missing-customer-id"/);
  });
});

// ─── F2: Rule I round-trip flow-simulate — mark → unmark → row reverts ───
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn(),
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: vi.fn(() => Promise.resolve()),
  unmarkAppointmentServiceCompleted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-V71A-flow' }),
}));

import { getAppointmentsByDateRange } from '../src/lib/scopedDataLayer.js';
import { loadTreatmentsByDateRange } from '../src/lib/reportsLoaders.js';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('V71.A F2 Rule I — round-trip mark → unmark → waiting', () => {
  beforeEach(() => {
    const today = todayBangkok();
    getAppointmentsByDateRange.mockResolvedValue([
      { id: 'RT1', date: today, startTime: '09:00', customerId: 'CRT1', customerName: 'Round-trip customer', status: 'confirmed', serviceCompletedAt: null },
    ]);
    loadTreatmentsByDateRange.mockResolvedValue([
      {
        id: 'TRT1',
        customerId: 'CRT1',
        detail: { treatmentDate: today },
        createdAt: '2026-05-15T08:00:00.000Z',
        vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
        status: 'vitalsigns-recorded',
      },
    ]);
  });

  it('F2.1 mark → row moves to completed → click unmark → row returns to waiting', async () => {
    const onMark = vi.fn(() => Promise.resolve());
    const onUnmark = vi.fn(() => Promise.resolve());
    render(
      <AppointmentHubView
        onMarkServiceComplete={onMark}
        onUnmarkServiceComplete={onUnmark}
      />
    );

    // 1. Load + waiting state
    await waitFor(() => expect(screen.getByTestId('appt-hub-row')).toBeInTheDocument());
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('1');
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('0');

    // 2. Click mark-complete + confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    confirmSpy.mockRestore();
    await waitFor(() => expect(onMark).toHaveBeenCalled());

    // 3. Counts flip
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('0'));
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('1');

    // 4. Switch to completed sub-pill → row visible there + unmark button shows
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getByText(/Round-trip customer/)).toBeInTheDocument());
    expect(screen.getByTestId('row-action-unmark-complete')).toBeInTheDocument();
    // Mark-complete button must be hidden in completed state (mutually exclusive)
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();

    // 5. Click unmark + confirm
    const confirmSpy2 = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('row-action-unmark-complete'));
    confirmSpy2.mockRestore();
    await waitFor(() => expect(onUnmark).toHaveBeenCalled());

    // 6. Counts flip back
    await waitFor(() => expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('0'));
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('1');
  });
});
