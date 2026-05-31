import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decideApptStatusServiceSync } from '../src/lib/appointmentDisplay.js';

// V139 (2026-05-31) — couple appt.status ↔ serviceCompletedAt so the
// "กำลังรอ / ✓ เสร็จแล้ว" tab (serviceCompletedAt SSOT) stays in sync with the
// status dropdown + mark/unmark buttons. Pure decision unit-tested here.

describe('V139 · decideApptStatusServiceSync (pure coupling decision)', () => {
  it('stamp: status→done when not previously in done tab', () => {
    expect(decideApptStatusServiceSync('done', null)).toBe('stamp');
    expect(decideApptStatusServiceSync('done', undefined)).toBe('stamp');
    expect(decideApptStatusServiceSync('done', '')).toBe('stamp');
  });
  it('clear: status→non-done when previously in done tab', () => {
    expect(decideApptStatusServiceSync('confirmed', '2026-05-31T00:00:00Z')).toBe('clear');
    expect(decideApptStatusServiceSync('pending', { seconds: 1 })).toBe('clear');
    expect(decideApptStatusServiceSync('cancelled', '2026-05-31T00:00:00Z')).toBe('clear');
  });
  it('none: already-consistent OR no status in patch (no clobber)', () => {
    expect(decideApptStatusServiceSync('done', '2026-05-31T00:00:00Z')).toBe('none'); // already done+stamped
    expect(decideApptStatusServiceSync('confirmed', null)).toBe('none');               // already waiting
    expect(decideApptStatusServiceSync(undefined, '2026-05-31T00:00:00Z')).toBe('none'); // no status → no clobber
    expect(decideApptStatusServiceSync('', null)).toBe('none');
  });
  it('case-sensitive: only lowercase "done" couples (matches APPT_STATUSES value)', () => {
    expect(decideApptStatusServiceSync('DONE', null)).toBe('none');
    expect(decideApptStatusServiceSync('Done', '2026-05-31T00:00:00Z')).toBe('clear'); // non-"done" string while stamped → clear
  });
  it('non-string status → none', () => {
    for (const s of [123, {}, [], true, null]) expect(decideApptStatusServiceSync(s, null)).toBe('none');
  });
});

describe('V139 · backendClient coupling source-grep (3 chokepoints)', () => {
  const src = readFileSync('src/lib/backendClient.js', 'utf8');
  it('markAppointmentServiceCompleted sets status:done', () => {
    const a = src.indexOf('export async function markAppointmentServiceCompleted');
    const b = src.indexOf('export async function unmarkAppointmentServiceCompleted');
    expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a);
    expect(src.slice(a, b)).toMatch(/status:\s*'done'/);
  });
  it('unmarkAppointmentServiceCompleted sets status:confirmed', () => {
    const a = src.indexOf('export async function unmarkAppointmentServiceCompleted');
    expect(a).toBeGreaterThan(-1);
    expect(src.slice(a, a + 700)).toMatch(/status:\s*'confirmed'/);
  });
  it('updateBackendAppointment imports + calls decideApptStatusServiceSync', () => {
    expect(src).toMatch(/import\s*\{[^}]*decideApptStatusServiceSync[^}]*\}\s*from\s*['"]\.\/appointmentDisplay\.js['"]/s);
    expect(src).toMatch(/decideApptStatusServiceSync\s*\(\s*data[^)]*status/);
  });
});

describe('V139 · AV159 regression (course SSOT + status-sync coupling)', () => {
  it('AppointmentOpdStepperRow uses resolveCourseDeducted SSOT (no inline detail.courseItems predicate)', () => {
    const s = readFileSync('src/components/admin/AppointmentOpdStepperRow.jsx', 'utf8');
    expect(s).toMatch(/resolveCourseDeducted\s*\(/);
    expect(s).not.toMatch(/detail\.courseItems/); // must go through the helper, not re-derive
    expect(s).toMatch(/withCourseStep/);
  });
  it('resolveCourseDeducted reads detail.* (not top-level)', () => {
    const s = readFileSync('src/lib/treatmentDisplayResolvers.js', 'utf8');
    const fn = s.slice(s.indexOf('export function resolveCourseDeducted'), s.indexOf('export function resolveCourseStepState'));
    expect(fn).toMatch(/t\.detail/);
    expect(fn).toMatch(/d\.courseItems/);
    expect(fn).toMatch(/d\.treatmentItems/);
  });
  it('CDV history stepper stays 3-step (withCourseStep is opt-in, defaults false)', () => {
    const s = readFileSync('src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx', 'utf8');
    expect(s).toMatch(/withCourseStep\s*=\s*false/); // default-off in the signature
  });
  it('AV159 documented in the audit skill', () => {
    expect(readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8')).toMatch(/AV159/);
  });
});
