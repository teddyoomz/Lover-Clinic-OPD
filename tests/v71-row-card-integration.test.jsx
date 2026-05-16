// V71 — AppointmentHubRowCard integration: LINE badge inline, OPD stepper row,
// complete button on today tab with treatment present.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const baseAppt = {
  id: 'BA-V71-test',
  customerId: 'C-V71',
  customerName: 'นางสาว แพรพร พรแพร',
  date: '2026-05-15',
  startTime: '13:15',
  endTime: '14:15',
  status: 'confirmed',
  notifyChannel: ['line'],
  customerLineUserId: 'Uxxx',
  doctorName: 'หมอมายด์',
  roomName: 'ห้องแพทย์/ผ่าตัด',
  appointmentTo: 'botox',
  serviceCompletedAt: null,
};

const baseSummary = {
  hn: '000004',
  name: 'นางสาว แพรพร พรแพร',
  walletBalance: 207000,
};

const treatment = {
  id: 'T-V71',
  vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
  status: 'vitalsigns-recorded',
};

describe('V71 RowCard LINE badge moved inline', () => {
  it('RC1.1 LINE badge renders INSIDE row (not absolute-positioned)', () => {
    const { container } = render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={false}
      />
    );
    const lineBadge = container.querySelector('[data-testid="line-badge"]');
    expect(lineBadge).toBeTruthy();
    let node = lineBadge;
    while (node && node !== container) {
      const cls = node.className || '';
      expect(typeof cls === 'string' && cls.includes('absolute')).toBe(false);
      node = node.parentElement;
    }
  });
});

describe('V71 RowCard OPD stepper row', () => {
  it('RC2.1 stepper row renders with latestTreatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
      />
    );
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('RC2.2 stepper row renders MUTED on today tab with no treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={true}
      />
    );
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('RC2.3 stepper row HIDDEN on tomorrow tab with no treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={false}
      />
    );
    expect(screen.queryByTestId('appt-row-opd-stepper')).toBeNull();
  });
});

describe('V71 RowCard service-completed button', () => {
  it('RC3.1 button visible on today + treatment exists + not yet completed', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();
  });

  it('RC3.2 button VISIBLE even when no treatment (V71.B-ter relax — admin trust)', () => {
    // V71.B-ter (2026-05-18) fully relaxed the gate: button now shows
    // on today tab regardless of treatment existence. Pre-V71.B-ter
    // required hasTreatmentForDay; now trusts admin's deliberate click
    // per user directive "ไปๆกลับๆไม่จำกัด". Test updated 2026-05-17 EOD+1.
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();
  });

  it('RC3.3 button HIDDEN on non-today tab', () => {
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={false}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
  });

  it('RC3.4 button HIDDEN when serviceCompletedAt already set', () => {
    const completedAppt = { ...baseAppt, serviceCompletedAt: { seconds: 12345 } };
    render(
      <AppointmentHubRowCard
        appt={completedAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={() => {}}
      />
    );
    expect(screen.queryByTestId('row-action-mark-complete')).toBeNull();
  });

  it('RC3.5 click → confirm → calls onMarkServiceComplete with appt', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(baseAppt);
    confirmSpy.mockRestore();
  });

  it('RC3.6 click → confirm-no → handler NOT called', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const handler = vi.fn();
    render(
      <AppointmentHubRowCard
        appt={baseAppt}
        summary={baseSummary}
        apptDateTreatments={[treatment]}
        isTodayTab={true}
        onMarkServiceComplete={handler}
      />
    );
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    expect(handler).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
