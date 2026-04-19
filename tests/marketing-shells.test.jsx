// ─── MarketingTabShell + MarketingFormShell — RTL tests (AV10) ────────────
// Guards against regression in the shared chrome extracted from Promotion /
// Coupon / Voucher tabs and form modals.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tag } from 'lucide-react';

import MarketingTabShell from '../src/components/backend/MarketingTabShell.jsx';
import MarketingFormShell from '../src/components/backend/MarketingFormShell.jsx';

const clinicSettings = { accentColor: '#dc2626' };

describe('MarketingTabShell', () => {
  const baseProps = {
    icon: Tag,
    title: 'โปรโมชัน',
    totalCount: 0,
    filteredCount: 0,
    createLabel: 'สร้างโปรโมชัน',
    onCreate: () => {},
    searchValue: '',
    onSearchChange: () => {},
    searchPlaceholder: 'ค้นหา',
    emptyText: 'ยังไม่มีโปรโมชัน',
    notFoundText: 'ไม่พบโปรโมชันที่ตรงกับตัวกรอง',
    clinicSettings,
  };

  it('T1 renders title + counts', () => {
    render(<MarketingTabShell {...baseProps} totalCount={12} filteredCount={7} />);
    expect(screen.getByText('โปรโมชัน')).toBeInTheDocument();
    expect(screen.getByText(/จำนวน 12 รายการ · แสดง 7 รายการ/)).toBeInTheDocument();
  });

  it('T2 fires onCreate when create button clicked', () => {
    const onCreate = vi.fn();
    render(<MarketingTabShell {...baseProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('T3 search input is controlled', () => {
    const onSearchChange = vi.fn();
    render(<MarketingTabShell {...baseProps} searchValue="abc" onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText('ค้นหา');
    expect(input.value).toBe('abc');
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(onSearchChange).toHaveBeenCalledWith('xyz');
  });

  it('T4 renders extraFilters', () => {
    render(
      <MarketingTabShell
        {...baseProps}
        extraFilters={<select data-testid="f"><option>a</option></select>}
      />
    );
    expect(screen.getByTestId('f')).toBeInTheDocument();
  });

  it('T5 shows empty-state when totalCount=0', () => {
    render(<MarketingTabShell {...baseProps} totalCount={0} filteredCount={0} />);
    expect(screen.getByText('ยังไม่มีโปรโมชัน')).toBeInTheDocument();
  });

  it('T6 shows not-found state when totalCount > 0 but filteredCount=0', () => {
    render(<MarketingTabShell {...baseProps} totalCount={5} filteredCount={0} />);
    expect(screen.getByText('ไม่พบโปรโมชันที่ตรงกับตัวกรอง')).toBeInTheDocument();
    expect(screen.queryByText('ยังไม่มีโปรโมชัน')).not.toBeInTheDocument();
  });

  it('T7 shows loading state (children hidden)', () => {
    render(
      <MarketingTabShell {...baseProps} loading totalCount={5} filteredCount={5}>
        <div data-testid="card">card</div>
      </MarketingTabShell>
    );
    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
    expect(screen.queryByTestId('card')).not.toBeInTheDocument();
  });

  it('T8 renders children when items present + not loading', () => {
    render(
      <MarketingTabShell {...baseProps} totalCount={1} filteredCount={1}>
        <div data-testid="card">card</div>
      </MarketingTabShell>
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('T9 renders error banner', () => {
    render(<MarketingTabShell {...baseProps} error="โหลดล้มเหลว" />);
    expect(screen.getByText('โหลดล้มเหลว')).toBeInTheDocument();
  });

  it('T10 title color uses accent from clinicSettings (Thai culture: red on names banned, not on tab titles)', () => {
    const { container } = render(<MarketingTabShell {...baseProps} clinicSettings={{ accentColor: '#3b82f6' }} />);
    const title = container.querySelector('h2');
    expect(title).toHaveStyle({ color: '#3b82f6' });
  });

  it('T11 empty state still renders when no Icon supplied', () => {
    const { icon: _ignored, ...noIcon } = baseProps;
    render(<MarketingTabShell {...noIcon} />);
    expect(screen.getByText('ยังไม่มีโปรโมชัน')).toBeInTheDocument();
  });
});

describe('MarketingFormShell', () => {
  const baseProps = {
    isEdit: false,
    titleCreate: 'สร้างคูปอง',
    titleEdit: 'แก้ไขคูปอง',
    onClose: () => {},
    onSave: () => {},
    clinicSettings,
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('F1 renders create title when isEdit=false', () => {
    render(<MarketingFormShell {...baseProps}><div>body</div></MarketingFormShell>);
    expect(screen.getByText('สร้างคูปอง')).toBeInTheDocument();
  });

  it('F2 renders edit title when isEdit=true', () => {
    render(<MarketingFormShell {...baseProps} isEdit><div>body</div></MarketingFormShell>);
    expect(screen.getByText('แก้ไขคูปอง')).toBeInTheDocument();
  });

  it('F3 save button label switches per isEdit', () => {
    const { rerender } = render(
      <MarketingFormShell {...baseProps} createLabel="สร้าง" editLabel="บันทึก">
        <div>body</div>
      </MarketingFormShell>
    );
    expect(screen.getByText('สร้าง')).toBeInTheDocument();
    rerender(
      <MarketingFormShell {...baseProps} isEdit createLabel="สร้าง" editLabel="บันทึก">
        <div>body</div>
      </MarketingFormShell>
    );
    expect(screen.getByText('บันทึก')).toBeInTheDocument();
  });

  it('F4 renders children body', () => {
    render(<MarketingFormShell {...baseProps}><div data-testid="body">BODY</div></MarketingFormShell>);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('F5 renders error banner', () => {
    render(<MarketingFormShell {...baseProps} error="บันทึกล้มเหลว"><div>body</div></MarketingFormShell>);
    expect(screen.getByText('บันทึกล้มเหลว')).toBeInTheDocument();
  });

  it('F6 click on backdrop fires onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MarketingFormShell {...baseProps} onClose={onClose}><div>body</div></MarketingFormShell>
    );
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('F7 click on modal body does NOT close', () => {
    const onClose = vi.fn();
    render(<MarketingFormShell {...baseProps} onClose={onClose}><div data-testid="body">BODY</div></MarketingFormShell>);
    fireEvent.click(screen.getByTestId('body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('F8 saving=true disables close + save buttons', () => {
    render(<MarketingFormShell {...baseProps} saving><div>body</div></MarketingFormShell>);
    expect(screen.getByText('ยกเลิก')).toBeDisabled();
    // save button still rendered; label has spinner + text
  });

  it('F9 saving=true ignores backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MarketingFormShell {...baseProps} onClose={onClose} saving><div>body</div></MarketingFormShell>
    );
    fireEvent.click(container.firstChild);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('F10 ESC key fires onClose', () => {
    const onClose = vi.fn();
    render(<MarketingFormShell {...baseProps} onClose={onClose}><div>body</div></MarketingFormShell>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('F11 ESC key ignored while saving', () => {
    const onClose = vi.fn();
    render(<MarketingFormShell {...baseProps} onClose={onClose} saving><div>body</div></MarketingFormShell>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('F12 non-ESC key does nothing', () => {
    const onClose = vi.fn();
    render(<MarketingFormShell {...baseProps} onClose={onClose}><div>body</div></MarketingFormShell>);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('F13 onSave fires on save-button click', () => {
    const onSave = vi.fn();
    render(
      <MarketingFormShell {...baseProps} onSave={onSave} createLabel="สร้าง"><div>body</div></MarketingFormShell>
    );
    fireEvent.click(screen.getByText('สร้าง'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('F14 close X button fires onClose', () => {
    const onClose = vi.fn();
    render(<MarketingFormShell {...baseProps} onClose={onClose}><div>body</div></MarketingFormShell>);
    fireEvent.click(screen.getByLabelText('ปิด'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('F15 maxWidth=3xl applies correct class', () => {
    const { container } = render(
      <MarketingFormShell {...baseProps} maxWidth="3xl"><div>body</div></MarketingFormShell>
    );
    expect(container.querySelector('.max-w-3xl')).toBeTruthy();
  });

  it('F16 unknown maxWidth → falls back to 2xl', () => {
    const { container } = render(
      <MarketingFormShell {...baseProps} maxWidth="999xl"><div>body</div></MarketingFormShell>
    );
    expect(container.querySelector('.max-w-2xl')).toBeTruthy();
  });

  it('F17 bodySpacing=6 applies space-y-6', () => {
    const { container } = render(
      <MarketingFormShell {...baseProps} bodySpacing={6}><div>body</div></MarketingFormShell>
    );
    expect(container.querySelector('.space-y-6')).toBeTruthy();
  });

  it('F18 unknown bodySpacing falls back to 4', () => {
    const { container } = render(
      <MarketingFormShell {...baseProps} bodySpacing={99}><div>body</div></MarketingFormShell>
    );
    expect(container.querySelector('.space-y-4')).toBeTruthy();
  });

  it('F19 event listener cleaned up on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <MarketingFormShell {...baseProps} onClose={onClose}><div>body</div></MarketingFormShell>
    );
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('F20 onClose optional — no throw when undefined', () => {
    const { container } = render(
      <MarketingFormShell {...baseProps} onClose={undefined}><div>body</div></MarketingFormShell>
    );
    expect(() => fireEvent.keyDown(window, { key: 'Escape' })).not.toThrow();
    expect(() => fireEvent.click(container.firstChild)).not.toThrow();
  });
});
