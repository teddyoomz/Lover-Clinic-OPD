// V131 (2026-05-28) — appointment detail MODAL: customer name is now a link →
// opens ?backend=1&customer=<id> in a new tab (like reports-sale). Wired only in
// the modal (onOpenCustomer supplied) for LINKED appts (appt.customerId); the
// hover peek + pick-later/walk-in appts keep a plain name. AV151.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import AppointmentDetailBody from '../src/components/backend/AppointmentDetailBody.jsx';

const baseAppt = {
  customerId: 'LC-26000078',
  customerName: 'นาย สุรชัย ปิยะอภินันท์',
  status: 'รอยืนยัน', date: '2026-05-28', startTime: '12:00', endTime: '12:15',
};

describe('V131.D appointment modal clickable customer name', () => {
  it('D1: modal + onOpenCustomer + customerId → name is a BUTTON; click opens that customer', () => {
    const onOpen = vi.fn();
    render(<AppointmentDetailBody appt={baseAppt} variant="modal" onOpenCustomer={onOpen} />);
    const nameEl = screen.getByTestId('appt-detail-name');
    expect(nameEl.tagName).toBe('BUTTON');
    fireEvent.click(nameEl);
    expect(onOpen).toHaveBeenCalledWith('LC-26000078');
  });
  it('D2: peek variant (no onOpenCustomer) → plain DIV, not clickable', () => {
    render(<AppointmentDetailBody appt={baseAppt} variant="peek" />);
    expect(screen.getByTestId('appt-detail-name').tagName).toBe('DIV');
  });
  it('D3: pick-later/walk-in (no customerId) → plain DIV even in modal', () => {
    const onOpen = vi.fn();
    const { customerId, ...noCid } = baseAppt;
    render(<AppointmentDetailBody appt={{ ...noCid, customerNameTemp: 'ลูกค้าใหม่' }} variant="modal" onOpenCustomer={onOpen} />);
    expect(screen.getByTestId('appt-detail-name').tagName).toBe('DIV');
  });
  it('D4: name link is cyan (never red on a patient name — Thai-culture)', () => {
    const onOpen = vi.fn();
    render(<AppointmentDetailBody appt={baseAppt} variant="modal" onOpenCustomer={onOpen} />);
    expect(screen.getByTestId('appt-detail-name').className).toMatch(/text-cyan-/);
  });
});

describe('V131.D-SG popover wiring + body guard', () => {
  const pop = readFileSync('src/components/backend/AppointmentDetailPopover.jsx', 'utf8');
  const body = readFileSync('src/components/backend/AppointmentDetailBody.jsx', 'utf8');
  it('SG1: popover imports openCustomerInNewTab + passes onOpenCustomer to the body', () => {
    expect(pop).toMatch(/import \{ openCustomerInNewTab \} from ['"][^'"]*customerNavigation\.js['"]/);
    expect(pop).toMatch(/onOpenCustomer=\{openCustomerInNewTab\}/);
  });
  it('SG2: body guards the clickable name on onOpenCustomer && appt.customerId', () => {
    expect(body).toMatch(/onOpenCustomer && appt\.customerId/);
    expect(body).toMatch(/onClick=\{\(\) => onOpenCustomer\(appt\.customerId\)\}/);
  });
});
