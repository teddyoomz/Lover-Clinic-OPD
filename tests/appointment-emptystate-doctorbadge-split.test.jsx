// @vitest-environment jsdom
// ─── appointment empty-state + doctor-badge nav + doctor/staff split (2026-07-24) ──
// Spec: docs/superpowers/specs/2026-07-24-appointment-emptystate-doctorbadge-schedule-split-design.html
// A deriveEmptyStateReason · B hub wiring · C badge nav (RTL) · D isDoctorAssistant + doctor tab · E staff-tab merge.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

import { deriveEmptyStateReason, EMPTY_STATE_COPY } from '../src/lib/appointmentHubEmptyState.js';
import { isDoctorAssistant, DOCTOR_ASSISTANT_POSITION } from '../src/lib/staffScheduleValidation.js';
import AppointmentHubDoctorCards, { DOCTOR_SCHEDULE_URL } from '../src/components/admin/AppointmentHubDoctorCards.jsx';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
afterEach(() => vi.restoreAllMocks());

describe('A — deriveEmptyStateReason (pure)', () => {
  const base = { activeTab: 'today', todaySubPill: 'waiting', waiting: 0, completed: 0, hasActiveFilter: false, tabHasData: false };
  it('A1 filtered wins when a filter is active AND the tab has data', () => {
    expect(deriveEmptyStateReason({ ...base, hasActiveFilter: true, tabHasData: true, completed: 2 })).toBe('filtered');
  });
  it('A2 all-done: today+waiting, 0 waiting, some completed', () => {
    expect(deriveEmptyStateReason({ ...base, waiting: 0, completed: 2 })).toBe('all-done');
  });
  it('A3 no-appts: genuinely empty', () => {
    expect(deriveEmptyStateReason(base)).toBe('no-appts');
  });
  it('A4 all-done ONLY on the waiting sub-pill', () => {
    expect(deriveEmptyStateReason({ ...base, todaySubPill: 'completed', completed: 2 })).toBe('no-appts');
  });
  it('A5 filter with an empty tab is NOT filtered (nothing to reveal)', () => {
    expect(deriveEmptyStateReason({ ...base, hasActiveFilter: true, tabHasData: false })).toBe('no-appts');
  });
  it('A6 non-today tab never all-done', () => {
    expect(deriveEmptyStateReason({ ...base, activeTab: 'tomorrow', completed: 2 })).toBe('no-appts');
  });
  it('A7 filter takes precedence over all-done (a filtered view is never "done")', () => {
    expect(deriveEmptyStateReason({ ...base, hasActiveFilter: true, tabHasData: true, waiting: 0, completed: 2 })).toBe('filtered');
  });
  it('A8 copy map covers every reason + never the old nag on non-filtered', () => {
    for (const r of ['filtered', 'all-done', 'no-appts']) {
      expect(EMPTY_STATE_COPY[r].heading).toBeTruthy();
      expect(EMPTY_STATE_COPY[r].sub).toBeTruthy();
    }
    expect(EMPTY_STATE_COPY['all-done'].sub).not.toMatch(/ปรับตัวกรอง/);
    expect(EMPTY_STATE_COPY['no-appts'].sub).not.toMatch(/ปรับตัวกรอง/);
    expect(EMPTY_STATE_COPY.filtered.sub).toMatch(/ปรับตัวกรอง/);
  });
});

describe('B — AppointmentHubView wiring (source-grep)', () => {
  const src = read('src/components/admin/AppointmentHubView.jsx');
  it('B1 imports the helper + renders per reason + keeps both CTAs', () => {
    expect(src).toMatch(/deriveEmptyStateReason/);
    expect(src).toMatch(/data-empty-reason=\{emptyReason\}/);
    // the reason is a pre-computed const, not an IIFE-in-JSX (RP1 audit is the
    // canonical guard for that — it strips comments; a blanket }\)()} grep here
    // would false-match this note).
    expect(src).toMatch(/const emptyReason =/);
    expect(src).toMatch(/setTodaySubPill\('completed'\)/);
    expect(src).toMatch(/appt-empty-cta-add/);
    expect(src).toMatch(/setCreatingAppt\(true\)/);
  });
  it('B2 the old blanket nag is GONE from the empty block', () => {
    expect(src).not.toMatch(/ลองเปลี่ยน tab หรือ ปรับตัวกรอง/);
    expect(src).not.toMatch(/>ไม่มีรายการนัดหมาย</);
  });
  it('B3 hasActiveFilter derives from the real filter state names', () => {
    expect(src).toMatch(/search\.trim\(\) !== '' \|\| typeFilter !== '' \|\| statusFilter !== '__all__'/);
    expect(src).toMatch(/tabHasData: appts\.length > 0/);
  });
});

