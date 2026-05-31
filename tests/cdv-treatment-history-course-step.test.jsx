import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { render } from '@testing-library/react';
import { TreatmentHistoryRow } from '../src/components/backend/treatment-history/TreatmentHistoryRow.jsx';

describe('③ CDV mapper computes courseDeducted', () => {
  const src = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');
  test('imports resolveCourseDeducted + maps it on the summary row', () => {
    expect(src).toMatch(/resolveCourseDeducted/);
    expect(src).toMatch(/courseDeducted:\s*resolveCourseDeducted\(t\)/);
  });
});

describe('③ TreatmentHistoryRow renders course step (3B)', () => {
  const base = {
    id: 'BT-1', date: '2026-05-31',
    vitalsignsRecordedAt: '2026-05-31T04:58:00Z',
    doctorRecordedAt: '2026-05-31T06:04:00Z',
    completedAt: '2026-05-31T06:09:00Z',
  };
  test('not-deducted → muted "ไม่ตัดคอร์ส"', () => {
    const { getByText } = render(<TreatmentHistoryRow t={{ ...base, courseDeducted: false }} />);
    expect(getByText('ไม่ตัดคอร์ส')).toBeTruthy();
  });
  test('deducted → "คอร์ส"', () => {
    const { getByText } = render(<TreatmentHistoryRow t={{ ...base, courseDeducted: true }} />);
    expect(getByText('คอร์ส')).toBeTruthy();
  });
  test('source: row passes withCourseStep + t.courseDeducted', () => {
    const rsrc = readFileSync('src/components/backend/treatment-history/TreatmentHistoryRow.jsx', 'utf8');
    expect(rsrc).toMatch(/withCourseStep/);
    expect(rsrc).toMatch(/courseDeducted=\{t\.courseDeducted\}/);
  });
});
