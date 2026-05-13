// Phase 28 (2026-05-14) — Task 3 RTL bank for TreatmentDateHeader.
// D1.1-D1.10: today vs past styling, relative-pill copy, count, testid stability,
// graceful empty inputs, future-date pill suppression.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreatmentDateHeader } from '../src/components/backend/treatment-history/TreatmentDateHeader.jsx';

describe('Phase 28 · TreatmentDateHeader RTL', () => {
  it('D1.1 renders today header with date + วันนี้ pill + count', () => {
    render(<TreatmentDateHeader date="2026-05-14" todayISO="2026-05-14" count={4} />);
    expect(screen.getByText(/14 พฤษภาคม 2569/)).toBeInTheDocument();
    expect(screen.getByText('วันนี้')).toBeInTheDocument();
    expect(screen.getByText('4 รายการ')).toBeInTheDocument();
  });

  it('D1.2 today header has fire-red border-left', () => {
    const { container } = render(<TreatmentDateHeader date="2026-05-14" todayISO="2026-05-14" count={4} />);
    expect(container.firstChild.className).toMatch(/border-l/);
    expect(container.firstChild.className).toMatch(/red/);
  });

  it('D1.3 yesterday → "เมื่อวาน" pill', () => {
    render(<TreatmentDateHeader date="2026-05-13" todayISO="2026-05-14" count={2} />);
    expect(screen.getByText('เมื่อวาน')).toBeInTheDocument();
  });

  it('D1.4 6 days ago → "6 วันที่แล้ว" pill', () => {
    render(<TreatmentDateHeader date="2026-05-08" todayISO="2026-05-14" count={1} />);
    expect(screen.getByText('6 วันที่แล้ว')).toBeInTheDocument();
  });

  it('D1.5 7 days ago → "1 สัปดาห์ที่แล้ว" pill', () => {
    render(<TreatmentDateHeader date="2026-05-07" todayISO="2026-05-14" count={1} />);
    expect(screen.getByText('1 สัปดาห์ที่แล้ว')).toBeInTheDocument();
  });

  it('D1.6 past header has gray (not red) border-left', () => {
    const { container } = render(<TreatmentDateHeader date="2026-05-07" todayISO="2026-05-14" count={1} />);
    expect(container.firstChild.className).toMatch(/border-l/);
    expect(container.firstChild.className).not.toMatch(/border-l-red/);
  });

  it('D1.7 count "1 รายการ" works (Thai is invariant)', () => {
    render(<TreatmentDateHeader date="2026-05-14" todayISO="2026-05-14" count={1} />);
    expect(screen.getByText('1 รายการ')).toBeInTheDocument();
  });

  it('D1.8 has data-testid="date-header-{date}"', () => {
    render(<TreatmentDateHeader date="2026-05-14" todayISO="2026-05-14" count={4} />);
    expect(screen.getByTestId('date-header-2026-05-14')).toBeInTheDocument();
  });

  it('D1.9 graceful with empty inputs (no throw)', () => {
    expect(() => render(<TreatmentDateHeader date="" todayISO="" count={0} />)).not.toThrow();
  });

  it('D1.10 future date renders date but no relative pill (helper returns empty)', () => {
    const { container } = render(<TreatmentDateHeader date="2026-05-15" todayISO="2026-05-14" count={1} />);
    expect(container.textContent).toMatch(/15 พฤษภาคม 2569/);
  });
});
