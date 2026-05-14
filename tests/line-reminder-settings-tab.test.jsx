// Task 11 tests — LineReminderSettingsSection + LineReminderDebugSection.
// Covers T11.1 / T11.2 / T11.3 / T11.4 per plan §Task 11 Step 1.
//
// Strategy:
//   - LineReminderSettingsSection is a pure controlled component — render +
//     fireEvent + assert onChange shape.
//   - LineReminderDebugSection: render + assert "all" mode disables button
//     until branch name typed verbatim. Also confirm dry-run is default-selected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// firebase auth — stub before any importer can resolve it
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'admin-1', getIdToken: vi.fn(async () => 'fake-token') } },
  db: {},
  appId: 'test-app',
}));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

import { LineReminderSettingsSection } from '../src/components/backend/LineReminderSettingsSection.jsx';
import { LineReminderDebugSection } from '../src/components/backend/LineReminderDebugSection.jsx';

const baseReminderForm = {
  lineReminder: {
    enabled: false,
    dayBeforeHour: 20,
    dayOfHour: 9,
    quietHourStart: 22,
    quietHourEnd: 8,
    templateDayBefore: 'tdb',
    templateDayOf: 'tdo',
    cancellationPolicyText: 'cpt',
  },
};

describe('T11 LineReminderSettingsSection', () => {
  it('T11.1 renders toggle + 4 time pickers + 3 textareas', () => {
    render(<LineReminderSettingsSection form={baseReminderForm} onChange={() => {}} />);
    // Toggle label visible
    expect(screen.getByText(/แจ้งเตือนสาขานี้/)).toBeInTheDocument();
    // 4 selects (dayBeforeHour, dayOfHour, quietHourStart, quietHourEnd)
    const fieldSelectors = [
      '[data-field="lineReminder.dayBeforeHour"]',
      '[data-field="lineReminder.dayOfHour"]',
      '[data-field="lineReminder.quietHourStart"]',
      '[data-field="lineReminder.quietHourEnd"]',
    ];
    fieldSelectors.forEach((sel) => {
      expect(document.querySelector(sel)).not.toBeNull();
    });
    // 3 textareas
    expect(document.querySelector('[data-field="lineReminder.templateDayBefore"]')).not.toBeNull();
    expect(document.querySelector('[data-field="lineReminder.templateDayOf"]')).not.toBeNull();
    expect(document.querySelector('[data-field="lineReminder.cancellationPolicyText"]')).not.toBeNull();
  });

  it('T11.2 toggle click fires onChange with updated lineReminder.enabled', () => {
    const onChange = vi.fn();
    render(<LineReminderSettingsSection form={baseReminderForm} onChange={onChange} />);
    const cb = screen.getByRole('checkbox', { name: /แจ้งเตือนสาขานี้/ });
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0];
    expect(payload).toHaveProperty('lineReminder');
    expect(payload.lineReminder.enabled).toBe(true);
    // other fields preserved
    expect(payload.lineReminder.dayBeforeHour).toBe(20);
    expect(payload.lineReminder.templateDayBefore).toBe('tdb');
  });

  it('T11.2b template editor change fires onChange with text patch', () => {
    const onChange = vi.fn();
    render(<LineReminderSettingsSection form={baseReminderForm} onChange={onChange} />);
    const ta = document.querySelector('[data-field="lineReminder.templateDayBefore"]');
    fireEvent.change(ta, { target: { value: 'NEW BODY' } });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)[0];
    expect(payload.lineReminder.templateDayBefore).toBe('NEW BODY');
    // other fields preserved
    expect(payload.lineReminder.templateDayOf).toBe('tdo');
  });

  it('T11.2c dayOfHour can be set to null (ปิด)', () => {
    const onChange = vi.fn();
    render(<LineReminderSettingsSection form={baseReminderForm} onChange={onChange} />);
    const sel = document.querySelector('[data-field="lineReminder.dayOfHour"]');
    fireEvent.change(sel, { target: { value: '__null__' } });
    const payload = onChange.mock.calls.at(-1)[0];
    expect(payload.lineReminder.dayOfHour).toBeNull();
  });
});

describe('T11 LineReminderDebugSection', () => {
  beforeEach(() => {
    // global fetch stub — never actually invoked in these tests
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sent: 0, skipped: 0, failed: 0 }),
    }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('T11.4 dry-run mode is the default', () => {
    render(<LineReminderDebugSection branchId="BR-1" branchName="พระราม 3" />);
    const dryRunRadio = document.querySelector('[data-field="mode-dry-run"]');
    const singleRadio = document.querySelector('[data-field="mode-single"]');
    const allRadio = document.querySelector('[data-field="mode-all"]');
    expect(dryRunRadio.checked).toBe(true);
    expect(singleRadio.checked).toBe(false);
    expect(allRadio.checked).toBe(false);
  });

  it('T11.4b dayBefore is the default reminderType', () => {
    render(<LineReminderDebugSection branchId="BR-1" branchName="พระราม 3" />);
    const r = document.querySelector('[data-field="reminderType-dayBefore"]');
    expect(r.checked).toBe(true);
  });

  it('T11.3 "all" mode disables fire button until branch name typed verbatim', () => {
    render(<LineReminderDebugSection branchId="BR-1" branchName="พระราม 3" />);
    // Select "all" mode
    fireEvent.click(document.querySelector('[data-field="mode-all"]'));
    // Warning banner visible
    expect(screen.getByTestId('debug-fire-all-warning')).toBeInTheDocument();
    const btn = screen.getByTestId('debug-fire-button');
    expect(btn).toBeDisabled();

    // Type a wrong branch name → still disabled
    const confirmInput = document.querySelector('[data-field="branch-name-confirm"]');
    fireEvent.change(confirmInput, { target: { value: 'wrong' } });
    expect(btn).toBeDisabled();

    // Type the correct branch name → enabled
    fireEvent.change(confirmInput, { target: { value: 'พระราม 3' } });
    expect(btn).not.toBeDisabled();
  });

  it('T11.3b "single" mode requires a customer id before fire', () => {
    render(<LineReminderDebugSection branchId="BR-1" branchName="พระราม 3" />);
    fireEvent.click(document.querySelector('[data-field="mode-single"]'));
    const btn = screen.getByTestId('debug-fire-button');
    expect(btn).toBeDisabled();

    const input = document.querySelector('[data-field="single-customer-query"]');
    fireEvent.change(input, { target: { value: 'LC-26000001' } });
    expect(btn).not.toBeDisabled();
  });

  it('T11.3c dry-run mode does not require any confirmation', () => {
    render(<LineReminderDebugSection branchId="BR-1" branchName="พระราม 3" />);
    // dry-run is default; button should be enabled with just a branchId
    const btn = screen.getByTestId('debug-fire-button');
    expect(btn).not.toBeDisabled();
  });
});
