// Task 11 tests — LineReminderHistoryPanel.
// Covers T11.5 (renders log rows from mocked onSnapshot) and T11.6 (filter by status).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock firebase + firestore BEFORE the component imports them.
// vi.mock factory hoists ABOVE top-level code, so we can't close over a
// `let` variable directly. Instead, expose the captured callback via the
// mocked module itself (mock.calls[*][1]) — we re-read it before each fire.

vi.mock('../src/firebase.js', () => ({
  db: {},
  appId: 'test-app',
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
}));

import { onSnapshot } from 'firebase/firestore';
import { LineReminderHistoryPanel } from '../src/components/backend/LineReminderHistoryPanel.jsx';

function fireRowsFromMockedListener(rows) {
  // Find the most recent onNext callback the component subscribed with.
  // onSnapshot signature in the component: onSnapshot(q, onNext, onError)
  const calls = onSnapshot.mock.calls;
  if (!calls.length) return;
  const onNext = calls[calls.length - 1][1];
  if (typeof onNext !== 'function') return;
  const fakeSnap = {
    docs: rows.map((r, idx) => ({
      id: r.id || `LOG-${idx}`,
      data: () => r,
    })),
  };
  // Wrap in act() so React flushes state updates synchronously.
  act(() => {
    onNext(fakeSnap);
  });
}

describe('T11 LineReminderHistoryPanel', () => {
  beforeEach(() => {
    onSnapshot.mockClear();
  });

  it('T11.5 renders rows from mocked onSnapshot fire', () => {
    render(<LineReminderHistoryPanel branchId="BR-1" />);
    expect(screen.getByTestId('history-panel-loading')).toBeInTheDocument();

    // Simulate Firestore returning 2 recent docs (within last 7 days).
    const nowIso = new Date().toISOString();
    fireRowsFromMockedListener([
      {
        id: 'LOG-A',
        branchId: 'BR-1',
        appointmentId: 'BA-1',
        customerId: 'LC-1',
        reminderType: 'dayBefore',
        status: 'sent',
        retryCount: 0,
        attemptedAt: nowIso,
      },
      {
        id: 'LOG-B',
        branchId: 'BR-1',
        appointmentId: 'BA-2',
        customerId: 'LC-2',
        reminderType: 'dayOf',
        status: 'failed',
        retryCount: 1,
        attemptedAt: nowIso,
      },
    ]);

    // Loading gone; table rendered with 2 rows.
    expect(screen.queryByTestId('history-panel-loading')).toBeNull();
    expect(screen.getByTestId('history-panel-table')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-A')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-B')).toBeInTheDocument();
    // Status chips visible (use getAllByText — 'sent' also appears in filter dropdown).
    const sentMatches = screen.getAllByText('sent');
    expect(sentMatches.length).toBeGreaterThanOrEqual(1);
    const failedMatches = screen.getAllByText('failed');
    expect(failedMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('T11.6 filter by status applies correctly', () => {
    render(<LineReminderHistoryPanel branchId="BR-1" />);
    const nowIso = new Date().toISOString();
    fireRowsFromMockedListener([
      { id: 'LOG-A', branchId: 'BR-1', appointmentId: 'BA-1', customerId: 'LC-1',
        reminderType: 'dayBefore', status: 'sent', retryCount: 0, attemptedAt: nowIso },
      { id: 'LOG-B', branchId: 'BR-1', appointmentId: 'BA-2', customerId: 'LC-2',
        reminderType: 'dayOf', status: 'failed', retryCount: 1, attemptedAt: nowIso },
      { id: 'LOG-C', branchId: 'BR-1', appointmentId: 'BA-3', customerId: 'LC-3',
        reminderType: 'dayBefore', status: 'skipped-quiet-hour', retryCount: 0, attemptedAt: nowIso },
    ]);

    // All 3 visible initially
    expect(screen.getByTestId('history-row-LOG-A')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-B')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-C')).toBeInTheDocument();

    // Filter by status = sent → only A visible
    const statusFilter = document.querySelector('[data-field="history-status-filter"]');
    fireEvent.change(statusFilter, { target: { value: 'sent' } });
    expect(screen.getByTestId('history-row-LOG-A')).toBeInTheDocument();
    expect(screen.queryByTestId('history-row-LOG-B')).toBeNull();
    expect(screen.queryByTestId('history-row-LOG-C')).toBeNull();

    // Filter by status = failed → only B visible
    fireEvent.change(statusFilter, { target: { value: 'failed' } });
    expect(screen.queryByTestId('history-row-LOG-A')).toBeNull();
    expect(screen.getByTestId('history-row-LOG-B')).toBeInTheDocument();
    expect(screen.queryByTestId('history-row-LOG-C')).toBeNull();

    // Filter by status = skipped-any → only C visible
    fireEvent.change(statusFilter, { target: { value: 'skipped-any' } });
    expect(screen.queryByTestId('history-row-LOG-A')).toBeNull();
    expect(screen.queryByTestId('history-row-LOG-B')).toBeNull();
    expect(screen.getByTestId('history-row-LOG-C')).toBeInTheDocument();

    // Reset → all visible
    fireEvent.change(statusFilter, { target: { value: 'all' } });
    expect(screen.getByTestId('history-row-LOG-A')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-B')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-LOG-C')).toBeInTheDocument();
  });

  it('T11.6b filter by type applies correctly', () => {
    render(<LineReminderHistoryPanel branchId="BR-1" />);
    const nowIso = new Date().toISOString();
    fireRowsFromMockedListener([
      { id: 'LOG-A', branchId: 'BR-1', appointmentId: 'BA-1', customerId: 'LC-1',
        reminderType: 'dayBefore', status: 'sent', retryCount: 0, attemptedAt: nowIso },
      { id: 'LOG-B', branchId: 'BR-1', appointmentId: 'BA-2', customerId: 'LC-2',
        reminderType: 'dayOf', status: 'sent', retryCount: 0, attemptedAt: nowIso },
    ]);

    const typeFilter = document.querySelector('[data-field="history-type-filter"]');
    fireEvent.change(typeFilter, { target: { value: 'dayBefore' } });
    expect(screen.getByTestId('history-row-LOG-A')).toBeInTheDocument();
    expect(screen.queryByTestId('history-row-LOG-B')).toBeNull();

    fireEvent.change(typeFilter, { target: { value: 'dayOf' } });
    expect(screen.queryByTestId('history-row-LOG-A')).toBeNull();
    expect(screen.getByTestId('history-row-LOG-B')).toBeInTheDocument();
  });

  it('empty state renders when no rows', () => {
    render(<LineReminderHistoryPanel branchId="BR-1" />);
    fireRowsFromMockedListener([]);
    expect(screen.getByTestId('history-panel-empty')).toBeInTheDocument();
  });
});
