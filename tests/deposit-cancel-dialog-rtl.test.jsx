import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DepositAwareCancelDialog from '../src/components/admin/DepositAwareCancelDialog.jsx';

// getDeposit is the only Firestore dependency — mock it. resolveDepositCancelState
// + fmtMoney are pure (real). No global.fetch use → no AV41 concern.
vi.mock('../src/lib/scopedDataLayer.js', () => ({ getDeposit: vi.fn() }));
import { getDeposit } from '../src/lib/scopedDataLayer.js';

describe('DepositAwareCancelDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('R1 appt orientation, unused deposit → both + keep enabled; both fires "both"', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-1', amount: 2000, usedAmount: 0, status: 'active' });
    const onChoice = vi.fn();
    render(<DepositAwareCancelDialog open orientation="appt" depositId="DEP-1" onChoice={onChoice} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cancel-choice-both').disabled).toBe(false));
    expect(screen.getByTestId('cancel-choice-keep').disabled).toBe(false);
    fireEvent.click(screen.getByTestId('cancel-choice-both'));
    expect(onChoice).toHaveBeenCalledWith('both');
  });

  it('R2 appt orientation, USED deposit → both DISABLED, keep ENABLED (keep preserves deposit)', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-2', amount: 2000, usedAmount: 500, status: 'active' });
    render(<DepositAwareCancelDialog open orientation="appt" depositId="DEP-2" onChoice={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cancel-choice-both').disabled).toBe(true));
    expect(screen.getByTestId('cancel-choice-keep').disabled).toBe(false);
  });

  it('R3 deposit orientation, USED deposit → both AND keep DISABLED (keep still deletes deposit)', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-3', amount: 2000, usedAmount: 500, status: 'active' });
    render(<DepositAwareCancelDialog open orientation="deposit" depositId="DEP-3" onChoice={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cancel-choice-both').disabled).toBe(true));
    expect(screen.getByTestId('cancel-choice-keep').disabled).toBe(true);
  });

  it('R4 keep choice → fires "this-only"', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-1', amount: 2000, usedAmount: 0, status: 'active' });
    const onChoice = vi.fn();
    render(<DepositAwareCancelDialog open orientation="appt" depositId="DEP-1" onChoice={onChoice} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cancel-choice-keep').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('cancel-choice-keep'));
    expect(onChoice).toHaveBeenCalledWith('this-only');
  });

  it('R5 back → fires "cancel" + onClose', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-1', amount: 2000, usedAmount: 0, status: 'active' });
    const onChoice = vi.fn(); const onClose = vi.fn();
    render(<DepositAwareCancelDialog open orientation="appt" depositId="DEP-1" onChoice={onChoice} onClose={onClose} />);
    await waitFor(() => screen.getByTestId('cancel-choice-back'));
    fireEvent.click(screen.getByTestId('cancel-choice-back'));
    expect(onChoice).toHaveBeenCalledWith('cancel');
    expect(onClose).toHaveBeenCalled();
  });

  it('R6 open=false → renders nothing', () => {
    const { container } = render(
      <DepositAwareCancelDialog open={false} orientation="appt" depositId="DEP-1" onChoice={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('R7 amount rendered via fmtMoney', async () => {
    getDeposit.mockResolvedValue({ id: 'DEP-9', amount: 2000, usedAmount: 0, status: 'active' });
    render(<DepositAwareCancelDialog open orientation="appt" depositId="DEP-9" onChoice={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('deposit-cancel-dialog').textContent).toMatch(/2,000/));
  });
});
