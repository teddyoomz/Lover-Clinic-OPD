/**
 * Phase 29.23 — RecallRow edit button + customer-name <a> link RTL tests.
 *
 * Per spec §4.2:
 *   - Edit button placement: between snooze + delete; sky-500 accent;
 *     data-testid=recall-edit-{id}; always shown when onEdit prop provided.
 *   - Customer-name: <a target="_blank"> with /?backend=1&customer={id}
 *     when customerId present; plain <span> fallback when missing.
 *   - Both stopPropagation so parent row click doesn't fire.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';

const RECALL_FIXTURE = {
  id: 'REC-TEST-1',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ ทดลอง',
  customerHN: 'HN-8001',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  status: 'pending',
};

describe('Phase 29.23 R1 — RecallRow edit button + customer link', () => {
  it('R1.1 — renders edit button when onEdit prop provided', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.2 — does NOT render edit button when onEdit prop missing', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    expect(screen.queryByTestId('recall-edit-REC-TEST-1')).toBeNull();
  });

  it('R1.3 — edit button click → onEdit called with recall.id', () => {
    const onEdit = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-TEST-1'));
    expect(onEdit).toHaveBeenCalledWith('REC-TEST-1');
  });

  it('R1.4 — edit button click stopPropagation: parent onClick NOT fired', () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onClick={onClick}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-TEST-1'));
    expect(onEdit).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('R1.5 — customer-name renders as <a target="_blank"> when customerId present', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('R1.6 — customer-name href contains backend deep-link with encoded id', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-26000001');
  });

  it('R1.7 — customer-name renders as plain <span> when customerId missing', () => {
    const recall = { ...RECALL_FIXTURE, customerId: '' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
      />
    );
    expect(screen.queryByTestId('recall-customer-link-REC-TEST-1')).toBeNull();
    expect(screen.getByTestId('recall-customer-name-plain-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.8 — customer-name <a> click stopPropagation: parent onClick NOT fired', () => {
    const onClick = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByTestId('recall-customer-link-REC-TEST-1'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('R1.9 — customer-name encodes special chars in customerId', () => {
    const recall = { ...RECALL_FIXTURE, customerId: 'LC/26000001+x' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC%2F26000001%2Bx');
  });

  it('R1.10 — edit button title contains แก้ไข Recall', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    const btn = screen.getByTestId('recall-edit-REC-TEST-1');
    expect(btn.getAttribute('title')).toContain('แก้ไข');
    expect(btn.getAttribute('aria-label')).toBe('แก้ไข Recall');
  });

  it('R1.11 — edit button rendered ALSO when status=done (admin can fix typos)', () => {
    const recall = { ...RECALL_FIXTURE, status: 'done' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.12 — edit button rendered ALSO when status=closed-no-answer', () => {
    const recall = { ...RECALL_FIXTURE, status: 'closed-no-answer' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });
});
