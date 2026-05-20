// tests/recall-list-enhancements.test.jsx
//
// 2026-05-20 — Recall list enhancements coverage:
//   - validateRecallOutcome (Q2=B required staff)
//   - RecallRow tap-to-call phone link (present/absent + tel: digits)
//   - RecallRow prominent note (Q1=A: outcomeNote || reason) + data-note-source
//   - RecallRow logged-by byline (outcomeBy.name)
//   - customer name is NOT red (Thai-culture rule)
//
// recordRecallOutcome's recordedBy contract + throw are covered in
// phase-29-recall-backend-client.test.js (B1.8 / B1.8b); the Save-gate +
// staff-pick flow in phase-29-recall-outcome-modal-rtl.test.jsx (O2.3 / O7).
// Frontend bucket order + prominence in phase-29-recall-frontend-tab-rtl.test.jsx
// (F1.1 / F1.1b) + phase-29-recall-list-rtl.test.jsx (L1.5).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';
import { validateRecallOutcome } from '../src/lib/recallValidation.js';

const TODAY = '2026-05-20';
const base = {
  id: 'RX',
  branchId: 'BR-1',
  customerId: 'LC-1',
  customerName: 'นางสาว สมหญิง',
  customerHN: 'HN-1',
  recallDate: TODAY,
  reason: 'ติดตามผลเลเซอร์ 7 วัน',
  status: 'pending',
  noAnswerCount: 0,
  customerPhone: '081-234-5678',
};

describe('validateRecallOutcome (Q2=B)', () => {
  it('VR1 ok with outcome + recordedBy.name', () => {
    expect(validateRecallOutcome({ outcome: 'will-come', recordedBy: { name: 'พิมพ์ชนก' } }))
      .toEqual({ ok: true, errors: [] });
  });
  it('VR2 fails when staff name blank/whitespace', () => {
    const r = validateRecallOutcome({ outcome: 'will-come', recordedBy: { name: '  ' } });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('recorded-by-required');
  });
  it('VR3 fails when outcome missing', () => {
    expect(validateRecallOutcome({ recordedBy: { name: 'x' } }).errors).toContain('outcome-required');
  });
  it('VR4 fails with neither', () => {
    expect(validateRecallOutcome({}).errors)
      .toEqual(expect.arrayContaining(['outcome-required', 'recorded-by-required']));
  });
});

describe('RecallRow — tap-to-call phone (2026-05-20)', () => {
  it('PH1 renders tel: link with stripped digits + raw display text', () => {
    render(<RecallRow recall={base} todayISO={TODAY} />);
    const link = screen.getByTestId('recall-phone-RX'); // mobile header link
    expect(link).toHaveAttribute('href', 'tel:0812345678');
    expect(link).toHaveTextContent('081-234-5678');
  });
  it('PH2 no phone link when customerPhone empty', () => {
    render(<RecallRow recall={{ ...base, customerPhone: '' }} todayISO={TODAY} />);
    expect(screen.queryByTestId('recall-phone-RX')).not.toBeInTheDocument();
  });
  it('PH3 preserves leading + for intl numbers', () => {
    render(<RecallRow recall={{ ...base, customerPhone: '+66 81 234 5678' }} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-phone-RX')).toHaveAttribute('href', 'tel:+66812345678');
  });
});

describe('RecallRow — prominent note (Q1=A: outcomeNote || reason)', () => {
  it('NT1 pending → note shows reason, source=reason, no byline', () => {
    render(<RecallRow recall={base} todayISO={TODAY} />);
    const note = screen.getByTestId('recall-note-RX');
    expect(note).toHaveTextContent('ติดตามผลเลเซอร์ 7 วัน');
    expect(note).toHaveAttribute('data-note-source', 'reason');
    expect(screen.queryByTestId('recall-logged-by-RX')).not.toBeInTheDocument();
  });
  it('NT2 done w/ outcomeNote → note shows outcomeNote (source=outcome) + byline', () => {
    const r = {
      ...base,
      status: 'done',
      outcome: 'will-come',
      outcomeNote: 'ลูกค้ายืนยันจะมาวันจันทร์',
      outcomeBy: { name: 'พิมพ์ชนก' },
    };
    render(<RecallRow recall={r} todayISO={TODAY} />);
    const note = screen.getByTestId('recall-note-RX');
    expect(note).toHaveTextContent('ลูกค้ายืนยันจะมาวันจันทร์');
    expect(note).toHaveAttribute('data-note-source', 'outcome');
    expect(screen.getByTestId('recall-logged-by-RX')).toHaveTextContent('พิมพ์ชนก');
  });
  it('NT3 done w/o outcomeNote → falls back to reason (source=reason)', () => {
    const r = { ...base, status: 'done', outcome: 'will-come', outcomeNote: '', outcomeBy: { name: 'พี่ X' } };
    render(<RecallRow recall={r} todayISO={TODAY} />);
    const note = screen.getByTestId('recall-note-RX');
    expect(note).toHaveTextContent('ติดตามผลเลเซอร์ 7 วัน');
    expect(note).toHaveAttribute('data-note-source', 'reason');
  });
});

describe('RecallRow — Thai-culture: name/phone color', () => {
  it('CC1 customer name is NOT red, phone uses red call-accent', () => {
    render(<RecallRow recall={base} todayISO={TODAY} />);
    const nameLink = screen.getByTestId('recall-customer-link-RX'); // desktop name
    expect(nameLink.className).not.toMatch(/text-red/);
    expect(nameLink.className).toMatch(/sky/);
    // phone link is a call action → red accent is fine (not a name)
    expect(screen.getByTestId('recall-phone-RX').className).toMatch(/red/);
  });
});
