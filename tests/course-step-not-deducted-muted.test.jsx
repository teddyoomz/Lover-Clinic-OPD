import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { resolveCourseStepState } from '../src/lib/treatmentDisplayResolvers.js';
import { TreatmentLifecycleStepper } from '../src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx';

describe('resolveCourseStepState (②)', () => {
  test('deducted → done', () => expect(resolveCourseStepState({ courseDeducted: true, completedDone: true })).toBe('done'));
  test('finished, not deducted → not-deducted (was warn)', () =>
    expect(resolveCourseStepState({ courseDeducted: false, completedDone: true })).toBe('not-deducted'));
  test('not finished → pending', () => expect(resolveCourseStepState({ courseDeducted: false, completedDone: false })).toBe('pending'));
});

describe('TreatmentLifecycleStepper course step (②)', () => {
  const lc = [{ key: 'vitalsigns', time: null }, { key: 'doctor', time: null }, { key: 'completed', time: null }];
  test('not-deducted → muted "ไม่ตัดคอร์ส", no amber warn', () => {
    const { container, getByText } = render(
      <TreatmentLifecycleStepper lifecycle={lc} withCourseStep courseDeducted={false} />);
    expect(getByText('ไม่ตัดคอร์ส')).toBeTruthy();
    expect(container.querySelector('.border-amber-500')).toBeNull();   // amber warn gone
    expect(container.textContent).not.toContain('ยังไม่ตัด');
  });
  test('deducted → violet "คอร์ส"', () => {
    const { getByText, container } = render(
      <TreatmentLifecycleStepper lifecycle={lc} withCourseStep courseDeducted={true} />);
    expect(getByText('คอร์ส')).toBeTruthy();
    expect(container.querySelector('[class*="violet"]')).toBeTruthy();
  });
});
