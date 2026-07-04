// Recall reason Timeline (2026-07-04, spec ①) — the ORIGINAL reason must stay
// visible EVERYWHERE a recall shows, even after an outcome is recorded.
// Supersedes the 2026-05-20 Q1=A single box (outcomeNote REPLACED reason).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';

const TODAY = '2026-07-04';
const base = {
  id: 'TL1',
  customerId: 'LC-26000123',
  customerName: 'คุณสมหญิง ใจดี',
  recallDate: '2026-07-04',
  reason: 'ติดตามอาการหลังฉีดฟิลเลอร์',
  status: 'pending',
  outcome: null,
  outcomeNote: null,
};

const SRC = (p) => fs.readFileSync(path.resolve(p), 'utf8');

describe('① Recall Timeline — RTL (RecallRow shared by 3 surfaces)', () => {
  it('R1 outcome recorded → BOTH reason node AND outcome node visible (the user-reported bug)', () => {
    render(<RecallRow recall={{
      ...base, status: 'done', outcome: 'will-come',
      outcomeNote: 'โทรแล้ว ลูกค้าสะดวกมาวันเสาร์บ่าย', outcomeBy: { name: 'พลอย' },
    }} todayISO={TODAY} />);
    const reasonNode = screen.getByTestId('recall-note-TL1');
    expect(reasonNode).toHaveTextContent('ติดตามอาการหลังฉีดฟิลเลอร์');
    expect(reasonNode).toHaveAttribute('data-note-source', 'reason');
    expect(screen.getByTestId('recall-outcome-note-TL1')).toHaveTextContent('โทรแล้ว ลูกค้าสะดวกมาวันเสาร์บ่าย');
    expect(screen.getByTestId('recall-timeline-TL1')).toBeInTheDocument();
  });

  it('R2 no outcome yet → single reason node, no outcome node', () => {
    render(<RecallRow recall={base} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-note-TL1')).toHaveTextContent('ติดตามอาการหลังฉีดฟิลเลอร์');
    expect(screen.queryByTestId('recall-outcome-note-TL1')).not.toBeInTheDocument();
  });

  it('R3 outcome WITHOUT free-text note → outcome node shows the label line', () => {
    render(<RecallRow recall={{ ...base, status: 'done', outcome: 'not-interested', outcomeNote: '' }} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-note-TL1')).toHaveTextContent('ติดตามอาการหลังฉีดฟิลเลอร์');
    expect(screen.getByTestId('recall-outcome-note-TL1')).toHaveTextContent('ผลการติดต่อ');
  });

  it('R4 compact mode (CDV RecallCard variant) renders the same timeline', () => {
    render(<RecallRow recall={{
      ...base, status: 'done', outcome: 'will-come', outcomeNote: 'มาแน่',
    }} todayISO={TODAY} compact />);
    expect(screen.getByTestId('recall-note-TL1')).toHaveTextContent('ติดตามอาการหลังฉีดฟิลเลอร์');
    expect(screen.getByTestId('recall-outcome-note-TL1')).toHaveTextContent('มาแน่');
  });

  it('R5 adversarial — empty reason + outcome recorded still renders (— placeholder)', () => {
    render(<RecallRow recall={{ ...base, reason: '', status: 'done', outcome: 'no-answer', outcomeNote: 'x' }} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-note-TL1')).toHaveTextContent('—');
    expect(screen.getByTestId('recall-outcome-note-TL1')).toHaveTextContent('x');
  });
});

describe('① source-grep regression — the either/or box must NOT come back', () => {
  const row = SRC('src/components/backend/recall/RecallRow.jsx');
  it('SG1 pre-2026-07-04 conditional is GONE', () => {
    expect(row).not.toMatch(/noteText = hasOutcomeNote \?/);
    expect(row).not.toMatch(/noteLabel = hasOutcomeNote \?/);
  });
  it('SG2 timeline structure present (reason node always + outcome node gated)', () => {
    expect(row).toMatch(/recall-timeline-\$\{recall\.id\}/);
    expect(row).toMatch(/data-note-source="reason"/);
    expect(row).toMatch(/recall-outcome-note-\$\{recall\.id\}/);
    expect(row).toMatch(/hasOutcomeRecorded/);
  });
  it('SG3 all 3 modals carry the reason strip (นัดเพราะ)', () => {
    for (const f of [
      'src/components/backend/recall/RecallOutcomeModal.jsx',
      'src/components/backend/recall/RecallSnoozeMenu.jsx',
      'src/components/backend/recall/RecallLineTemplateModal.jsx',
    ]) {
      const s = SRC(f);
      expect(s, f).toMatch(/recall-reason-strip/);
      expect(s, f).toMatch(/นัดเพราะ:/);
    }
  });
  it('SG4 the LINE message renderer (customer-facing) is untouched by the strip work', () => {
    const s = SRC('src/lib/lineTemplateRenderer.js');
    expect(s).not.toMatch(/recall-reason-strip|นัดเพราะ:/);
  });
});
