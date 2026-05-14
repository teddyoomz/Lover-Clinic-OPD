import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerOption } from '../src/components/CustomerOption.jsx';

describe('T9 CustomerOption', () => {
  it('T9.1 renders customer name', () => {
    render(<CustomerOption customer={{ name: 'นาย โอ๊ค' }} contextBranchId="BR-A" />);
    expect(screen.getByText('นาย โอ๊ค')).toBeInTheDocument();
  });

  it('T9.2 prefers fullName over name', () => {
    render(<CustomerOption customer={{ name: 'X', fullName: 'นาย โอ๊ค สุภาพ' }} contextBranchId="BR-A" />);
    expect(screen.getByText('นาย โอ๊ค สุภาพ')).toBeInTheDocument();
  });

  it('T9.3 linked at this branch shows 🟢 LINE badge', () => {
    const customer = {
      name: 'X',
      branchId: 'BR-A',
      lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A', lineDisplayName: 'LineX' } },
    };
    render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(screen.getByTitle(/LINE: LineX/)).toBeInTheDocument();
  });

  it('T9.4 legacy lineUserId at customer.branchId === contextBranchId shows 🟢', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'legacy', lineDisplayName: 'LegacyName' };
    render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(screen.getByTitle(/LINE: LegacyName/)).toBeInTheDocument();
  });

  it('T9.5 linked elsewhere → ⚪️ LINE chip', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': { lineUserId: 'U-A' } } };
    render(<CustomerOption customer={customer} contextBranchId="BR-Y" />);
    expect(screen.getByTitle(/ผูก LINE กับสาขาอื่น/)).toBeInTheDocument();
  });

  it('T9.6 not linked anywhere → no badge', () => {
    const customer = { name: 'X', branchId: 'BR-A' };
    const { container } = render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    expect(container.querySelector('[title*="LINE"]')).toBeNull();
  });

  it('T9.7 showLineBadge=false suppresses badge', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'L' };
    const { container } = render(<CustomerOption customer={customer} contextBranchId="BR-A" showLineBadge={false} />);
    expect(container.querySelector('[title*="LINE"]')).toBeNull();
  });

  // Task 9 polish (I1+I2) — nameClassName prop preserves caller styling
  // (AdminDashboard bold-heading-color + truncate; AppointmentFormModal
  // muted-secondary) and outer flex must use min-w-0 so the inner name
  // span inherits `truncate` from a parent wrapper (e.g. the AppointmentCalendarView
  // <a> wrapping CustomerOption). Badge spans must `flex-shrink-0` so they don't
  // get squished when truncate kicks in.
  it('T9.8 nameClassName prop applies to name span', () => {
    render(<CustomerOption customer={{ name: 'X' }} contextBranchId="BR-A" nameClassName="text-bold custom-class" />);
    const nameSpan = screen.getByText('X');
    expect(nameSpan.className).toContain('text-bold');
    expect(nameSpan.className).toContain('custom-class');
  });

  it('T9.9 outer flex div has min-w-0 for truncate inheritance', () => {
    const { container } = render(<CustomerOption customer={{ name: 'X' }} contextBranchId="BR-A" />);
    const outer = container.firstChild;
    expect(outer.className).toContain('min-w-0');
  });

  it('T9.10 badge spans have flex-shrink-0', () => {
    const customer = { name: 'X', branchId: 'BR-A', lineUserId: 'L' };
    const { container } = render(<CustomerOption customer={customer} contextBranchId="BR-A" />);
    const badge = container.querySelector('[title*="LINE"]');
    expect(badge.className).toContain('flex-shrink-0');
  });
});
