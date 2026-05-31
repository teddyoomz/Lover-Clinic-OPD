import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

// (2026-05-31) — "คอนเฟิร์มนัด" must follow the appointment's REAL status (rawStatus),
// NOT treatment-existence — exactly like the other status actions (mark-complete for
// confirmed, un-mark for done, which use their own treatment-independent gates).
// Bug: treat customer → un-mark (clears serviceCompletedAt, but the treatment RECORD
// persists → hasTreatmentForDay stays true) → revert status to "รอยืนยัน" → the confirm
// button vanished because the button dispatch led with hasTreatmentForDay. V73-BS1 class
// (UI following hasTreatmentForDay instead of real status) at the confirm-button layer.

afterEach(cleanup);

const NOW = new Date('2026-05-31T05:00:00Z'); // 12:00 Bangkok 2026-05-31
const TODAY = '2026-05-31';
const PAST = '2026-05-20';
const summary = { hn: '000061', name: 'นาย อุทิศ สอนทา' };
const treatment = { id: 'BT-1', customerId: 'C1', detail: { treatmentDate: TODAY } };
const mkAppt = (over = {}) => ({ id: 'A1', customerId: 'C1', date: TODAY, startTime: '10:30', endTime: '10:45', status: 'pending', ...over });

describe('confirm button follows real status, not treatment-existence', () => {
  test('THE BUG: today pending + treatment record exists → "คอนเฟิร์มนัด" STILL shows (+ keeps edit-treatment)', () => {
    render(<AppointmentHubRowCard appt={mkAppt()} summary={summary} apptDateTreatments={[treatment]} isTodayTab now={NOW} />);
    expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-edit-treatment')).toBeInTheDocument(); // record stays editable
  });

  test('today pending + NO treatment → confirm + edit + cancel (unchanged)', () => {
    render(<AppointmentHubRowCard appt={mkAppt()} summary={summary} apptDateTreatments={[]} isTodayTab now={NOW} />);
    expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-cancel')).toBeInTheDocument();
  });

  test('confirmed → NO confirm (mark-complete is its status action instead)', () => {
    render(<AppointmentHubRowCard appt={mkAppt({ status: 'confirmed' })} summary={summary} apptDateTreatments={[]} isTodayTab now={NOW} />);
    expect(screen.queryByTestId('row-action-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();
  });

  test('cancelled + treatment → NO confirm', () => {
    render(<AppointmentHubRowCard appt={mkAppt({ status: 'cancelled' })} summary={summary} apptDateTreatments={[treatment]} isTodayTab now={NOW} />);
    expect(screen.queryByTestId('row-action-confirm')).not.toBeInTheDocument();
  });

  test('PAST pending + treatment → NO confirm (past appts record, not confirm); edit-treatment shows', () => {
    render(<AppointmentHubRowCard appt={mkAppt({ date: PAST })} summary={summary} apptDateTreatments={[{ ...treatment, detail: { treatmentDate: PAST } }]} now={NOW} />);
    expect(screen.queryByTestId('row-action-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-action-edit-treatment')).toBeInTheDocument();
  });

  test('click confirm fires onConfirm even when a treatment record exists', () => {
    const fn = vi.fn();
    render(<AppointmentHubRowCard appt={mkAppt()} summary={summary} apptDateTreatments={[treatment]} isTodayTab now={NOW} onConfirm={fn} />);
    fireEvent.click(screen.getByTestId('row-action-confirm'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].id).toBe('A1');
  });
});
