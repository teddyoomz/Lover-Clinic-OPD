import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineNotifyConfirmation } from '../src/components/LineNotifyConfirmation.jsx';

describe('T10 LineNotifyConfirmation', () => {
  it('T10.1 linked-here — checkbox checked + green chip', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', lineDisplayName: 'OakLINE' } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={true} onChange={() => {}} />);
    expect(screen.getByText(/แจ้งเตือนผ่าน LINE/)).toBeInTheDocument();
    expect(screen.getByText(/OakLINE/)).toBeInTheDocument();
  });

  it('T10.2 linked elsewhere — warning + invite-to-link', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-Y" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/ผูก LINE กับสาขาอื่น/)).toBeInTheDocument();
  });

  it('T10.3 customer.notifyOptOut shows warning chip', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'l', notifyOptOut: true };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/ลูกค้าปิดแจ้งเตือน/)).toBeInTheDocument();
  });

  it('T10.4 stale chip', () => {
    const customer = {
      name: 'X', branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', _lineStale: true } },
    };
    render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(screen.getByText(/หมดอายุ/)).toBeInTheDocument();
  });

  it('T10.5 not linked anywhere → component returns null', () => {
    const customer = { name: 'X', branchId: 'BR-A' };
    const { container } = render(<LineNotifyConfirmation customer={customer} targetBranchId="BR-A" checked={false} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
