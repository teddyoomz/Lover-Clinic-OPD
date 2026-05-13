import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryPagination } from '../src/components/backend/treatment-history/TreatmentHistoryPagination.jsx';

describe('Phase 28 · TreatmentHistoryPagination RTL', () => {
  it('P1.1 renders info text with current range', () => {
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByText(/แสดง/)).toBeInTheDocument();
    expect(screen.getByText('1–5')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
  });

  it('P1.2 last page info text shows correct end (truncated to totalItems)', () => {
    // 13 items, page 3 of 3, pageSize 5 → start=11, end=min(15,13)=13
    render(<TreatmentHistoryPagination currentPage={3} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByText('11–13')).toBeInTheDocument();
  });

  it('P1.3 highlights active page button', () => {
    render(<TreatmentHistoryPagination currentPage={2} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    const active = screen.getByTestId('treatment-page-2');
    expect(active.className).toMatch(/from-red|red/);
  });

  it('P1.4 prev disabled on page 1', () => {
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByTestId('treatment-page-prev')).toBeDisabled();
    expect(screen.getByTestId('treatment-page-next')).not.toBeDisabled();
  });

  it('P1.5 next disabled on last page', () => {
    render(<TreatmentHistoryPagination currentPage={3} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByTestId('treatment-page-next')).toBeDisabled();
    expect(screen.getByTestId('treatment-page-prev')).not.toBeDisabled();
  });

  it('P1.6 page click triggers onPageChange with page number', async () => {
    const onPageChange = vi.fn();
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByTestId('treatment-page-2'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('P1.7 prev click triggers onPageChange(currentPage - 1)', async () => {
    const onPageChange = vi.fn();
    render(<TreatmentHistoryPagination currentPage={2} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByTestId('treatment-page-prev'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('P1.8 next click triggers onPageChange(currentPage + 1)', async () => {
    const onPageChange = vi.fn();
    render(<TreatmentHistoryPagination currentPage={2} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByTestId('treatment-page-next'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('P1.9 returns null when totalPages <= 1', () => {
    const { container } = render(<TreatmentHistoryPagination currentPage={1} totalPages={1}
      totalItems={3} pageSize={5} pageNumbers={[1]} onPageChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('P1.10 renders ellipsis between non-adjacent pageNumbers', () => {
    // pageNumbers = [1, 5, 10] (gaps 1→5 and 5→10) → 2 ellipses
    render(<TreatmentHistoryPagination currentPage={5} totalPages={10} totalItems={50}
      pageSize={5} pageNumbers={[1, 5, 10]} onPageChange={() => {}} />);
    const ellipses = screen.getAllByText('…');
    expect(ellipses.length).toBe(2);
  });

  it('P1.11 has data-testid="treatment-history-pagination" on root', () => {
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByTestId('treatment-history-pagination')).toBeInTheDocument();
  });

  it('P1.12 prev/next have aria-label for accessibility', () => {
    render(<TreatmentHistoryPagination currentPage={2} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByLabelText(/หน้าก่อนหน้า/)).toBeInTheDocument();
    expect(screen.getByLabelText(/หน้าถัดไป/)).toBeInTheDocument();
  });
});
