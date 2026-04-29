// tests/phase16.2-clinic-report-sidebar.test.jsx — Phase 16.2 Task 10
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClinicReportSidebar from '../src/components/backend/reports/ClinicReportSidebar.jsx';

const baseProps = {
  branches: [{ id: 'BR-A', name: 'ชลบุรี' }, { id: 'BR-B', name: 'ปทุมธานี' }],
  selectedBranchIds: ['BR-A', 'BR-B'],
  onBranchChange: vi.fn(),
  selectedPresetId: 'last6months',
  onPresetChange: vi.fn(),
  customRange: null,
  onCustomRangeChange: vi.fn(),
  selectedCategories: ['revenue', 'customers', 'operations', 'stock', 'branch'],
  onCategoryChange: vi.fn(),
  onExportPdf: vi.fn(),
  onExportCsv: vi.fn(),
  onRefresh: vi.fn(),
  loading: false,
};

describe('S1 ClinicReportSidebar', () => {
  it('S1.1 — renders all 7 preset buttons', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    for (const label of ['วันนี้', 'สัปดาห์นี้', 'เดือนนี้', 'ไตรมาสนี้', 'YTD', '6 เดือน', '12 เดือน']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('S1.2 — selected preset has data-active=true', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    const btn = screen.getByText('6 เดือน').closest('button');
    expect(btn.getAttribute('data-active')).toBe('true');
  });

  it('S1.3 — clicking preset fires onPresetChange with id', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByText('YTD'));
    expect(baseProps.onPresetChange).toHaveBeenCalledWith('ytd');
  });

  it('S1.4 — branch checkboxes mirror selectedBranchIds', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    expect(screen.getByLabelText('ชลบุรี')).toBeChecked();
    expect(screen.getByLabelText('ปทุมธานี')).toBeChecked();
  });

  it('S1.5 — toggling branch fires onBranchChange', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByLabelText('ปทุมธานี'));
    expect(baseProps.onBranchChange).toHaveBeenCalled();
  });

  it('S1.6 — refresh + export buttons present + wired', () => {
    render(<ClinicReportSidebar {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(baseProps.onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /PDF/i }));
    expect(baseProps.onExportPdf).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /CSV/i }));
    expect(baseProps.onExportCsv).toHaveBeenCalled();
  });

  it('S1.7 — loading=true disables buttons', () => {
    render(<ClinicReportSidebar {...baseProps} loading />);
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeDisabled();
  });
});