describe('C — doctor badge → confirm → open doctor-schedule tab (RTL)', () => {
  it('C1 empty "ไม่มีแพทย์เข้า" badge is clickable → modal → window.open(doctor-schedules,_blank)', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { getByTestId, queryByTestId } = render(<AppointmentHubDoctorCards tab="today" doctorShifts={[]} />);
    expect(getByTestId('appt-hub-doctor-cards-empty')).toBeTruthy();
    expect(queryByTestId('appt-doctor-nav-modal')).toBeNull();
    fireEvent.click(getByTestId('appt-hub-doctor-cards'));
    expect(getByTestId('appt-doctor-nav-modal')).toBeTruthy();
    fireEvent.click(getByTestId('appt-doctor-nav-go'));
    expect(open).toHaveBeenCalledWith(DOCTOR_SCHEDULE_URL, '_blank');
    expect(queryByTestId('appt-doctor-nav-modal')).toBeNull();
  });
  it('C2 chip badge also clickable; ยกเลิก closes without navigating', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { getByTestId, getByText, queryByTestId } = render(
      <AppointmentHubDoctorCards tab="today" doctorShifts={[{ name: 'หมอมายด์', startTime: '11:00', endTime: '20:00' }]} />,
    );
    expect(getByTestId('appt-hub-doctor-card')).toBeTruthy();
    fireEvent.click(getByTestId('appt-hub-doctor-cards'));
    fireEvent.click(getByText('ยกเลิก'));
    expect(queryByTestId('appt-doctor-nav-modal')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
  it('C3 renders nothing off today/tomorrow', () => {
    const { container } = render(<AppointmentHubDoctorCards tab="upcoming" doctorShifts={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it('C4 DOCTOR_SCHEDULE_URL is the existing deep-link pattern', () => {
    expect(DOCTOR_SCHEDULE_URL).toBe('?backend=1&tab=doctor-schedules');
  });
});

describe('D — isDoctorAssistant + ตารางแพทย์ filters assistants out', () => {
  it('D1 matches ONLY the exact ผู้ช่วยแพทย์ position (trimmed)', () => {
    expect(DOCTOR_ASSISTANT_POSITION).toBe('ผู้ช่วยแพทย์');
    expect(isDoctorAssistant({ position: 'ผู้ช่วยแพทย์' })).toBe(true);
    expect(isDoctorAssistant({ position: ' ผู้ช่วยแพทย์ ' })).toBe(true);
    expect(isDoctorAssistant({ position: 'แพทย์' })).toBe(false);
    expect(isDoctorAssistant({ position: '' })).toBe(false);
    expect(isDoctorAssistant({})).toBe(false);
    expect(isDoctorAssistant(null)).toBe(false);
    expect(isDoctorAssistant(undefined)).toBe(false);
  });
  it('D2 DoctorSchedulesTab filters assistants out of listDoctors', () => {
    const src = read('src/components/backend/DoctorSchedulesTab.jsx');
    expect(src).toMatch(/import \{ isDoctorAssistant \} from '\.\.\/\.\.\/lib\/staffScheduleValidation\.js'/);
    expect(src).toMatch(/\(await listDoctors\(\)\)\.filter\(\(p\) => !isDoctorAssistant\(p\)\)/);
  });
});

describe('E — ตารางพนักงาน merges normalized assistants', () => {
  const src = read('src/components/backend/EmployeeSchedulesTab.jsx');
  it('E1 imports + merges assistants from be_doctors, normalized to staffId', () => {
    expect(src).toMatch(/listDoctors/);
    expect(src).toMatch(/filterDoctorsByBranch/);
    expect(src).toMatch(/import \{ isDoctorAssistant \}/);
    expect(src).toMatch(/\(docList \|\| \[\]\)\.filter\(isDoctorAssistant\)/);
    expect(src).toMatch(/staffId: String\(d\.doctorId \|\| d\.id\)/);
    expect(src).toMatch(/\.\.\.filterStaffByBranch\(staffList \|\| \[\]/);
  });
  it('E2 the merge is the identity-normalization contract (schedules resolve via staffId||id)', () => {
    // the assistant's schedule entries are keyed by doctorId||id (DoctorSchedulesTab
    // convention); normalizing staffId=doctorId||id makes the existing staffIdSet match.
    expect(src).toMatch(/Promise\.all\(\[listStaff\(\), listDoctors\(\)\]\)/);
  });
});
