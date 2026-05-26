import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitPurposePicker from '../src/components/VisitPurposePicker.jsx';

// V-deposit-noappt (2026-05-27) — RTL for the one cheaply-mountable piece of
// this feature: VisitPurposePicker's new `label` prop + real chip behavior.
//
// The heavy modals (AppointmentFormModal / DepositPanel) are NOT RTL-mounted
// anywhere in this repo — they pull in Firebase + BranchContext +
// useBranchAwareListener + ~10 scopedDataLayer fns, and mocking all of that
// produces mocks-that-lie (Rule Q V66). Their ไม่นัดหมาย toggle hide/show +
// pickLater behavior is covered by source-grep
// (deposit-no-appointment-flow-simulate.test.js) + the real-prod round-trip
// (scripts/e2e-deposit-no-appointment.mjs) + user L1 acceptance.
describe('VisitPurposePicker label prop (RTL — real render, no mocks)', () => {
  it('R1 — defaults to "นัดมาเพื่อ" when no label prop', () => {
    render(<VisitPurposePicker value="" onChange={() => {}} />);
    expect(screen.getByText(/นัดมาเพื่อ/)).toBeInTheDocument();
    expect(screen.queryByText(/มัดจำสำหรับ/)).toBeNull();
  });

  it('R2 — renders "มัดจำสำหรับ" when label override is passed', () => {
    render(<VisitPurposePicker value="" onChange={() => {}} label="มัดจำสำหรับ" />);
    expect(screen.getByText(/มัดจำสำหรับ/)).toBeInTheDocument();
    expect(screen.queryByText(/นัดมาเพื่อ/)).toBeNull();
  });

  it('R3 — required star renders alongside the custom label', () => {
    render(<VisitPurposePicker value="" onChange={() => {}} label="มัดจำสำหรับ" required />);
    expect(screen.getByText(/มัดจำสำหรับ/)).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('R4 — clicking a chip emits a non-empty joined purpose string', () => {
    const onChange = vi.fn();
    render(<VisitPurposePicker value="" onChange={onChange} label="มัดจำสำหรับ" idPrefix="dep-vp" />);
    const chips = screen.getAllByRole('button');
    expect(chips.length).toBeGreaterThan(0);
    fireEvent.click(chips[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0];
    expect(typeof emitted).toBe('string');
    expect(emitted.length).toBeGreaterThan(0);
  });

  it('R5 — renders stably (no crash) when hydrated from an existing value', () => {
    expect(() => render(
      <VisitPurposePicker value="สมรรถภาพ, อื่นๆ: ผ่ามุก" onChange={() => {}} idPrefix="dep-vp" />,
    )).not.toThrow();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
