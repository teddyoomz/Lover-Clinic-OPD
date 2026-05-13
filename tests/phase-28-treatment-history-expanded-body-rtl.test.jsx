// Phase 28 Task 5 (2026-05-14) — TreatmentHistoryExpandedBody RTL test bank.
// Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md § 4.7
//
// Verifies:
//  - CC/DX callout renders when either field present
//  - Print buttons (cert + record) wired to callbacks
//  - Loading + fallback states
//  - NO edit/delete chips inside body (those stay on collapsed row per spec § 4.7)

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryExpandedBody } from '../src/components/backend/treatment-history/TreatmentHistoryExpandedBody.jsx';

const t = { id: 'BT-1', cc: 'ฟหกฟ', dx: 'ฟหกฟห' };
const baseProps = {
  t,
  detail: null,
  ac: '#fff',
  acRgb: '255,255,255',
  isDark: true,
  treatmentsLoading: false,
  onPrintCert: () => {},
  onPrintRecord: () => {},
};

describe('Phase 28 · TreatmentHistoryExpandedBody RTL', () => {
  it('E1.1 renders CC + DX callout when both present', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} />);
    expect(screen.getByText('ฟหกฟ')).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟห')).toBeInTheDocument();
    expect(screen.getByText(/CC.*อาการ/)).toBeInTheDocument();
    expect(screen.getByText(/DX.*วินิจฉัย/)).toBeInTheDocument();
  });

  it('E1.2 renders print buttons (cert + record)', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} />);
    expect(screen.getByTestId(`treatment-print-cert-${t.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`treatment-print-record-${t.id}`)).toBeInTheDocument();
  });

  it('E1.3 print cert button click triggers callback with t.id', async () => {
    const onPrintCert = vi.fn();
    render(<TreatmentHistoryExpandedBody {...baseProps} onPrintCert={onPrintCert} />);
    await userEvent.click(screen.getByTestId(`treatment-print-cert-${t.id}`));
    expect(onPrintCert).toHaveBeenCalledWith(t.id);
  });

  it('E1.4 print record button click triggers callback with t.id', async () => {
    const onPrintRecord = vi.fn();
    render(<TreatmentHistoryExpandedBody {...baseProps} onPrintRecord={onPrintRecord} />);
    await userEvent.click(screen.getByTestId(`treatment-print-record-${t.id}`));
    expect(onPrintRecord).toHaveBeenCalledWith(t.id);
  });

  it('E1.5 shows loading skeleton when treatmentsLoading=true and no detail', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} treatmentsLoading={true} detail={null} />);
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('E1.6 shows fallback message when detail is null and not loading', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} treatmentsLoading={false} detail={null} />);
    expect(screen.getByText(/ไม่มีข้อมูลรายละเอียด/)).toBeInTheDocument();
  });

  it('E1.7 omits CC callout when cc is empty', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} t={{ id: 'BT-2', cc: '', dx: 'only-dx' }} />);
    expect(screen.queryByText(/CC.*อาการ/)).not.toBeInTheDocument();
    expect(screen.getByText(/DX.*วินิจฉัย/)).toBeInTheDocument();
  });

  it('E1.8 omits DX callout when dx is empty', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} t={{ id: 'BT-3', cc: 'only-cc', dx: '' }} />);
    expect(screen.getByText(/CC.*อาการ/)).toBeInTheDocument();
    expect(screen.queryByText(/DX.*วินิจฉัย/)).not.toBeInTheDocument();
  });

  it('E1.9 omits ENTIRE callout block when both cc and dx empty', () => {
    render(
      <TreatmentHistoryExpandedBody {...baseProps} t={{ id: 'BT-4', cc: '', dx: '' }} />
    );
    expect(screen.queryByText(/CC.*อาการ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DX.*วินิจฉัย/)).not.toBeInTheDocument();
  });

  it('E1.10 NO edit/delete chips inside expanded body (per spec § 4.7)', () => {
    render(<TreatmentHistoryExpandedBody {...baseProps} />);
    expect(screen.queryByLabelText(/แก้ไขการรักษา/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ลบการรักษา/)).not.toBeInTheDocument();
  });
});
