import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const m = vi.hoisted(() => ({
  createAssessmentRound: vi.fn(() => Promise.resolve('R1')),
  createAssessmentSession: vi.fn(() => Promise.resolve('FW-ED-abc123')),
  // ED follow-up v2 (2026-06-15, R3) — handleCreate now calls this FIRST.
  supersedePendingFollowups: vi.fn(() => Promise.resolve({ superseded: 0 })),
  generateQrDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,QRDATA')),
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createAssessmentRound: m.createAssessmentRound,
  createAssessmentSession: m.createAssessmentSession,
  supersedePendingFollowups: m.supersedePendingFollowups,
}));
vi.mock('../src/lib/documentPrintEngine.js', () => ({ generateQrDataUrl: m.generateQrDataUrl }));

import EDFollowupModal from '../src/components/backend/EDFollowupModal.jsx';

beforeEach(() => { Object.values(m).forEach((fn) => fn.mockClear()); });

const baseProps = { customerId: 'LC-1', roundNumber: 3, intakeTypes: ['adam', 'iief'], branchId: 'BR-1', isDark: true };

describe('EDFollowupModal', () => {
  it('shows the derived round number + type picker default-checked to intakeTypes', () => {
    render(<EDFollowupModal {...baseProps} onClose={() => {}} />);
    expect(screen.getByText(/ครั้งที่ 3/)).toBeInTheDocument();
    expect(screen.getByTestId('ed-type-adam')).toBeChecked();
    expect(screen.getByTestId('ed-type-iief')).toBeChecked();
    expect(screen.getByTestId('ed-type-mrs')).not.toBeChecked();
    expect(screen.getByTestId('ed-type-pe')).not.toBeChecked();
  });

  it('create link → mints round + session (only picked types) + QR; shows link', async () => {
    render(<EDFollowupModal {...baseProps} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    await waitFor(() => expect(screen.getByText(/FW-ED-abc123/)).toBeInTheDocument());
    expect(m.createAssessmentRound).toHaveBeenCalledTimes(1);
    expect(m.createAssessmentRound.mock.calls[0][0].types).toEqual(['adam', 'iief']);
    expect(m.createAssessmentRound.mock.calls[0][0].customerId).toBe('LC-1');
    expect(m.createAssessmentSession).toHaveBeenCalledTimes(1);
    expect(m.createAssessmentSession.mock.calls[0][0].roundId).toBe('R1'); // round linked into session
    expect(m.createAssessmentSession.mock.calls[0][0].branchId).toBe('BR-1');
    expect(m.generateQrDataUrl).toHaveBeenCalledWith(expect.stringContaining('?session=FW-ED-abc123'), { width: 600 });
    expect(screen.getByAltText('QR แบบประเมิน')).toBeInTheDocument();
  });

  it('respects type picker — unticking iief sends only adam', async () => {
    render(<EDFollowupModal {...baseProps} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-type-iief')); // untick
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    await waitFor(() => expect(m.createAssessmentRound).toHaveBeenCalled());
    expect(m.createAssessmentRound.mock.calls[0][0].types).toEqual(['adam']);
  });

  it('zero types → error, no mint', () => {
    render(<EDFollowupModal {...baseProps} intakeTypes={[]} onClose={() => {}} />);
    // defaults to adam+iief when intakeTypes empty → untick both
    fireEvent.click(screen.getByTestId('ed-type-adam'));
    fireEvent.click(screen.getByTestId('ed-type-iief'));
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    expect(screen.getByText(/เลือกอย่างน้อย 1/)).toBeInTheDocument();
    expect(m.createAssessmentRound).not.toHaveBeenCalled();
  });

  it('full-screen QR overlay opens', async () => {
    render(<EDFollowupModal {...baseProps} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-create-link-btn'));
    await waitFor(() => expect(screen.getByTestId('ed-qr-fullscreen-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('ed-qr-fullscreen-btn'));
    expect(screen.getByTestId('ed-qr-fullscreen')).toBeInTheDocument();
    expect(screen.getByText(/ให้ลูกค้าสแกน/)).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<EDFollowupModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('ed-modal-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
