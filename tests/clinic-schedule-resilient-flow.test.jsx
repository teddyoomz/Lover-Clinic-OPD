// Task 7 (representative mounted flow-sim) — a stuck onSnapshot must end in
// the error+retry card, never a permanent spinner (mobile-load reliability).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let snapCb = null;
let errCb = null;
const unsub = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __doc: a }),
  // A2 repoint (2026-07-07 instant cold-start): ClinicSchedule now subscribes via
  // freshGate's onSnapshotFresh → onSnapshot(ref, { includeMetadataChanges }, cb, err).
  // Normalize both arg shapes so this harness keeps driving the REAL wrapped callback.
  onSnapshot: (_ref, optsOrCb, cbOrErr, maybeErr) => {
    if (typeof optsOrCb === 'function') { snapCb = optsOrCb; errCb = cbOrErr; }
    else { snapCb = cbOrErr; errCb = maybeErr; }
    return unsub;
  },
}));
// A2 — snapshots fed through the freshGate wrapper need metadata; server = fromCache:false.
const serverSnap = (o) => ({ metadata: { fromCache: false }, ...o });
vi.mock('../src/firebase.js', () => ({
  db: {}, appId: 'app',
  auth: { currentUser: { uid: 'u' }, onAuthStateChanged: () => () => {} },
}));
const reconnectFirestore = vi.fn();
vi.mock('../src/lib/firestoreReconnect.js', () => ({ reconnectFirestore: (...a) => reconnectFirestore(...a) }));

import ClinicSchedule from '../src/pages/ClinicSchedule.jsx';

const props = { token: 't1', clinicSettings: { accentColor: '#dc2626' }, theme: 'dark', setTheme: () => {} };

describe('ClinicSchedule resilient load (mounted flow)', () => {
  beforeEach(() => { vi.useFakeTimers(); snapCb = null; errCb = null; unsub.mockClear(); reconnectFirestore.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('subscribes on mount and shows the spinner (not the error card)', () => {
    render(<ClinicSchedule {...props} />);
    expect(snapCb).toBeTypeOf('function');
    expect(screen.queryByTestId('load-error-retry')).toBeNull();
  });

  it('a snapshot that NEVER fires → auto-retry → error+retry card (no permanent spinner)', () => {
    render(<ClinicSchedule {...props} />);
    act(() => { vi.advanceTimersByTime(8000); }); // soft timeout → silent auto-retry (re-subscribe)
    expect(reconnectFirestore).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('load-error-retry')).toBeNull(); // still silently retrying
    act(() => { vi.advanceTimersByTime(8000); }); // retries exhausted
    expect(screen.getByTestId('load-error-retry')).toBeInTheDocument();
  });

  it('a snapshot that fires (doc found) → schedule loads, error card never appears', () => {
    render(<ClinicSchedule {...props} />);
    act(() => {
      snapCb(serverSnap({ exists: () => true, data: () => ({ months: ['2026-01'], doctorDays: [], closedDays: [], noDoctorRequired: true, bookedSlots: [] }) }));
    });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.queryByTestId('load-error-retry')).toBeNull();
  });

  it('a doc-NOT-FOUND snapshot counts as loaded (markReady) → notfound shown, NO error card (contract 1)', () => {
    render(<ClinicSchedule {...props} />);
    act(() => { snapCb(serverSnap({ exists: () => false, data: () => ({}) })); }); // doc absent / disabled
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByText('ไม่พบตารางนัดหมาย')).toBeInTheDocument();
    expect(screen.queryByTestId('load-error-retry')).toBeNull(); // not-found is a RESOLVED load, never the error card
  });

  it('A2 (2026-07-07): a fromCache snapshot does NOT resolve the page — customers render server truth only', () => {
    render(<ClinicSchedule {...props} />);
    act(() => {
      snapCb({ metadata: { fromCache: true }, exists: () => true, data: () => ({ months: ['2026-01'], doctorDays: [], closedDays: [], noDoctorRequired: true, bookedSlots: [] }) });
    });
    // still on the loading spinner — persistentLocalCache data is dropped by freshGate
    expect(document.querySelector('.animate-spin')).not.toBeNull();
    // server snapshot then resolves it
    act(() => {
      snapCb(serverSnap({ exists: () => true, data: () => ({ months: ['2026-01'], doctorDays: [], closedDays: [], noDoctorRequired: true, bookedSlots: [] }) }));
    });
    expect(screen.queryByTestId('load-error-retry')).toBeNull();
  });

  it('a transient onError does NOT instantly flash notfound — it routes through retry', () => {
    render(<ClinicSchedule {...props} />);
    act(() => { errCb(new Error('transient')); });            // markError → silent retry
    expect(screen.queryByTestId('load-error-retry')).toBeNull();
    act(() => { errCb(new Error('transient again')); });      // 2nd failure → error
    expect(screen.getByTestId('load-error-retry')).toBeInTheDocument();
    expect(screen.queryByText('ไม่พบตารางนัดหมาย')).toBeNull(); // NOT the dead-end notfound
  });
});
