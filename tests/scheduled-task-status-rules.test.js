// Task 11 — firestore rules for the status doc.
//
// DECISION (2026-06-02): NO new rule. The status doc lives at
// clinic_settings/scheduled_task_status, already covered by the existing
// `match /clinic_settings/{settingId}` wildcard (read: if true; write: if
// isClinicStaff()). Firestore OR-evaluates overlapping matches, so a specific
// `write: if false` / `read: if isClinicStaff()` would NOT restrict below the
// wildcard — it would be inert. Functionally the wildcard is correct:
//   • crons write via admin SDK (bypass rules) — always works
//   • UI reads via onSnapshot (clinic-staff signed in) — works
//   • anon write → denied (not clinic-staff → 403)
// The doc holds only operational counts + short cron-error strings (no PII /
// money / secrets), consistent with clinic_settings already being public-read.
// → deploy is vercel + functions only; no Probe-Deploy-Probe.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('scheduled_task_status — rules', () => {
  it('status doc lives under clinic_settings (wildcard-covered)', () => {
    const runtime = readFileSync('api/_lib/scheduledTaskRuntime.js', 'utf8');
    expect(runtime).toMatch(/clinic_settings\/scheduled_task_status/);
    expect(readFileSync('firestore.rules', 'utf8')).toMatch(/match \/clinic_settings\/\{settingId\}/);
  });

  it('the client app never WRITES the status doc (admin-SDK only; UI is read-only)', () => {
    const hook = readFileSync('src/hooks/useScheduledTaskStatus.js', 'utf8');
    expect(hook).toMatch(/onSnapshot/);
    expect(hook).not.toMatch(/\b(setDoc|updateDoc|writeBatch|addDoc)\b/);
  });
});
