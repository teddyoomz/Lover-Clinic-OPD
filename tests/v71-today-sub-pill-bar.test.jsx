// V71 — TodaySubPillBar.
// Renders TWO pills with counts. Active pill is styled distinctly.
// onSubPillChange callback fires with 'waiting' | 'completed' on click.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubTodaySubPillBar from '../src/components/admin/AppointmentHubTodaySubPillBar.jsx';

describe('V71 AppointmentHubTodaySubPillBar', () => {
  it('SP1.1 renders both pills with correct counts', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={3}
      completedCount={5}
      onSubPillChange={() => {}}
    />);
    expect(screen.getByText(/กำลังรอ/)).toBeInTheDocument();
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('SP1.2 active pill has aria-selected=true', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="completed"
      waitingCount={0}
      completedCount={2}
      onSubPillChange={() => {}}
    />);
    const completedBtn = screen.getByTestId('sub-pill-completed');
    const waitingBtn = screen.getByTestId('sub-pill-waiting');
    expect(completedBtn).toHaveAttribute('aria-selected', 'true');
    expect(waitingBtn).toHaveAttribute('aria-selected', 'false');
  });

  it('SP1.3 clicking inactive pill calls onSubPillChange', () => {
    const handler = vi.fn();
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={1}
      completedCount={1}
      onSubPillChange={handler}
    />);
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    expect(handler).toHaveBeenCalledWith('completed');
  });

  it('SP1.4 zero count still renders (no hide)', () => {
    render(<AppointmentHubTodaySubPillBar
      activeSubPill="waiting"
      waitingCount={0}
      completedCount={0}
      onSubPillChange={() => {}}
    />);
    expect(screen.getByText(/กำลังรอ/)).toBeInTheDocument();
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
  });
});
