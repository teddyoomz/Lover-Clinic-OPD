// Task 4 RTL — EDFollowupModal: supersede runs BEFORE create; confirmInfo forwarded.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  supersedePendingFollowups: vi.fn(async (a) => { calls.push(['supersede', a]); return { superseded: 1 }; }),
  createAssessmentRound: vi.fn(async () => { calls.push(['round']); return 'ASMT-x'; }),
  createAssessmentSession: vi.fn(async (a) => { calls.push(['session', a]); return 'FW-ED-x'; }),
}));
vi.mock('../src/lib/documentPrintEngine.js', () => ({ generateQrDataUrl: vi.fn(async () => 'data:image/png;base64,x') }));

import EDFollowupModal from '../src/components/backend/EDFollowupModal.jsx';

describe('EDFollowupModal — R3 supersede + R1 confirmInfo', () => {
  beforeEach(() => { calls.length = 0; });

  it('supersede runs FIRST, then round, then session with confirmInfo forwarded', async () => {
    render(<EDFollowupModal customerId="LC-1" roundNumber={2} intakeTypes={['adam']} branchId="BR-A"
      confirmInfo={{ name: 'นายสมชาย ใจดี', age: '45', phoneMasked: '081-•••-5678' }} isDark onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    await waitFor(() => expect(calls.find((c) => c[0] === 'session')).toBeTruthy());
    // order: supersede must precede create
    expect(calls[0][0]).toBe('supersede');
    expect(calls[0][1]).toEqual({ customerId: 'LC-1', branchId: 'BR-A' });
    expect(calls.findIndex((c) => c[0] === 'supersede')).toBeLessThan(calls.findIndex((c) => c[0] === 'session'));
    // confirmInfo forwarded to the session
    const session = calls.find((c) => c[0] === 'session');
    expect(session[1].confirmInfo).toEqual({ name: 'นายสมชาย ใจดี', age: '45', phoneMasked: '081-•••-5678' });
    expect(session[1].customerId).toBe('LC-1');
  });

  it('does not create a link when no type is picked (validation)', async () => {
    render(<EDFollowupModal customerId="LC-1" roundNumber={2} intakeTypes={[]} branchId="BR-A"
      confirmInfo={{ name: 'x', age: '1', phoneMasked: '' }} isDark onClose={() => {}} />);
    // deselect the defaults (intakeTypes empty → defaults to adam,iief)
    fireEvent.click(screen.getByTestId('ed-type-adam'));
    fireEvent.click(screen.getByTestId('ed-type-iief'));
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    await waitFor(() => expect(screen.getByText(/เลือกอย่างน้อย 1/)).toBeTruthy());
    expect(calls.length).toBe(0); // no supersede, no create
  });
});
