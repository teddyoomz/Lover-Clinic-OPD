import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryHeader } from '../src/components/backend/treatment-history/TreatmentHistoryHeader.jsx';

describe('Phase 28 · TreatmentHistoryHeader RTL', () => {
  const baseProps = {
    count: 13,
    ac: '#fff',
    acRgb: '255,255,255',
    onPrintDoc: () => {},
    onShowTimeline: () => {},
    onCreateTreatment: () => {},
  };

  it('H1.1 renders title + count badge', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    expect(screen.getByText('ประวัติการรักษา')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
  });

  it('H1.2 renders 3 CTA buttons when all callbacks present', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    expect(screen.getByTestId('print-document-btn')).toBeInTheDocument();
    expect(screen.getByTestId('show-timeline-btn')).toBeInTheDocument();
    expect(screen.getByTestId('create-treatment-btn')).toBeInTheDocument();
  });

  it('H1.3 omits create button when onCreateTreatment is null', () => {
    render(<TreatmentHistoryHeader {...baseProps} onCreateTreatment={null} />);
    expect(screen.queryByTestId('create-treatment-btn')).not.toBeInTheDocument();
    // Print + timeline still present
    expect(screen.getByTestId('print-document-btn')).toBeInTheDocument();
    expect(screen.getByTestId('show-timeline-btn')).toBeInTheDocument();
  });

  it('H1.4 omits create button when onCreateTreatment is undefined', () => {
    const { onCreateTreatment, ...propsWithoutCreate } = baseProps;
    render(<TreatmentHistoryHeader {...propsWithoutCreate} />);
    expect(screen.queryByTestId('create-treatment-btn')).not.toBeInTheDocument();
  });

  it('H1.5 print button click triggers onPrintDoc callback', async () => {
    const onPrintDoc = vi.fn();
    render(<TreatmentHistoryHeader {...baseProps} onPrintDoc={onPrintDoc} />);
    await userEvent.click(screen.getByTestId('print-document-btn'));
    expect(onPrintDoc).toHaveBeenCalled();
  });

  it('H1.6 timeline button click triggers onShowTimeline callback', async () => {
    const onShowTimeline = vi.fn();
    render(<TreatmentHistoryHeader {...baseProps} onShowTimeline={onShowTimeline} />);
    await userEvent.click(screen.getByTestId('show-timeline-btn'));
    expect(onShowTimeline).toHaveBeenCalled();
  });

  it('H1.7 create button click triggers onCreateTreatment callback', async () => {
    const onCreate = vi.fn();
    render(<TreatmentHistoryHeader {...baseProps} onCreateTreatment={onCreate} />);
    await userEvent.click(screen.getByTestId('create-treatment-btn'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('H1.8 create button has fire-red gradient class (visual primary)', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    const createBtn = screen.getByTestId('create-treatment-btn');
    expect(createBtn.className).toMatch(/red/);
  });

  it('H1.9 print + timeline buttons are ghost-style (no fire-red bg)', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    const printBtn = screen.getByTestId('print-document-btn');
    const timelineBtn = screen.getByTestId('show-timeline-btn');
    // Ghost buttons should NOT have a red gradient bg by default
    expect(printBtn.className).not.toMatch(/from-red-500.*to-red-700/);
    expect(timelineBtn.className).not.toMatch(/from-red-500.*to-red-700/);
  });

  it('H1.10 button text labels in Thai', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    expect(screen.getByText(/พิมพ์เอกสาร/)).toBeInTheDocument();
    expect(screen.getByText(/ดูไทม์ไลน์/)).toBeInTheDocument();
    expect(screen.getByText(/บันทึกการรักษา/)).toBeInTheDocument();
  });

  it('H1.11 buttons have title attribute (tooltip) for accessibility', () => {
    render(<TreatmentHistoryHeader {...baseProps} />);
    expect(screen.getByTestId('print-document-btn').title).toBeTruthy();
    expect(screen.getByTestId('show-timeline-btn').title).toBeTruthy();
    expect(screen.getByTestId('create-treatment-btn').title).toBeTruthy();
  });

  it('H1.12 count badge has font-mono class', () => {
    const { container } = render(<TreatmentHistoryHeader {...baseProps} count={13} />);
    const badge = Array.from(container.querySelectorAll('span')).find(s => s.textContent === '13');
    expect(badge).toBeTruthy();
    expect(badge.className).toMatch(/font-mono|tabular-nums/);
  });
});
