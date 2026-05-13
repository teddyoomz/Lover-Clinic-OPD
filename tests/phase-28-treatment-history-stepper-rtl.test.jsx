import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreatmentLifecycleStepper } from '../src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx';

describe('Phase 28 · TreatmentLifecycleStepper RTL', () => {
  it('S1.1 renders 3 dots + 2 connectors when all stages done', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T04:02:00Z' },
      { key: 'doctor', time: '2026-05-14T04:23:00Z' },
      { key: 'completed', time: '2026-05-14T04:23:00Z' },
    ];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(container.querySelectorAll('[data-testid="stepper-dot"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="stepper-connector"]')).toHaveLength(2);
  });

  it('S1.2 marks pending-now step (vitals done, doctor pending) with pulse animation when isLatest', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} isLatest={true} />);
    const dots = container.querySelectorAll('[data-testid="stepper-dot"]');
    // Dot index 1 (doctor position) is pending-now → has animate-pulse class
    expect(dots[1].className).toMatch(/animate-pulse/);
  });

  it('S1.3 displays "ข้ามแพทย์" label for skipped doctor stage', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T03:49:00Z' },
      { key: 'completed', time: '2026-05-14T03:49:00Z' },
    ];
    render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(screen.getByText('ข้ามแพทย์')).toBeInTheDocument();
  });

  it('S1.4 shows formatted HH:MM time under done dots (Bangkok TZ)', () => {
    // 04:13 UTC = 11:13 Bangkok
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(screen.getByText('11:13')).toBeInTheDocument();
  });

  it('S1.5 shows "—" for empty step times', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(container.textContent).toMatch(/—/);
  });

  it('S1.6 displays "−" for skipped step (step.txt content)', () => {
    const lc = [{ key: 'completed', time: '2026-05-14T01:03:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    // Both vitals + doctor positions are skipped → both show "−" symbol
    const dots = container.querySelectorAll('[data-testid="stepper-dot"]');
    expect(dots[0].textContent).toBe('−');
    expect(dots[1].textContent).toBe('−');
  });

  it('S1.7 done step shows ✓ via Lucide Check icon (svg)', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    const doneDot = container.querySelectorAll('[data-testid="stepper-dot"]')[0];
    // Lucide Check renders an svg
    expect(doneDot.querySelector('svg')).toBeInTheDocument();
  });

  it('S1.8 pending-future steps (no isLatest) show step number 2 or 3', () => {
    const lc = []; // empty — all stages future
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} isLatest={false} />);
    const dots = container.querySelectorAll('[data-testid="stepper-dot"]');
    expect(dots[0].textContent).toBe('1');
    expect(dots[1].textContent).toBe('2');
    expect(dots[2].textContent).toBe('3');
  });

  it('S1.9 done connector shows gradient class (filled)', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T04:02:00Z' },
      { key: 'doctor', time: '2026-05-14T04:23:00Z' },
    ];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    const connectors = container.querySelectorAll('[data-testid="stepper-connector"]');
    // First connector (vitals→doctor) both done → filled
    expect(connectors[0].className).toMatch(/teal|gradient/);
  });

  it('S1.10 graceful with null/undefined lifecycle', () => {
    expect(() => render(<TreatmentLifecycleStepper lifecycle={null} isDark={true} />)).not.toThrow();
    expect(() => render(<TreatmentLifecycleStepper lifecycle={undefined} isDark={true} />)).not.toThrow();
  });
});
