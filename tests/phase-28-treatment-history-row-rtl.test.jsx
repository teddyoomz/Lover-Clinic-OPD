// tests/phase-28-treatment-history-row-rtl.test.jsx
//
// Phase 28 Task 4 (2026-05-14) — TreatmentHistoryRow RTL bank.
//
// Component under test: src/components/backend/treatment-history/TreatmentHistoryRow.jsx
// Spec: docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
//   § 4.4 (Row collapsed) + chip block + § 4.7 expanded styling adjustments

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryRow } from '../src/components/backend/treatment-history/TreatmentHistoryRow.jsx';

const sampleTreatment = {
  id: 'BT-1',
  date: '2026-05-14',
  vitalsignsRecordedAt: '2026-05-14T04:13:00Z',
  doctor: 'หมอกวางตุ้ง',
  branch: 'นครราชสีมา',
  cc: 'ฟหกฟ',
  dx: 'ฟหกฟห',
};

describe('Phase 28 · TreatmentHistoryRow RTL', () => {
  it('R-Row.1 collapsed renders time, status, stepper, meta, cc/dx preview', () => {
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    // Bangkok TZ: 04:13 UTC → 11:13 Bangkok.
    // Scope to time column testid because stepper also renders 11:13 under the
    // vitals dot (one match in time column + one in stepper).
    expect(screen.getByTestId('treatment-time')).toHaveTextContent('11:13');
    expect(screen.getByText(/ซักประวัติเท่านั้น/)).toBeInTheDocument();
    expect(screen.getByText('หมอกวางตุ้ง')).toBeInTheDocument();
    expect(screen.getByText(/นครราชสีมา/)).toBeInTheDocument();
    // CC/DX preview present in collapsed
    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(screen.getByText('DX')).toBeInTheDocument();
  });

  it('R-Row.2 shows "ล่าสุด" tag only when isLatest=true', () => {
    const { rerender } = render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={true}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    expect(screen.getByText('ล่าสุด')).toBeInTheDocument();
    rerender(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    expect(screen.queryByText('ล่าสุด')).not.toBeInTheDocument();
  });

  it('R-Row.3 click on row body triggers onToggle with t.id', async () => {
    const onToggle = vi.fn();
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={onToggle}
        isDark={true}
        isBackendCreated={true}
      />
    );
    await userEvent.click(screen.getByTestId(`treatment-toggle-${sampleTreatment.id}`));
    expect(onToggle).toHaveBeenCalledWith(sampleTreatment.id);
  });

  it('R-Row.4 edit chip click does NOT trigger onToggle (stopPropagation)', async () => {
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={onToggle}
        onEditTreatment={onEdit}
        isDark={true}
        isBackendCreated={true}
      />
    );
    await userEvent.click(screen.getByTestId(`treatment-edit-${sampleTreatment.id}`));
    expect(onEdit).toHaveBeenCalledWith(sampleTreatment.id);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('R-Row.5 delete chip click does NOT trigger onToggle', async () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={onToggle}
        onDeleteTreatment={onDelete}
        isDark={true}
        isBackendCreated={true}
      />
    );
    await userEvent.click(screen.getByTestId(`treatment-delete-${sampleTreatment.id}`));
    expect(onDelete).toHaveBeenCalledWith(sampleTreatment.id);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('R-Row.6 hides edit/delete chips when isBackendCreated=false', () => {
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        onEditTreatment={() => {}}
        onDeleteTreatment={() => {}}
        isDark={true}
        isBackendCreated={false}
      />
    );
    expect(screen.queryByTestId(`treatment-edit-${sampleTreatment.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`treatment-delete-${sampleTreatment.id}`)).not.toBeInTheDocument();
  });

  it('R-Row.7 chevron rotates when isExpanded=true', () => {
    const { container, rerender } = render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    const chevron = container.querySelector('[data-testid="treatment-chevron"]');
    expect(chevron.className).not.toMatch(/rotate-180/);
    rerender(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={true}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    expect(chevron.className).toMatch(/rotate-180/);
  });

  it('R-Row.8 expanded row has fire-red left accent', () => {
    const { container } = render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={true}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    const row = container.firstChild;
    expect(row.className).toMatch(/border-l/);
    expect(row.className).toMatch(/red/);
  });

  it('R-Row.9 expanded row HIDES collapsed CC/DX preview (callout shows them instead)', () => {
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={true}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    // Preview area gone; CC/DX text only shown via expanded body slot (caller renders that)
    expect(screen.queryByText('CC')).not.toBeInTheDocument();
    expect(screen.queryByText('DX')).not.toBeInTheDocument();
  });

  it('R-Row.10 latest row time has fire-red glow class', () => {
    const { container } = render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={true}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    // Time shown in fire-red color when latest
    expect(container.textContent).toMatch(/11:13/);
    // The time element should have a class indicating latest styling (red text)
    const timeElement = container.querySelector('[data-testid="treatment-time"]');
    expect(timeElement.className).toMatch(/red/);
  });

  it('R-Row.11 expanded body slot renders children when isExpanded=true', () => {
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={true}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      >
        <div data-testid="expanded-body-slot">EXPANDED CONTENT</div>
      </TreatmentHistoryRow>
    );
    expect(screen.getByTestId('expanded-body-slot')).toBeInTheDocument();
    expect(screen.getByText('EXPANDED CONTENT')).toBeInTheDocument();
  });

  it('R-Row.12 collapsed row does NOT render children slot', () => {
    render(
      <TreatmentHistoryRow
        t={sampleTreatment}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      >
        <div data-testid="expanded-body-slot">SHOULD NOT SHOW</div>
      </TreatmentHistoryRow>
    );
    expect(screen.queryByTestId('expanded-body-slot')).not.toBeInTheDocument();
  });

  it('R-Row.13 row-action shows "✓ บันทึก HH:MM" for completed treatment', () => {
    const completedT = {
      ...sampleTreatment,
      vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
      doctorRecordedAt: '2026-05-14T04:23:00Z',
      completedAt: '2026-05-14T04:23:00Z',
    };
    render(
      <TreatmentHistoryRow
        t={completedT}
        isLatest={false}
        isExpanded={false}
        onToggle={() => {}}
        isDark={true}
        isBackendCreated={true}
      />
    );
    // 04:23 UTC → 11:23 Bangkok
    expect(screen.getByText(/บันทึก 11:23/)).toBeInTheDocument();
  });
});
